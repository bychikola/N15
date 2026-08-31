// Воркер ИИ-агента для CRM N15.
// Запуск на VPS-хосте (НЕ в docker): нужен доступ к ~/n15, docker и Postgres.
//
// Безопасность (по итогам аудита):
//   - Агент НЕ получает Bash: только Read/Edit/Write/Glob/Grep — правит файлы
//     репозитория и не может выполнять команды/читать .env на хосте.
//   - Проверки (tsc/lint), git commit/push и deploy выполняет сам воркер.
//   - При ошибках tsc/lint воркер даёт агенту одну попытку исправить.
//
// Цикл:
//   1. Раз в 5 секунд берёт задачу status='queued' из agent-tasks.
//   2. Claude Agent SDK (cwd = репозиторий) правит файлы по запросу.
//   3. Воркер: tsc --noEmit → npm run lint → git add/commit/push.
//   4. Воркер запускает bash deploy.sh. Статус и журнал — в БД (CRM видит живьём).
//
// Переменные окружения:
//   DATABASE_URI      — Postgres (как в ~/n15/.env)
//   N15_REPO          — путь к репозиторию (по умолчанию /root/n15)
//   ANTHROPIC_API_KEY — ключ Anthropic (обязателен)

const { Client } = require('pg')
const { spawn } = require('child_process')
const { claudeAgentSDK } = require('@anthropic-ai/claude-agent-sdk')

const DB = process.env.DATABASE_URI
const REPO = process.env.N15_REPO || '/root/n15'
const POLL_MS = 5000
const AGENT_TIMEOUT_MS = 15 * 60 * 1000
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000

if (!DB) {
  console.error('DATABASE_URI is required')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required')
  process.exit(1)
}

const SYSTEM_RULES = `
Ты — ИИ-разработчик сайта N15 (Next.js + Payload). Ты работаешь в его репозитории (${REPO}).
Выполни запрос пользователя, ИЗМЕНЯЯ ТОЛЬКО ФАЙЛЫ РЕПОЗИТОРИЯ инструментами Read/Edit/Write/Glob/Grep.
Правила:
1. Не трогай: node_modules, .env*, docker-compose*, Caddyfile, deploy.sh, docker-entrypoint.sh, tools/.
2. Соблюдай стиль существующего кода (комментарии на русском, где они есть).
3. НЕ запускай никакие команды (у тебя нет Bash). Только правь файлы и сообщи, что изменил.
4. Не создавай новые файлы без необходимости.
Заверши работу кратким списком изменений — он попадёт в сообщение коммита.
`

function log(taskId, line) {
  console.log(`[${new Date().toISOString()}] task#${taskId} ${line}`)
}

async function updateTask(client, id, patch) {
  const keys = Object.keys(patch)
  const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
  await client.query(`UPDATE agent_tasks SET ${set}, "updated_at" = now() WHERE id = $${keys.length + 1}`, [...Object.values(patch), id])
}

async function appendLog(client, id, text) {
  await client.query(
    `UPDATE agent_tasks SET log = COALESCE(log, '') || $1, "updated_at" = now() WHERE id = $2`,
    [text, id],
  )
}

function runCommand(cmd, args, cwd, timeoutMs, onChunk) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, shell: false })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; onChunk?.(s) })
    child.stderr.on('data', (d) => { const s = d.toString(); out += s; onChunk?.(s) })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: String(e) })
    })
  })
}

async function runAgent(client, id, prompt) {
  await appendLog(client, id, `\n— Агент (${new Date().toLocaleTimeString('ru-RU')}) —\n`)
  const result = await claudeAgentSDK.run({
    cwd: REPO,
    prompt: `${SYSTEM_RULES}\n\nЗапрос пользователя:\n${prompt}`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 60,
      // БЕЗ Bash: агент может только править файлы репозитория
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      permissionMode: 'acceptEdits',
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    },
  })
  for await (const event of result) {
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          await appendLog(client, id, block.text)
        }
      }
    }
  }
  const text = result.result?.output?.trim() || ''
  await appendLog(client, id, `\n— Агент завершил —\n`)
  return { text, ok: result.result?.subtype !== 'error_max_turns' }
}

// Проверки + коммит + push — выполняет воркер (не LLM)
async function checkAndPush(client, id, commitMsg) {
  await appendLog(client, id, `\n— Проверки —\n`)

  const tsc = await runCommand('npx', ['tsc', '--noEmit'], REPO, 5 * 60 * 1000)
  await appendLog(client, id, tsc.out.slice(-3000))
  if (tsc.code !== 0) {
    await appendLog(client, id, `\n⨯ tsc не прошёл (exit ${tsc.code})\n`)
    return { ok: false, step: 'tsc' }
  }

  const lint = await runCommand('npm', ['run', 'lint'], REPO, 5 * 60 * 1000)
  await appendLog(client, id, lint.out.slice(-3000))
  if (lint.code !== 0) {
    await appendLog(client, id, `\n⨯ lint не прошёл (exit ${lint.code})\n`)
    return { ok: false, step: 'lint' }
  }

  const diff = await runCommand('git', ['diff', '--stat'], REPO, 30000)
  if (!diff.out.trim()) {
    await appendLog(client, id, `\n⚠ Изменений в репозитории нет — коммит пропущен.\n`)
    return { ok: true, step: 'noop' }
  }

  await runCommand('git', ['add', '-A'], REPO, 30000)
  const commit = await runCommand('git', ['commit', '-m', commitMsg], REPO, 30000)
  await appendLog(client, id, commit.out.slice(-1500))
  const push = await runCommand('git', ['push', 'origin', 'master'], REPO, 60 * 1000)
  await appendLog(client, id, push.out.slice(-1500))
  if (push.code !== 0) {
    await appendLog(client, id, `\n⨯ push не прошёл (exit ${push.code})\n`)
    return { ok: false, step: 'push' }
  }
  return { ok: true, step: 'pushed' }
}

async function runAgentTask(client, task) {
  const id = task.id
  log(id, 'started')
  const commitMsg = `feat(ai): ${task.prompt.replace(/[^\wа-яё\s-]/gi, '').slice(0, 60) || 'agent changes'}`

  // 1. Агент правит файлы
  const agent = await runAgent(client, id, task.prompt)
  if (!agent.ok) {
    await updateTask(client, id, { status: 'failed', result: 'Агент не завершил работу (лимит шагов)' })
    return
  }

  // 2. Проверки; при ошибке — одна попытка агента исправить
  let check = await checkAndPush(client, id, commitMsg)
  if (!check.ok) {
    await appendLog(client, id, `\n— Агент исправляет ошибки (${check.step}) —\n`)
    await runAgent(client, id, `Исправь ошибки сборки/стиля, которые показаны в логе выше. Проверь результат по коду.`)
    check = await checkAndPush(client, id, commitMsg)
  }
  if (!check.ok) {
    await updateTask(client, id, {
      status: 'failed',
      result: `Проверки не прошли (${check.step}). Хвост лога в журнале задачи.`,
    })
    return
  }

  // 3. Деплой — воркер (сборка долгая)
  await appendLog(client, id, `\n— Деплой: bash deploy.sh (10-20 мин) —\n`)
  const deploy = await runCommand('bash', ['deploy.sh'], REPO, DEPLOY_TIMEOUT_MS, (chunk) => {
    appendLog(client, id, chunk)
  })
  await appendLog(client, id, `\n— Деплой завершён (exit ${deploy.code}) —\n`)

  if (deploy.code === 0) {
    await updateTask(client, id, {
      status: 'done',
      result: agent.text || 'Изменения применены и сайт обновлён.',
    })
    log(id, 'done')
  } else {
    await updateTask(client, id, {
      status: 'failed',
      result: `Деплой упал (exit ${deploy.code}). Хвост: ${deploy.out.slice(-2000)}`,
    })
    log(id, 'deploy failed')
  }
}

let client = null
let busy = false

async function main() {
  client = new Client({ connectionString: DB })
  await client.connect()
  console.log('worker connected, polling every', POLL_MS / 1000, 's')

  setInterval(async () => {
    if (busy) return
    try {
      const res = await client.query(
        `SELECT * FROM agent_tasks WHERE status = 'queued' ORDER BY "created_at" ASC LIMIT 1`,
      )
      if (!res.rows.length) return
      busy = true
      const task = res.rows[0]
      await updateTask(client, task.id, { status: 'running' })
      try {
        await runAgentTask(client, task)
      } catch (e) {
        console.error('task error', e)
        await updateTask(client, task.id, { status: 'failed', result: String(e).slice(0, 2000) })
      } finally {
        busy = false
      }
    } catch (e) {
      console.error('poll error', e)
    }
  }, POLL_MS)
}

main().catch((e) => {
  console.error('fatal', e)
  process.exit(1)
})
