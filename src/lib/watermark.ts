import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Sharp } from 'sharp'

import { PHOTO_MIME_TYPES } from './photo-rules'

/**
 * Водяной знак на фотографиях объектов — фирменный знак «Н15» по центру кадра:
 * ключик сверху, кириллические литеры «Н15», подпись «НЕДВИЖИМОСТЬ» снизу и
 * тонкая рамка (файл знака — public/img/watermark.png, как он собран — см.
 * комментарий к знаку ниже).
 *
 * Знак накладывает сервер, а не браузер: sharp уже есть в образе (им Payload
 * готовит размеры фото), поэтому один и тот же знак получают все снимки
 * объектов — и из карточки CRM, и из старой формы /admin-add (она ходит в тот
 * же маршрут /api/upload), и любые будущие загрузки. Пока знак рисовался в
 * браузере, мимо него проходили все остальные пути загрузки.
 *
 * Место — центр кадра, а не угол: в каталоге и на карточке объекта плитки
 * обрезают снимок по краям (object-cover), поэтому угловой знак с плитки
 * пропадал целиком, и на сайте фотографии выглядели чистыми, хотя знак лежал
 * в файле. Центр обрезка не задевает никогда.
 *
 * Размер и прозрачность одинаковы для всех фото: ширина знака — доля короткой
 * стороны кадра, поэтому на вертикальном и горизонтальном снимке знак выглядит
 * одинаково, а не раздувается на широких кадрах.
 *
 * Формат исходника сохраняется: JPEG и WebP пережимаются на 92, PNG остаётся
 * без потерь. Читаемость на любом кадре держат два слоя под знаком: тёмный
 * кант по контуру (на светлых стенах и на золотистых кадрах знак без него
 * терялся) и мягкая тень вокруг него.
 */

/**
 * Ширина знака — доля короткой стороны кадра (24%). Литеры «Н15» занимают
 * около трёх четвертей ширины знака, поэтому сами буквы на фото остаются
 * того же размера, что и раньше (18%), а ключик, подпись и рамка идут
 * вокруг них.
 */
const MARK_WIDTH_RATIO = 0.24
/** Минимальная ширина знака в пикселях: на маленьких кадрах он не микроскопический */
const MARK_MIN_WIDTH = 48
/** Непрозрачность знака: аккуратно, но читаемо */
const MARK_OPACITY = 0.78
/** Тень под знаком: размытая копия контура, тоже полупрозрачная */
const SHADOW_OPACITY = 0.26
/** Радиус размытия тени — доля ширины знака */
const SHADOW_BLUR_RATIO = 0.035
/** Тёмный кант по контуру знака: на светлом кадре без него знак не виден */
const OUTLINE_OPACITY = 0.55
/** Толщина канта (в обе стороны от контура) — доля ширины знака */
const OUTLINE_WIDTH_RATIO = 0.006

/**
 * Версия знака — попадает в поле wm коллекции media (см. Media.ts):
 *   0 — нашего знака на файле нет, фото ждёт разметки;
 *   1 — знака быть не должно (портрет сотрудника, kind=avatar при загрузке)
 *       или на файле прежний знак «Н15» без ключа и подписи — фото, загруженные
 *       21.09.2026, когда работала первая версия знака: второй знак поверх
 *       первого печатать нельзя;
 *   2 — фирменный знак с ключиком, подписью и рамкой — текущий;
 *  -1 — знак нужно переложить заново, см. WATERMARK_REDO.
 * По этому полю массовое обновление знака (см. src/app/api/watermark/route.ts)
 * понимает, какие фото ещё не размечены, и не накладывает знак дважды.
 */
export const WATERMARK_VERSION = 2
/**
 * «Переложить знак заново»: на фото наш знак уже есть, но в прежнем месте —
 * до 24.09.2026 он ложился в правый нижний угол, а плитки каталога обрезают
 * кадр по краям (object-cover), и на сайте такие фото выходили без знака.
 * Разметка берёт такие фото в очередь наравне с теми, где знака ещё нет, и
 * кладёт знак по центру поверх текущего файла (см. media-marking.ts: чистый
 * кадр не трогаем, чтобы не открыть след прежней разметки), после чего поле
 * становится обычным WATERMARK_VERSION.
 *
 * Минус, а не 3 и не версия: значение должно быть непохоже на версию знака —
 * по полю решают, размечено фото или нет, а «3» когда-нибудь станет очередной
 * версией, и тогда пометка «переложить» превратилась бы в «уже размечено».
 * Работающее приложение такую пометку не трогает: и разметка фото, и сборка
 * размеров смотрят только на WATERMARK_VERSION.
 */
export const WATERMARK_REDO = -1
/**
 * Портрет сотрудника (kind=avatar при загрузке): знака на нём быть не должно —
 * на маленьком портрете знак выглядит наклейкой. Массовая разметка такие фото
 * пропускает (см. src/lib/media-marking.ts).
 */
export const WATERMARK_AVATAR = 1
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
export function photoFormat(mimetype: string, filename: string): PhotoFormat | null {
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
 * Проверка, что кадр вообще читается sharp. Знак накладывается уже после
 * записи файла (см. src/lib/media-marking.ts), а сотруднику причину отказа
 * нужно показать сразу — до сохранения: битый файл или HEIC под расширением
 * .jpg не откроется и в каталоге.
 */
export async function probePhoto(input: Buffer): Promise<'ok' | 'unreadable'> {
  try {
    const meta = await sharp(input).metadata()
    return meta.width && meta.height ? 'ok' : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

/**
 * Слой знака в raw RGBA: нужен цвет и общая непрозрачность, а sharp умеет
 * только «наложить как есть» — поэтому альфу готовим сами. Размытие нужно
 * тени: размываем альфу, а не саму картинку, чтобы контур остался чётким.
 */
export async function markLayer(
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

/**
 * Тёмный кант по контуру знака: чёрное кольцо вдоль края штрихов, наружу от
 * них. Без канта знак теряется на светлых кадрах — белых стенах, снегу, — а на
 * золотистых кадрах сливается с фоном совсем. Кольцо считается из альфы знака:
 * размытая альфа даёт у края половину, удвоение доводит её до единицы, а
 * умножение на (1 - альфа) убирает заливку внутри штрихов — кант остаётся
 * только снаружи, самого знака не пачкает.
 */
export async function outlineLayer(
  mark: Buffer,
  width: number,
  opacity: number,
  blur: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const base = await markLayer(mark, width, 1)
  const alpha = await sharp(base.data, {
    raw: { width: base.width, height: base.height, channels: 4 },
  })
    .extractChannel('alpha')
    .blur(blur)
    .raw()
    .toBuffer()
  const out = Buffer.alloc(base.data.length)
  for (let i = 0; i < base.width * base.height; i++) {
    const a = base.data[i * 4 + 3] / 255
    const ring = Math.min(1, (alpha[i] / 255) * 2.5) * (1 - a)
    out[i * 4 + 3] = Math.round(ring * opacity * 255)
  }
  return { data: out, width: base.width, height: base.height }
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

    const [layer, shadow, outline] = await Promise.all([
      markLayer(mark, markWidth, MARK_OPACITY),
      markLayer(mark, markWidth, SHADOW_OPACITY, {
        color: [0, 0, 0],
        blur: Math.max(4, Math.round(markWidth * SHADOW_BLUR_RATIO)),
      }),
      outlineLayer(mark, markWidth, OUTLINE_OPACITY, Math.max(1, Math.round(markWidth * OUTLINE_WIDTH_RATIO))),
    ])

    // Центр кадра: плитки каталога обрезают края снимка (object-cover), и знак
    // в углу с них пропадал целиком
    const left = Math.max(0, Math.round((width - layer.width) / 2))
    const top = Math.max(0, Math.round((height - layer.height) / 2))
    const raw = (l: { data: Buffer; width: number; height: number }) =>
      ({ input: l.data, raw: { width: l.width, height: l.height, channels: 4 as const } })

    const data = await encode(
      sharp(input)
        .rotate()
        .composite([
          { ...raw(shadow), left, top },
          { ...raw(outline), left, top },
          { ...raw(layer), left, top },
        ]),
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
