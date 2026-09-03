// Воркер ИИ-агента для CRM N15.
// Запуск на VPS-хосте (НЕ в docker). В основе — настоящий терминальный
// Claude Code CLI (как в локальной сессии): headless-режим `claude -p`,
// со ВСЕМИ плагинами и скиллами из ~/.claude на сервере.
//
// Безопасность (принятый компромисс): CLI запускается с
// --dangerously-skip-permissions — агент имеет полный доступ (Bash и т.д.),
// как локальный Claude Code. Это сознательный выбор владельца («как у меня»).
// Агент сам коммитит и пушит изменения (git add/commit/push), как обычная
// сессия — воркер после него лишь проверяет tsc/lint (гейт перед деплоем)
// и запускает bash deploy.sh, если origin/master уехал вперёд.
//
// Цикл:
//   1. Раз в 5 секунд берёт задачу status='queued' из agent-tasks.
//   2. Запускает: claude -p "<запрос>" --output-format stream-json
//      --dangerously-skip-permissions --cwd <репозиторий>
//   3. Стрим-события агента пишутся в лог задачи (CRM видит живьём).
//   4. Агент делает git commit + push (если правил код).
//   5. Воркер: tsc/lint (если есть node_modules) → bash deploy.sh.
//
// Переменные окружения:
//   DATABASE_URI      — Postgres (как в ~/n15/.env)
//   N15_REPO          — путь к репозиторию (по умолчанию /root/n15)
//   ANTHROPIC_API_KEY — ключ Anthropic (обязателен)

const { Client } = require('pg')
const { spawn } = require('child_process')
const { existsSync } = require('fs')

// IMAP-поллер почты (VK WorkSpace). Пакеты ставятся install.sh (package.json).
let imap = null
try { imap = require('imapflow') } catch { /* появится после install.sh */ }
let simpleParser = null
try { ({ simpleParser } = require('mailparser')) } catch { /* появится после install.sh */ }

const DB = process.env.DATABASE_URI
const REPO = process.env.N15_REPO || '/root/n15'
const POLL_MS = 5000
const AGENT_TIMEOUT_MS = 20 * 60 * 1000
const DEPLOY_TIMEOUT_MS = 40 * 60 * 1000
const AUTH_PROMPT = '__AUTH__' // спец-задача: авторизация ChatGPT (Codex) из CRM
const AUTH_JSON = `${process.env.HOME || '/home/n15'}/.codex/auth.json`
const AUTH_TIMEOUT_MS = 20 * 60 * 1000
const MAIL_SYNC_MS = 60 * 1000 // почта: интервал забора писем
const MAIL_LOOKBACK_MS = 48 * 3600 * 1000 // при первом заборе смотрим последние 48ч
const MAIL_BATCH = 30 // максимум писем за один проход (остальные — следующими)

if (!DB) {
  console.error('DATABASE_URI is required')
  process.exit(1)
}
// Гейт наличия ключа — fail-closed, см. main() (после загрузки конфига из CRM).

const SYSTEM_RULES = `
Ты — Claude Code, работающий в репозитории сайта N15 (Next.js + Payload) на сервере.
У тебя есть все обычные инструменты (включая Bash) и git, как в обычной сессии.
Выполни запрос пользователя. Правила:
1. Работай в этом репозитории. Не трогай: node_modules, .env*, docker-compose*, Caddyfile, deploy.sh, docker-entrypoint.sh, tools/.
2. Соблюдай стиль существующего кода (комментарии на русском, где они есть).
3. Если правил код — до коммита выполни проверки (если есть node_modules): npx tsc --noEmit и npm run lint; исправь найденные ошибки. Если node_modules нет — пропусти.
4. НЕ устанавливай зависимости (npm install, npm ci и т.п.) и не запускай сторонние npx-пакеты — на сервере зависимостей нет намеренно, сайт собирается в docker.
5. После правок сделай git add -A, git commit -m "<краткое описание>" и git push origin master — как в обычной сессии.
6. Если правки кода не нужны (например, только данные в БД) — ничего не коммить, просто опиши результат.
7. НЕ запускай deploy и не трогай docker-команды.
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

function runCommand(cmd, args, cwd, timeoutMs, onChunk, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...(extraEnv || {}) }, shell: false })
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
    const child = spawn('claude', args, {
      cwd: REPO,
      env: { ...process.env, ...agentEnv },
      shell: false,
      // stdin не нужен (headless) — сразу закрыт, иначе CLI 3с ждёт ввода
      // и пишет "no stdin data received" в каждую задачу
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
      // [claude-code:unrecognized_model] — косметика CLI (модель DeepSeek не
      // из таблицы Anthropic), на работу не влияет — в лог задачи не пишем.
      if (!s.includes('[claude-code:unrecognized_model]')) {
        appendLog(client, id, s)
      }
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

// Гейт tsc/lint после агента, перед деплоем. Коммит и push делает сам агент
// (как обычная сессия Claude Code) — воркер лишь убеждается, что код
// собирается, иначе сломанный код не уедет на прод.
async function verifyCodeGate(client, id) {
  await appendLog(client, id, `\n— Проверки (tsc/lint) перед деплоем —\n`)
  if (!existsSync(`${REPO}/node_modules`)) {
    await appendLog(client, id, `node_modules отсутствует — tsc/lint пропущены (проверит сборка при деплое).\n`)
    return true
  }
  const tsc = await runCommand(`${REPO}/node_modules/.bin/tsc`, ['--noEmit'], REPO, 5 * 60 * 1000)
  await appendLog(client, id, tsc.out.slice(-3000))
  if (tsc.code !== 0) {
    await appendLog(client, id, `\n⨯ tsc не прошёл (exit ${tsc.code}) — деплой отменён.\n`)
    return false
  }
  const lint = await runCommand('npm', ['run', 'lint'], REPO, 5 * 60 * 1000)
  await appendLog(client, id, lint.out.slice(-3000))
  if (lint.code !== 0) {
    await appendLog(client, id, `\n⨯ lint не прошёл (exit ${lint.code}) — деплой отменён.\n`)
    return false
  }
  return true
}

// Текущий коммит origin/master (после fetch). Пустая строка — репо без remote.
async function remoteHead() {
  const r = await runCommand('git', ['rev-parse', 'origin/master'], REPO, 30000)
  return r.code === 0 ? r.out.trim() : ''
}

async function runAgentTask(client, task) {
  const id = task.id
  log(id, 'started')

  // ChatGPT-режим: проверяем прокси ДО запуска агента, иначе задача упала бы
  // с непонятной ошибкой или висела на сетевых таймаутах.
  const proxy = await checkProxy()
  if (!proxy.ok) {
    await appendLog(client, id, `\n⨯ ${proxy.reason}\n`)
    await updateTask(client, id, { status: 'failed', result: `${proxy.reason}. ${proxy.hint}` })
    log(id, `proxy preflight failed: ${proxy.reason}`)
    return
  }

  // Состояние ДО агента: что на origin/master, HEAD и какие файлы грязные.
  // После агента по ним понимаем, что он сделал с кодом — сам коммитит
  // и пушит, как обычная сессия Claude Code.
  await runCommand('git', ['fetch', 'origin'], REPO, 60000)
  const remoteBefore = await remoteHead()
  const headBefore = (await runCommand('git', ['rev-parse', 'HEAD'], REPO, 30000)).out.trim()
  const dirtyBefore = (await runCommand('git', ['status', '--porcelain'], REPO, 30000)).out.trim()

  // 1. Настоящий Claude Code CLI (с плагинами из ~/.claude на сервере)
  const agent = await runClaude(client, id, task.prompt)
  await appendLog(client, id, `\n— Claude Code завершил (exit ${agent.code}) —\n`)
  if (agent.code !== 0) {
    let result = `Claude Code завершился с ошибкой (exit ${agent.code}). Хвост: ${agent.out.slice(-1500)}`
    // ChatGPT-режим: подсказки по типичным ошибкам прокси/подписки
    if (LOCAL_PROXY_RE.test(agentEnv.ANTHROPIC_BASE_URL || '')) {
      if (/401|403|unauthorized|invalid token|not authenticated/i.test(agent.out)) {
        result += ' Подсказка: токен ChatGPT протух — выполни sudo -u n15 codex login --device-auth'
      } else if (/429|rate limit|quota exceeded/i.test(agent.out)) {
        result += ' Подсказка: исчерпан лимит ChatGPT Plus (роллинг-окно ~5 ч) — повтори задачу позже'
      }
    }
    await updateTask(client, id, { status: 'failed', result })
    return
  }

  // Что изменилось после агента
  await runCommand('git', ['fetch', 'origin'], REPO, 60000)
  const remoteAfter = await remoteHead()
  const headAfter = (await runCommand('git', ['rev-parse', 'HEAD'], REPO, 30000)).out.trim()
  const dirtyAfter = (await runCommand('git', ['status', '--porcelain'], REPO, 30000)).out.trim()

  // 2. Агент запушил изменения → гейт tsc/lint → деплой
  if (remoteBefore && remoteAfter !== remoteBefore) {
    if (!(await verifyCodeGate(client, id))) {
      await updateTask(client, id, {
        status: 'failed',
        result: 'Код после агента не прошёл tsc/lint — деплой отменён. Хвост лога в журнале задачи.',
      })
      log(id, 'gate failed, deploy cancelled')
      return
    }
    await appendLog(client, id, `\n— Деплой: bash deploy.sh (10-20 мин) —\n`)
    const deploy = await runCommand('bash', ['deploy.sh'], REPO, DEPLOY_TIMEOUT_MS, (chunk) => {
      appendLog(client, id, chunk)
    }, { APP_DIR: REPO })
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
    return
  }

  // 3. Закоммичено локально, но не запушено
  if (headAfter && headBefore && headAfter !== headBefore) {
    await updateTask(client, id, {
      status: 'failed',
      result: 'Агент закоммитил изменения, но не запушал (origin/master не двигался). Хвост лога в журнале задачи.',
    })
    log(id, 'committed but not pushed')
    return
  }

  // 4. Файлы изменились, но не закоммичены
  if (dirtyAfter !== dirtyBefore) {
    await updateTask(client, id, {
      status: 'failed',
      result: 'Агент изменил файлы в репозитории, но не закоммитил. Хвост лога в журнале задачи.',
    })
    log(id, 'uncommitted changes')
    return
  }

  // 5. Код не менялся — задача по данным (БД и т.п.), деплой не нужен
  await updateTask(client, id, {
    status: 'done',
    result: agent.out.slice(-2000) || 'Изменений в коде не требовалось.',
  })
  log(id, 'done (no code changes)')
}

// Авторизация ChatGPT (Codex) прямо из CRM: спец-задача __AUTH__.
// Запускаем `codex login --device-auth`, стримим URL+код в лог задачи;
// после подтверждения на телефоне codex сам пишет ~/.codex/auth.json —
// перезапускаем прокси (pkill → systemd Restart=always), задача «Готово».
async function runAuthTask(client, task) {
  const id = task.id
  log(id, 'auth started')

  if (existsSync(AUTH_JSON)) {
    await appendLog(client, id, 'Найден ~/.codex/auth.json — авторизация уже выполнена.\nПерезапускаю прокси, чтобы он подхватил токен...\n')
    await runCommand('pkill', ['-f', 'claudex'], REPO, 10000)
    await updateTask(client, id, { status: 'done', result: 'Уже авторизовано ✓' })
    return
  }

  await appendLog(client, id, `\n— Авторизация ChatGPT (Codex) —\n`)
  await appendLog(client, id, `Открой ссылку ниже на телефоне, введи код и подтверди вход в ChatGPT.\nКод действует ~15 минут.\n\n`)

  return new Promise((resolve) => {
    const child = spawn('codex', ['login', '--device-auth'], {
      env: { ...process.env, ...agentEnv },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => { const s = d.toString(); out += s; appendLog(client, id, s) })
    child.stderr.on('data', (d) => { const s = d.toString(); out += s; appendLog(client, id, s) })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      updateTask(client, id, { status: 'failed', result: 'Авторизация не завершена за 20 минут — код протух. Повтори.' })
      log(id, 'auth timeout')
      resolve()
    }, AUTH_TIMEOUT_MS)

    child.on('close', async (code) => {
      clearTimeout(timer)
      if (existsSync(AUTH_JSON)) {
        await appendLog(client, id, `\n✓ Авторизовано. Перезапускаю прокси, чтобы он подхватил токен...\n`)
        const k = await runCommand('pkill', ['-f', 'claudex'], REPO, 10000)
        await appendLog(client, id, `прокси перезапущен (systemd Restart=always)${k.code !== 0 ? ' — проверь systemctl status n15-proxy' : ''}\n`)
        await updateTask(client, id, { status: 'done', result: 'ChatGPT (Codex) авторизован ✓' })
        log(id, 'auth done')
      } else if (code !== 0) {
        const tail = out.trim().slice(-400)
        await updateTask(client, id, {
          status: 'failed',
          result: `codex login завершился с ошибкой (exit ${code}).${tail ? ` Вывод: ${tail}` : ''} Включи в ChatGPT: Settings → Security → «Allow device code login», затем повтори.`,
        })
        log(id, `auth failed (exit ${code})`)
      } else {
        await updateTask(client, id, { status: 'failed', result: 'Авторизация не завершилась — токен не найден. Повтори.' })
      }
      resolve()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      updateTask(client, id, { status: 'failed', result: `codex недоступен: ${String(e)}` })
      resolve()
    })
  })
}

// Забирает новые письма с ящика VK WorkSpace (настройки в mail_settings) и
// пишет их в коллекцию emails. Дедуп по message_id; письмо привязывается
// к клиенту (customers.email) или заявке (applications.client_email).
// Один проход за раз и не во время задачи агента: syncMailOnce по интервалу
// мог бы пересечься сам с собой (гонка → двойной импорт без unique-индекса)
// или отнять ресурсы у выполняющейся задачи/деплоя.
let mailSyncing = false
async function syncMailOnce() {
  if (!imap || !simpleParser || !client || busy || mailSyncing) return
  mailSyncing = true
  try {
    await syncMailRun()
  } finally {
    mailSyncing = false
  }
}

async function syncMailRun() {
  if (!imap || !simpleParser || !client) return
  let cfg
  try {
    const r = await client.query(
      'SELECT enabled, imap_host, imap_port, username, password FROM mail_settings LIMIT 1',
    )
    cfg = r.rows[0]
  } catch (e) {
    console.error('mail settings error:', e.message)
    return
  }
  if (!cfg || !cfg.enabled || !cfg.username || !cfg.password) return

  const flow = new imap.ImapFlow({
    host: cfg.imap_host || 'imap.mail.ru',
    port: Number(cfg.imap_port) || 993,
    secure: true,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
  })

  try {
    await flow.connect()
    const lock = await flow.getMailboxLock('INBOX')
    try {
      // Кандидаты: письма за последние 48ч + все непрочитанные (первый забор
      // подтянет старые непрочитанные тоже).
      const since = new Date(Date.now() - MAIL_LOOKBACK_MS)
      let uids = await flow.search({ since })
      try {
        const unseen = await flow.search({ seen: false })
        uids = [...new Set([...uids, ...unseen])]
      } catch { /* поиск по seen не поддержан — ок */ }
      if (!uids.length) return

      // Лимит прохода: свежие письма первыми, остальные дойдут следующими
      // проходами (непрочитанные не теряются — помечаются \Seen после импорта)
      uids = uids.slice(-MAIL_BATCH)

      let imported = 0
      for (const uid of uids) {
        try {
          const full = await flow.fetchOne(uid, { source: true }, { uid: true })
          const parsed = await simpleParser(full.source)
          const from = (parsed.from && parsed.from.value && parsed.from.value[0]) || {}
          const to = (parsed.to && parsed.to.value && parsed.to.value[0]) || {}
          const fromEmail = (from.address || '').toLowerCase()
          const subject = String(parsed.subject || '(без темы)').slice(0, 500)
          const textBody = String(parsed.text || '').slice(0, 20000)
          const dateVal = parsed.date ? new Date(parsed.date) : new Date()
          const messageId = (parsed.messageId || '').trim() ||
            `noid-${fromEmail}-${dateVal.getTime()}-${subject}`

          // Дедуп по message_id: уже импортированные пропускаем
          const dup = await client.query('SELECT 1 FROM emails WHERE message_id = $1 LIMIT 1', [messageId])
          if (dup.rows.length) continue

          // Привязка к клиенту/заявке по email отправителя
          let customerId = null
          let applicationId = null
          if (fromEmail) {
            const cu = await client.query('SELECT id FROM customers WHERE lower(email) = $1 LIMIT 1', [fromEmail])
            if (cu.rows[0]) {
              customerId = cu.rows[0].id
            } else {
              const ap = await client.query(
                'SELECT id, customer_id FROM applications WHERE lower(client_email) = $1 ORDER BY id DESC LIMIT 1',
                [fromEmail],
              )
              if (ap.rows[0]) {
                applicationId = ap.rows[0].id
                if (!customerId && ap.rows[0].customer_id) customerId = ap.rows[0].customer_id
              }
            }
          }

          await client.query(
            `INSERT INTO emails
               (folder, message_id, from_name, from_email, to_email, subject, text,
                received_at, read, customer_id, application_id, created_at, updated_at)
             VALUES ('inbox', $1, $2, $3, $4, $5, $6, $7, false, $8, $9, now(), now())`,
            [
              messageId,
              String(from.name || '').slice(0, 200),
              fromEmail,
              String(to.address || '').slice(0, 200),
              subject,
              textBody,
              dateVal,
              customerId,
              applicationId,
            ],
          )
          await flow.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
          imported++
          console.log(`[mail] imported: ${fromEmail || '?'} «${subject.slice(0, 60)}»`)
        } catch (e) {
          console.error('mail import error:', e.message)
        }
      }
      if (imported) console.log(`[mail] sync: +${imported} письм(а)`)
    } finally {
      lock.release()
    }
    await flow.logout()
  } catch (e) {
    console.error('mail sync error:', e.message)
    try { await flow.logout() } catch { /* уже закрыт */ }
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
      // Заглушки вместо ключей (пресеты/модалка: «ВСТАВЬТЕ_КЛЮЧ…»,
      // sk-ant-placeholder) и пустые значения не должны перекрывать реальный
      // ключ из .env воркера — иначе DeepSeek падает с ошибкой авторизации.
      if (!v.trim() || v === 'sk-ant-placeholder' || v.startsWith('ВСТАВЬТЕ')) continue
      out[k] = v
    }
  }
  return out
}

// Префлайт прокси ChatGPT (claudex, порт 4000) — только когда в конфиге
// ANTHROPIC_BASE_URL указывает на локальный прокси. DeepSeek-режим не трогаем.
const LOCAL_PROXY_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//

async function checkProxy() {
  const base = (agentEnv.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || '').replace(/\/+$/, '')
  if (!LOCAL_PROXY_RE.test(base)) return { ok: true }
  // 1. Жив ли процесс прокси (GET /health — квоту не тратит)
  let health
  try {
    health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) })
  } catch {
    return {
      ok: false,
      reason: `прокси ${base} не отвечает`,
      hint: 'На сервере: systemctl status n15-proxy, затем systemctl restart n15-proxy.',
    }
  }
  if (!health.ok) {
    return { ok: false, reason: `/health → HTTP ${health.status}`, hint: 'Смотри journalctl -u n15-proxy -f' }
  }
  // 2. Авторизация Codex: POST /v1/messages/count_tokens (квоту не тратит).
  //    Если claudex считает count_tokens локально и upstream не трогает —
  //    вернёт 200 даже с протухшим токеном; тогда подстрахует разбор
  //    401/429 после запуска агента (см. runAgentTask).
  try {
    const r = await fetch(`${base}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'sk-ant-placeholder' },
      body: JSON.stringify({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        reason: `count_tokens → HTTP ${r.status}`,
        hint: 'Токен ChatGPT (Codex) протух (~8 дней простоя). На сервере: sudo -u n15 codex login --device-auth',
      }
    }
    if (r.status === 429) {
      return {
        ok: false,
        reason: 'count_tokens → HTTP 429',
        hint: 'Исчерпан лимит ChatGPT Plus (роллинг-окно ~5 ч) — повтори задачу позже.',
      }
    }
  } catch {
    // таймаут/эндпоинт не поддерживается — не блокируем
  }
  return { ok: true }
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
  // Задачи, оборванные рестартом воркера, навсегда залипают в 'running' —
  // при старте сбрасываем их в 'failed', чтобы очередь не встала.
  const stuck = await client.query(
    `UPDATE agent_tasks SET status = 'failed', result = 'Воркер перезапущен — задача прервана', "updated_at" = now() WHERE status = 'running'`,
  )
  if (stuck.rowCount > 0) console.log(`reset ${stuck.rowCount} stuck task(s) -> failed`)
  console.log('worker connected, polling every', POLL_MS / 1000, 's')
  await refreshAgentEnv()
  console.log('provider:', agentEnv.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'anthropic (default)')
  console.log('model:', agentEnv.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'default')

  // Fail-closed гейт: ключ должен быть в .env ИЛИ в конфиге CRM (agent_settings).
  // Иначе воркер не стартует — ошибка видна сразу в journalctl, а не в задачах.
  const hasKey = [
    agentEnv.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    agentEnv.ANTHROPIC_AUTH_TOKEN,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].some(Boolean)
  if (!hasKey) {
    console.error('Нет ключа API: задай ANTHROPIC_API_KEY/AUTH_TOKEN в /home/n15/n15-agent/.env или сохрани конфиг в модалке CRM (agent_settings)')
    process.exit(1)
  }

  // Периодически обновляем конфиг из БД (редактирование из модалки CRM)
  setInterval(() => { refreshAgentEnv().catch(() => {}) }, 30 * 1000)

  // Почта: забираем письма с ящика (раз в минуту)
  if (!imap) console.warn('imapflow не установлен — синхронизация почты отключена (запусти install.sh)')
  syncMailOnce().catch((e) => console.error('mail sync error', e))
  setInterval(() => { syncMailOnce().catch(() => {}) }, MAIL_SYNC_MS)

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
        if (task.prompt === AUTH_PROMPT) {
          await runAuthTask(client, task)
        } else {
          await runAgentTask(client, task)
        }
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
