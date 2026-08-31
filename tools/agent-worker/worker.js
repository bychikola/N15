// Воркер ИИ-агента для CRM N15.
// Запуск на VPS-хосте (НЕ в docker). В основе — настоящий терминальный
// Claude Code CLI (как в локальной сессии): headless-режим `claude -p`,
// со ВСЕМИ плагинами и скиллами из ~/.claude на сервере.
//
// Безопасность (принятый компромисс): CLI запускается с
// --dangerously-skip-permissions — агент имеет полный доступ (Bash и т.д.),
// как локальный Claude Code. Это сознательный выбор владельца («как у меня»).
// Проверки tsc/lint, git commit/push и deploy выполняет сам воркер после
// завершения агента — LLM деплой не запускает.
//
// Цикл:
//   1. Раз в 5 секунд берёт задачу status='queued' из agent-tasks.
//   2. Запускает: claude -p "<запрос>" --output-format stream-json
//      --dangerously-skip-permissions --cwd <репозиторий>
//   3. Стрим-события агента пишутся в лог задачи (CRM видит живьём).
//   4. Воркер: tsc --noEmit → npm run lint → git add/commit/push.
//   5. Воркер запускает bash deploy.sh.
//
// Переменные окружения:
//   DATABASE_URI      — Postgres (как в ~/n15/.env)
//   N15_REPO          — путь к репозиторию (по умолчанию /root/n15)
//   ANTHROPIC_API_KEY — ключ Anthropic (обязателен)

const { Client } = require('pg')
const { spawn } = require('child_process')
const { existsSync } = require('fs')

const DB = process.env.DATABASE_URI
const REPO = process.env.N15_REPO || '/root/n15'
const POLL_MS = 5000
const AGENT_TIMEOUT_MS = 20 * 60 * 1000
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000

if (!DB) {
  console.error('DATABASE_URI is required')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('ANTHROPIC_API_KEY (или ANTHROPIC_AUTH_TOKEN) is required')
  process.exit(1)
}

const SYSTEM_RULES = `
Ты — Claude Code, работающий в репозитории сайта N15 (Next.js + Payload) на сервере.
У тебя есть все обычные инструменты (включая Bash), как в обычной сессии.
Выполни запрос пользователя. Правила:
1. Работай в этом репозитории. Не трогай: node_modules, .env*, docker-compose*, Caddyfile, deploy.sh, docker-entrypoint.sh, tools/.
2. Соблюдай стиль существующего кода (комментарии на русском, где они есть).
3. После правок выполни проверки: npx tsc --noEmit и npm run lint — исправь ошибки.
4. НЕ коммить и НЕ пуши — это сделает воркер после тебя.
5. НЕ запускай deploy и не трогай docker-команды.
Заверши кратким списком изменений.
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

// Запуск настоящего Claude Code CLI в headless-режиме.
// Стрим-события (stream-json) пишем в лог задачи.
async function runClaude(client, id, prompt) {
  await appendLog(client, id, `\n— Claude Code (${new Date().toLocaleTimeString('ru-RU')}) —\n`)
  const args = [
    '-p', `${SYSTEM_RULES}\n\nЗапрос пользователя:\n${prompt}`,
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ]
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: REPO, env: { ...process.env, ...agentEnv }, shell: false })
    let out = ''
    let buffer = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), AGENT_TIMEOUT_MS)

    const onLine = (line) => {
      try {
        const evt = JSON.parse(line)
        if (evt.type === 'assistant' && evt.message?.content) {
          for (const block of evt.message.content) {
            if (block.type === 'text' && block.text) {
              out += block.text
              appendLog(client, id, block.text)
            }
          }
        } else if (evt.type === 'result') {
          out += evt.result || ''
          if (evt.totalCostUsd) {
            out += `\n[стоимость: $${evt.totalCostUsd.toFixed(3)}]`
          }
        }
      } catch {
        // не-JSON строка — игнорируем (служебный вывод)
      }
    }

    child.stdout.on('data', (d) => {
      buffer += d.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) onLine(line)
      }
    })
    child.stderr.on('data', (d) => {
      const s = d.toString()
      out += s
      appendLog(client, id, s)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (buffer.trim()) onLine(buffer)
      resolve({ code, out })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: String(e) })
    })
  })
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
    await appendLog(client, id, `\n⚠ Изменений нет — коммит пропущен.\n`)
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

  // 1. Настоящий Claude Code CLI (с плагинами из ~/.claude на сервере)
  const agent = await runClaude(client, id, task.prompt)
  await appendLog(client, id, `\n— Claude Code завершил (exit ${agent.code}) —\n`)
  if (agent.code !== 0) {
    await updateTask(client, id, {
      status: 'failed',
      result: `Claude Code завершился с ошибкой (exit ${agent.code}). Хвост: ${agent.out.slice(-1500)}`,
    })
    return
  }

  // 2. Проверки; при ошибке — одна попытка агента исправить
  let check = await checkAndPush(client, id, commitMsg)
  if (!check.ok) {
    await appendLog(client, id, `\n— Claude Code исправляет ошибки (${check.step}) —\n`)
    await runClaude(client, id, `Исправь ошибки сборки/стиля, показанные в логе выше.`)
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
      result: agent.out.slice(-2000) || 'Изменения применены и сайт обновлён.',
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
let agentEnv = {}

// Разрешаем только переменные Claude Code/Anthropic — нельзя подсунуть
// системные ключи (PATH, LD_PRELOAD и т.п.) через конфиг из CRM.
function sanitizeAgentEnv(env) {
  const out = {}
  for (const [k, v] of Object.entries(env)) {
    if (
      typeof v === 'string' &&
      (k.startsWith('ANTHROPIC_') || k.startsWith('CLAUDE_CODE_') || k === 'ENABLE_TOOL_SEARCH')
    ) {
      out[k] = v
    }
  }
  return out
}

// Читает конфигурацию агента из глобала agent-settings (БД) и обновляет env,
// который передаётся CLI при следующем запуске. Вызывается при старте и каждые 30с.
// Payload 3 хранит глобал в отдельной таблице по имени (agent_settings), поле
// envJson — колонка env_json.
async function refreshAgentEnv() {
  try {
    const res = await client.query(`SELECT env_json FROM agent_settings LIMIT 1`)
    const envJson = res.rows[0]?.env_json
    if (typeof envJson === 'string' && envJson.trim()) {
      const env = JSON.parse(envJson)
      if (typeof env === 'object' && env !== null && !Array.isArray(env)) {
        agentEnv = sanitizeAgentEnv(env)
      }
    }
  } catch (e) {
    console.error('refreshAgentEnv error', e)
  }
}

async function main() {
  // Проверка доступности CLI и репозитория
  if (!existsSync(REPO)) {
    console.error(`Repo not found: ${REPO}`)
    process.exit(1)
  }
  const cliCheck = await runCommand('claude', ['--version'], REPO, 15000)
  if (cliCheck.code !== 0) {
    console.error('claude CLI not found. Install: curl -fsSL https://claude.ai/install.sh | bash')
    process.exit(1)
  }
  console.log('claude CLI:', cliCheck.out.trim())

  client = new Client({ connectionString: DB })
  await client.connect()
  console.log('worker connected, polling every', POLL_MS / 1000, 's')
  await refreshAgentEnv()
  console.log('provider:', agentEnv.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'anthropic (default)')
  console.log('model:', agentEnv.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'default')

  // Периодически обновляем конфиг из БД (редактирование из модалки CRM)
  setInterval(() => { refreshAgentEnv().catch(() => {}) }, 30 * 1000)

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
