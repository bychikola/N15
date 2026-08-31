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

  # Инициализация схемы: Payload в production НЕ создаёт таблицы автоматически,
  # а CLI миграций (payload migrate) падает с ERR_REQUIRE_ASYNC_MODULE в этом
  # окружении (tsx vs ESM-модуль lexical). Надёжный способ — запустить dev-сервер
  # с NODE_ENV=development на время: Payload выполнит pushDevSchema и создаст
  # все таблицы. Затем восстанавливаем production-сборку из .next-prod.
  echo "Checking if schema is up to date..."
  # Проверяем не просто наличие схемы, а актуальность: базовые таблицы + новые
  # коллекции/колонки (tasks, customers, loss_reason в applications). Если чего-то
  # нет — запускаем dev-push, который досоздаст недостающее без потери данных.
  if ! node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URI });
    (async () => {
      await c.connect();
      const o = await c.query(\"SELECT to_regclass('public.objects') AS t\");
      const t = await c.query(\"SELECT to_regclass('public.tasks') AS t\");
      const cu = await c.query(\"SELECT to_regclass('public.customers') AS t\");
      const lr = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='applications' AND column_name='loss_reason'\");
      const un = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='username'\");
      const own = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='objects' AND column_name='owner_name'\");
      const em = await c.query(\"SELECT to_regclass('public.emails') AS t\");
      const ms = await c.query(\"SELECT to_regclass('public.mail_settings') AS t\");
      const loc = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='objects_address' AND column_name='locality'\");
      const ok = o.rows[0].t && t.rows[0].t && cu.rows[0].t && lr.rows.length > 0 && un.rows.length > 0 && own.rows.length > 0 && em.rows[0].t && ms.rows[0].t && loc.rows.length > 0;
      await c.end();
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  "; then
    echo "Schema missing — starting dev server to create tables..."
    NODE_ENV=development node_modules/.bin/next dev -p 3001 >/tmp/dev-init.log 2>&1 &
    DEV_PID=$!
    INIT_OK=0
    i=0
    while [ "$i" -lt 90 ]; do
      i=$((i+1))
      # Запрос к REST API заставляет Payload инициализироваться и выполнить push
      if node -e "fetch('http://localhost:3001/api/objects?limit=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
        INIT_OK=1
        break
      fi
      sleep 2
    done
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
    # Восстанавливаем production-сборку
    rm -rf .next
    cp -r .next-prod .next
    if [ "$INIT_OK" != "1" ]; then
      echo "Schema init failed. Dev log:" >&2
      tail -60 /tmp/dev-init.log >&2
      exit 1
    fi
    echo "Schema created."
  else
    echo "Schema already exists."
  fi
fi

# Миграция статусов заявок (CRM-воронка): старые значения -> новые
if [ -n "$DATABASE_URI" ]; then
  node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URI });
    const mapping = [['processing','call'],['completed','closed'],['cancelled','rejected']];
    (async () => {
      await c.connect();
      for (const [oldV, newV] of mapping) {
        await c.query('UPDATE applications SET status=\$1 WHERE status=\$2', [newV, oldV]);
      }
      await c.end();
    })().catch(() => process.exit(1));
  " || echo "status migration skipped"
fi

echo "Starting Next.js server..."
exec node_modules/.bin/next start --hostname 0.0.0.0 --port 3000
