# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-slim AS builder
WORKDIR /app

# NEXT_PUBLIC_* и ADMIN_ROUTE инлайнятся при сборке (Next подставляет process.env
# в серверный код на этапе build — рантайм-переменные для них не работают)
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ARG NEXT_PUBLIC_ADMIN_URL
ARG ADMIN_ROUTE
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL
ENV ADMIN_ROUTE=$ADMIN_ROUTE
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# VPS: 3.8 ГБ RAM (свободно ~1.8 ГБ), без свопа, 2 ядра. Лимит кучи 2048 —
# выше Node упирается в доступную память и сборка «зависает» (OOM без свопа).
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Кэш сборки Next.js (BuildKit --mount=type=cache): между деплоями
# переиспользуется результат компиляции неизменившихся модулей — мелкие
# правки (дизайн, текст и т.п.) вместо полной сборки 15-20 мин занимают
# пару минут. Кэш хранится на хосте (в образ не попадает, рантайм не
# затрагивается). При подозрительных ошибках сборки: docker builder prune —
# кэш очистится, сборка станет полной, это безопасно.
RUN --mount=type=cache,id=nextjs-build-cache,target=/app/.next/cache npm run build

# ---- runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Копируем весь проект (нужен payload CLI для миграций и src/payload для конфига)
COPY --from=builder /app ./

# Бэкап .next в образ НЕ кладём: entrypoint при необходимости (dev-push схемы)
# сам архивирует .next перед запуском dev-сервера и восстановит после —
# образ легче, сборка/экспорт быстрее.

EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
