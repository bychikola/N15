#!/usr/bin/env node
/**
 * Проверки водяного знака «Н15» на фотографиях объектов.
 *
 * Запуск: node scripts/check-watermark.mjs [адрес сайта] [сколько фото]
 *   По умолчанию — боевой https://n15-realty.ru и 5 фото; локальную сборку
 *   можно проверить так: node scripts/check-watermark.mjs http://localhost:3011 3
 *
 * Скрипт только читает публичный API Payload (тот же, что читает каталог) и
 * сами файлы фотографий, и ничего не меняет. Проверяет:
 *
 * 1. Знак стоит по центру кадра — и по горизонтали, и по вертикали. Знак
 *    накладывает сервер прямо в файл (см. src/lib/watermark.ts), поэтому
 *    проверяется то, что видит посетитель. Место и вид знака известны: ширина —
 *    24% короткой стороны кадра, непрозрачность 0.78, тень и тёмный кант по
 *    контуру. Скрипт строит такую же модель и сверяет её узор с кадром в двух
 *    местах: по центру (где знак должен быть) и в правом нижнем углу (где он
 *    лежал до 24.09.2026 — плитки каталога обрезают кадр по краям, и оттуда
 *    знак пропадал целиком). Совпадение узора с моделью: у размеченных кадров
 *    0.6–1.0, у чистых — до 0.2, порог проверки — 0.5. Целый прежний знак в
 *    углу (совпадение от 0.85) — ошибка; слабый след от него (у четырёх фото
 *    знак ложился дважды, и снят один слой) — только пометка в отчёте.
 * 2. Знак полупрозрачный, а не закрывает кадр собой: средний цвет кадра под
 *    плотными штрихами знака сверяется с двумя моделями — полупрозрачной
 *    (0.78, как утверждено) и непрозрачной. Полупрозрачная модель должна
 *    оказаться ближе: значит, кадр под знаком виден.
 *
 * У фото, до которых фоновая разметка ещё не дошла (поле wm = -1 — знак нужно
 * переложить, см. src/lib/media-marking.ts), знак лежит в углу: проверка это и
 * покажет. Массовая разметка идёт фоном и порциями, поэтому сразу после
 * выкладки часть фото может быть ещё с прежним знаком — повторный запуск
 * скрипта через некоторое время покажет, дошли ли до них руки.
 *
 * Код возврата: 0 — все проверки прошли, 1 — есть ошибки (они помечены ✗).
 */

import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const BASE = (process.argv[2] || process.env.CHECK_BASE_URL || 'https://n15-realty.ru').replace(/\/+$/, '')
const COUNT = Math.max(1, Number(process.argv[3]) || 5)
/** Файл знака — тот же, что накладывает сервер (см. src/lib/watermark.ts) */
const MARK = readFileSync(new URL('../public/img/watermark.png', import.meta.url))

/** Геометрия и непрозрачности знака — числа из src/lib/watermark.ts */
const MARK_WIDTH_RATIO = 0.24
const MARK_MIN_WIDTH = 48
const MARK_OPACITY = 0.78
const MARK_SHADOW_OPACITY = 0.26
const MARK_SHADOW_BLUR_RATIO = 0.035
/** Паспорт прежнего углового знака — им проверяется угол кадра */
const OLD_MARK_MARGIN_RATIO = 0.04
const OLD_MARK_OPACITY = 0.72
/** Порог «узор знака совпал»: у размеченных кадров 0.6–1.0, у чистых до 0.2 */
const MIN_FIT = 0.5
/**
 * Совпадение, при котором прежний знак в углу считается целым. У фото, размеченных
 * угловой версией, он 0.9–1.0. Ниже — не знак, а слабый след: у четырёх фото
 * (media 936–939) знак ложился дважды, и снятие снимает один слой — второй в углу
 * остаётся (см. stripOldCornerMark в src/lib/watermark.ts). Такой след — не ошибка,
 * а пометка в отчёте.
 */
const CORNER_INTACT = 0.85
/** Штрихи знака для замера прозрачности: насколько плотные пиксели берём */
const STROKE_ALPHA = 200

/**
 * Слой знака в raw RGBA: sharp умеет только «наложить как есть», поэтому цвет,
 * непрозрачность и размытие тени готовятся заранее — ровно так же, как в
 * src/lib/watermark.ts, иначе модель не совпадёт с тем, что лежит в файле.
 */
async function markLayer(mark, width, opacity, options = {}) {
  const { data, info } = await sharp(mark)
    .resize({ width, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const alpha = options.blur
    ? await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extractChannel('alpha')
      .blur(options.blur)
      .raw()
      .toBuffer()
    : null

  const out = Buffer.alloc(info.width * info.height * 4)
  const [r, g, b] = options.color ?? []
  for (let i = 0; i < info.width * info.height; i++) {
    const source = alpha ? alpha[i] : data[i * 4 + 3]
    out[i * 4] = r ?? data[i * 4]
    out[i * 4 + 1] = g ?? data[i * 4 + 1]
    out[i * 4 + 2] = b ?? data[i * 4 + 2]
    out[i * 4 + 3] = Math.round(source * opacity)
  }
  return { data: out, width: info.width, height: info.height }
}

/** Знак такого размера, каким его кладёт сервер, и место в кадре */
async function markModel(width, height, opacity = MARK_OPACITY) {
  const short = Math.min(width, height)
  const markWidth = Math.max(MARK_MIN_WIDTH, Math.round(short * MARK_WIDTH_RATIO))
  const [layer, shadow, mask] = await Promise.all([
    markLayer(MARK, markWidth, opacity),
    markLayer(MARK, markWidth, MARK_SHADOW_OPACITY, {
      color: [0, 0, 0],
      blur: Math.max(4, Math.round(markWidth * MARK_SHADOW_BLUR_RATIO)),
    }),
    // Маска штрихов: цвет знака и его форма без непрозрачности
    markLayer(MARK, markWidth, 1),
  ])
  return { layer, shadow, mask }
}

/** Место знака в кадре: по центру — нынешний знак, в правом нижнем углу — прежний */
function markPlace(width, height, layer, corner) {
  if (!corner) {
    return { left: Math.max(0, Math.round((width - layer.width) / 2)), top: Math.max(0, Math.round((height - layer.height) / 2)) }
  }
  const short = Math.min(width, height)
  const margin = Math.round(short * OLD_MARK_MARGIN_RATIO)
  return { left: Math.max(0, width - layer.width - margin), top: Math.max(0, height - layer.height - margin) }
}

/**
 * Совпадение узора знака с кадром на заданном месте: сравниваем штрихи знака с
 * фоном вокруг них (пиксели внутри рамки знака, но не под штрихами). Числа — те
 * же, что в fitOldCornerMark из src/lib/watermark.ts: у кадра с нашим знаком
 * совпадение около 1, у чистого — около 0.
 */
function fit(img, info, layer, shadow, left, top) {
  const bg = [0, 0, 0]
  let n = 0
  const inside = (x, y) => x >= 0 && y >= 0 && x < info.width && y < info.height
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      if (layer.data[(y * layer.width + x) * 4 + 3] > 8) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * info.width + left + x) * info.channels
      for (let c = 0; c < 3; c++) bg[c] += img[at + c]
      n++
    }
  }
  if (!n) return null
  for (let c = 0; c < 3; c++) bg[c] /= n

  let dot = 0
  let observed2 = 0
  let model2 = 0
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const li = (y * layer.width + x) * 4
      const mark = layer.data[li + 3] / 255
      const shade = shadow.data[li + 3] / 255
      if (mark <= 0.3) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * info.width + left + x) * info.channels
      const a = 1 - (1 - shade) * (1 - mark)
      for (let c = 0; c < 3; c++) {
        const observed = img[at + c] - bg[c]
        const expected = layer.data[li + c] * mark - a * bg[c]
        dot += observed * expected
        observed2 += observed * observed
        model2 += expected * expected
      }
    }
  }
  if (model2 < 1) return null
  return dot / Math.sqrt(Math.max(1e-9, observed2 * model2))
}

/**
 * Насколько знак перекрыл кадр: средний цвет под плотными штрихами сверяется с
 * двумя моделями — полупрозрачной (утверждённые 0.78) и непрозрачной. Меньшее
 * расхождение и есть ответ; тень под знаком слегка темнит кадр, поэтому
 * сравниваются модели между собой, а не с порогом.
 */
function ink(model, place, img, info) {
  const { layer, mask } = model
  const { left, top } = place
  const bg = [0, 0, 0]
  let n = 0
  const inside = (x, y) => x >= 0 && y >= 0 && x < info.width && y < info.height
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      if (layer.data[(y * layer.width + x) * 4 + 3] > 8) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * info.width + left + x) * info.channels
      for (let c = 0; c < 3; c++) bg[c] += img[at + c]
      n++
    }
  }
  if (!n) return null
  for (let c = 0; c < 3; c++) bg[c] /= n

  const sum = [0, 0, 0]
  let k = 0
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const li = (y * layer.width + x) * 4
      if (mask.data[li + 3] < STROKE_ALPHA) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * info.width + left + x) * info.channels
      for (let c = 0; c < 3; c++) sum[c] += img[at + c]
      k++
    }
  }
  if (!k) return null
  const observed = sum.map((v) => v / k)
  const color = [mask.data[0], mask.data[1], mask.data[2]].slice(0, 3)
  const diff = (opacity) => {
    let total = 0
    for (let c = 0; c < 3; c++) total += Math.abs(observed[c] - (color[c] * opacity + bg[c] * (1 - opacity)))
    return Math.round(total / 3)
  }
  return { translucent: diff(MARK_OPACITY), opaque: diff(1), observed: observed.map(Math.round) }
}

/** Фотографии объектов из публичного API: имя файла, объект и поле wm */
async function photos(limit) {
  const res = await fetch(`${BASE}/api/objects?limit=50&depth=1`)
  if (!res.ok) throw new Error(`каталог не ответил: ${res.status}`)
  const body = await res.json()
  const list = []
  for (const doc of body.docs ?? []) {
    for (const image of doc.images ?? []) {
      if (image?.url) list.push({ url: image.url, file: image.filename, wm: image.wm, object: doc.title, id: doc.id })
    }
  }
  // Фото берём вразброс по каталогу: рядом лежат снимки одного объекта, а
  // проверка нужна на разных — и по кадру, и по дате загрузки
  const step = Math.max(1, Math.floor(list.length / limit))
  const picked = []
  for (let i = 0; i < list.length && picked.length < limit; i += step) picked.push(list[i])
  return picked
}

/** Разбор кадра в пиксели: 3 канала, без EXIF-поворота — как его видит sharp */
async function pixels(bytes) {
  const meta = await sharp(bytes).metadata()
  const { data, info } = await sharp(bytes).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, info, width: info.width, height: info.height, orientation: meta.orientation ?? 1 }
}

async function check(photo) {
  const res = await fetch(photo.url)
  if (!res.ok) throw new Error(`фото не скачалось: ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const { data, info } = await pixels(bytes)
  const errors = []

  const current = await markModel(info.width, info.height)
  const center = markPlace(info.width, info.height, current.layer, false)
  const centerFit = fit(data, info, current.layer, current.shadow, center.left, center.top)

  const old = await markModel(info.width, info.height, OLD_MARK_OPACITY)
  const corner = markPlace(info.width, info.height, old.layer, true)
  const cornerFit = fit(data, info, old.layer, old.shadow, corner.left, corner.top)

  const centered = centerFit !== null && centerFit >= MIN_FIT
  const cornered = cornerFit !== null && cornerFit >= CORNER_INTACT
  const cornerTrace = !cornered && cornerFit !== null && cornerFit >= MIN_FIT
  if (!centered) errors.push('знака по центру кадра нет')
  if (cornered) errors.push('знак стоит в правом нижнем углу (прежнее место)')

  // Прозрачность меряется по штрихам знака, поэтому только там, где он вообще
  // есть: у кадра без знака по центру замер ничего не значит
  const alpha = centered ? ink(current, center, data, info) : null
  const translucent = !alpha || alpha.translucent < alpha.opaque
  if (alpha && !translucent) errors.push('знак закрывает кадр собой (полупрозрачности нет)')

  return { errors, centerFit, cornerFit, cornerTrace, alpha, size: `${info.width}×${info.height}` }
}

const pct = (v) => (v === null ? 'н/д' : v.toFixed(2))

try {
  console.log(`Проверка водяного знака «Н15» — ${BASE}\n`)
  const list = await photos(COUNT)
  if (!list.length) throw new Error('в каталоге нет фотографий')

  let bad = 0
  for (const photo of list) {
    let result
    try {
      result = await check(photo)
    } catch (e) {
      console.log(`  ✗ ${photo.file} (${photo.object}): ${e.message}\n`)
      bad++
      continue
    }
    const mark = result.errors.length ? '✗' : '✓'
    if (result.errors.length) bad++
    console.log(`${mark} ${photo.file} (${result.size}, «${photo.object}», id ${photo.id})`)
    console.log(`   центр кадра: совпадение ${pct(result.centerFit)} (нужно ≥ ${MIN_FIT})`)
    console.log(`   угол кадра:  совпадение ${pct(result.cornerFit)} (целый прежний знак — от ${CORNER_INTACT})`)
    if (result.cornerTrace) console.log('   (в углу слабый след прежнего знака: у этих фото знак ложился дважды, снят один слой)')
    if (result.alpha) {
      const a = result.alpha
      console.log(`   кадр под штрихами: ${a.observed.join('/')}; полупрозрачная модель ближе на ${a.translucent} уровней, непрозрачная — на ${a.opaque}`)
    }
    for (const e of result.errors) console.log(`   ✗ ${e}`)
    // Подсказка на случай, когда фоновая разметка ещё не переложила знак
    if (photo.wm < 0) console.log('   (wm = -1: фото ждёт перекладывания знака фоновой разметкой)')
    console.log('')
  }

  console.log(bad ? `Итог: проверено ${list.length} фото, с замечаниями — ${bad}.` : `Итог: проверено ${list.length} фото, все проверки прошли.`)
  process.exit(bad ? 1 : 0)
} catch (e) {
  console.error(`Проверка не удалась: ${e.message}`)
  process.exit(1)
}
