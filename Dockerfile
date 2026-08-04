# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-slim AS builder
WORKDIR /app

# NEXT_PUBLIC_* инлайнятся при сборке
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Копируем весь проект (нужен payload CLI для миграций и src/payload для конфига)
COPY --from=builder /app ./

# Резервная копия production-сборки: entrypoint может временно запускать
# dev-сервер для создания схемы БД, после чего восстанавливает .next из этого бэкапа.
RUN cp -r .next .next-prod

EXPOSE 3000
CMD ["sh", "docker-entrypoint.sh"]
