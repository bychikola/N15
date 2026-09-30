#!/usr/bin/env bash
# Перенос проекта Н15 на другой сервер: бэкап → проверка → восстановление →
# проверка результата. Запуск по шагам, каждый шаг завершается отдельно
# (иначе сломанная середина оставит оба сервера в неясном состоянии).
#
#   На СТАРОМ сервере:   bash tools/migrate-server.sh backup
#   Скопировать папку    rsync -avP /root/n15-migrate user@НОВЫЙ:/root/
#   На НОВОМ сервере:     bash tools/migrate-server.sh restore
#   Проверить результат:  bash tools/migrate-server.sh check
#
# Скрипт НИКОГДА не трогает исходный сервер: backup только читает, restore
# работает по локальному пути назначения.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/n15}"
BACKUP_DIR="${BACKUP_DIR:-/root/n15-migrate}"
STAMP="$(date +%Y%m%d-%H%M)"
# Том с фотографиями: ищем по имени тома docker (n15_media на этом проекте).
# Том обязателен отдельно от базы: в дампе БД файлов нет.
find_media_volume() {
  docker volume ls -q | grep -E '(^|_)media$' | head -1
}

# Логин и база — из .env проекта (postgres поднимается с ними при первом старте)
pguser() { local v; v=$(grep -E '^POSTGRES_USER=' "$REPO_DIR/.env" | head -1 | cut -d= -f2-); echo "${v:-n15}"; }
pgdb()   { local v; v=$(grep -E '^POSTGRES_DB='   "$REPO_DIR/.env" | head -1 | cut -d= -f2-); echo "${v:-n15}"; }

# ── backup: только чтение данных, сервисы на время снятия копии ─────────────
# Почему сервисы останавливаются: фоновая разметка фотографий (media-marking)
# в этот момент ПЕРЕПИСЫВАЕТ файлы на диске, и архив может поймать фотографию
# на середине записи — файл формально есть, а открыть его нельзя. По той же
# причине агент не должен коммитить посреди переезда.
#
# Отмена происходит автоматически: даже если архивирование упадёт, сайт и агент
# вернутся (trap EXIT ниже).
PAUSED=0
resume_services() {
  [[ "$PAUSED" == 1 ]] || return 0
  PAUSED=0
  echo
  echo "-- Возвращаю сайт и агента"
  docker compose start app >/dev/null 2>&1 || true
  systemctl start n15-agent >/dev/null 2>&1 || true
}
trap resume_services EXIT

cmd_backup() {
  cd "$REPO_DIR"
  [[ -f .env ]] || { echo "Нет $REPO_DIR/.env" >&2; exit 1; }

  local vol; vol="$(find_media_volume)"
  [[ -n "$vol" ]] || { echo "Не найден том с медиа (docker volume ls)" >&2; exit 1; }

  mkdir -p "$BACKUP_DIR"
  echo "== Каталог бэкапа: $BACKUP_DIR"
  echo "== Том с фотографиями: $vol"

  # Сколько влезает копировать — чтобы понимать, сколько это займёт по времени
  echo "== Объём фотографий (это надолго, если много)"
  docker run --rm -v "$vol":/data alpine \
    sh -c "du -sh /data 2>/dev/null | cut -f1" | sed 's/^/   /'

  echo "-- Останавливаю сайт и агента (фото перестанут переписываться)"
  docker compose stop app >/dev/null
  systemctl stop n15-agent >/dev/null 2>&1 || true
  PAUSED=1
  echo "   Сайт недоступен, пока снимается копия — это нужно для целостности фото."

  echo "-- База данных (агенты, администратор, объекты, заявки, письма)"
  docker compose exec -T postgres pg_dump -U "$(pguser)" -d "$(pgdb)" \
    | gzip > "$BACKUP_DIR/db.sql.gz"

  # Точка в конце (tar czf ... -C /data .) обязательна: без неё скрытые папки
  # media/originals и media/.wm-backup НЕ попадут в архив, и оригиналы
  # фотографий молча потеряются
  echo "-- Фотографии (том $vol), включая скрытые папки originals и .wm-backup"
  docker run --rm -v "$vol":/data -v "$BACKUP_DIR":/out alpine \
    tar czf "/out/media.tar.gz" -C /data .

  echo "-- Секреты"
  cp .env "$BACKUP_DIR/app.env"
  [[ -f /home/n15/n15-agent/.env ]] && cp /home/n15/n15-agent/.env "$BACKUP_DIR/agent.env" || true
  [[ -d /home/n15/.ssh ]] && cp -r /home/n15/.ssh "$BACKUP_DIR/n15-ssh" || true

  echo
  echo "== Проверка бэкапа (пустой архив — самая частая ошибка)"
  cmd_verify
}

# ── verify: читаемость и полнота архивов ────────────────────────────────────
cmd_verify() {
  local ok=1

  [[ -s "$BACKUP_DIR/db.sql.gz" ]] || { echo "НЕТ db.sql.gz"; ok=0; }
  if zcat "$BACKUP_DIR/db.sql.gz" 2>/dev/null | tail -3 | grep -q "database dump complete"; then
    echo "OK   база: дамп дочитан"
  else
    echo "FAIL база: дамп не дочитан или битый"; ok=0
  fi

  [[ -s "$BACKUP_DIR/media.tar.gz" ]] || { echo "НЕТ media.tar.gz"; ok=0; }
  local files; files="$(tar tzf "$BACKUP_DIR/media.tar.gz" 2>/dev/null | grep -c . || echo 0)"
  if [[ "${files:-0}" -gt 0 ]]; then
    echo "OK   фото: файлов в архиве — $files"
  else
    echo "FAIL фото: архив пуст или не читается"; ok=0
  fi

  # Скрытые папки — то, что молча теряется
  if tar tzf "$BACKUP_DIR/media.tar.gz" 2>/dev/null | grep -qE 'originals|wm-backup'; then
    echo "OK   скрытые папки (originals / .wm-backup) внутри архива"
  else
    echo "ВНИМАНИЕ скрытых папок нет — оригиналы фото могут не перенестись"
  fi

  [[ -f "$BACKUP_DIR/app.env" ]] && echo "OK   .env сайта сохранён" || { echo "НЕТ app.env"; ok=0; }

  echo
  ls -lh "$BACKUP_DIR" | tail -n +2
  [[ "$ok" = 1 ]] || { echo "Бэкап неполон — восстановление отменено." >&2; exit 1; }
  echo "Бэкап полон, можно переносить."
}

# ── restore: только локальный сервер назначения ──────────────────────────────
cmd_restore() {
  cd "$REPO_DIR"
  cmd_verify            # не восстанавливаемся из непроверенного архива

  [[ -f .env ]] || { echo "В .env нет PAYLOAD_SECRET — скопируй app.env до деплоя" >&2; exit 1; }

  # Поднимаем только базу: приложение стартует после восстановления
  docker compose up -d postgres
  for i in $(seq 1 30); do
    docker compose exec -T postgres pg_isready -U "$(pguser)" -d "$(pgdb)" >/dev/null 2>&1 && break
    sleep 2
  done

  # Восстановление в пустую базу. Если данные уже есть — повторное
  # восстановление допишет поверх, и это ловушка, поэтому проверяем заранее
  local rows; rows="$(docker compose exec -T postgres psql -U "$(pguser)" -d "$(pgdb)" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')"
  if [[ "${rows:-0}" -gt 3 ]]; then
    echo "В базе уже есть таблицы ($rows) — похоже, восстановление уже было." >&2
    echo "Если это точно нужно — сначала: docker compose down && docker volume rm n15_pgdata" >&2
    exit 1
  fi

  echo "-- Восстанавливаю базу"
  gunzip -c "$BACKUP_DIR/db.sql.gz" \
    | docker compose exec -T postgres psql -q -U "$(pguser)" -d "$(pgdb)"

  local vol; vol="$(find_media_volume)"
  if [[ -n "$vol" ]]; then
    echo "-- Восстанавливаю фотографии в том $vol"
    docker run --rm -v "$vol":/data -v "$BACKUP_DIR":/out:ro alpine \
      tar xzf /out/media.tar.gz -C /data
  else
    echo "Том с медиа пока не создан — он появится при первом docker compose up app"
  fi

  echo "-- Собираю и запускаю сайт (15–45 минут)"
  bash deploy.sh

  echo "-- Ставлю ИИ-агента"
  bash tools/agent-worker/install.sh

  # SSH-ключ: без него агент и деплой не смогут ходить в GitHub
  if [[ -d "$BACKUP_DIR/n15-ssh" ]]; then
    echo "-- Восстанавливаю SSH-ключ пользователя n15"
    mkdir -p /home/n15/.ssh
    cp -r "$BACKUP_DIR/n15-ssh/." /home/n15/.ssh/
    chown -R n15:n15 /home/n15/.ssh
    chmod 700 /home/n15/.ssh; chmod 600 /home/n15/.ssh/* 2>/dev/null || true
  fi
  [[ -f "$BACKUP_DIR/agent.env" && -f /home/n15/n15-agent/.env ]] && \
    cp "$BACKUP_DIR/agent.env" /home/n15/n15-agent/.env && \
    chown n15:n15 /home/n15/n15-agent/.env && chmod 600 /home/n15/n15-agent/.env && \
    systemctl restart n15-agent || true

  echo
  echo "Восстановление закончено. Проверь: bash tools/migrate-server.sh check"
}

# ── check: что именно просил перенести ──────────────────────────────────────
cmd_check() {
  cd "$REPO_DIR"
  local du pgdbx
  du="$(pgdb)"; pgdbx="$(pguser)"

  echo "== АДМИНИСТОР"
  docker compose exec -T postgres psql -U "$pgdbx" -d "$du" -tAc \
    "SELECT email, role FROM users WHERE role='admin' ORDER BY id" \
    | sed 's/^/   /' || echo "   НЕТ"

  echo "== АГЕНТЫ (всего: $(docker compose exec -T postgres psql -U "$pgdbx" -d "$du" -tAc 'SELECT count(*) FROM agents' | tr -d '[:space:]'))"
  docker compose exec -T postgres psql -U "$pgdbx" -d "$du" -tAc \
    "SELECT id, name, \"isActive\" FROM agents ORDER BY sort_order, id LIMIT 20" \
    | sed 's/^/   /' || true

  echo "== ОБЪЕКТЫ (всего: $(docker compose exec -T postgres psql -U "$pgdbx" -d "$du" -tAc 'SELECT count(*) FROM objects' | tr -d '[:space:]'))"
  echo "== ЗАЯВКИ (всего: $(docker compose exec -T postgres psql -U "$pgdbx" -d "$du" -tAc 'SELECT count(*) FROM applications' | tr -d '[:space:]'))"

  local vol; vol="$(find_media_volume)"
  if [[ -n "$vol" ]]; then
    echo "== ФОТОГРАФИИ на диске"
    docker run --rm -v "$vol":/data alpine sh -c \
      "find /data -type f | wc -l" | sed 's/^/   файлов: /'
    docker run --rm -v "$vol":/data alpine sh -c \
      "du -sh /data 2>/dev/null | cut -f1" | sed 's/^/   объём: /'
  else
    echo "== ТОМ С ФОТОГРАФИЯМИ НЕ НАЙДЕН"
  fi

  echo
  echo "Ручная проверка (с другого компьютера, до смены DNS):"
  echo "  curl -sI -H 'Host: n15-realty.ru' http://IP_НОВОГО/ru | head -3"
  echo "  открой сайт, войди в CRM под администратором, открой объект с фото"
}

case "${1:-}" in
  backup)  cmd_backup ;;
  verify)  cmd_verify ;;
  restore) cmd_restore ;;
  check)   cmd_check ;;
  *) echo "Использование: $0 {backup|verify|restore|check}"; exit 1 ;;
esac
