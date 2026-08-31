# Воркер ИИ-агента (установка на VPS)

В основе — **настоящий терминальный Claude Code CLI** (headless-режим `claude -p`): тот же агент, что в локальной сессии, со всеми плагинами и скиллами. Воркер берёт запрос из очереди CRM и запускает CLI в репозитории сайта; **агент сам коммитит и пушит** (как обычная сессия Claude Code), а воркер после него проверяет tsc/lint (гейт перед деплоем) и запускает `deploy.sh`, если код изменился.

⚠️ CLI запускается с `--dangerously-skip-permissions` — агент имеет полный доступ (как локальный Claude Code). Это сознательный выбор владельца.

## Установка — одной командой

```bash
cd ~/n15 && git pull origin master && bash tools/agent-worker/install.sh
```

Скрипт сам: ставит Node и Claude Code CLI (**через npm** — работает в регионах, где claude.ai/install.sh недоступен), создаёт пользователя `n15` (воркер не работает от root — Claude Code запрещает `--dangerously-skip-permissions` под root), отдаёт ему репозиторий, даёт docker-группу, генерирует SSH-ключ, собирает `DATABASE_URI`, спросит ключ DeepSeek и запустит сервис от `n15`. Повторный запуск — обновление.

После установки добавь напечатанный публичный SSH-ключ в GitHub (Settings → Deploy keys репозитория N15) — иначе `git push` не пройдёт.

## Плагины/скиллы (после установки, один раз)

Те же, что локально (из `~/.claude` на ПК) — либо установить через CLI:

```bash
claude plugin marketplace add <твой маркетплейс>   # например anthropics/claude-code
claude plugin install superpowers@anthropics
```

Либо скопировать конфиг: `scp -r C:\Users\Admin\.claude\plugins root@IP:/root/.claude/` (+ settings.json).

## Проверка

```bash
systemctl status n15-agent
journalctl -u n15-agent -f   # должно быть: worker connected, provider: https://api.deepseek.com/anthropic
```

`DATABASE_URI` собирается автоматически из `~/n15/.env` (fallback на IP контейнера postgres).

## Бэкенд ChatGPT Plus (вместо DeepSeek)

Прокси **claudex** на порту 4000 переводит Anthropic Messages API → OpenAI Responses API (ChatGPT). Токены — из `/home/n15/.codex/auth.json` (`claudex --reuse-codex`); активный конфиг агента — в модалке настроек CRM (`agent_settings`): `ANTHROPIC_BASE_URL=http://127.0.0.1:4000`, ключ-заглушка `sk-ant-placeholder`, модели `gpt-5.5` / `gpt-5.4-mini`.

Установка: `bash tools/agent-worker/install.sh` — ставит `@openai/codex` и `claudex`, создаёт сервис `n15-proxy`. Авторизация:

1. ChatGPT → Settings → Security → включить «Allow device code login»
2. `sudo -u n15 codex login --device-auth` — открываешь ссылку с телефона, вводишь код
3. `sudo -u n15 claudex --reuse-codex --list-sources` — проверить, что токены видны
4. `systemctl restart n15-proxy`

Проверка: `curl -s http://127.0.0.1:4000/health`; тест CLI:
`sudo -u n15 env ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_API_KEY=sk-ant-placeholder ANTHROPIC_MODEL=gpt-5.5 claude -p "привет" --output-format text --dangerously-skip-permissions --cwd /root/n15`

⚠️ Токен протухает после ~8 дней простоя — задачи падают с подсказкой `codex login --device-auth` (повтори шаги 2–4). Лимиты ChatGPT Plus — роллинг-окна ~5 ч: упор → 429, подожди. Это серая зона условий OpenAI — использование на свой риск.

Возврат на DeepSeek: в модалке настроек CRM замени конфиг содержимым `_deepseek_template` и сохрани — воркер подхватит за ≤30 с, прокси не используется.

**Безопасность**: claudex не проверяет API-ключи, поэтому порт 4000 закрыт firewall'ом для внешних подключений (install.sh настраивает iptables: доступ только с 127.0.0.1; открытый доступ = кто угодно жжёт квоту подписки). Если у тебя ufw/firewalld — закрой порт 4000 вручную. Проверка привязки: `ss -tlnp | grep 4000`. **Доверие (supply chain)**: `claudex` — community-пакет из npm (версия зафиксирована в install.sh — 1.0.5), работает от непривилегированного пользователя n15 и ходит только на chatgpt.com; `@openai/codex` — официальный пакет OpenAI. Ставятся на свой риск.

## Если commit/push у воркера падает

`Author identity unknown` или `could not read Username for 'https://github.com'` — у пользователя `n15` нет имени автора коммита, а `origin` настроен на https (SSH deploy key не работает). Один раз:

```bash
sudo -u n15 git config --global user.name "N15 Agent"
sudo -u n15 git config --global user.email "agent@n15-realty.ru"
sudo -u n15 git -C /root/n15 remote set-url origin git@github.com:bychikola/N15.git
sudo -u n15 ssh-keyscan -H github.com >> /home/n15/.ssh/known_hosts
systemctl restart n15-agent
```

(install.sh делает это сам при установке/обновлении.)

## Обновление воркера (правильный путь!)

Юнит запускает воркер из `/home/n15/n15-agent/worker.js` (не `/root/n15-agent`):

```bash
cd ~/n15 && git pull origin master
cp tools/agent-worker/worker.js /home/n15/n15-agent/worker.js
chown n15:n15 /home/n15/n15-agent/worker.js
systemctl restart n15-agent
```

## Проверка CLI

```bash
claude --version
# в ~/n15: claude -p "проверь, что я работаю" --output-format text --dangerously-skip-permissions
```

## Логи

```bash
journalctl -u n15-agent -f
```

## Обновление воркера

```bash
cd /root/n15-agent && cp /root/n15/tools/agent-worker/worker.js . && systemctl restart n15-agent
```
