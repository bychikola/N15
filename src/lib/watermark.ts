import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Sharp } from 'sharp'

import { PHOTO_MIME_TYPES } from './photo-rules'

/**
 * Водяной знак на фотографиях объектов — фирменный знак «Н15» в правом нижнем
 * углу кадра.
 *
 * Знак накладывает сервер, а не браузер: sharp уже есть в образе (им Payload
 * готовит размеры фото), поэтому один и тот же знак получают все снимки
 * объектов — и из карточки CRM, и из старой формы /admin-add (она ходит в тот
 * же маршрут /api/upload), и любые будущие загрузки. Пока знак рисовался в
 * браузере, мимо него проходили все остальные пути загрузки.
 *
 * Размер и прозрачность одинаковы для всех фото: ширина знака — доля короткой
 * стороны кадра, поэтому на вертикальном и горизонтальном снимке знак выглядит
 * одинаково, а не раздувается на широких кадрах. Отступ от нижнего и правого
 * краёв — та же доля короткой стороны, то есть одинаковый со всех сторон.
 *
 * Формат исходника сохраняется: JPEG и WebP пережимаются на 95, PNG остаётся
 * без потерь. Под знаком — мягкая тень: без неё знак пропадает на светлых
 * кадрах (белые стены, снег) и выглядит наклейкой на тёмных.
 */

/** Ширина знака — доля короткой стороны кадра (18%) */
const MARK_WIDTH_RATIO = 0.18
/** Отступ от краёв кадра — доля короткой стороны (4%) */
const MARK_MARGIN_RATIO = 0.04
/** Минимальная ширина знака в пикселях: на маленьких кадрах он не микроскопический */
const MARK_MIN_WIDTH = 48
/** Непрозрачность знака: аккуратно, но читаемо */
const MARK_OPACITY = 0.72
/** Тень под знаком: размытая копия контура, тоже полупрозрачная */
const SHADOW_OPACITY = 0.3
/** Радиус размытия тени — доля ширины знака */
const SHADOW_BLUR_RATIO = 0.035
/**
 * Качество пережима JPEG/WebP. 92 — как у размеров Payload (webp 86 ≈ jpeg 92):
 * на глаз от исходника не отличается (PSNR выше 46 дБ), но файл не растёт
 * вдвое, как на 95 — фото уходят в каталог и на карточку объекта.
 */
const OUTPUT_QUALITY = 92

/** Форматы, которые умеет и браузер сотрудника, и sharp (см. photo-rules.ts) */
type PhotoFormat = 'jpeg' | 'png' | 'webp'

const FORMAT_BY_MIME: Record<string, PhotoFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MIME_BY_FORMAT: Record<PhotoFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Путь к знаку: public/ лежит рядом с приложением и в образе, и на сервере */
const MARK_PATH = path.join(process.cwd(), 'public', 'img', 'watermark.png')

// Файл знака читаем один раз на процесс: он нужен каждой загрузке, а меняется
// только вместе с деплоем. null — файла нет (знак не накладываем, фото важнее).
let markSource: Buffer | null | undefined

function readMark(): Buffer | null {
  if (markSource === undefined) {
    try {
      markSource = readFileSync(MARK_PATH)
    } catch (e) {
      console.error('watermark: не читается файл знака', MARK_PATH, e)
      markSource = null
    }
  }
  return markSource
}

/**
 * Формат фото по MIME-типу, а при пустом типе — по расширению файла:
 * часть браузеров (и почти все на iPhone) не присылает file.type.
 */
function photoFormat(mimetype: string, filename: string): PhotoFormat | null {
  const byMime = FORMAT_BY_MIME[(mimetype || '').toLowerCase()]
  if (byMime) return byMime
  const ext = /\.([^.]+)$/.exec(filename || '')?.[1].toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg'
  if (ext === 'png') return 'png'
  if (ext === 'webp') return 'webp'
  return null
}

/** Есть ли формат в списке разрешённых (одна правда — src/lib/photo-rules.ts) */
function isSupportedMime(mimetype: string): boolean {
  return (PHOTO_MIME_TYPES as readonly string[]).includes((mimetype || '').toLowerCase())
}

/**
 * Слой знака в raw RGBA: нужен цвет и общая непрозрачность, а sharp умеет
 * только «наложить как есть» — поэтому альфу готовим сами. Размытие нужно
 * тени: размываем альфу, а не саму картинку, чтобы контур остался чётким.
 */
async function markLayer(
  mark: Buffer,
  width: number,
  opacity: number,
  options: { color?: [number, number, number]; blur?: number } = {},
): Promise<{ data: Buffer; width: number; height: number }> {
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

/** Пережим в исходном формате: качество близко к исходнику, размер не растёт вдвое */
function encode(image: Sharp, format: PhotoFormat): Promise<Buffer> {
  if (format === 'png') return image.png({ compressionLevel: 9 }).toBuffer()
  if (format === 'webp') return image.webp({ quality: OUTPUT_QUALITY }).toBuffer()
  // 4:4:4 — без прореживания цветности: знак тонкий и цветной, на 4:2:0 его
  // контур «мылится»
  return image.jpeg({ quality: OUTPUT_QUALITY, chromaSubsampling: '4:4:4' }).toBuffer()
}

export type WatermarkOutcome =
  /** Знак наложен — в хранилище идёт этот файл */
  | { status: 'done'; data: Buffer; mimetype: string }
  /** Кадр не читается sharp: битый файл или HEIC под чужим расширением */
  | { status: 'unreadable' }
  /** Знак наложить не вышло (нет файла знака, сбой пережима) — фото сохраняем как есть */
  | { status: 'skipped' }

/**
 * Наложить знак «Н15» на фото объекта. Фото важнее знака: если что-то не
 * сошлось, вызывающий сохраняет исходный файл (status 'skipped'), а о
 * нечитаемом кадре говорит сотруднику понятной ошибкой (status 'unreadable').
 */
export async function applyWatermark(
  input: Buffer,
  mimetype: string,
  filename = '',
): Promise<WatermarkOutcome> {
  const format = photoFormat(mimetype, filename)
  if (!format) return { status: 'skipped' }

  const mark = readMark()
  if (!mark) return { status: 'skipped' }

  let width: number
  let height: number
  try {
    const meta = await sharp(input).metadata()
    if (!meta.width || !meta.height) return { status: 'unreadable' }
    // Кадры с телефонов приходят с EXIF-ориентацией: sharp().rotate() развернёт
    // их при выводе, поэтому размеры считаем уже в фактической ориентации
    // (у поворотов на 90° и 270° ширина и высота меняются местами)
    const swapped = (meta.orientation ?? 1) >= 5
    width = swapped ? meta.height : meta.width
    height = swapped ? meta.width : meta.height
  } catch {
    return { status: 'unreadable' }
  }

  try {
    const short = Math.min(width, height)
    const markWidth = Math.max(MARK_MIN_WIDTH, Math.round(short * MARK_WIDTH_RATIO))
    const margin = Math.round(short * MARK_MARGIN_RATIO)

    const layer = await markLayer(mark, markWidth, MARK_OPACITY)
    const shadow = await markLayer(mark, markWidth, SHADOW_OPACITY, {
      color: [0, 0, 0],
      blur: Math.max(4, Math.round(markWidth * SHADOW_BLUR_RATIO)),
    })

    const left = Math.max(0, width - layer.width - margin)
    const top = Math.max(0, height - layer.height - margin)
    const raw = (l: { data: Buffer; width: number; height: number }) =>
      ({ input: l.data, raw: { width: l.width, height: l.height, channels: 4 as const } })

    const data = await encode(
      sharp(input)
        .rotate()
        .composite([{ ...raw(shadow), left, top }, { ...raw(layer), left, top }]),
      format,
    )

    // MIME возвращаем по формату, который реально записали: если браузер не
    // прислал тип и формат определён по расширению, пустой mimetype сломал бы
    // раздачу файла
    return {
      status: 'done',
      data,
      mimetype: isSupportedMime(mimetype) ? mimetype.toLowerCase() : MIME_BY_FORMAT[format],
    }
  } catch (e) {
    console.error('watermark: не удалось наложить знак', e)
    return { status: 'skipped' }
  }
}
