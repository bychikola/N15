#!/usr/bin/env node
/**
 * Сборка файла знака «Н15» для наложения на фотографии (public/img/watermark.png).
 *
 * Запуск: node scripts/build-watermark.mjs
 *
 * Знак — картинка в золоте с прозрачным фоном: ключик, литеры «Н15», подпись
 * адресом сайта и тонкая рамка. Рисовать его целиком в коде не нужно: ключик,
 * монограмма и рамка берутся из прежнего файла знака (public/img/watermark-v2.png —
 * тот, что лежал на фотографиях до 26.09.2026), а меняется только подпись под
 * монограммой: вместо «НЕДВИЖИМОСТЬ» — адрес n15-realty.ru. Так знак сохраняет
 * фирменный стиль один в один, а из кода видно, каким шрифтом и кеглем набрана
 * подпись (иначе этого не понять по готовой картинке).
 *
 * Шрифт подписи — тот же, что у монограммы: NewStandard (public/fonts). sharp
 * разбирает SVG через fontconfig, поэтому скрипт сам собирает временный
 * fonts.conf на папку со шрифтами: на машине без системных шрифтов иначе подпись
 * не нарисуется.
 *
 * Файл знака читает сервер (src/lib/watermark.ts, константа MARK_PATH), поэтому
 * после пересборки его нужно закоммитить. Прошлый знак (watermark-v2.png)
 * остаётся в репозитории: по нему сервер снимает прежний знак с фотографий,
 * загруженных до смены подписи.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** Прежний знак — источник ключика, монограммы и рамки */
const BASE = path.join(ROOT, 'public', 'img', 'watermark-v2.png')
/** Готовый знак — его и накладывает сервер */
const TARGET = path.join(ROOT, 'public', 'img', 'watermark.png')
const FONTS = path.join(ROOT, 'public', 'fonts')

/** Цвет знака — фирменное золото */
const GOLD = '#C9A24B'
/**
 * Кегль и разрядка подписи. Кегль упирается в ширину знака: при 210 подпись
 * занимает 1290 px из 1312 доступных, при 220 уже вылезает за рамку. Дальше
 * увеличить адрес нельзя, не увеличивая сам знак, — поэтому 210 это предел
 * читаемости на плитке каталога (знак на ней всего 72 px шириной).
 */
const CAPTION_SIZE = 210
const CAPTION_TRACKING = 7
/** Подпись: строки берём из прежнего знака ниже этой высоты (там уже была подпись) */
const TOP = 940
/** Полоса нижней рамки прежнего знака — из неё собирается низ нового файла */
const FRAME_BOTTOM = { top: 1131, height: 6 }
/** Толщина боковых линий рамки прежнего знака */
const SIDE = 6
/** Поля подписи от боковых линий рамки (нужны, чтобы подпись не касалась рамки) */
const CAPTION_MARGIN = 12
/** Просветы вокруг подписи: сверху до монограммы, снизу до рамки */
const GAP_TOP = 19
const GAP_BOTTOM = 86

/** Подпись отдельным слоем: золотая надпись на прозрачном фоне */
async function caption(text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="600">
<text x="40" y="420" font-family="NewStandard" font-size="${CAPTION_SIZE}" letter-spacing="${CAPTION_TRACKING}" fill="${GOLD}">${text}</text>
</svg>`
  const rendered = await sharp(Buffer.from(svg)).png().toBuffer()
  // trim отрезает прозрачные поля — размеры подписи нужны, чтобы поставить её
  // по центру; raw после trim — уже пиксели, а не PNG (иначе ширина выйдет 1)
  const { data, info } = await sharp(rendered)
    .trim({ threshold: 8 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Собрать знак: верх прежнего файла, новая подпись по центру, низ и рамка прежние */
async function build(text) {
  const base = await sharp(BASE).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W } = base.info
  const cap = await caption(text)
  const maxWidth = W - 2 * SIDE - 2 * CAPTION_MARGIN
  if (cap.width > maxWidth) throw new Error(`подпись шире рамки: ${cap.width} > ${maxWidth}`)

  const height = TOP + GAP_TOP + cap.height + GAP_BOTTOM + FRAME_BOTTOM.height
  const out = Buffer.alloc(W * height * 4)
  // Верх прежнего знака (рамка, ключик, монограмма) — как есть
  base.data.copy(out, 0, 0, TOP * W * 4)
  // Боковые линии рамки тянем вниз на всю новую высоту: строку с линиями берём
  // из прежнего файла, где рядом нет ни монограммы, ни подписи
  const sideRow = 600
  for (let y = TOP; y < height - FRAME_BOTTOM.height; y++) {
    for (let x = 0; x < SIDE; x++) {
      for (let c = 0; c < 4; c++) {
        out[(y * W + x) * 4 + c] = base.data[(sideRow * W + x) * 4 + c]
        out[(y * W + (W - 1 - x)) * 4 + c] = base.data[(sideRow * W + (W - 1 - x)) * 4 + c]
      }
    }
  }
  // Подпись по центру знака
  const left = Math.round((W - cap.width) / 2)
  const top = TOP + GAP_TOP
  for (let y = 0; y < cap.height; y++) {
    for (let x = 0; x < cap.width; x++) {
      const si = (y * cap.width + x) * 4
      const a = cap.data[si + 3] / 255
      if (a <= 0) continue
      const di = ((top + y) * W + left + x) * 4
      for (let c = 0; c < 3; c++) {
        out[di + c] = Math.round(cap.data[si + c] * a + out[di + c] * (1 - a))
      }
      out[di + 3] = Math.max(out[di + 3], cap.data[si + 3])
    }
  }
  // Нижняя рамка прежнего знака
  const bottomSrc = FRAME_BOTTOM.top * W * 4
  base.data.copy(out, (height - FRAME_BOTTOM.height) * W * 4, bottomSrc, bottomSrc + FRAME_BOTTOM.height * W * 4)

  await sharp(out, { raw: { width: W, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(TARGET)
  return { width: W, height, caption: cap }
}

/** fonts.conf на папку со шрифтами репозитория: без него sharp не находит шрифт */
function pointFontconfig() {
  const dir = mkdtempSync(path.join(tmpdir(), 'watermark-fonts-'))
  const conf = path.join(dir, 'fonts.conf')
  writeFileSync(
    conf,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS}</dir>
  <cachedir>${path.join(dir, 'cache')}</cachedir>
</fontconfig>
`,
  )
  process.env.FONTCONFIG_FILE = conf
}

try {
  pointFontconfig()
  const result = await build('n15-realty.ru')
  console.log(`Знак собран: ${path.relative(ROOT, TARGET)} — ${result.width}×${result.height}, подпись ${result.caption.width}×${result.caption.height}`)
} catch (e) {
  console.error('Знак собрать не удалось:', e.message)
  process.exit(1)
}
