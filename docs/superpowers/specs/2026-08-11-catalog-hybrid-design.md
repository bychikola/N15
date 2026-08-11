# Дизайн: гибридный редизайн каталога объектов N15

Дата: 2026-08-11 · Статус: утверждён пользователем (брейншторм завершён)

## Контекст

N15 — Next.js 16 + Payload CMS, сайт недвижимости Владикавказа. Есть светлая (по умолчанию, ivory) и тёмная темы (cookie-переключатель), i18n (ru + os), орнаменты, шрифты New Standard (display) / Inter (body).

Референс — https://alaniadom.ru/ (каталог недвижимости): паттерны карточек (цена на тёмном градиенте поверх фото, пилюли-бейджи, капс-лейблы), функциональность списка (поиск, dropdown-фильтры, сортировка, «ПОКАЗАТЬ ЕЩЁ»).

**Решение пользователя: гибрид** — структура и паттерны alaniadom + фирменные краски N15 (золото `#B08D3E`, бургунди `#722F37`, кремовая база, New Standard/Inter). Подход A: компонентный гибрид поверх существующего клиентского списка. Работаем в обеих темах через CSS-переменные.

## Объём итерации

- Редизайн списка каталога: карточка, поиск, dropdown-фильтры, сортировка, пагинация
- Доработка страницы объекта: хлебные крошки, цена в hero, агент из схемы, похожие объекты, балкон в параметрах
- Новая палитра гибрида в обеих темах

**YAGNI (не делаем):** скидки со старой ценой (нет поля), избранное на карточке (механика — статичная заглушка), push-поп-ап, полоса «200₽», мобильное нижнее меню, SSR-рефакторинг списка, статистика «лет на рынке» (нет данных в глобале).

## 1. Палитра и токены (globals.css)

Новые CSS-переменные в `:root` и `html[data-theme='dark']`:

| Токен | Светлая | Тёмная | Применение |
|---|---|---|---|
| `--card-gradient` | `linear-gradient(to top, rgba(114,47,55,.92), transparent 72%)` | то же | Подложка цены на фото (бургунди `#722F37` — общий для обеих тем) |
| `--card-price-fg` | `#F6F2E9` (кремовый) | `#F5F5F7` | Текст цены поверх градиента |
| `--pill-bg` | `rgba(246,242,233,.92)` | `rgba(245,245,247,.92)` | Фон пилюль-бейджей на фото |
| `--pill-fg` | `#722F37` | `#722F37` | Текст пилюль |
| `--search-bg` | `rgba(255,255,255,.6)` | `rgba(26,26,30,.6)` | Фон поисковой пилюли |
| `--search-border` | `rgba(176,141,62,.35)` | `rgba(200,164,78,.35)` | Рамка поисковой пилюли (золото 35%) |

Принципы: острые углы (0) — база; пилюли (999px) — только поиск и бейджи; золото — акценты; бургунди — градиенты и тёмные поверхности на фото; капс-лейблы с трекингом — интерфейс.

## 2. Карточка объекта — `src/components/objects/ObjectCard.tsx`

```tsx
<a class="object-card" href={`/${lang}/catalog/${obj.slug || obj.id}`}>
  <div class="object-card__media">            // aspect-4/3, overflow hidden
    <img object-cover hover:scale-105 />       // фото, transition
    <div class="object-card__overlay" />       // --card-gradient снизу
    <span class="object-card__pill">ПРОДАЖА|АРЕНДА</span>  // левый верх
    <div class="object-card__price">12 500 000 ₽</div>     // внизу, поверх градиента
  </div>
  <div class="object-card__body">
    <h3>Заголовок</h3>                         // New Standard ~18px, hover → золото
    <p>Адрес</p>                               // muted 12px
    <p>62 м² • 3 комн • 4/9 эт</p>             // капс 10px muted, по наличию полей
    <div class="object-card__agent">◉ Имя</div> // кружок (фото агента или инициалы) + имя
  </div>
</a>
```

- Поля карточки: title, type (пилюля «ПРОДАЖА»/«АРЕНДА»), price, area/rooms/floor+totalFloors (по наличию), address (street, house), agent (имя; фото — если есть в глубине запроса), primaryImage
- Ссылка: `/${lang}/catalog/${obj.slug || obj.id}` — роут `[slug]` уже парсит `parseInt(slug)`, для id работает; slug из схемы — вперёд
- Без кнопки избранного (механики нет)

## 3. Список каталога — `src/app/(site)/[lang]/catalog/page.tsx`

Остаётся клиентский компонент + fetch `/api/objects` (`limit`, `page`, `depth: 2`, `sort`, `where`). Расширения:

**Состояние в URL** (`useSearchParams` + `router.replace`, как сейчас для type/category): `type`, `category`, `rooms`, `price_min`, `price_max`, `area_min`, `sort`, `q`, `page`. Параметры читаются при инициализации.

**Поиск-пилюля:** инпут (radius 999px, `--search-bg`/`--search-border`, debounce 300 мс) → `where.or: [{ title: { contains: q } }, { 'address.street': { contains: q } }]`.

**Dropdown-фильтры** — новый компонент `src/components/objects/CatalogFilters.tsx` (капс-лейблы, чек/радио внутри кастомного дропдауна):
- ТИП СДЕЛКИ: Продажа / Аренда → `where.type`
- КАТЕГОРИЯ: 5 категорий схемы → `where.category`
- КОМНАТЫ: чипы 1 / 2 / 3 / 4+ → `where.rooms.equals` (для 4+ — `greater_than_equal` 4)
- ЦЕНА, ₽: min/max → `where.price.greater_than_equal` / `less_than_equal`
- ПЛОЩАДЬ, м²: min → `where.area.greater_than_equal`
- «СБРОСИТЬ ФИЛЬТРЫ» → очистка всех

Фильтры комбинируются в один объект `where` (Payload `and`), счётчик — из `totalDocs`.

**Сортировка:** dropdown «Подобрали для вас» (дефолт `-createdAt`) / цена ↑ `price` / цена ↓ `-price` / площадь ↓ `-area` → `sort` параметр.

**Пагинация «ПОКАЗАТЬ ЕЩЁ»:** `limit: 12`; кнопка грузит `page+1`, аппендит к списку; скрыта когда `docs.length >= totalDocs`; при смене фильтров — сброс к page 1. В ответе сервера уже есть `totalDocs` и `page`.

**Шапка каталога:** заголовок + подпись + счётчик «N объектов» (из totalDocs после первой загрузки) — капс-лейблы. Без «лет на рынке».

**Сетка:** `grid-cols-1 md:2 lg:3 gap-6` (как сейчас).

## 4. Страница объекта — `src/app/(site)/[lang]/catalog/[slug]/page.tsx`

- **Хлебные крошки**: «КАТАЛОГ / ТИТЛ» — капс, muted, трекинг ~2px; «КАТАЛОГ» — ссылка на `/${lang}/catalog`
- **Цена в hero**: под H1/адресом, New Standard ~32px, золото `var(--n15-gold)` + цена за м² muted (перенос из нижней части страницы)
- **Бейджи-пилюли**: премиум/exclusive + тип сделки (пилюли в тоне текущей темы)
- **Агент из схемы**: `agent.photo` (кружок; fallback — инициалы, как сейчас), `agent.position` (вместо хардкода «Главный риелтор» — лейбл из словаря), `agent.phone` (tel:), `agent.telegram`, `agent.whatsapp` — вместо захардкоженного `+7 (8672) 12-34-56`. Обработка отсутствия полей: скрывать непустые кнопки
- **Сайдбар-форма**: остаётся (стили уже в духе гибрида); порядок: карточка агента → кнопки связи → форма
- **Параметры**: добавить `balcony` (балкон) в сетку параметров
- **Похожие объекты**: блок «Ещё в каталоге» + ссылка «Весь каталог →» — `payload.find` по `category` текущего объекта, `where.id.not_equals`, limit 3, переиспользование `ObjectCard`
- **Карта и галерея**: без изменений

## 5. i18n

Новые ключи в `src/i18n/dictionaries.ts` (ru и os, по существующему паттерну `catalog.*` / `object.*`):
- `catalog.searchPlaceholder`, `catalog.searchBtn`, `catalog.sortDefault`, `catalog.sortPriceAsc`, `catalog.sortPriceDesc`, `catalog.sortAreaDesc`, `catalog.showMore`, `catalog.roomsLabel`, `catalog.priceLabel`, `catalog.areaLabel`
- `object.breadcrumbCatalog`, `object.similarTitle`, `object.allCatalog`, `object.balcony` (+ переводы значений балкона), `object.phone`, `object.telegram`, `object.whatsapp`

## 6. Тестирование

- `npx tsc --noEmit` + `npm run lint`
- Dev-сервер: каталог (поиск, фильтры, сортировка, «ПОКАЗАТЬ ЕЩЁ») и объект (крошки, цена, агент, похожие) — в обеих темах (ThemeSwitcher)
- Проверка «ПОКАЗАТЬ ЕЩЁ» при 43 объектах (limit 12 → 4 клика)
- Скриншоты до/после для сверки с паттернами alaniadom

## Файлы

- Изменить: `src/app/globals.css` (токены), `src/app/(site)/[lang]/catalog/page.tsx` (поиск/сортировка/пагинация/шапка), `src/app/(site)/[lang]/catalog/[slug]/page.tsx` (крошки, цена, агент, похожие, балкон), `src/i18n/dictionaries.ts`
- Создать: `src/components/objects/ObjectCard.tsx`, `src/components/objects/CatalogFilters.tsx`
- Не трогаем: Header/Footer, ThemeSwitcher, ObjectMap, ImageSlider, схемы Payload, API
