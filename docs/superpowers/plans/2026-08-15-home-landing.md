# Лендинг главной (перенос из прототипа N15-chatgpt) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Главная N15 становится одностраничным лендингом в светлой палитре прототипа (#FAF8F3, шрифт New Standard): hero, аккордеоны «Что вы ищете?» с чипами→каталог, избранные объекты из Payload, ипотечный калькулятор, справочник районов, услуги, юр-блок, about, контакты.

**Architecture:** Секции — компоненты в `src/components/home/` со scoped-CSS (префикс `lp-`), глобальные токены сайта не трогаем. Главная — server component (Payload: объекты + SiteSettings). Калькулятор — client. Фильтры чипов → `/catalog?…` через существующий URL-sync; в каталог добавляется фильтр «Район».

**Tech Stack:** Next.js 16 (Turbopack), Tailwind 4, Payload REST (серверные запросы), i18n ru/os, New Standard.

**Спека:** `docs/superpowers/specs/2026-08-15-home-landing-design.md`

## Global Constraints

- **⚠️ ЗАПРЕЩЕНЫ git-коммиты и push — явная команда пользователя. Все шаги «Commit» в этом плане ПРОПУСКАЮТСЯ: файлы остаются в рабочей директории.**
- Проверка: `npx tsc --noEmit` (NODE_OPTIONS=--max-old-space-size=4096) + `npm run lint` + браузер (http://localhost:3000 — dev-сервер запущен)
- TypeScript модифицирован: однострочные `if (x) a() else b()` без фигурных скобок ломают компиляцию — всегда `{ }`
- Правило `react-hooks/set-state-in-effect`: никаких синхронных setState в теле useEffect
- Шрифт заголовков — New Standard (вместо Baskerville прототипа): `'New Standard', Georgia, serif`
- Палитра прототипа: `--cream:#f3eee3; --paper:#faf8f3; --ink:#24231f; --muted:#777267; --bronze:#a87c3f`; тёмные секции `#262722` (калькулятор) и `#292a26` (юр-блок/справочник)
- Прототип-сервер: http://localhost:3100 (сверка стилей); ассеты в `C:/Users/Admin/Documents/N15-chatgpt/public/images/`
- Все UI-строки — i18n ru+os; собственные имена (населённые пункты) — константы без перевода

---

### Task 1: Ассеты и scoped-CSS лендинга

**Files:**
- Create: `public/img/hero.png`, `public/img/fatima-ossetia.png`, `public/img/apartment.png`, `public/img/villa.png` (копии из прототипа)
- Modify: `src/app/globals.css` (секция Landing в конце файла)

**Interfaces:**
- Produces: CSS-классы `lp-*` — используются во всех следующих задачах

- [ ] **Step 1: Скопировать ассеты**

Run (Git Bash):

```bash
cp "C:/Users/Admin/Documents/N15-chatgpt/public/images/hero.png" "C:/Users/Admin/Documents/N15-chatgpt/public/images/fatima-ossetia.png" "C:/Users/Admin/Documents/N15-chatgpt/public/images/apartment.png" "C:/Users/Admin/Documents/N15-chatgpt/public/images/villa.png" public/img/
ls public/img/
```

Expected: 4 файла в `public/img/`

- [ ] **Step 2: Добавить scoped-CSS лендинга в globals.css**

В конец `src/app/globals.css` добавить:

```css
/* ═══ Landing (главная-лендинг, светлая палитра прототипа) ═══ */

.lp-section { background: #faf8f3; color: #24231f; }
.lp-container { width: min(90%, 1280px); margin: 0 auto; }
.lp-eyebrow {
  margin: 0 0 22px; color: #a87c3f; text-transform: uppercase;
  letter-spacing: .32em; font-size: 11px;
}
.lp-eyebrow-light { color: #d7ba8b; }
.lp-h2 {
  margin: 0; font-family: 'New Standard', Georgia, serif; font-weight: 400;
  letter-spacing: -.03em; font-size: clamp(44px, 5.5vw, 76px); line-height: 1.02;
}
.lp-muted { color: #777267; }

/* Hero */
.lp-hero { min-height: 680px; position: relative; display: flex; align-items: center; overflow: hidden; color: #fff; }
.lp-hero-visual { position: absolute; inset: 0; background: url('/img/hero.png') center/cover; transform: scale(1.02); }
.lp-hero-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,20,18,.82), rgba(20,20,18,.4) 50%, rgba(20,20,18,.1)); }
.lp-hero-content { width: min(90%, 1280px); margin: 0 auto; position: relative; z-index: 2; }
.lp-hero h1 { margin: 0; max-width: 750px; font-family: 'New Standard', Georgia, serif; font-weight: 400; letter-spacing: -.03em; font-size: clamp(58px, 7.2vw, 110px); line-height: .92; }
.lp-hero-copy { max-width: 520px; margin: 30px 0 34px; color: rgba(255,255,255,.78); font-size: 17px; line-height: 1.7; }
.lp-hero-note { position: absolute; z-index: 2; right: 5.2vw; bottom: 38px; margin: 0; text-transform: uppercase; letter-spacing: .28em; font-size: 9px; color: rgba(255,255,255,.7); }

/* Кнопки */
.lp-button {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 32px;
  min-width: 220px; padding: 18px 22px; background: #a87c3f; color: #fff;
  font-size: 12px; text-transform: uppercase; letter-spacing: .13em; transition: background .2s;
}
.lp-button:hover { background: #8f672f; }

/* «Что вы ищете?» */
.lp-objects { width: min(90%, 1280px); margin: 120px auto; }
.lp-objects-heading { display: grid; grid-template-columns: 1.2fr .8fr; gap: 60px; align-items: end; margin-bottom: 50px; }
.lp-objects-heading > p { margin: 0 0 8px; color: #777267; line-height: 1.8; max-width: 490px; }
.lp-categories { border-top: 1px solid #d8d1c4; }
.lp-categories > details { border-bottom: 1px solid #d8d1c4; scroll-margin-top: 25px; }
.lp-categories > details > summary { min-height: 115px; display: grid; grid-template-columns: 55px 1fr 40px; align-items: center; gap: 18px; cursor: pointer; list-style: none; }
.lp-categories > details > summary::-webkit-details-marker { display: none; }
.lp-categories > details > summary > span { font-size: 10px; color: #a87c3f; letter-spacing: .15em; }
.lp-categories h3 { margin: 0 0 8px; font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: clamp(25px, 3vw, 38px); }
.lp-categories summary p { margin: 0; color: #777267; font-size: 12px; }
.lp-categories summary i { justify-self: end; color: #a87c3f; font: normal 300 26px Arial; transition: transform .2s; }
.lp-categories details[open] > summary i { transform: rotate(45deg); }
.lp-filters { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; padding: 0 0 32px 73px; }
.lp-filters > div { padding: 20px; background: #f3eee3; }
.lp-filters small { display: block; margin-bottom: 14px; color: #8b7656; text-transform: uppercase; letter-spacing: .12em; font-size: 9px; }
.lp-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-chips a { padding: 10px 12px; background: #faf8f3; border: 1px solid #ddd4c5; font-size: 11px; color: #24231f; transition: .2s; }
.lp-chips a:hover { background: #24231f; color: #fff; border-color: #24231f; }
.lp-land-filters { grid-template-columns: .75fr 1.25fr; }
.lp-land-filters .lp-settlement-filter { grid-column: 1/-1; }
.lp-settlement-groups { display: flex; flex-direction: column; }
.lp-settlement-groups details { border-bottom: 1px solid #d8d1c4; }
.lp-settlement-groups summary { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; cursor: pointer; list-style: none; font-size: 13px; }
.lp-settlement-groups summary::-webkit-details-marker { display: none; }
.lp-settlement-groups summary i { color: #a87c3f; font: normal 18px Arial; }
.lp-settlement-groups details[open] summary i { transform: rotate(45deg); }
.lp-settlement-groups p { margin: 0 0 14px; font-size: 12px; line-height: 1.9; color: #777267; }

/* Избранные объекты */
.lp-featured { margin: 0 auto 110px; }
.lp-featured-title { width: min(90%, 1280px); margin: 0 auto 38px; }
.lp-cards { display: flex; gap: 25px; width: min(90%, 1280px); margin: 0 auto; }
.lp-property-card {
  min-height: 450px; padding: 24px; position: relative; display: flex; flex-direction: column;
  justify-content: space-between; color: #fff; overflow: hidden; text-decoration: none;
  background-position: center; background-size: cover; flex: 1;
}
.lp-property-card:before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.66)); }
.lp-property-card > * { position: relative; z-index: 1; }
.lp-property-badge {
  align-self: flex-start; padding: 7px 12px; background: rgba(255,255,255,.14);
  backdrop-filter: blur(4px); font-size: 10px; text-transform: uppercase; letter-spacing: .13em;
}
.lp-property-info p { margin: 0 0 10px; font-size: 12px; color: rgba(255,255,255,.75); }
.lp-property-info h3 { margin: 0 0 10px; font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 26px; }
.lp-property-info span { font-size: 12px; color: rgba(255,255,255,.8); }
.lp-property-open { display: block; margin-top: 14px; font-size: 10px; text-transform: uppercase; letter-spacing: .13em; color: #d7ba8b; }

/* Калькулятор (тёмная секция) */
.lp-mortgage { padding: 110px max(5vw, 32px); background: #262722; color: #fff; display: grid; grid-template-columns: .7fr 1.3fr; gap: 70px; }
.lp-mortgage-heading h2 { margin: 0 0 25px; }
.lp-mortgage-heading > p:last-child { max-width: 390px; color: rgba(255,255,255,.48); font-size: 12px; line-height: 1.8; }
.lp-mortgage-panel { background: #f5f0e6; color: #24231f; padding: 28px; display: grid; grid-template-columns: 1fr .75fr; gap: 28px; }
.lp-mortgage-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-mortgage-fields label { position: relative; background: #fff; border: 1px solid #ddd4c5; padding: 14px; }
.lp-mortgage-fields label > span { display: block; margin-bottom: 12px; color: #817b70; text-transform: uppercase; letter-spacing: .09em; font-size: 8px; }
.lp-mortgage-fields input { width: 100%; border: 0; outline: 0; background: transparent; font-family: 'New Standard', Georgia, serif; font-size: 19px; color: #24231f; padding: 0 35px 0 0; }
.lp-mortgage-fields label > small { position: absolute; right: 14px; bottom: 17px; color: #9a815e; font-size: 11px; }
.lp-mortgage-results { background: #fff; padding: 20px; }
.lp-mortgage-results > div { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding: 11px 0; border-bottom: 1px solid #ebe5db; }
.lp-mortgage-results span { color: #817b70; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
.lp-mortgage-results strong { display: block; margin-top: 8px; font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 30px; color: #a87c3f; }
.lp-mortgage-results b { font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 13px; }
.lp-mortgage-results > a { display: flex; justify-content: space-between; margin-top: 18px; padding: 14px; background: #a87c3f; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; }

/* Справочник (тёмная секция) */
.lp-country { padding: 120px max(5vw, 32px); background: #292a26; color: #fff; }
.lp-country-heading { width: min(100%, 1280px); margin: 0 auto 55px; display: grid; grid-template-columns: 1.2fr .8fr; gap: 60px; align-items: end; }
.lp-country-heading > p { max-width: 500px; margin: 0 0 8px; color: rgba(255,255,255,.58); font-size: 15px; line-height: 1.8; }
.lp-nearby { width: min(100%, 1280px); margin: 0 auto 56px; border-top: 1px solid rgba(255,255,255,.18); padding-top: 26px; }
.lp-nearby span { display: block; margin-bottom: 12px; color: #d7ba8b; font-size: 10px; text-transform: uppercase; letter-spacing: .14em; }
.lp-nearby p { margin: 0; color: rgba(255,255,255,.66); font-size: 13px; line-height: 2; }
.lp-districts { width: min(100%, 1280px); margin: 0 auto; border-top: 1px solid rgba(255,255,255,.18); }
.lp-districts details { border-bottom: 1px solid rgba(255,255,255,.18); }
.lp-districts summary { display: grid; grid-template-columns: 55px 1fr 40px; align-items: center; padding: 18px 0; cursor: pointer; list-style: none; }
.lp-districts summary::-webkit-details-marker { display: none; }
.lp-districts summary span { color: #d7ba8b; font-size: 10px; letter-spacing: .15em; }
.lp-districts summary strong { font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 18px; }
.lp-districts summary i { justify-self: end; color: #d7ba8b; font: normal 20px Arial; transition: transform .2s; }
.lp-districts details[open] summary i { transform: rotate(45deg); }
.lp-districts details p { margin: 0 0 22px 55px; color: rgba(255,255,255,.6); font-size: 12px; line-height: 2; }

/* Услуги */
.lp-services { width: min(90%, 1280px); margin: 130px auto 100px; }
.lp-services-heading { margin-bottom: 45px; }
.lp-service-list { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; border-top: 1px solid #d8d1c4; }
.lp-home-service { padding-top: 25px; }
.lp-home-service span { color: #a87c3f; font-size: 10px; letter-spacing: .15em; }
.lp-home-service h3 { margin: 14px 0 10px; font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 24px; }
.lp-home-service p { margin: 0; color: #777267; font-size: 13px; line-height: 1.8; max-width: 460px; }

/* Юр-блок (тёмная секция) */
.lp-legal { padding: 110px max(5vw, 32px); background: #292a26; color: #fff; }
.lp-legal-heading { width: min(100%, 1280px); margin: 0 auto 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px 60px; align-items: end; }
.lp-legal-heading .lp-eyebrow-light { grid-column: 1/-1; margin-bottom: 0; }
.lp-legal-heading > p:last-child { margin: 0 0 8px; color: rgba(255,255,255,.55); line-height: 1.8; max-width: 480px; }
.lp-legal-grid { width: min(100%, 1280px); margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(255,255,255,.17); border-left: 1px solid rgba(255,255,255,.17); }
.lp-legal-grid article { min-height: 220px; padding: 25px; border-right: 1px solid rgba(255,255,255,.17); border-bottom: 1px solid rgba(255,255,255,.17); }
.lp-legal-grid span { color: #d7ba8b; font-size: 9px; letter-spacing: .15em; }
.lp-legal-grid h3 { margin: 42px 0 12px; font-family: 'New Standard', Georgia, serif; font-weight: 400; font-size: 22px; }
.lp-legal-grid p { margin: 0; color: rgba(255,255,255,.52); font-size: 12px; line-height: 1.7; }
.lp-legal-action { width: min(100%, 1280px); margin: 24px auto 0; padding: 18px 0; display: flex; justify-content: space-between; color: #d7ba8b; border-bottom: 1px solid rgba(255,255,255,.17); font-size: 10px; text-transform: uppercase; letter-spacing: .14em; }

/* About */
.lp-about { width: min(90%, 1280px); margin: 0 auto; min-height: 590px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; padding: 100px 0; }
.lp-about-image img { width: 100%; display: block; }
.lp-about-copy h2 { margin: 0 0 25px; }
.lp-about-copy > p { color: #777267; line-height: 1.8; max-width: 480px; }
.lp-signature { margin-top: 35px; padding: 20px 0; border-top: 1px solid #d8d1c4; }
.lp-signature span { font-family: 'New Standard', Georgia, serif; font-size: 20px; color: #a87c3f; }
.lp-signature p { margin: 8px 0 0; font-size: 12px; color: #777267; }
.lp-directions { margin-top: 25px; border-top: 1px solid #d7cfbf; border-bottom: 1px solid #d7cfbf; }
.lp-directions summary { padding: 18px 0; display: flex; justify-content: space-between; cursor: pointer; list-style: none; font-family: 'New Standard', Georgia, serif; font-size: 17px; }
.lp-directions summary::-webkit-details-marker { display: none; }
.lp-directions i { font: normal 20px Arial; color: #a87c3f; }
.lp-directions details[open] i { transform: rotate(45deg); }
.lp-directions p { margin: 0 0 18px; font-size: 12px; line-height: 1.8; color: #777267; }

/* Контакты */
.lp-contact { width: min(90%, 1280px); margin: 0 auto; padding: 110px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
.lp-contact-copy p { color: #777267; line-height: 1.8; max-width: 420px; margin: 0 0 25px; }
.lp-phone {
  display: inline-block; margin: 0 0 25px; font-family: 'New Standard', Georgia, serif;
  font-size: 30px; color: #a87c3f; letter-spacing: .03em;
}
.lp-contact small { display: block; margin-top: 20px; font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #777267; }

/* Футер лендинга */
.lp-footer { width: min(90%, 1280px); margin: 0 auto; padding: 40px 0; border-top: 1px solid #d8d1c4; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
.lp-footer p { margin: 0; color: #777267; font-size: 12px; line-height: 1.8; }
.lp-footer .lp-phone { margin: 0; font-size: 20px; }

/* Мобильная адаптация */
@media (max-width: 820px) {
  .lp-hero { min-height: 610px; align-items: flex-end; padding-bottom: 80px; }
  .lp-hero-content { width: auto; margin: 0 22px; }
  .lp-hero h1 { font-size: 54px; }
  .lp-hero-copy { max-width: 360px; font-size: 15px; margin: 24px 0 28px; }
  .lp-hero-note { display: none; }
  .lp-objects { width: auto; margin: 80px 22px; }
  .lp-objects-heading { grid-template-columns: 1fr; gap: 20px; }
  .lp-objects-heading h2 { font-size: 43px; }
  .lp-categories > details > summary { min-height: 100px; grid-template-columns: 32px 1fr 25px; gap: 10px; }
  .lp-categories h3 { font-size: 25px; }
  .lp-filters, .lp-land-filters { grid-template-columns: 1fr; padding: 0 0 24px; }
  .lp-land-filters .lp-settlement-filter { grid-column: auto; }
  .lp-cards { flex-direction: column; width: auto; margin: 0 22px; }
  .lp-mortgage { padding: 80px 22px; grid-template-columns: 1fr; gap: 30px; }
  .lp-mortgage-panel { grid-template-columns: 1fr; }
  .lp-country { padding: 80px 22px; }
  .lp-country-heading { grid-template-columns: 1fr; gap: 18px; }
  .lp-service-list { grid-template-columns: 1fr; gap: 30px; }
  .lp-legal { padding: 80px 22px; }
  .lp-legal-heading { grid-template-columns: 1fr; gap: 18px; }
  .lp-legal-grid { grid-template-columns: 1fr; }
  .lp-legal-grid article { min-height: 0; }
  .lp-about { grid-template-columns: 1fr; gap: 30px; padding: 60px 0; }
  .lp-contact { grid-template-columns: 1fr; gap: 30px; padding: 60px 0; }
}

@media (max-width: 480px) {
  .lp-mortgage-fields { grid-template-columns: 1fr; }
  .lp-mortgage-panel { padding: 16px; }
}
```

- [ ] **Step 3: Проверить**

Run: `curl -s -o /dev/null -w "img: %{http_code}\n" http://localhost:3000/img/hero.png`
Expected: `200`

- [ ] **Step 4: НЕ коммитить** (запрет пользователя) — перейти к Task 2

---

### Task 2: Данные справочника и i18n-ключи лендинга

**Files:**
- Create: `src/components/home/landing-data.ts` (справочники: районы, населённые пункты, СНТ — копия из прототипа)
- Modify: `src/i18n/dictionaries.ts` (блок `landing.*` в ru и os)

**Interfaces:**
- Produces: `DISTRICTS: string[]`, `NEAR_VIK: string[]`, `SNT_AREAS: string[]`, `COUNTRY_AREAS: { district: string; places: string }[]`, `CITIES: string[]`, `PRIORITY: { district: string; places: string }[]`; ключи `landing.*` — используются в Tasks 3-6

- [ ] **Step 1: Создать `src/components/home/landing-data.ts`**

Скопировать данные из `C:/Users/Admin/Documents/N15-chatgpt/app/page.tsx` (строки 11-36 — массивы districts, ossetiaCities, prioritySettlements, nearVladikavkaz, sntAreas, countryAreas):

```ts
// Справочники лендинга — собственные имена (населённые пункты, СНТ) без перевода.
// Источник: прототип N15-chatgpt (app/page.tsx).

export const DISTRICTS = ['Иристонский', 'Северо-Западный', 'Затеречный', 'Промышленный']

export const CITIES = ['Владикавказ', 'Моздок', 'Беслан', 'Алагир', 'Ардон', 'Дигора']

export const NEAR_VIK = ['Ногир', 'Октябрьское', 'Архонская', 'Гизель', 'Михайловское', 'Ир', 'Дачное', 'Камбилеевское', 'Сунжа', 'Чермен', 'Тарское', 'Карца', 'Мичурино']

export const SNT_AREAS = ['СТ Кобань', 'СТ Учитель', 'СТ Хурзарин', 'СТ Терек', 'СНТ Контактор', 'СТ Горное', 'СТ Победит', 'СНТ Магнит', 'СТ Майрамадаг', 'СНТ Мичурино', 'СНО Наука', 'СНО Дарьял', 'СНО Иристон', 'СНО Весна', 'СНО Дружба', 'СНО Горянка', 'СНО Рухс', 'СНО Учитель', 'СНО Надежда', 'СТ Аэропорт', 'СНО Металлург', 'СНТ Баркад', 'СНО Локомотив', 'СНТ Алания', 'СНО Южный', 'СНО Дачное', 'СНТ Кобан', 'СНТ Геолог', 'СНТ Кодахджин 2010', 'СНО Северное', 'СНО Редант', 'СНО Ир', 'СНО Аграрник']

export const PRIORITY = [
  { district: 'Владикавказский городской округ', places: 'Владикавказ · Заводской · Чми · Балта · Верхний Ларс · Нижний Ларс · Редант · Эзми' },
  { district: 'Алагирский район', places: 'Црау · Нижний Бирагзанг · Хидикус · Нузал · Ход' },
  { district: 'Ардонский район', places: 'Ардон · Мичурино · Кадгарон · Красногор · Рассвет' },
  { district: 'Пригородный район', places: 'Октябрьское · Ногир · Гизель · Сунжа · Михайловское · Чермен · Камбилеевское · Тарское · Ир · Дачное · Архонская' },
  { district: 'Моздокский район', places: 'Кизляр · Моздок · Троицкое' },
  { district: 'Ирафский район', places: 'Чикола · Хазнидон · Лескен · Ахсарисар · Новый Урух (Секер) · Дзагепбарз (Текати-Хау)' },
  { district: 'Дигорский район', places: 'Дигора' },
  { district: 'Правобережный район', places: 'Беслан · Брут · Батако · Новый Батако · Заманкул · Хумалаг · Зильги · Раздзог' },
  { district: 'Кировский район', places: 'Эльхотово · Карджин · Дарг-Кох · Змейская · Комсомольское' },
]

export const COUNTRY_AREAS = [
  { district: 'Владикавказский городской округ', places: 'Владикавказ · Заводской · Балта · Верхний Ларс · Нижний Ларс · Чми · Эзми · Редант' },
  { district: 'Алагирский район', places: 'Абайтикау · Алагир · Архон · Бад · Барзикау · Биз · Бурон · Варце · Верхний Бирагзанг · Верхний Зарамаг · Верхний Згид · Верхний Унал · Верхний Фиагдон · Верхний Цей · Гули · Гусыра · Дагом · Даикау · Даллагкау · Дзивгис · Дзуарикау (Дзуарикауское с/п) · Дзуарикау (Фиагдонское с/п) · Донисар · Елгона · Згил · Зинцар · Зригатта · Кадат · Калак · Камсхо · Карца · Кесатикау · Кодахджин · Красный Ход · Курайтта · Лац · Лисри · Майрамадаг · Мизур · Нар · Нижний Бирагзанг · Нижний Зарамаг · Нижний Унал · Нижний Цей · Ногкау (Мизурское с/п) · Ногкау (Ногкауское с/п) · Нузал · Потыфаз · Рамоново · Регах · Сагол · Садон · Сатат · Саубын · Сахсат · Слас · Суадаг · Тагардон · Тамиск · Тапанкау · Тиб · Урикау · Урсдон · Харисджин · Хаталдон · Хидикус · Ход · Холст · Худисан · Хукали · Цаликово · Цамад · Цасем · Цементный · Цемса · Цми · Цмити · Црау' },
  { district: 'Ардонский район', places: 'Ардон · Бекан · Кадгарон · Кирово · Коста · Красногор · Мичурино · Нарт · Рассвет · Фиагдон · Цмити' },
  { district: 'Дигорский район', places: 'Дигора · Дур-Дур · Карман-Синдзикау (Карман / Синдзикау) · Кора-Урсдон (Кора / Урсдон) · Мостиздах · Николаевская' },
  { district: 'Ирафский район', places: 'Ахсарисар · Ахсау · Вакац · Верхний Задалеск · Верхний Нар · Галиат · Дзагепбарз (Текати-Хау) · Дзинага · Донифарс · Дунта · Казахта · Калнахта · Калух · Камата · Камунта · Куссу · Лезгор · Лескен · Махческ · Мацута · Моска · Нижний Задалеск · Нижний Нар · Новый Урух (Секер) · Ногкау · Одола · Советское · Средний Урух · Стур-Дигора · Сурх-Дигора · Толдзгун · Фараскатта · Фаснал · Хазнидон · Ханаз · Чикола' },
  { district: 'Кировский район', places: 'Дарг-Кох · Змейская · Иран · Карджин · Комсомольское · Ставд-Дурт · Эльхотово' },
  { district: 'Моздокский район', places: 'Весёлое · Виноградное · Дружба · Елбаево · Калининский · Киевское · Кизляр · Комарово · Кусово · Луковская · Луковский · Любы Кондратенко · Малый Малгобек · Мирный · Моздок · Нижний Малгобек · Ново-Георгиевское · Новоосетинская · Октябрьское · Осетинский · Павлодольская · Предгорное · Притеречный · Раздольное · Садовый · Советский · Сухотское · Тельмана · Терская · Троицкое · Хурикау · Черноярская (станица) · Черноярская (станция)' },
  { district: 'Правобережный район', places: 'Батако · Беслан · Брут · Заманкул · Зильги · Новый Батако · Ольгинское · Раздзог · Фарн · Хумалаг · Цалык' },
  { district: 'Пригородный район', places: 'Алханчурт · Архонская · Верхний Кани · Верхняя Саниба · Гизель · Даргавс · Дачное · Джимара · Донгарон · Ир · Какадур · Камбилеевское · Кармадон · Кобан · Комгарон · Куртат · Ламардон · Майское · Михайловское · Нижний Кани · Нижняя Саниба · Новое · Ногир · Октябрьское · Первомайский · Старая Саниба · Сунжа · Тарское · Тменикау · Фазикау · Чермен' },
]
```

- [ ] **Step 2: Добавить `landing.*` в ru-словарь**

В `src/i18n/dictionaries.ts` после блока `crm: { ... },` (ru) добавить:

```ts
  landing: {
    heroEyebrow: 'Владикавказ · Северная Осетия — Алания',
    heroTitle1: 'Недвижимость',
    heroTitle2: 'в Осетии',
    heroCopy: 'Квартиры, частные дома, земельные участки и коммерческие объекты с персональным сопровождением N15.',
    heroCta: 'Выбрать объект',
    heroNote: 'Осетия — наш главный рынок',
    searchEyebrow: 'Объекты в Осетии',
    searchTitle: 'Что вы ищете?',
    searchSubtitle: 'Выберите тип недвижимости, параметры и район. Нужный раздел раскрывается по нажатию.',
    catApartments: 'Квартиры',
    catApartmentsDesc: 'По комнатности и районам Владикавказа',
    catHouses: 'Частные дома',
    catHousesDesc: 'Дома, коттеджи и городские резиденции',
    catLand: 'Земельные участки',
    catLandDesc: 'По городам, районам, населённым пунктам и садовым товариществам',
    catCommercial: 'Коммерческая недвижимость',
    catCommercialDesc: 'Офисы, помещения, здания и инвестиционные объекты',
    roomsLabel: 'Количество комнат',
    room1: '1-комнатные',
    room2: '2-комнатные',
    room3: '3-комнатные',
    room4: '4+ комнат',
    districtLabel: 'Район',
    featuredEyebrow: 'Новые предложения',
    featuredTitle: 'Избранные объекты',
    openObject: 'Открыть объект',
    calcEyebrow: 'Ипотечный калькулятор',
    calcTitle1: 'Рассчитайте',
    calcTitle2: 'платёж',
    calcNote: 'Предварительный расчёт. Точные условия зависят от банка и программы.',
    calcPrice: 'Стоимость объекта',
    calcDown: 'Первоначальный взнос',
    calcDownPercent: 'Первоначальный взнос, %',
    calcYears: 'Срок кредита',
    calcRate: 'Процентная ставка',
    calcYearsUnit: 'лет',
    calcMonthly: 'Ежемесячный платёж',
    calcDownSum: 'Первоначальный взнос',
    calcCredit: 'Сумма кредита',
    calcTotal: 'Общая выплата',
    calcOverpay: 'Переплата',
    calcConsult: 'Получить консультацию',
    countryEyebrow: 'Загородная недвижимость',
    countryTitle1: 'Дома и участки',
    countryTitle2: 'по всей Осетии',
    countrySubtitle: 'Сначала показан ближний пригород по расположению, ниже — официальный состав городского округа и муниципальных районов.',
    countryNearby: 'Ближний пригород Владикавказа',
    servicesEyebrow: 'N15 Home',
    servicesTitle1: 'Дизайн и ремонт',
    servicesTitle2: 'под ключ',
    serviceDesignTitle: 'Дизайн интерьера и комплектация',
    serviceDesignText: 'Концепция, планировка, визуализация и рабочие чертежи. Подбор мебели, света, сантехники, отделочных материалов и декора — всё в единой концепции.',
    serviceRepairTitle: 'Ремонт под ключ',
    serviceRepairText: 'Смета, подрядчики, организация работ, технический контроль и соблюдение сроков.',
    legalEyebrow: 'Экспертный центр N15',
    legalTitle: 'Юридические услуги',
    legalSubtitle: 'Сопровождение недвижимости от проверки документов до регистрации права.',
    legal1Title: 'Сделки и проверка',
    legal1Text: 'Проверка объекта и собственника, договоры, задаток, регистрация перехода права.',
    legal2Title: 'Узаконивание',
    legal2Text: 'Перепланировка, реконструкция, кадастровый учёт и исправление реестровых ошибок.',
    legal3Title: 'Приватизация и доли',
    legal3Text: 'Приватизация, сделки с долями, порядок пользования, выкуп и раздел имущества.',
    legal4Title: 'Наследство и земля',
    legal4Text: 'Оформление наследства, межевые споры, сервитуты и признание права собственности.',
    legal5Title: 'Ипотечный брокер',
    legal5Text: 'Подбор программы, расчёт нагрузки и сопровождение заявки в банке.',
    legal6Title: 'Независимый оценщик',
    legal6Text: 'Оценка квартиры, дома, участка или коммерческого объекта для сделки и ипотеки.',
    legalCta: 'Получить консультацию',
    aboutEyebrow: 'О компании',
    aboutTitle1: 'Осетия —',
    aboutTitle2: 'наш приоритет',
    aboutText: 'Мы знаем местный рынок, проверяем каждый объект и сопровождаем клиента от первого звонка до передачи ключей.',
    aboutSignature: 'Фатима, дарящая солнце',
    aboutSignatureText: 'Осетия — наша земля, наш характер, наша экспертиза.',
    aboutDirections: 'Другие направления',
    aboutDirectionsText: 'Москва · Санкт-Петербург · Краснодарский край · Ставропольский край · Зарубежная недвижимость по индивидуальному запросу.',
    contactEyebrow: 'Персональная консультация',
    contactTitle1: 'Найдём объект',
    contactTitle2: 'в Осетии',
    contactText: 'Позвоните в N15 — уточним задачу и подготовим индивидуальную подборку.',
    contactCall: 'Позвонить в N15',
    contactNote: 'Владикавказ · Северная Осетия — Алания',
    footerText1: 'Недвижимость во Владикавказе',
    footerText2: 'и по всей Осетии',
  },
```

- [ ] **Step 3: Зеркально в os-словарь**

После os-блока `crm` добавить те же ключи с переводами (осетинский):

```ts
  landing: {
    heroEyebrow: 'Дзæуджыхъæу · Цæгат Ирыстон — Алани',
    heroTitle1: 'Æндæрхуыст',
    heroTitle2: 'Ирыстоны',
    heroCopy: 'Квартирæтæ, хæдзæрттæ, зæххы фæзтæ æмæ коммерцион объекттæ — N15-ы хиуарт æмвæндынæн.',
    heroCta: 'Объект равзарын',
    heroNote: 'Ирыстон — нæ сæйраг базар',
    searchEyebrow: 'Объекттæ Ирыстоны',
    searchTitle: 'Цы агурæм?',
    searchSubtitle: 'Равзар объекты хуыз, параметртæ æмæ район. Хъæуы хай байгом кæнын.',
    catApartments: 'Квартирæтæ',
    catApartmentsDesc: 'Уатты нымæц æмæ Дзæуджыхъæуы районтæм гæсгæ',
    catHouses: 'Хæдзæрттæ',
    catHousesDesc: 'Хæдзæрттæ, коттеджтæ æмæ горæты резиденцитæ',
    catLand: 'Зæххы фæзтæ',
    catLandDesc: 'Горæттæм, районтæм, цæрæнрæттæм æмæ дзæхæрадæнты æхсæнæдтæм гæсгæ',
    catCommercial: 'Коммерцион æндæрхуыст',
    catCommercialDesc: 'Офиссæн бынаттæ, агъуыстытæ æмæ инвестицион объекттæ',
    roomsLabel: 'Уатты нымæц',
    room1: '1-уатон',
    room2: '2-уатон',
    room3: '3-уатон',
    room4: '4+ уат',
    districtLabel: 'Район',
    featuredEyebrow: 'Ног хъусынгæнинæгтæ',
    featuredTitle: 'Равзæрст объекттæ',
    openObject: 'Объект байгом кæнын',
    calcEyebrow: 'Ипотекон калькулятор',
    calcTitle1: 'Банымай',
    calcTitle2: 'фиддон',
    calcNote: 'Разæййаг нымад у. Бæлвырд уавæртæ банк æмæ программæйæ аразгæ сты.',
    calcPrice: 'Объекты аргъ',
    calcDown: 'Фыццаг фиддон',
    calcDownPercent: 'Фыццаг фиддон, %',
    calcYears: 'Кредиты æмгъуыд',
    calcRate: 'Процентон ставкæ',
    calcYearsUnit: 'азы',
    calcMonthly: 'Мæйон фиддон',
    calcDownSum: 'Фыццаг фиддон',
    calcCredit: 'Кредиты бæрц',
    calcTotal: 'Æдæппæт фиддон',
    calcOverpay: 'Бафыстонтæ',
    calcConsult: 'Консультаци райсын',
    countryEyebrow: 'Горæтгæроны æндæрхуыст',
    countryTitle1: 'Хæдзæрттæ æмæ фæзтæ',
    countryTitle2: 'æппæт Ирыстоныл',
    countrySubtitle: 'Фыццаг æвдыст цæуы Дзæуджыхъæуы æввахс горæтгæрон, дæлдæр — официалон сконд горæты зылды æмæ муниципалон районты.',
    countryNearby: 'Дзæуджыхъæуы æввахс горæтгæрон',
    servicesEyebrow: 'N15 Home',
    servicesTitle1: 'Дизайн æмæ ремонт',
    servicesTitle2: 'дзырддæгтæй',
    serviceDesignTitle: 'Мидæггаг дизайн æмæ æмбырдгонд',
    serviceDesignText: 'Концепци, план, визуализаци æмæ кусæн нывтæ. Хæдзардонмæ ист: мебель, рухс, сантехникæ, фæсæхъæнтæ.',
    serviceRepairTitle: 'Ремонт дзырддæгтæй',
    serviceRepairText: 'Сметæ, подрядчиккæ, куысты организаци, техникон контроль æмæ æмгъуыдтæ хъахъхъæнын.',
    legalEyebrow: 'N15-ы экспертон центр',
    legalTitle: 'Юридикон услугæтæ',
    legalSubtitle: 'Æндæрхуысты æмвæндын документты сгарæнæй регистрацимæ.',
    legal1Title: 'Базартæ æмæ сгарæн',
    legal1Text: 'Объект æмæ хицауы сгарæн, бадзырдтæ, æвæрæн, бары регистраци.',
    legal2Title: 'Легализаци',
    legal2Text: 'Фæивын, реконструкци, кадасторон нымад æмæ реест рон рæстæнын.',
    legal3Title: 'Приватизаци æмæ хайтæ',
    legal3Text: 'Приватизаци, хайтимæ базартæ, пайдакæнынады фæтк, æлхæн æмæ дих.',
    legal4Title: 'Быны æмæ зæхх',
    legal4Text: 'Бынты æрæвæрын, æрæнты быцæутæ, сервитуттæ æмæ бары банымад.',
    legal5Title: 'Ипотекон брокер',
    legal5Text: 'Программæ æвзарын, уæз нымайын æмæ курдиаты æмвæндын банчы.',
    legal6Title: 'Хæдбар аргъгæнæг',
    legal6Text: 'Квартирæ, хæдзар, фæз кæнæ коммерцион объекты аргъ базары æмæ ипотекæйæн.',
    legalCta: 'Консультаци райсын',
    aboutEyebrow: 'Агентады тыххæй',
    aboutTitle1: 'Ирыстон —',
    aboutTitle2: 'нæ приоритет',
    aboutText: 'Мах зонæм бынæттон базар, сгарæм алы объект дæр æмæ æмвæндæм клиенты фыццаг дзурдæй дæгъæлты раттынмæ.',
    aboutSignature: 'Фатимæ, хур дæттæг',
    aboutSignatureText: 'Ирыстон — нæ зæхх, нæ удыконд, нæ æмвæндын.',
    aboutDirections: 'Æндæр здæхтытæ',
    aboutDirectionsText: 'Мæскуы · Бетъырбух · Краснодары край · Ставрополы край · Фæсарæйнаг æндæрхуыст хиуарт курдиатмæ гæсгæ.',
    contactEyebrow: 'Хиуарт консультаци',
    contactTitle1: 'Объект ссардзыстæм',
    contactTitle2: 'Ирыстоны',
    contactText: 'N15-мæ фæдзур — хæс æргом кæндзыстæм æмæ хиуарт равзæрст бацæттæ кæндзыстæм.',
    contactCall: 'N15-мæ фæдзурын',
    contactNote: 'Дзæуджыхъæу · Цæгат Ирыстон — Алани',
    footerText1: 'Æндæрхуыст Дзæуджыхъæуы',
    footerText2: 'æмæ æппæт Ирыстоныл',
  },
```

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: PASS (пропущенный ключ в os = ошибка типа)

- [ ] **Step 5: НЕ коммитить** — перейти к Task 3

---

### Task 3: Hero и «Что вы ищете?» (аккордеоны с чипами)

**Files:**
- Create: `src/components/home/LandingHero.tsx`
- Create: `src/components/home/SearchCategories.tsx`

**Interfaces:**
- Consumes: `landing.*` (Task 2), классы `lp-*` (Task 1), `DISTRICTS` (Task 2)
- Produces: `LandingHero({ t, lang }: { t: Dict; lang: string })`, `SearchCategories({ t, lang }: { t: Dict; lang: string })` — используются в Task 6

- [ ] **Step 1: Создать `src/components/home/LandingHero.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

export default function LandingHero({ t }: Props) {
  return (
    <section className="lp-section lp-hero" id="top">
      <div className="lp-hero-visual" aria-hidden="true" />
      <div className="lp-hero-overlay" aria-hidden="true" />
      <div className="lp-hero-content">
        <p className="lp-eyebrow lp-eyebrow-light">{t.landing.heroEyebrow}</p>
        <h1>
          {t.landing.heroTitle1}
          <br />
          {t.landing.heroTitle2}
        </h1>
        <p className="lp-hero-copy">{t.landing.heroCopy}</p>
        <a className="lp-button" href="#objects">
          {t.landing.heroCta} <span aria-hidden="true">→</span>
        </a>
      </div>
      <p className="lp-hero-note">{t.landing.heroNote}</p>
    </section>
  )
}
```

- [ ] **Step 2: Создать `src/components/home/SearchCategories.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'
import { DISTRICTS, NEAR_VIK, SNT_AREAS, CITIES, COUNTRY_AREAS, PRIORITY } from './landing-data'

interface Props {
  t: Dict
  lang: string
}

function Chips({ items, hrefBuilder }: { items: string[]; hrefBuilder: (item: string) => string }) {
  return (
    <div className="lp-chips">
      {items.map((item) => (
        <a key={item} href={hrefBuilder(item)}>{item}</a>
      ))}
    </div>
  )
}

export default function SearchCategories({ t, lang }: Props) {
  const catalog = (params: string) => `/${lang}/catalog?${params}`

  return (
    <section className="lp-section lp-objects" id="objects">
      <div className="lp-objects-heading">
        <div>
          <p className="lp-eyebrow">{t.landing.searchEyebrow}</p>
          <h2 className="lp-h2">{t.landing.searchTitle}</h2>
        </div>
        <p className="lp-muted">{t.landing.searchSubtitle}</p>
      </div>

      <div className="lp-categories">
        {/* 01 Квартиры */}
        <details id="apartments" open>
          <summary>
            <span>01</span>
            <div>
              <h3>{t.landing.catApartments}</h3>
              <p>{t.landing.catApartmentsDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters">
            <div>
              <small>{t.landing.roomsLabel}</small>
              <Chips
                items={[t.landing.room1, t.landing.room2, t.landing.room3, t.landing.room4]}
                hrefBuilder={(room) => {
                  const rooms = room === t.landing.room4 ? '4' : room === t.landing.room3 ? '3' : room === t.landing.room2 ? '2' : '1'
                  return catalog(`category=apartment&rooms=${rooms}`)
                }}
              />
            </div>
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=apartment&district=${encodeURIComponent(d)}`)} />
            </div>
          </div>
        </details>

        {/* 02 Частные дома */}
        <details id="houses">
          <summary>
            <span>02</span>
            <div>
              <h3>{t.landing.catHouses}</h3>
              <p>{t.landing.catHousesDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters lp-land-filters">
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=house&district=${encodeURIComponent(d)}`)} />
            </div>
            <div>
              <small>{t.landing.countryNearby}</small>
              <Chips items={NEAR_VIK} hrefBuilder={() => catalog('category=house')} />
            </div>
            <div className="lp-settlement-filter">
              <small>Населённые пункты по официальным районам</small>
              <div className="lp-settlement-groups">
                {COUNTRY_AREAS.map((area) => (
                  <details key={area.district} open={area.district === 'Ардонский район' || area.district === 'Дигорский район'}>
                    <summary>
                      {area.district}
                      <span>{area.places.split(' · ').length}</span>
                      <i>+</i>
                    </summary>
                    <p>{area.places}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="lp-settlement-filter">
              <small>СТ, СНТ, СНО и ДНТ</small>
              <Chips items={SNT_AREAS} hrefBuilder={() => catalog('category=house')} />
            </div>
          </div>
        </details>

        {/* 03 Земельные участки */}
        <details id="land">
          <summary>
            <span>03</span>
            <div>
              <h3>{t.landing.catLand}</h3>
              <p>{t.landing.catLandDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters lp-land-filters">
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=land&district=${encodeURIComponent(d)}`)} />
            </div>
            <div>
              <small>{t.landing.countryNearby}</small>
              <Chips items={NEAR_VIK} hrefBuilder={() => catalog('category=land')} />
            </div>
            <div className="lp-settlement-filter">
              <small>Населённые пункты по официальным районам</small>
              <div className="lp-settlement-groups">
                {PRIORITY.map((area) => (
                  <details key={area.district}>
                    <summary>
                      {area.district}
                      <span>{area.places.split(' · ').length}</span>
                      <i>+</i>
                    </summary>
                    <p>{area.places}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="lp-settlement-filter">
              <small>СТ, СНТ, СНО и ДНТ</small>
              <Chips items={SNT_AREAS} hrefBuilder={() => catalog('category=land')} />
            </div>
          </div>
        </details>

        {/* 04 Коммерческая */}
        <details id="commercial">
          <summary>
            <span>04</span>
            <div>
              <h3>{t.landing.catCommercial}</h3>
              <p>{t.landing.catCommercialDesc}</p>
            </div>
            <i>+</i>
          </summary>
          <div className="lp-filters">
            <div>
              <small>{t.landing.districtLabel}</small>
              <Chips items={DISTRICTS} hrefBuilder={(d) => catalog(`category=commercial&district=${encodeURIComponent(d)}`)} />
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/home/LandingHero.tsx src/components/home/SearchCategories.tsx`
Expected: PASS

- [ ] **Step 4: НЕ коммитить** — перейти к Task 4

---

### Task 4: Избранные объекты (Payload) и калькулятор

**Files:**
- Create: `src/components/home/FeaturedObjects.tsx`
- Create: `src/components/home/MortgageCalculator.tsx`

**Interfaces:**
- Consumes: `landing.*`, `lp-*`; Payload-данные передаются из родителя (Task 6)
- Produces: `FeaturedObjects({ objects, t, lang }: { objects: LandingObject[]; t: Dict; lang: string })`; тип `LandingObject` (id, title, price, category, location, district, area, rooms, imageUrl); `MortgageCalculator({ t }: { t: Dict })`

- [ ] **Step 1: Создать `src/components/home/FeaturedObjects.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

export interface LandingObject {
  id: number
  title: string
  price: number
  category: string
  location?: string
  district?: string
  area?: number
  rooms?: number
  imageUrl?: string
}

interface Props {
  objects: LandingObject[]
  t: Dict
  lang: string
}

export default function FeaturedObjects({ objects, t, lang }: Props) {
  const details = (o: LandingObject) =>
    [
      o.area ? `${o.area} м²` : null,
      o.rooms ? `${o.rooms} комн.` : null,
    ].filter(Boolean).join(' · ')

  const cards = objects.length
    ? objects.map((o) => (
        <a
          key={o.id}
          href={`/${lang}/catalog/${o.id}`}
          className="lp-property-card"
          style={o.imageUrl ? { backgroundImage: `url(${o.imageUrl})` } : undefined}
        >
          <span className="lp-property-badge">{o.category}</span>
          <div className="lp-property-info">
            <p>{[o.location, o.district].filter(Boolean).join(' · ')}</p>
            <h3>{o.title}</h3>
            <span>{details(o) || o.price.toLocaleString('ru-RU') + ' ₽'}</span>
            <small className="lp-property-open">{t.landing.openObject} →</small>
          </div>
        </a>
      ))
    : [
        <a key="ph1" href="#contact" className="lp-property-card" style={{ backgroundImage: "url('/img/apartment.png')" }}>
          <span className="lp-property-badge">Квартира</span>
          <div className="lp-property-info">
            <p>Владикавказ · Иристонский район</p>
            <h3>Квартира с панорамным видом</h3>
            <span>95 м² · 3 комнаты</span>
          </div>
        </a>,
        <a key="ph2" href="#contact" className="lp-property-card" style={{ backgroundImage: "url('/img/villa.png')" }}>
          <span className="lp-property-badge">Частный дом</span>
          <div className="lp-property-info">
            <p>Владикавказ</p>
            <h3>Современная резиденция</h3>
            <span>284 м² · участок 20 соток</span>
          </div>
        </a>,
      ]

  return (
    <section className="lp-section lp-featured">
      <div className="lp-featured-title">
        <p className="lp-eyebrow">{t.landing.featuredEyebrow}</p>
        <h2 className="lp-h2">{t.landing.featuredTitle}</h2>
      </div>
      <div className="lp-cards">{cards}</div>
    </section>
  )
}
```

- [ ] **Step 2: Создать `src/components/home/MortgageCalculator.tsx`**

(логика — точная копия из прототипа `app/mortgage-calculator.tsx`, стили — классы `lp-*`, шрифты New Standard; `id="mortgage"`)

```tsx
'use client'

import { useMemo, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'

const formatResult = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? Math.max(0, value) : 0,
  )

const parseMoney = (value: string) => Number(value.replace(/\s/g, '').replace(/[^\d]/g, '')) || 0

const formatMoneyInput = (value: string | number) => {
  const digits = String(value).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const cleanDecimal = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [whole, ...fraction] = normalized.split('.')
  return fraction.length ? `${whole}.${fraction.join('').slice(0, 2)}` : whole
}

const displayPercent = (value: number) => {
  if (!Number.isFinite(value)) return ''
  return Math.round(value * 10) / 10 + ''
}

export default function MortgageCalculator({ t }: { t: Dict }) {
  const [priceText, setPriceText] = useState('9 000 000')
  const [downPaymentText, setDownPaymentText] = useState('1 800 000')
  const [downPercentText, setDownPercentText] = useState('20')
  const [yearsText, setYearsText] = useState('20')
  const [rateText, setRateText] = useState('18')

  const price = parseMoney(priceText)
  const downPayment = Math.min(parseMoney(downPaymentText), price)
  const years = Number(yearsText) || 0
  const rate = Number(rateText.replace(',', '.')) || 0

  const changePrice = (raw: string) => {
    const formatted = formatMoneyInput(raw)
    const nextPrice = parseMoney(formatted)
    const currentDownPayment = parseMoney(downPaymentText)
    const nextDownPayment = Math.min(currentDownPayment, nextPrice)
    setPriceText(formatted)
    if (currentDownPayment > nextPrice) setDownPaymentText(formatMoneyInput(nextDownPayment))
    setDownPercentText(nextPrice > 0 ? displayPercent((nextDownPayment / nextPrice) * 100) : '')
  }

  const changeDownPayment = (raw: string) => {
    const entered = parseMoney(raw)
    const next = Math.min(entered, price)
    const isEmpty = raw.replace(/\D/g, '') === ''
    setDownPaymentText(isEmpty ? '' : formatMoneyInput(next))
    setDownPercentText(isEmpty || price === 0 ? '' : displayPercent((next / price) * 100))
  }

  const changeDownPercent = (raw: string) => {
    const cleaned = cleanDecimal(raw)
    if (!cleaned) {
      setDownPercentText('')
      setDownPaymentText('')
      return
    }
    const percent = Math.min(Number(cleaned) || 0, 100)
    setDownPercentText(percent === 100 && Number(cleaned) > 100 ? '100' : cleaned)
    setDownPaymentText(formatMoneyInput(Math.round((price * percent) / 100)))
  }

  const result = useMemo(() => {
    const principal = Math.max(0, price - downPayment)
    const months = Math.max(1, Math.round(years * 12))
    const monthlyRate = Math.max(0, rate) / 100 / 12
    const factor = Math.pow(1 + monthlyRate, months)
    const payment =
      principal === 0
        ? 0
        : monthlyRate === 0
          ? principal / months
          : (principal * monthlyRate * factor) / (factor - 1)
    const total = payment * months
    return { principal, payment, total, overpayment: total - principal }
  }, [price, downPayment, years, rate])

  return (
    <section className="lp-mortgage" id="mortgage">
      <div className="lp-mortgage-heading">
        <p className="lp-eyebrow lp-eyebrow-light">{t.landing.calcEyebrow}</p>
        <h2 className="lp-h2">
          {t.landing.calcTitle1}
          <br />
          {t.landing.calcTitle2}
        </h2>
        <p>{t.landing.calcNote}</p>
      </div>
      <div className="lp-mortgage-panel">
        <div className="lp-mortgage-fields">
          <label>
            <span>{t.landing.calcPrice}</span>
            <input aria-label={t.landing.calcPrice} inputMode="numeric" type="text" value={priceText} placeholder="0" onChange={(e) => changePrice(e.target.value)} />
            <small>₽</small>
          </label>
          <label>
            <span>{t.landing.calcDown}</span>
            <input aria-label={t.landing.calcDown} inputMode="numeric" type="text" value={downPaymentText} placeholder="0" onChange={(e) => changeDownPayment(e.target.value)} />
            <small>₽</small>
          </label>
          <label>
            <span>{t.landing.calcDownPercent}</span>
            <input aria-label={t.landing.calcDownPercent} inputMode="decimal" type="text" value={downPercentText} placeholder="0" onChange={(e) => changeDownPercent(e.target.value)} />
            <small>%</small>
          </label>
          <label>
            <span>{t.landing.calcYears}</span>
            <input aria-label={t.landing.calcYears} inputMode="numeric" type="text" value={yearsText} placeholder="0" onChange={(e) => setYearsText(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => { if (years > 40) setYearsText('40') }} />
            <small>{t.landing.calcYearsUnit}</small>
          </label>
          <label>
            <span>{t.landing.calcRate}</span>
            <input aria-label={t.landing.calcRate} inputMode="decimal" type="text" value={rateText} placeholder="0" onChange={(e) => setRateText(cleanDecimal(e.target.value))} />
            <small>%</small>
          </label>
        </div>
        <div className="lp-mortgage-results">
          <div><span>{t.landing.calcMonthly}</span><strong>{formatResult(result.payment)} ₽</strong></div>
          <div><span>{t.landing.calcDownSum}</span><b>{formatResult(downPayment)} ₽ · {downPercentText || '0'}%</b></div>
          <div><span>{t.landing.calcCredit}</span><b>{formatResult(result.principal)} ₽</b></div>
          <div><span>{t.landing.calcTotal}</span><b>{formatResult(result.total)} ₽</b></div>
          <div><span>{t.landing.calcOverpay}</span><b>{formatResult(result.overpayment)} ₽</b></div>
          <a href="#contact">{t.landing.calcConsult} <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/home/FeaturedObjects.tsx src/components/home/MortgageCalculator.tsx`
Expected: PASS

- [ ] **Step 4: НЕ коммитить** — перейти к Task 5

---

### Task 5: Справочник, услуги, юр-блок, about, контакты

**Files:**
- Create: `src/components/home/CountryGuide.tsx`
- Create: `src/components/home/ServicesSection.tsx`
- Create: `src/components/home/LegalSection.tsx`
- Create: `src/components/home/AboutSection.tsx`
- Create: `src/components/home/ContactSection.tsx`

**Interfaces:**
- Consumes: `landing.*`, `lp-*`, `COUNTRY_AREAS`, `NEAR_VIK` (Task 2)
- Produces: компоненты-секции, используются в Task 6; `ContactSection({ t, phone }: { t: Dict; phone?: string })` — телефон из SiteSettings

- [ ] **Step 1: Создать `src/components/home/CountryGuide.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'
import { COUNTRY_AREAS, NEAR_VIK } from './landing-data'

export default function CountryGuide({ t }: { t: Dict }) {
  return (
    <section className="lp-country" id="country">
      <div className="lp-country-heading">
        <div>
          <p className="lp-eyebrow lp-eyebrow-light">{t.landing.countryEyebrow}</p>
          <h2 className="lp-h2">
            {t.landing.countryTitle1}
            <br />
            {t.landing.countryTitle2}
          </h2>
        </div>
        <p>{t.landing.countrySubtitle}</p>
      </div>
      <div className="lp-nearby">
        <span>{t.landing.countryNearby}</span>
        <p>{NEAR_VIK.join(' · ')}</p>
      </div>
      <div className="lp-districts">
        {COUNTRY_AREAS.map((area, index) => (
          <details key={area.district}>
            <summary>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{area.district}{index === 0 ? ' — официальный состав' : ''}</strong>
              <i>+</i>
            </summary>
            <p>{area.places}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Создать `src/components/home/ServicesSection.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

export default function ServicesSection({ t }: { t: Dict }) {
  return (
    <section className="lp-section lp-services" id="design">
      <div className="lp-services-heading">
        <p className="lp-eyebrow">{t.landing.servicesEyebrow}</p>
        <h2 className="lp-h2">
          {t.landing.servicesTitle1}
          <br />
          {t.landing.servicesTitle2}
        </h2>
      </div>
      <div className="lp-service-list">
        <article className="lp-home-service">
          <span>01</span>
          <h3>{t.landing.serviceDesignTitle}</h3>
          <p>{t.landing.serviceDesignText}</p>
        </article>
        <article className="lp-home-service">
          <span>02</span>
          <h3>{t.landing.serviceRepairTitle}</h3>
          <p>{t.landing.serviceRepairText}</p>
        </article>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Создать `src/components/home/LegalSection.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

const ITEMS = [
  { key: 'legal1', title: 'legal1Title', text: 'legal1Text' },
  { key: 'legal2', title: 'legal2Title', text: 'legal2Text' },
  { key: 'legal3', title: 'legal3Title', text: 'legal3Text' },
  { key: 'legal4', title: 'legal4Title', text: 'legal4Text' },
  { key: 'legal5', title: 'legal5Title', text: 'legal5Text' },
  { key: 'legal6', title: 'legal6Title', text: 'legal6Text' },
] as const

export default function LegalSection({ t }: { t: Dict }) {
  return (
    <section className="lp-legal" id="legal">
      <div className="lp-legal-heading">
        <p className="lp-eyebrow lp-eyebrow-light">{t.landing.legalEyebrow}</p>
        <h2 className="lp-h2">{t.landing.legalTitle}</h2>
        <p>{t.landing.legalSubtitle}</p>
      </div>
      <div className="lp-legal-grid">
        {ITEMS.map((item, i) => (
          <article key={item.key}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            <h3>{t.landing[item.title]}</h3>
            <p>{t.landing[item.text]}</p>
          </article>
        ))}
      </div>
      <a className="lp-legal-action" href="#contact">
        {t.landing.legalCta} <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}
```

- [ ] **Step 4: Создать `src/components/home/AboutSection.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

export default function AboutSection({ t }: { t: Dict }) {
  return (
    <section className="lp-section" id="about">
      <div className="lp-about">
        <div className="lp-about-image" aria-hidden="true">
          <img src="/img/fatima-ossetia.png" alt="" />
        </div>
        <div className="lp-about-copy">
          <p className="lp-eyebrow">{t.landing.aboutEyebrow}</p>
          <h2 className="lp-h2">
            {t.landing.aboutTitle1}
            <br />
            {t.landing.aboutTitle2}
          </h2>
          <p>{t.landing.aboutText}</p>
          <div className="lp-signature">
            <span>{t.landing.aboutSignature}</span>
            <p>{t.landing.aboutSignatureText}</p>
          </div>
          <div className="lp-directions">
            <details>
              <summary>
                {t.landing.aboutDirections} <i>+</i>
              </summary>
              <p>{t.landing.aboutDirectionsText}</p>
            </details>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Создать `src/components/home/ContactSection.tsx`**

```tsx
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  phone?: string
}

export default function ContactSection({ t, phone }: Props) {
  const phoneHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'
  const phoneLabel = phone || '8 958 116-15-15'

  return (
    <section className="lp-section" id="contact">
      <div className="lp-contact">
        <div>
          <p className="lp-eyebrow">{t.landing.contactEyebrow}</p>
          <h2 className="lp-h2">
            {t.landing.contactTitle1}
            <br />
            {t.landing.contactTitle2}
          </h2>
        </div>
        <div className="lp-contact-copy">
          <p>{t.landing.contactText}</p>
          <a className="lp-phone" href={phoneHref}>{phoneLabel}</a>
          <a className="lp-button" href={phoneHref}>
            {t.landing.contactCall} <span aria-hidden="true">→</span>
          </a>
          <small>{t.landing.contactNote}</small>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/components/home/*.tsx"`
Expected: PASS

- [ ] **Step 7: НЕ коммитить** — перейти к Task 6

---

### Task 6: Сборка главной (замена page.tsx)

**Files:**
- Modify: `src/app/(site)/[lang]/page.tsx` (полная замена содержимого; Header текущего сайта остаётся сверху)

**Interfaces:**
- Consumes: все секции Tasks 3-5, `LandingObject` (Task 4), `getPayload`, `SiteSettings`

- [ ] **Step 1: Переписать `src/app/(site)/[lang]/page.tsx`**

```tsx
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { getDictionary } from '@/i18n/dictionaries'
import LandingHero from '@/components/home/LandingHero'
import SearchCategories from '@/components/home/SearchCategories'
import FeaturedObjects, { type LandingObject } from '@/components/home/FeaturedObjects'
import MortgageCalculator from '@/components/home/MortgageCalculator'
import CountryGuide from '@/components/home/CountryGuide'
import ServicesSection from '@/components/home/ServicesSection'
import LegalSection from '@/components/home/LegalSection'
import AboutSection from '@/components/home/AboutSection'
import ContactSection from '@/components/home/ContactSection'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

const CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  house: 'Частный дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая недвижимость',
  land: 'Земельный участок',
}

export default async function HomePage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'published' } },
    sort: '-createdAt',
    limit: 6,
    depth: 1,
  })

  const objects: LandingObject[] = docs.map((d) => {
    const o = d as unknown as Record<string, unknown>
    const img = o.primaryImage as { url?: string } | undefined
    const addr = o.address as { city?: string; district?: string } | undefined
    return {
      id: o.id as number,
      title: o.title as string,
      price: o.price as number,
      category: CATEGORY_LABELS[o.category as string] || (o.category as string),
      location: addr?.city,
      district: addr?.district,
      area: o.area as number | undefined,
      rooms: o.rooms as number | undefined,
      imageUrl: img?.url,
    }
  })

  // Телефон из глобала (fallback — из прототипа)
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const sitePhones = ((site as Record<string, unknown>).phones as { phone?: string }[] | undefined) || []
  const phone = sitePhones[0]?.phone

  return (
    <>
      <Header />
      <main>
        <LandingHero t={t} lang={lang} />
        <SearchCategories t={t} lang={lang} />
        <FeaturedObjects objects={objects} t={t} lang={lang} />
        <MortgageCalculator t={t} />
        <CountryGuide t={t} />
        <ServicesSection t={t} />
        <LegalSection t={t} />
        <AboutSection t={t} />
        <ContactSection t={t} phone={phone} />
        <footer className="lp-section">
          <div className="lp-footer">
            <p>
              {t.landing.footerText1}
              <br />
              {t.landing.footerText2}
            </p>
            <a className="lp-phone" href={phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'}>
              {phone || '8 958 116-15-15'}
            </a>
            <p>© {new Date().getFullYear()} N15</p>
          </div>
        </footer>
      </main>
    </>
  )
}
```

⚠️ Внимание: Header текущего сайта — фиксированный (fixed top-0) с тёмным фоном токенов. Лендинг светлый — шапка будет контрастировать. Это согласовано в спеке («текущая шапка остаётся») — приёмка: на шапке виден контраст кремовой шапки на светлом лендинге; если пользователю не понравится — отдельная задача по шапке.

- [ ] **Step 2: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint "src/app/(site)/[lang]/page.tsx"`
Expected: PASS

- [ ] **Step 3: Проверить в браузере**

- http://localhost:3000/ru — лендинг рендерится: hero → категории → объекты → калькулятор → справочник → услуги → юр → about → контакты
- Аккордеоны открываются, чипы ведут на /ru/catalog?… с параметрами
- Калькулятор считает (изменить стоимость → платёж меняется)
- Объекты из БД кликабельны (если есть published)

- [ ] **Step 4: НЕ коммитить** — перейти к Task 7

---

### Task 7: Фильтр «Район» в каталоге

**Files:**
- Modify: `src/components/objects/CatalogFilters.tsx` (dropdown + state + where)
- Modify: `src/app/(site)/[lang]/catalog/page.tsx` (URL-параметр district)

**Interfaces:**
- Consumes: `DISTRICTS` (Task 2), существующий `FiltersState`, `buildWhere`

- [ ] **Step 1: CatalogFilters — поле district**

В `src/components/objects/CatalogFilters.tsx`:

1. Импорт: `import { DISTRICTS } from '@/components/home/landing-data'`
2. В `FiltersState` добавить `district: string`; в `emptyFilters` — `district: ''`
3. В `buildWhere` после category:

```ts
  if (f.district) conds.push({ 'address.district': { equals: f.district } })
```

4. В JSX после блока «КАТЕГОРИЯ» добавить:

```tsx
      <div className="w-48">
        <Dropdown label={t.catalog.districtLabel} value={state.district}
          options={DISTRICTS.map((d) => ({ value: d, label: d }))}
          onSelect={(v) => onChange({ district: v })} />
      </div>
```

5. В `hasFilters` добавить `|| state.district`

- [ ] **Step 2: Ключ словаря `catalog.districtLabel`**

В `src/i18n/dictionaries.ts` в `catalog` (ru): `districtLabel: 'Район',`; в os: `districtLabel: 'Район',`

- [ ] **Step 3: Каталог — URL-параметр**

В `src/app/(site)/[lang]/catalog/page.tsx`:
- В инициализации `filters` (useState из searchParams): добавить `district: searchParams.get('district') ?? ''`
- В блоке render-adjustment (prevSearchParams !== searchParams): в `next` добавить `district: searchParams.get('district') ?? ''`

- [ ] **Step 4: Проверить**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npx eslint src/components/objects/CatalogFilters.tsx "src/app/(site)/[lang]/catalog/page.tsx"`
Expected: PASS

- [ ] **Step 5: Проверить в браузере**

- http://localhost:3000/ru/catalog?category=apartment&district=Иристонский — фильтр «Район: Иристонский» выбран, список отфильтрован
- С лендинга: клик по чипу «Иристонский» → каталог с применённым фильтром

- [ ] **Step 6: НЕ коммитить** — перейти к Task 8

---

### Task 8: Финальная верификация

- [ ] **Step 1: Полные проверки**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit && npm run lint 2>&1 | grep -cE " error "`
Expected: `0`

- [ ] **Step 2: Сценарий лендинга**

1. `/ru` — все 9 секций + футер, скриншоты (полный + по секциям)
2. Аккордеоны категорий открываются/закрываются (квартиры открыта по умолчанию)
3. Чипы: «2-комнатные» → `/ru/catalog?category=apartment&rooms=2`; «Иристонский» → `...&district=Иристонский`; фильтры применены
4. Калькулятор: изменить сумму → ежемесячный платёж пересчитывается
5. Ссылки объектов → страница объекта открывается

- [ ] **Step 3: os-локаль и мобильная ширина**

- `/os` — осетинские заголовки секций
- 390px: hero сжат, категории в 1 колонку, карточки вертикально

- [ ] **Step 4: Сверка с прототипом**

- Открыть http://localhost:3100/ рядом — визуально сравнить ключевые секции (hero, категории, калькулятор); поправить расхождения в CSS

- [ ] **Step 5: Без коммитов — доложить пользователю о готовности и ждать команды**
