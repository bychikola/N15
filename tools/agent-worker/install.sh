#!/bin/bash
# ============================================================
# Установка воркера ИИ-агента N15 на VPS-хост (НЕ в docker)
#
# Запуск (от root):
#   bash /root/n15/tools/agent-worker/install.sh
#
# Скрипт сам:
#   1. Ставит Node 22 и Claude Code CLI (npm) — если нет
#   2. Создаёт пользователя n15 (не root!) и отдаёт ему репозиторий сайта
#   3. Даёт n15 доступ к docker (для deploy.sh)
#   4. Генерирует SSH-ключ для n15 (нужно добавить его в GitHub как deploy key)
#   5. Ставит воркер в /home/n15/n15-agent и запускает сервис от пользователя n15
#      (Claude Code запрещает --dangerously-skip-permissions под root)
#   6. Ставит @openai/codex (авторизация ChatGPT) + claudex (прокси на порт 4000)
#      и запускает сервис n15-proxy — бэкенд ChatGPT Plus для агента
# Повторный запуск — безопасен (обновление).
# ============================================================
set -e

REPO_DIR="${N15_REPO:-$HOME/n15}"
N15_USER="${N15_USER:-n15}"
N15_HOME="/home/$N15_USER"
AGENT_DIR="$N15_HOME/n15-agent"

echo "======================================"
echo "  N15 — установка ИИ-агента"
echo "  Репозиторий: $REPO_DIR"
echo "  Пользователь: $N15_USER (не root)"
echo "  Воркер: $AGENT_DIR"
echo "======================================"

# ---------- 1. Node 22 ----------
if command -v node >/dev/null 2>&1; then
  echo "[1/10] Node: $(node -v) — уже установлен"
else
  echo "[1/10] Устанавливаю Node 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  echo "  Node: $(node -v)"
fi

# ---------- 2. Claude Code CLI (npm — работает в любом регионе) ----------
if command -v claude >/dev/null 2>&1; then
  echo "[2/10] Claude Code CLI: установлен ($(claude --version 2>/dev/null || echo ok))"
else
  echo "[2/10] Устанавливаю Claude Code CLI (npm)..."
  npm install -g @anthropic-ai/claude-code
  export PATH="$PATH:$(npm prefix -g)/bin"
  echo "  CLI: $(claude --version 2>/dev/null || echo ok)"
fi

# ---------- 3. Пользователь n15 + доступ к репозиторию ----------
echo "[3/10] Пользователь $N15_USER..."
if ! id "$N15_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$N15_USER"
  echo "  Создан пользователь $N15_USER"
fi
usermod -aG docker "$N15_USER" 2>/dev/null || echo "  (docker-группа не добавлена — проверь вручную)"
# после смены владельца git от root ругается на "dubious ownership"
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true
# путь к репо должен быть проходим для n15 (если репо в /root/...)
PARENT=$(dirname "$REPO_DIR")
chmod o+x "$PARENT" 2>/dev/null || true
chown -R "$N15_USER:$N15_USER" "$REPO_DIR"
echo "  Репозиторий $REPO_DIR отдан пользователю $N15_USER"

# ---------- 4. SSH-ключ для git push ----------
echo "[4/10] SSH-ключ для $N15_USER..."
sudo -u "$N15_USER" bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519'
PUBKEY=$(sudo -u "$N15_USER" cat "$N15_HOME/.ssh/id_ed25519.pub")
echo "  Публичный ключ (добавь в GitHub → Settings → Deploy keys репозитория N15):"
echo "  ---"
echo "$PUBKEY"
echo "  ---"
# git-автор коммитов (иначе commit падает: "Author identity unknown")
sudo -u "$N15_USER" git config --global user.name "N15 Agent"
sudo -u "$N15_USER" git config --global user.email "agent@n15-realty.ru"
# если репозиторий склонирован по https — переключаем origin на SSH,
# чтобы push шёл по deploy key, а не спрашивал пароль
CURRENT_REMOTE=$(sudo -u "$N15_USER" git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)
if [[ "$CURRENT_REMOTE" == https://* ]]; then
  SSH_REMOTE="git@github.com:${CURRENT_REMOTE#https://github.com/}"
  sudo -u "$N15_USER" git -C "$REPO_DIR" remote set-url origin "$SSH_REMOTE"
  echo "  origin переключён на SSH: $SSH_REMOTE"
fi
sudo -u "$N15_USER" bash -c 'ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null || true'

# ---------- 5. Воркер ----------
echo "[5/10] Готовлю воркер..."
if [ ! -f "$REPO_DIR/tools/agent-worker/worker.js" ]; then
  echo "Ошибка: не найден $REPO_DIR/tools/agent-worker/worker.js — сделай git pull" >&2
  exit 1
fi
mkdir -p "$AGENT_DIR"
cp "$REPO_DIR/tools/agent-worker/worker.js" "$AGENT_DIR/worker.js"
cp "$REPO_DIR/tools/agent-worker/package.json" "$AGENT_DIR/package.json"
chown -R "$N15_USER:$N15_USER" "$AGENT_DIR"
cd "$AGENT_DIR"
if [ ! -d node_modules ]; then
  sudo -u "$N15_USER" npm install
else
  sudo -u "$N15_USER" npm install --silent
fi

# ---------- 6. DATABASE_URI ----------
echo "[6/10] Собираю DATABASE_URI из $REPO_DIR/.env..."
if [ ! -f "$REPO_DIR/.env" ]; then
  echo "Ошибка: не найден $REPO_DIR/.env" >&2
  exit 1
fi
PGUSER=$(grep '^POSTGRES_USER=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGPASS=$(grep '^POSTGRES_PASSWORD=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGDB=$(grep '^POSTGRES_DB=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-)
PGHOST="localhost"
if ! (echo > /dev/tcp/localhost/5432) 2>/dev/null; then
  PGHOST=$(docker inspect n15-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null | tr -d ' ')
fi
DATABASE_URI="postgres://${PGUSER:-n15}:${PGPASS}@${PGHOST}:5432/${PGDB:-n15}"
echo "  DATABASE_URI: postgres://$PGUSER:****@$PGHOST:5432/$PGDB"

# ---------- 7. Ключ DeepSeek ----------
echo "[7/10] Проверяю ключ ANTHROPIC_AUTH_TOKEN..."
if [ -n "$ANTHROPIC_AUTH_TOKEN" ]; then
  TOKEN="$ANTHROPIC_AUTH_TOKEN"
  echo "  (взят из переменной окружения)"
else
  read -rp "  Вставь ключ DeepSeek (ANTHROPIC_AUTH_TOKEN, fallback-бэкенд — активный конфиг в модалке CRM): " TOKEN
fi
cat > "$AGENT_DIR/.env" << EOF
ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://api.deepseek.com/anthropic}
ANTHROPIC_AUTH_TOKEN=$TOKEN
ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-deepseek-v4-flash}
DATABASE_URI=$DATABASE_URI
N15_REPO=$REPO_DIR
EOF
chown "$N15_USER:$N15_USER" "$AGENT_DIR/.env"
chmod 600 "$AGENT_DIR/.env"

# ---------- 8. systemd (запуск от пользователя n15) ----------
echo "[8/10] Устанавливаю systemd-сервис..."
cat > /etc/systemd/system/n15-agent.service << EOF
[Unit]
Description=N15 AI agent worker
After=network.target postgresql.service docker.service

[Service]
Type=simple
User=$N15_USER
Group=docker
WorkingDirectory=$AGENT_DIR
EnvironmentFile=$AGENT_DIR/.env
ExecStart=$(npm prefix -g)/bin/node $AGENT_DIR/worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable n15-agent >/dev/null 2>&1 || true
# enable --now не перезапускает уже запущенный сервис — делаем явный restart
systemctl restart n15-agent
sleep 2
systemctl status n15-agent --no-pager | head -12 || true

# ---------- 9. Бэкенд ChatGPT Plus: @openai/codex (логин) + claudex (прокси) ----------
echo "[9/10] Устанавливаю @openai/codex@0.151.0 и claudex@1.0.5 (npm -g)..."
if ! npm list -g @openai/codex@0.151.0 >/dev/null 2>&1; then npm install -g @openai/codex@0.151.0; fi
if ! npm list -g claudex@1.0.5 >/dev/null 2>&1; then npm install -g claudex@1.0.5; fi
echo "  codex: $(command -v codex || echo ok) / claudex: $(command -v claudex || echo ok)"

# ---------- 10. systemd-юнит прокси (порт 4000, от n15) ----------
echo "[10/10] Устанавливаю systemd-сервис n15-proxy..."
cat > /etc/systemd/system/n15-proxy.service << EOF
[Unit]
Description=N15 claudex proxy (Claude Code -> ChatGPT Plus)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$N15_USER
Environment=CODEX_MODEL=gpt-5.5
ExecStart=$(npm prefix -g)/bin/claudex --reuse-codex --port 4000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable n15-proxy >/dev/null 2>&1 || true
# до device-auth claudex может не стартовать — не критично
systemctl restart n15-proxy || true
# claudex не умеет выбирать интерфейс привязки — закрываем порт 4000 снаружи
# на уровне firewall: доступ только с localhost (прокси не проверяет ключи,
# открытый доступ = кто угодно жжёт квоту подписки).
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport 4000 -s 127.0.0.1 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 4000 -s 127.0.0.1 -j ACCEPT
  iptables -C INPUT -p tcp --dport 4000 -j DROP 2>/dev/null || iptables -I INPUT 2 -p tcp --dport 4000 -j DROP
  echo "  iptables: порт 4000 доступен только с localhost"
else
  echo "  ⚠ iptables не найден — закрой порт 4000 снаружи вручную (ufw/firewalld)"
fi

echo ""
echo "======================================"
echo "  ✅ Воркер установлен и запущен от $N15_USER!"
echo "  1. Добавь публичный ключ выше в GitHub (Deploy keys репозитория)"
echo "  2. Проверка воркера: journalctl -u n15-agent -f"
echo "  ── Бэкенд ChatGPT Plus (n15-proxy, порт 4000) ──"
echo "  3. В ChatGPT (chatgpt.com) → Settings → Security включи «Allow device code login»"
echo "  4. Авторизуй Codex от имени n15:"
echo "       sudo -u n15 codex login --device-auth"
echo "     (URL + код — подтверди с телефона)"
echo "  5. Проверка источников: sudo -u n15 claudex --reuse-codex --list-sources"
echo "  6. systemctl restart n15-proxy"
echo "  7. Проверка прокси: curl -s http://127.0.0.1:4000/health"
echo "  8. Проверка привязки (должно быть 127.0.0.1): ss -tlnp | grep 4000"
echo "  ВАЖНО: токен протухает после ~8 дней простоя — повтори п.4"
echo "  Возврат на DeepSeek: конфиг _deepseek_template в модалке настроек CRM"
echo "======================================"
