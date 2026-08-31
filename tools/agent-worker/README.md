# Воркер ИИ-агента (установка на VPS)

В основе — **настоящий терминальный Claude Code CLI** (headless-режим `claude -p`): тот же агент, что в локальной сессии, со всеми плагинами и скиллами. Воркер берёт запрос из очереди CRM, запускает CLI в репозитории сайта, затем сам проверяет (tsc/lint), коммитит, пушит и деплоит.

⚠️ CLI запускается с `--dangerously-skip-permissions` — агент имеет полный доступ (как локальный Claude Code). Это сознательный выбор владельца.

## Установка — одной командой

```bash
cd ~/n15 && git pull origin master && bash tools/agent-worker/install.sh
```

Скрипт сам: ставит Node и Claude Code CLI (**через npm** — работает в регионах, где claude.ai/install.sh недоступен), создаёт пользователя `n15` (воркер не работает от root — Claude Code запрещает `--dangerously-skip-permissions` под root), отдаёт ему репозиторий, даёт docker-группу, генерирует SSH-ключ, собирает `DATABASE_URI`, спросит ключ DeepSeek и запустит сервис от `n15`. Повторный запуск — обновление.

После установки добавь напечатанный публичный SSH-ключ в GitHub (Settings → Deploy keys репозитория N15) — иначе `git push` не пройдёт.

## Плагины/скиллы (после установки, один раз)

Те же, что локально (из `~/.claude` на ПК) — либо установить через CLI:

```bash
claude plugin marketplace add <твой маркетплейс>   # например anthropics/claude-code
claude plugin install superpowers@anthropics
```

Либо скопировать конфиг: `scp -r C:\Users\Admin\.claude\plugins root@IP:/root/.claude/` (+ settings.json).

## Проверка

```bash
systemctl status n15-agent
journalctl -u n15-agent -f   # должно быть: worker connected, provider: https://api.deepseek.com/anthropic
```

`DATABASE_URI` собирается автоматически из `~/n15/.env` (fallback на IP контейнера postgres).

## Проверка CLI

```bash
claude --version
# в ~/n15: claude -p "проверь, что я работаю" --output-format text --dangerously-skip-permissions
```

## Логи

```bash
journalctl -u n15-agent -f
```

## Обновление воркера

```bash
cd /root/n15-agent && cp /root/n15/tools/agent-worker/worker.js . && systemctl restart n15-agent
```
