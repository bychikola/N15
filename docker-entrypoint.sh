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

  # Значение статуса 'cancelled' (отмена задачи агента из CRM) добавляем сами:
  # drizzle-kit push (движок push-схемы Payload) НЕ умеет ALTER TYPE ADD VALUE —
  # он пытается пересоздать enum и зависает, из-за чего dev-push не завершался
  # и контейнер крутился в цикле «Schema missing». Идемпотентно; если статус
  # не enum — просто ничего не делаем. Ошибку не глотаем молча: без нового
  # значения push снова зависнет, и в логе должно быть видно почему.
  node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URI });
    (async () => {
      await c.connect();
      const t = await c.query(\"SELECT DISTINCT t.typname FROM pg_type t JOIN pg_attribute a ON a.atttypid = t.oid JOIN pg_class cl ON cl.oid = a.attrelid WHERE cl.relname = 'agent_tasks' AND a.attname = 'status' AND t.typtype = 'e'\");
      for (const row of t.rows) {
        // имя типа берём из каталога БД, но всё равно пропускаем только
        // безопасные идентификаторы (защита от подстановки в DDL)
        if (!/^[a-z_][a-z0-9_]*$/.test(row.typname)) {
          console.warn('enum cancelled: неожиданное имя типа, пропускаю:', row.typname);
          continue;
        }
        try {
          await c.query('ALTER TYPE \"' + row.typname + '\" ADD VALUE IF NOT EXISTS \\'cancelled\\'');
          console.log('enum cancelled →', row.typname);
        } catch (e) {
          console.warn('enum cancelled: не удалось добавить в', row.typname, '—', e.message);
        }
      }
      await c.end();
    })().catch((e) => { console.warn('enum cancelled: ошибка —', e.message); process.exit(0); });
  " || true

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
      const at = await c.query(\"SELECT to_regclass('public.agent_tasks') AS t\");
      const ma = await c.query(\"SELECT to_regclass('public.mail_attachments') AS t\");
      const ag = await c.query(\"SELECT 1 FROM payload_globals WHERE slug = 'agent-settings' LIMIT 1\");
      const aa = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='agent_access'\");
      const cma = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='can_manage_agents'\");
      // Новые разделы: новости (автосбор), реклама, юр-экспертиза, парсер рынка
      const nw = await c.query(\"SELECT to_regclass('public.news') AS t\");
      const ml = await c.query(\"SELECT to_regclass('public.market_listings') AS t\");
      const ld = await c.query(\"SELECT to_regclass('public.legal_documents') AS t\");
      const lrp = await c.query(\"SELECT to_regclass('public.legal_reports') AS t\");
      const adv = await c.query(\"SELECT to_regclass('public.advertisers') AS t\");
      const ads = await c.query(\"SELECT to_regclass('public.advertisements') AS t\");
      const adr = await c.query(\"SELECT to_regclass('public.advertising_requests') AS t\");
      const ns = await c.query(\"SELECT 1 FROM payload_globals WHERE slug = 'news-settings' LIMIT 1\");
      // Межрегиональная недвижимость (регионы/населённые пункты) и
      // «Интеграции площадок» (ключи Авито/ЦИАН/Домклика)
      const rg = await c.query(\"SELECT to_regclass('public.regions') AS t\");
      const st = await c.query(\"SELECT to_regclass('public.settlements') AS t\");
      const ps = await c.query(\"SELECT 1 FROM payload_globals WHERE slug = 'platform-settings' LIMIT 1\");
      // Новые колонки объектов: единица площади (сотки), район города, СНТ
      const au = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='objects' AND column_name='area_unit'\");
      const cd = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='objects_address' AND column_name='city_district'\");
      const sn = await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='objects_address' AND column_name='snt'\");
      const ok = o.rows[0].t && t.rows[0].t && cu.rows[0].t && lr.rows.length > 0 && un.rows.length > 0 && own.rows.length > 0 && em.rows[0].t && ms.rows[0].t && loc.rows.length > 0 && at.rows[0].t && ma.rows[0].t && ag.rows.length > 0 && aa.rows.length > 0
        && nw.rows[0].t && ml.rows[0].t && ld.rows[0].t && lrp.rows[0].t && adv.rows[0].t && ads.rows[0].t && adr.rows[0].t && ns.rows.length > 0
        && rg.rows[0].t && st.rows[0].t && ps.rows.length > 0
        && au.rows.length > 0 && cd.rows.length > 0 && sn.rows.length > 0 && cma.rows.length > 0;
      await c.end();
      process.exit(ok ? 0 : 1);
    })().catch(() => process.exit(1));
  "; then
    echo "Schema missing — starting dev server to create tables..."
    # Бэкап production-сборки в рантайме (в образ не кладём): dev-сервер
    # перезапишет .next, после инициализации восстановим его из архива.
    tar -czf /app/.next-prod.tar.gz -C /app .next
    # Два подводных камня dev-push, из-за которых сайт не поднимался:
    # 1) drizzle-kit при удалении таблиц/колонок (агент убрал поля из глобала)
    #    спрашивает «Accept warnings and push schema to database? (y/N)» —
    #    в контейнере ответить некому, push висел вечно. Подаём бесконечные «y»
    #    через stdin (yes): вопрос и список удаляемого остаются в логе.
    # 2) Лимит кучи: на VPS ~2 ГБ свободной памяти, dev-сервер без лимита ловит
    #    OOM-killer (в логе приложения пусто, причина видна только в dmesg).
    # $! в пайплайне — это PID последней команды (next dev), поэтому kill ниже
    # останавливает именно сервер; yes умирает сам по SIGPIPE.
    yes | NODE_OPTIONS=--max-old-space-size=1536 NODE_ENV=development node_modules/.bin/next dev -p 3001 >/tmp/dev-init.log 2>&1 &
    DEV_PID=$!
    INIT_OK=0
    i=0
    # 12 попыток по 10 минут: первый запрос dev-сервера компилирует приложение
    # и выполняет push схемы — на слабом VPS это может идти дольше 5 минут.
    # fetch (undici) обрывает запрос ровно на 5 минутах — используем http.get,
    # у которого лимит задаём сами; неудачная попытка не мешает: сервер
    # продолжает компиляцию в фоне, следующая попытка обычно отвечает быстро.
    while [ "$i" -lt 12 ]; do
      i=$((i+1))
      if node -e "
        const http = require('http');
        const req = http.get('http://localhost:3001/api/objects?limit=1', (res) => {
          res.resume();
          process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
        });
        req.setTimeout(600000, () => { req.destroy(); process.exit(1); });
        req.on('error', () => process.exit(1));
      " 2>/dev/null; then
        INIT_OK=1
        break
      fi
      if ! kill -0 "$DEV_PID" 2>/dev/null; then
        echo "  ⨯ dev-сервер завершился на попытке $i — схема не будет создана"
        break
      fi
      echo "  ...схема ещё создаётся (попытка $i из 12)"
      sleep 5
    done
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
    # Восстанавливаем production-сборку из рантайм-бэкапа и убираем архив
    rm -rf .next
    tar -xzf .next-prod.tar.gz -C /app
    rm -f /app/.next-prod.tar.gz
    if [ "$INIT_OK" != "1" ]; then
      echo "Schema init failed. Dev log:" >&2
      tail -60 /tmp/dev-init.log >&2
      # Активность БД в момент провала: видно, ждёт ли push блокировку
      node -e "
        const { Client } = require('pg');
        const c = new Client({ connectionString: process.env.DATABASE_URI });
        (async () => {
          await c.connect();
          const r = await c.query(\"SELECT pid, state, wait_event_type, wait_event, now()-query_start AS dur, left(replace(query, E'\\\\n', ' '), 90) AS q FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() ORDER BY dur DESC NULLS LAST LIMIT 8\");
          for (const row of r.rows) {
            console.error('db:', row.state, '| wait:', row.wait_event_type || '-', row.wait_event || '-', '| dur:', row.dur, '|', row.q);
          }
          await c.end();
        })().catch((e) => console.error('db activity check failed:', e.message));
      " 2>&1 >&2 || true
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
