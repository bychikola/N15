#!/bin/sh
set -e

echo "=== N15 container starting ==="

# Ждём готовности Postgres (если DATABASE_URI задан).
# Используем node для TCP-проверки: /dev/tcp — фича bash, в sh (dash) не работает.
if [ -n "$DATABASE_URI" ]; then
  echo "Waiting for PostgreSQL..."
  i=0
  until node -e "
    const u = new URL(process.env.DATABASE_URI);
    const net = require('net');
    const port = Number(u.port || 5432);
    const s = net.connect(port, u.hostname);
    s.on('connect', () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
    s.setTimeout(3000, () => { s.destroy(); process.exit(1); });
  "; do
    i=$((i+1))
    if [ "$i" -gt 60 ]; then
      echo "PostgreSQL not reachable after 60s, giving up." >&2
      exit 1
    fi
    echo "  ...waiting ($i)"
    sleep 2
  done
  echo "PostgreSQL is up."

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
