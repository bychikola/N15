# Воркер ИИ-агента (установка на VPS)

В основе — **настоящий терминальный Claude Code CLI** (headless-режим `claude -p`): тот же агент, что в локальной сессии, со всеми плагинами и скиллами. Воркер берёт запрос из очереди CRM, запускает CLI в репозитории сайта, затем сам проверяет (tsc/lint), коммитит, пушит и деплоит.

⚠️ CLI запускается с `--dangerously-skip-permissions` — агент имеет полный доступ (как локальный Claude Code). Это сознательный выбор владельца.

## Установка

```bash
# 1. Node 22 + Claude Code CLI на хост
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
curl -fsSL https://claude.ai/install.sh | bash   # установит claude CLI

# 2. Плагины/скиллы — те же, что локально (из ~/.claude на ПК)
#    Вариант А (рекомендуется): установить те же плагины через CLI:
claude plugin marketplace add anthropics/claude-code  # или твои маркетплейсы
claude plugin install superpowers@anthropics          # пример — по факту твоих плагинов
#    Вариант Б: скопировать конфиг с локального ПК:
#    scp -r C:\Users\Admin\.claude\plugins root@IP:/root/.claude/   (и settings.json)

# 3. Папка воркера
mkdir -p /root/n15-agent
cd /root/n15-agent
cp /root/n15/tools/agent-worker/worker.js /root/n15/tools/agent-worker/package.json .
npm install

# 4. Конфиг
# Провайдер — DeepSeek (Anthropic-совместимый endpoint), как в локальном
# конфиге ~/.claude/settings.json на ПК. Значения берутся оттуда же:
cat > /root/n15-agent/.env << 'EOF'
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=<ключ из ~/.claude/settings.json на ПК>
ANTHROPIC_MODEL=deepseek-v4-flash
DATABASE_URI=postgres://n15:ПАРОЛЬ@localhost:5432/n15
N15_REPO=/root/n15
EOF
chmod 600 /root/n15-agent/.env

# 5. systemd
cp /root/n15/tools/agent-worker/worker.service /etc/systemd/system/n15-agent.service
systemctl daemon-reload
systemctl enable --now n15-agent
systemctl status n15-agent
```

`DATABASE_URI` возьми из `~/n15/.env` (`POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB`, хост `localhost:5432` для хоста).

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
