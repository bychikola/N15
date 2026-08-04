#!/bin/bash
# ============================================================
# N15 — автоматическое развёртывание на VPS (Docker + Caddy)
#
# Запуск на сервере:
#   bash deploy.sh
#
# Скрипт делает всё по порядку:
#   1. Останавливает веб-сервер хостера (nginx/apache), если мешает порту 80
#   2. Устанавливает Docker + Docker Compose (если нет)
#   3. Клонирует (или обновляет) код в ~/n15
#   4. Создаёт .env с секретами (если его ещё нет)
#   5. Собирает и запускает сайт
#   6. Caddy сам получает SSL-сертификат (Let's Encrypt) — вручную certbot НЕ нужен
# ============================================================
set -e

# ---- Настройки (можно менять) ----
REPO="https://github.com/bychikola/N15.git"
BRANCH="master"
APP_DIR="$HOME/n15"              # папка сайта (меняй на любой путь, например /var/www/n15)
DOMAIN="n15-realty.ru"           # твой домен
# NEXT_PUBLIC_YANDEX_MAPS_API_KEY — если не задан ниже, скрипт спросит
YANDEX_MAPS_API_KEY="${NEXT_PUBLIC_YANDEX_MAPS_API_KEY:-}"
# ---------------------------------

echo ""
echo "======================================"
echo "  N15 — развёртывание на VPS"
echo "  Папка: $APP_DIR"
echo "  Домен: $DOMAIN"
echo "======================================"
echo ""

# ---------- 1. Остановить веб-сервер хостера (порт 80) ----------
echo "[1/6] Освобождаю порт 80/443 (останавливаю nginx/apache хостера)..."
for svc in nginx apache2 httpd caddy; do
    if systemctl list-unit-files 2>/dev/null | grep -q "^${svc}\.service"; then
        echo "  Останавливаю $svc..."
        sudo systemctl stop "$svc" 2>/dev/null || true
        sudo systemctl disable "$svc" 2>/dev/null || true
    fi
done
# Если что-то всё ещё слушает 80/443 — убиваем
sudo fuser -k 80/tcp 2>/dev/null || true
sudo fuser -k 443/tcp 2>/dev/null || true
echo "  Порт 80/443 свободен."

# ---------- 2. Установить Docker ----------
echo "[2/6] Проверяю Docker..."
if ! command -v docker &> /dev/null; then
    echo "  Устанавливаю Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "  Docker установлен. Перелогиньтесь (exit + ssh заново), затем запустите: bash deploy.sh"
    echo "  Или продолжите с sudo: sudo bash deploy.sh"
    exit 0
fi
docker --version
docker compose version 2>/dev/null || echo "  (docker compose — встроен в docker)"

# ---------- 3. Клонировать / обновить код ----------
echo "[3/6] Получаю код..."
if [ -d "$APP_DIR/.git" ]; then
    echo "  Обновляю существующую копию..."
    cd "$APP_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    echo "  Клонирую репозиторий..."
    mkdir -p "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# ---------- 4. Создать .env с секретами ----------
echo "[4/6] Настраиваю .env..."
if [ ! -f .env ]; then
    echo "  Создаю .env (сохранится один раз)..."
    if [ -z "$YANDEX_MAPS_API_KEY" ]; then
        read -rp "  Введи ключ Яндекс.Карт (JavaScript API): " YANDEX_MAPS_API_KEY
    fi
    PAYLOAD_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
    cat > .env <<EOF
# Сгенерировано deploy.sh $(date +%F)
PAYLOAD_SECRET=$PAYLOAD_SECRET
POSTGRES_USER=n15
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=n15
NEXT_PUBLIC_SERVER_URL=https://$DOMAIN
NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$YANDEX_MAPS_API_KEY
EOF
    chmod 600 .env
    echo "  .env создан."
else
    echo "  .env уже существует — пропускаю (замени при необходимости)."
fi

# ---------- 5. Сборка и запуск ----------
echo "[5/6] Собираю и запускаю сайт (первый раз ~3-7 минут)..."
# Импортируем переменные из .env для docker compose
set -a
. ./.env
set +a
docker compose up -d --build

# ---------- 6. Ждём готовности ----------
echo "[6/6] Проверяю запуск..."
sleep 5
docker compose ps

echo ""
echo "======================================"
echo "  ✅ Сайт развёрнут!"
echo ""
echo "  Домен:  https://$DOMAIN"
echo "  Админ:  https://$DOMAIN/admin"
echo ""
echo "  Первый админ создаётся через админку:"
echo "    открой https://$DOMAIN/admin и нажми 'Create First User'"
echo ""
echo "  SSL-сертификат ставит Caddy автоматически"
echo "  (первые ~30 секунд может быть ошибка сертификата — подожди и обнови)."
echo ""
echo "  Полезные команды:"
echo "    docker compose logs -f app     # логи приложения"
echo "    docker compose ps              # статус"
echo "    cd $APP_DIR && bash deploy.sh  # обновить сайт"
echo "======================================"
echo ""
