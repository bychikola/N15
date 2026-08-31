# Воркер ИИ-агента (установка на VPS)

Запускается **на хосте сервера** (не в docker): ему нужен доступ к репозиторию сайта `~/n15`, к docker и к Postgres.

## Установка

```bash
# 1. Node 22 на хост (если нет)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 2. Папка воркера
mkdir -p /root/n15-agent
cd /root/n15-agent
cp /root/n15/tools/agent-worker/worker.js .
cp /root/n15/tools/agent-worker/package.json .
npm install

# 3. Конфиг: ключ API + строка Postgres из .env сайта
cat > /root/n15-agent/.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URI=postgres://n15:ПАРОЛЬ@localhost:5432/n15
N15_REPO=/root/n15
EOF
chmod 600 /root/n15-agent/.env

# 4. systemd
cp /root/n15/tools/agent-worker/worker.service /etc/systemd/system/n15-agent.service
systemctl daemon-reload
systemctl enable --now n15-agent
systemctl status n15-agent
```

`DATABASE_URI` можно взять из `~/n15/.env` (там же `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB`, хост — `localhost:5432` для хоста или IP контейнера postgres).

## Логи воркера

```bash
journalctl -u n15-agent -f
```

## Обновление воркера

```bash
cd /root/n15-agent && cp /root/n15/tools/agent-worker/worker.js . && systemctl restart n15-agent
```
