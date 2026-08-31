# Воркер ИИ-агента (установка на VPS)

В основе — **настоящий терминальный Claude Code CLI** (headless-режим `claude -p`): тот же агент, что в локальной сессии, со всеми плагинами и скиллами. Воркер берёт запрос из очереди CRM, запускает CLI в репозитории сайта, затем сам проверяет (tsc/lint), коммитит, пушит и деплоит.

⚠️ CLI запускается с `--dangerously-skip-permissions` — агент имеет полный доступ (как локальный Claude Code). Это сознательный выбор владельца.

## Установка — одной командой

```bash
cd ~/n15 && git pull origin master && bash tools/agent-worker/install.sh
```

Скрипт сам: ставит Node и Claude Code CLI, копирует воркер, собирает `DATABASE_URI` из `.env`, спросит ключ DeepSeek (или возьмёт из `ANTHROPIC_AUTH_TOKEN`) и запустит сервис. Повторный запуск — обновление.

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
