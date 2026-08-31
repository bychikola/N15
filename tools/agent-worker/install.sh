#!/bin/bash
# ============================================================
# Установка воркера ИИ-агента N15 на VPS-хост (НЕ в docker)
#
# Запуск:
#   bash /root/n15/tools/agent-worker/install.sh
#
# Скрипт сам:
#   1. Ставит Node 22 (если нет)
#   2. Ставит Claude Code CLI (если нет)
#   3. Копирует воркер в /root/n15-agent и ставит зависимости
#   4. Собирает DATABASE_URI из .env сайта автоматически
#   5. Спрашивает ключ DeepSeek (ANTHROPIC_AUTH_TOKEN) — если не задан заранее
#   6. Создаёт .env, systemd-юнит и запускает сервис
# Повторный запуск — безопасен (обновление воркера).
# ============================================================
set -e

REPO_DIR="${N15_REPO:-$HOME/n15}"
AGENT_DIR="/root/n15-agent"

echo "======================================"
echo "  N15 — установка ИИ-агента"
echo "  Репозиторий: $REPO_DIR"
echo "  Воркер: $AGENT_DIR"
echo "======================================"

# ---------- 1. Node 22 ----------
if command -v node >/dev/null 2>&1; then
  echo "[1/7] Node: $(node -v) — уже установлен"
else
  echo "[1/7] Устанавливаю Node 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  echo "  Node: $(node -v)"
fi

# ---------- 2. Claude Code CLI ----------
if command -v claude >/dev/null 2>&1; then
  echo "[2/7] Claude Code CLI: $(claude --version 2>/dev/null || echo installed) — уже установлен"
else
  echo "[2/7] Устанавливаю Claude Code CLI..."
  curl -fsSL https://claude.ai/install.sh | bash
  # свежий PATH после установки
  export PATH="$HOME/.local/bin:$PATH"
  echo "  CLI: $(claude --version 2>/dev/null || echo ok)"
fi
export PATH="$HOME/.local/bin:$PATH"

# ---------- 3. Воркер ----------
echo "[3/7] Готовлю воркер..."
if [ ! -f "$REPO_DIR/tools/agent-worker/worker.js" ]; then
  echo "Ошибка: не найден $REPO_DIR/tools/agent-worker/worker.js — сделай git pull в $REPO_DIR" >&2
  exit 1
fi
mkdir -p "$AGENT_DIR"
cp "$REPO_DIR/tools/agent-worker/worker.js" "$AGENT_DIR/worker.js"
cp "$REPO_DIR/tools/agent-worker/package.json" "$AGENT_DIR/package.json"
cp "$REPO_DIR/tools/agent-worker/worker.service" "$AGENT_DIR/worker.service"
cd "$AGENT_DIR"
if [ ! -d node_modules ]; then
  npm install
else
  npm install --silent
fi

# ---------- 4. DATABASE_URI из .env сайта ----------
echo "[4/7] Собираю DATABASE_URI из $REPO_DIR/.env..."
if [ ! -f "$REPO_DIR/.env" ]; then
  echo "Ошибка: не найден $REPO_DIR/.env" >&2
  exit 1
fi
PGUSER=$(grep '^POSTGRES_USER=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGPASS=$(grep '^POSTGRES_PASSWORD=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGDB=$(grep '^POSTGRES_DB=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGHOST="localhost"
# если postgres недоступен на localhost — берём IP контейнера
if ! (echo > /dev/tcp/localhost/5432) 2>/dev/null; then
  PGHOST=$(docker inspect n15-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | tr -d ' ')
fi
DATABASE_URI="postgres://${PGUSER:-n15}:${PGPASS}@${PGHOST}:5432/${PGDB:-n15}"
echo "  DATABASE_URI: postgres://$PGUSER:****@$PGHOST:5432/$PGDB"

# ---------- 5. Ключ DeepSeek ----------
echo "[5/7] Проверяю ключ ANTHROPIC_AUTH_TOKEN..."
if [ -n "$ANTHROPIC_AUTH_TOKEN" ]; then
  TOKEN="$ANTHROPIC_AUTH_TOKEN"
  echo "  (взят из переменной окружения)"
else
  read -rp "  Вставь ключ DeepSeek (ANTHROPIC_AUTH_TOKEN): " TOKEN
fi
if [ -z "$TOKEN" ]; then
  echo "Ошибка: ключ не задан — воркер не сможет работать. Продолжаю без него? (впишешь в модалке CRM)" >&2
  read -rp "  Нажми Enter чтобы продолжить без ключа: " _
fi

# ---------- 6. .env ----------
echo "[6/7] Пишу $AGENT_DIR/.env..."
cat > "$AGENT_DIR/.env" << EOF
ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://api.deepseek.com/anthropic}
ANTHROPIC_AUTH_TOKEN=$TOKEN
ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-deepseek-v4-flash}
DATABASE_URI=$DATABASE_URI
N15_REPO=$REPO_DIR
EOF
chmod 600 "$AGENT_DIR/.env"

# ---------- 7. systemd ----------
echo "[7/7] Устанавливаю systemd-сервис..."
cp "$AGENT_DIR/worker.service" /etc/systemd/system/n15-agent.service
systemctl daemon-reload
systemctl enable --now n15-agent
sleep 2
systemctl status n15-agent --no-pager | head -10 || true

echo ""
echo "======================================"
echo "  ✅ Воркер установлен и запущен!"
echo "  Логи: journalctl -u n15-agent -f"
echo "  Проверка: systemctl status n15-agent"
echo "======================================"
