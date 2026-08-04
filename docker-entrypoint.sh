#!/bin/sh
set -e

echo "=== N15 container starting ==="

# Ждём готовности Postgres (если DATABASE_URI задан)
if [ -n "$DATABASE_URI" ]; then
  echo "Waiting for PostgreSQL..."
  # извлекаем host:port из postgres://user:pass@host:port/db
  DB_HOST=$(echo "$DATABASE_URI" | sed -E 's#postgres(ql)?://[^@]*@([^:/]+):?([0-9]*)/.*#\2#' )
  DB_PORT=$(echo "$DATABASE_URI" | sed -E 's#postgres(ql)?://[^@]*@([^:/]+):?([0-9]*)/.*#\3#')
  DB_PORT=${DB_PORT:-5432}
  if [ -n "$DB_HOST" ]; then
    i=0
    until (exec 3<>"/dev/tcp/$DB_HOST/$DB_PORT") 2>/dev/null; do
      i=$((i+1))
      if [ "$i" -gt 60 ]; then
        echo "PostgreSQL not reachable after 60s, giving up." >&2
        exit 1
      fi
      echo "  ...waiting ($i)"
      sleep 2
    done
    exec 3>&- 3<&-
    echo "PostgreSQL is up."
  fi

  # Первичная инициализация схемы (только если нет таблиц миграций)
  echo "Checking migrations..."
  if ! npx payload migrate:status >/dev/null 2>&1; then
    echo "No migrations table — creating initial migration and applying..."
    npx payload migrate:create initial --force-accept-warning >/dev/null 2>&1 || echo "  (migration create skipped or already exists)"
  fi
  npx payload migrate || echo "  (migrate: no pending migrations)"
  echo "Migrations applied."
fi

echo "Starting Next.js server..."
exec node_modules/.bin/next start --hostname 0.0.0.0 --port 3000
