# Дизайн: Закрытая CRM для команды (/crm)

Дата: 2026-08-15 · Статус: утверждён пользователем (все секции одобрены)
⚠️ Работа без git-коммитов до явной команды пользователя.

## Контекст

Прототип `N15-chatgpt/app/crm` — закрытая CRM с собственной авторизацией и drizzle-БД. Основной сайт N15 — Next 16 + Payload (Users с ролями, Objects, Agents, Applications с 7 стадиями, Messages, чат и воронка в ЛК).

**Решения пользователя:**
- CRM — страницы `/crm` внутри основного приложения на Payload (одна БД, одна авторизация)
- Вход: общий Payload-логин + проверка роли (client → отказ; agent/admin → CRM)
- Воронка и чаты агента переносятся из ЛК в CRM; ЛК остаётся только для пользователей
- Первая итерация (ядро): вход+роль, дашборд с метриками, воронка, чаты, управление объектами
- Подход A: переиспользование FunnelBoard/ChatList/ChatThread + CRM-оболочка в стиле прототипа

## 1. Роут, доступ, оболочка

- `/crm` — топ-уровень без локали (как админка): `src/app/crm/` со своим layout (без Header сайта)
- `src/proxy.ts`: добавить `crm` в matcher-исключения (как `admin`)
- Страницы: `/crm` (дашборд), `/crm/login`, `/crm/objects`, `/crm/leads`, `/crm/messages`, `/crm/messages/[applicationId]`
- Доступ — серверная проверка на каждой странице:
  - без сессии → redirect `/crm/login` (форма на `/api/users/login`)
  - роль `user` → экран «Доступ только для команды N15» + выход
  - agent/admin → CRM
- Оболочка `CrmShell` (тёмная, стиль прототипа): сайдбар — лого N15 + «закрытая CRM», навигация Обзор/Заявки/Сообщения/Объекты, внизу «← Открыть сайт N15»; шапка — приветствие + профиль (инициал, роль, выход)
- ЛК: из LkShell убрать пункт «Воронка»; футер лендинга: «Вход для команды» → `/crm`

## 2. Дашборд и перенос воронки/чатов

- `/crm` — метрики через `payload.count`: Объекты · Активные заявки (не closed/rejected) · Клиенты (users role=user) · Сообщения (всего); ниже таблица «Последние заявки» (5: клиент · объект · стадия · агент; клик → чат)
- `/crm/leads` — переиспользовать `FunnelBoard` без изменений (агент — свои, админ — все + фильтр)
- `/crm/messages` и `/crm/messages/[id]` — переиспользовать `ChatList`/`ChatThread`; добавить обоим проп `basePath` (default `/lk/messages`, CRM передаёт `/crm/messages`) для ссылок внутри
- ЛК остаётся: избранное, «Мои заявки», сообщения, профиль — без воронки

## 3. Управление объектами (/crm/objects)

- Список: таблица (миниатюра, название+адрес, категория, цена, статус, агент, «Редактировать») + «Добавить объект»
- Форма (все поля схемы Objects через Payload REST):
  - Основное: title, type, category, price, area/livingArea/kitchenArea, rooms, floor/totalFloors
  - Характеристики: buildingType, condition, heating, balcony, water/sewerage/electricity/gas/internet
  - Адрес: city/district/street/house/apartment + coordinates (lat/lng)
  - description (textarea), features (по одной), status, agent (выбор из /api/agents)
  - Фото: загрузка FormData → `/api/media` (alt авто); первое — primaryImage, остальные — images; удаление из набора
- POST (новый) / PATCH (редактирование); «Удалить» — только admin
- Доступ: Payload-access уже позволяет agent/admin создавать/редактировать

## Технические детали

- Стиль: `src/app/crm/crm.css` — тёмная тема прототипа, адаптация под New Standard; изолирован от сайта
- i18n: блок `crm.*` (ru+os): метрики, таблицы, кнопки, лейблы формы, «доступ только для команды», «выход»
- Компоненты: `CrmShell`, `CrmLogin`, `CrmDashboard`, `CrmObjects` (список+форма) — в `src/components/crm/`
- Тестирование: tsc/lint; сценарий: агент входит → дашборд → создаёт объект → объект в каталоге сайта; клиент на /crm → отказ; воронка/чаты работают из CRM; обе локали
- **Без git-коммитов**

## Файлы

- Создать: `src/app/crm/layout.tsx`, `src/app/crm/page.tsx`, `src/app/crm/login/page.tsx`, `src/app/crm/objects/page.tsx`, `src/app/crm/leads/page.tsx`, `src/app/crm/messages/page.tsx`, `src/app/crm/messages/[applicationId]/page.tsx`, `src/app/crm/crm.css`, `src/components/crm/CrmShell.tsx`, `src/components/crm/CrmLogin.tsx`, `src/components/crm/CrmDashboard.tsx`, `src/components/crm/CrmObjects.tsx`
- Изменить: `src/proxy.ts` (исключение crm), `src/components/lk/LkShell.tsx` (убрать воронку), `src/components/lk/ChatList.tsx` и `ChatThread.tsx` (проп basePath), `src/app/(site)/[lang]/page.tsx` (футер → /crm), `src/i18n/dictionaries.ts` (crm.*)
