// Воркер ИИ-агента для CRM N15.
// Запуск на VPS-хосте (НЕ в docker): нужен доступ к ~/n15, docker и Postgres.
//
// Цикл:
//   1. Раз в 5 секунд берёт одну задачу status='queued' из таблицы agent-tasks.
//   2. Запускает Claude Agent SDK (cwd = репозиторий сайта) с запросом из CRM.
//      Агент правит код, запускает tsc/lint, делает git commit + push.
//   3. После успешного push воркер сам запускает bash deploy.sh (лог в задачу).
//   4. Статус и журнал пишутся обратно в БД — CRM показывает их вживую.
//
// Переменные окружения:
//   DATABASE_URI     — строка подключения к Postgres (как в ~/n15/.env)
//   N15_REPO         — путь к репозиторию сайта (по умолчанию /root/n15)
//   ANTHROPIC_API_KEY— ключ API Anthropic (обязателен)

const { Client } = require('pg')
const { spawn } = require('child_process')
const { claudeAgentSDK } = require('@anthropic-ai/claude-agent-sdk')

const DB = process.env.DATABASE_URI
const REPO = process.env.N15_REPO || '/root/n15'
const POLL_MS = 5000
const AGENT_TIMEOUT_MS = 15 * 60 * 1000 // 15 минут на работу агента
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000 // 40 минут на сборку/деплой

if (!DB) {
  console.error('DATABASE_URI is required')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required')
  process.exit(1)
}

const SYSTEM_RULES = `
Ты — ИИ-разработчик сайта N15 (Next.js + Payload) и работаешь в его репозитории (${REPO}).
Выполни запрос пользователя. Обязательные правила:
1. Вноси изменения только в файлы репозитория. Не трогай node_modules, .env*, docker-compose*, Caddyfile, deploy.sh, docker-entrypoint.sh.
2. После правок запусти проверки: npx tsc --noEmit и npm run lint. Исправь все ошибки (не игнорируй).
3. Затем закоммить: git add -A && git commit -m "..." (сообщение conventional, на английском, префикс по области: feat/fix/chore).
4. Запушь: git push origin master.
5. НЕ запускай deploy и никакие другие команды вне репозитория. На этом остановись.
Соблюдай стиль существующего кода (комментарии на русском, где они есть).
`

function log(taskId, line, extra = '') {
  const stamp = new Date().toISOString()
  console.log(`[${stamp}] task#${taskId} ${line}`, extra)
}

async function updateTask(client, id, patch) {
  const keys = Object.keys(patch)
  const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')
  const vals = keys.map((k) => patch[k])
  await client.query(`UPDATE agent_tasks SET ${set} WHERE id = $${keys.length + 1}`, [...vals, id])
}

async function appendLog(client, id, text) {
  await client.query(
    `UPDATE agent_tasks SET log = COALESCE(log, '') || $1, "updated_at" = now() WHERE id = $2`,
    [text, id],
  )
}

function runCommand(cmd, args, cwd, timeoutMs, onChunk) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env })
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

async function runAgentTask(task) {
  const id = task.id
  log(id, 'started')
  const append = (text) => appendLog(client, id, text)

  // 1. Агент правит код, проверяет, коммитит, пушит
  append(`\n— Запуск агента (${new Date().toLocaleTimeString('ru-RU')}) —\n`)
  const sdkResult = await claudeAgentSDK.run({
    cwd: REPO,
    prompt: `${SYSTEM_RULES}\n\nЗапрос пользователя:\n${task.prompt}`,
    options: {
      model: 'claude-sonnet-4-6',
      maxTurns: 60,
      allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
      permissionMode: 'acceptEdits',
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    },
  })
  for await (const event of sdkResult) {
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          append(block.text)
        }
      }
    }
  }
  const resultText = sdkResult.result?.output?.trim() || ''
  append(`\n— Агент завершил: ${sdkResult.result?.subtype || 'ok'} —\n`)

  // 2. Проверяем, что push реально ушёл (git status)
  const status = await runCommand('git', ['status', '--short'], REPO, 30000)
  if (status.out.trim()) {
    append(`\n⚠ В репозитории остались незакоммиченные изменения — агент не закоммитил всё:\n${status.out.slice(0, 2000)}`)
    await updateTask(client, id, { status: 'failed', result: 'Агент оставил незакоммиченные изменения' })
    return
  }

  // 3. Деплой (сам воркер — сборка долгая, LLM её не ждёт)
  append(`\n— Деплой: bash deploy.sh (может занять 10-20 мин) —\n`)
  const deploy = await runCommand('bash', ['deploy.sh'], REPO, DEPLOY_TIMEOUT_MS, (chunk) => {
    // лог деплоя пишем порциями, чтобы CRM обновлялась живьём
    append(chunk)
  })
  append(`\n— Деплой завершён (exit ${deploy.code}) —\n`)

  if (deploy.code === 0) {
    await updateTask(client, id, {
      status: 'done',
      result: resultText || 'Изменения применены и сайт обновлён.',
    })
    log(id, 'done')
  } else {
    await updateTask(client, id, {
      status: 'failed',
      result: `Деплой упал (exit ${deploy.code}). Хвост лога: ${deploy.out.slice(-2000)}`,
    })
    log(id, 'deploy failed')
  }
}

let client = null
let busy = false

async function main() {
  client = new Client({ connectionString: DB })
  await client.connect()
  console.log('worker connected to postgres, polling every', POLL_MS / 1000, 's')

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
        await runAgentTask(task)
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
