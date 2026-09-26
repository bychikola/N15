import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Sharp } from 'sharp'

import { PHOTO_MIME_TYPES } from './photo-rules'

/**
 * Водяной знак на фотографиях объектов — фирменный знак «Н15» по центру кадра:
 * ключик сверху, кириллические литеры «Н15», подпись адресом сайта снизу и
 * тонкая рамка. Файл знака — public/img/watermark.png, собирается скриптом
 * scripts/build-watermark.mjs: ключик, монограмма и рамка берутся из прошлого
 * знака (public/img/watermark-v2.png), меняется только подпись под монограммой.
 *
 * Подпись — адрес сайта, а не прежнее слово «НЕДВИЖИМОСТЬ»: адрес на фото и
 * объясняет, чей это кадр, и куда идти за остальными. Набрана тем же шрифтом,
 * что и монограмма, и заметно крупнее прежней подписи (170 px против 87 px на
 * той же ширине знака) — на плитке каталога прежняя подпись читалась как
 * серая полоса.
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
 *   2 — фирменный знак с ключиком и рамкой, подпись «НЕДВИЖИМОСТЬ»;
 *   3 — тот же знак, но с адресом сайта вместо слова — текущий;
 *  -1 — знак нужно переложить заново, см. WATERMARK_REDO.
 * По этому полю массовое обновление знака (см. src/app/api/watermark/route.ts)
 * понимает, какие фото ещё не размечены, и не накладывает знак дважды.
 */
export const WATERMARK_VERSION = 3
/**
 * Прежняя версия знака — та, с которой фото ждут переразметки: файлы размечены
 * знаком с подписью «НЕДВИЖИМОСТЬ», и его нужно заменить на нынешний с адресом
 * сайта (см. WATERMARK_VERSION). Разметка берёт такие фото в очередь наравне с
 * неразмеченными (см. pendingWhere в src/lib/media-marking.ts) и собирает файлы
 * заново из чистого кадра — снятия знака при этом не требуется.
 *
 * Версия растёт вместе со знаком: сменили подпись — подняли WATERMARK_VERSION,
 * и прежняя версия сама попала сюда. Отдельного поля «что переразметить» не
 * нужно: файл с прежним знаком уже не считается размеченным.
 */
export const WATERMARK_PREVIOUS = 2
/**
 * «Переложить знак заново»: на фото наш знак уже есть, но в прежнем месте —
 * до 24.09.2026 он ложился в правый нижний угол, а плитки каталога обрезают
 * кадр по краям (object-cover), и на сайте такие фото выходили без знака.
 * Разметка берёт такие фото в очередь наравне с теми, где знака ещё нет,
 * снимает с текущего файла прежний знак (см. stripPreviousMark) и
 * кладёт нынешний по центру кадра; чистый кадр при этом не трогается — в нём
 * остался след прежней разметки (см. media-marking.ts). После разметки поле
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
/**
 * Прежний знак — тот же рисунок с подписью «НЕДВИЖИМОСТЬ» (на фотографиях до
 * 26.09.2026). Нужен, чтобы опознать и снять его с кадров, размеченных прошлой
 * версией: снимать знак можно только тем же слоем, каким он положен.
 */
const PREV_MARK_PATH = path.join(process.cwd(), 'public', 'img', 'watermark-v2.png')

// Файлы знака читаем один раз на процесс: они нужны каждой загрузке, а меняются
// только вместе с деплоем. null — файла нет (знак не накладываем, фото важнее).
let markSource: Buffer | null | undefined
let prevMarkSource: Buffer | null | undefined

function readMark(): Buffer | null {
  if (markSource === undefined) markSource = readMarkFile(MARK_PATH)
  return markSource
}

/** Прежний знак: им опознаётся и снимается разметка прошлой версии */
function readPrevMark(): Buffer | null {
  if (prevMarkSource === undefined) prevMarkSource = readMarkFile(PREV_MARK_PATH)
  return prevMarkSource
}

function readMarkFile(file: string): Buffer | null {
  try {
    return readFileSync(file)
  } catch (e) {
    console.error('watermark: не читается файл знака', file, e)
    return null
  }
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

/**
 * Прежний знак — тот же «Н15», но с подписью «НЕДВИЖИМОСТЬ» (его рисунок лежит
 * в public/img/watermark-v2.png): им размечены фотографии до 26.09.2026. Ложился
 * он двумя версиями кода, и у каждой свой паспорт:
 *   • по центру кадра — тем же кодом, что и нынешний знак, поэтому паспорт у
 *     него нынешний (MARK_* выше): ширина 24% короткой стороны, знак 0.78,
 *     тень 0.26, кант 0.55 — так его кладут с 24.09.2026;
 *   • в правый нижний угол — до 24.09.2026: ширина та же, но знак 0.72 и без
 *     канта, отступ 4% от правого и нижнего края.
 * Снять знак можно только тем же слоем, каким он положен, поэтому угловой
 * паспорт берётся из того кода, а не из нынешнего.
 */
/** Отступ прежнего углового знака от правого и нижнего края — доля короткой стороны */
const OLD_CORNER_MARGIN_RATIO = 0.04
/** Непрозрачность прежнего углового знака */
const OLD_CORNER_OPACITY = 0.72
/** Тень прежнего углового знака */
const OLD_CORNER_SHADOW_OPACITY = 0.26
/** Радиус размытия тени прежнего знака — доля ширины знака */
const OLD_CORNER_SHADOW_BLUR_RATIO = 0.035
/**
 * Порог опознания прежнего знака: совпадение узора с моделью (fit) и сила слоя
 * (scale, 1 — ровно как в паспорте). Измерено на живых фото: у размеченных
 * кадров совпадение 0.62–1.0 и сила 0.83–1.27, у чистых — до 0.2 и 0.3.
 * Порог стоит между ними, и это главная защита: вычесть золото из чистого
 * кадра значит поделить его на 0.2 и оставить на фото тёмный отпечаток знака.
 *
 * Одного порога мало: у прежнего и нынешнего знаков общая монограмма и ключик,
 * различает их только подпись. По замеру на живых фото кадр с нынешним знаком
 * даёт по прежнему шаблону 0.55–0.72 — выше порога, то есть порог принял бы
 * нынешний знак за прежний. Поэтому рядом с порогом стоит сравнение с нынешним
 * узором (см. markRecognized).
 */
const MARK_MIN_FIT = 0.5
/** Ниже этой силы слоя узор считаем чужим (снятый знак, фактура кадра) */
const MARK_MIN_SCALE = 0.5

/** Кадр, разобранный в пиксели: с ним работает снятие прежнего знака */
export type RawPhoto = {
  data: Buffer
  width: number
  height: number
  channels: number
}

/** Слой знака: цвет с альфой. Все слои одной модели — одного размера */
type MarkLayer = { data: Buffer; width: number; height: number }

/** Слои знака на кадре таких размеров и место этих слоёв в кадре */
type MarkModel = {
  layer: MarkLayer
  shadow: MarkLayer
  /** Кант по контуру; у прежнего углового знака канта не было — слой пустой */
  outline: MarkLayer
  left: number
  top: number
}

/** Пустой слой: у знака без канта он не меняет ни кадр, ни опознание */
function emptyLayer(width: number, height: number): MarkLayer {
  return { data: Buffer.alloc(width * height * 4), width, height }
}

/**
 * Слой знака по центру кадра. Паспорт тот же, что у нынешнего знака (MARK_*):
 * прежний знак по центру рисовался этими же числами, отличается только рисунок
 * подписи. Поэтому им описывают и прежний знак (рисунок watermark-v2.png), и
 * нынешний — чтобы понять, который из двух лежит на кадре (см. markRecognized).
 */
async function centerModel(mark: Buffer, width: number, height: number): Promise<MarkModel> {
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
  return {
    layer,
    shadow,
    outline,
    left: Math.max(0, Math.round((width - layer.width) / 2)),
    top: Math.max(0, Math.round((height - layer.height) / 2)),
  }
}

/** Слой прежнего углового знака — паспорт версии до 24.09.2026 (OLD_CORNER_*) */
async function previousCornerModel(mark: Buffer, width: number, height: number): Promise<MarkModel> {
  const short = Math.min(width, height)
  const markWidth = Math.max(MARK_MIN_WIDTH, Math.round(short * MARK_WIDTH_RATIO))
  const margin = Math.round(short * OLD_CORNER_MARGIN_RATIO)
  const [layer, shadow] = await Promise.all([
    markLayer(mark, markWidth, OLD_CORNER_OPACITY),
    markLayer(mark, markWidth, OLD_CORNER_SHADOW_OPACITY, {
      color: [0, 0, 0],
      blur: Math.max(4, Math.round(markWidth * OLD_CORNER_SHADOW_BLUR_RATIO)),
    }),
  ])
  return {
    layer,
    shadow,
    outline: emptyLayer(layer.width, layer.height),
    left: Math.max(0, width - layer.width - margin),
    top: Math.max(0, height - layer.height - margin),
  }
}

/**
 * Общая непрозрачность слоёв знака в пикселе: sharp кладёт кант, тень и золото
 * друг под друга, поэтому непрозрачности перемножаются, а не складываются.
 * Снятие знака считает по этой же величине — иначе обратный ход не сойдётся с
 * тем, что лежит в файле.
 */
function markAlpha(model: MarkModel, index: number): number {
  const shade = model.shadow.data[index * 4 + 3] / 255
  const outline = model.outline.data[index * 4 + 3] / 255
  const mark = model.layer.data[index * 4 + 3] / 255
  return 1 - (1 - shade) * (1 - outline) * (1 - mark)
}

/**
 * Опознание прежнего знака на кадре: сравниваем штрихи знака с фоном вокруг них
 * (пиксели внутри рамки знака, но не под штрихами). Узор должен совпадать с
 * моделью, а сила слоя — быть около единицы; у снятого или чужого знака
 * совпадение уходит в минус. Кадр под штрихами сравнивать с одним фоном грубо —
 * фактура кадра даёт разброс, — поэтому у размеченных кадров совпадение и не
 * доходит до единицы (0.62–1.0 на живых фото).
 */
async function fitMark(photo: RawPhoto, model: MarkModel): Promise<{ fit: number; scale: number } | null> {
  const { layer, left, top } = model
  const background = [0, 0, 0]
  let backgroundN = 0
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < photo.width && y < photo.height

  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      if (layer.data[(y * layer.width + x) * 4 + 3] > 8) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * photo.width + left + x) * photo.channels
      for (let c = 0; c < 3; c++) background[c] += photo.data[at + c]
      backgroundN++
    }
  }
  if (!backgroundN) return null
  for (let c = 0; c < 3; c++) background[c] /= backgroundN

  let dot = 0
  let observed2 = 0
  let model2 = 0
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const li = (y * layer.width + x) * 4
      const mark = layer.data[li + 3] / 255
      // Слабые пиксели (край тени) дают больше шума, чем сигнала: узор знака —
      // это штрихи, по ним и опознаём
      if (mark <= 0.3) continue
      if (!inside(left + x, top + y)) continue
      const at = ((top + y) * photo.width + left + x) * photo.channels
      const a = markAlpha(model, y * layer.width + x)
      for (let c = 0; c < 3; c++) {
        const observed = photo.data[at + c] - background[c]
        const expected = layer.data[li + c] * mark - a * background[c]
        dot += observed * expected
        observed2 += observed * observed
        model2 += expected * expected
      }
    }
  }
  if (model2 < 1) return null
  return {
    fit: dot / Math.sqrt(Math.max(1e-9, observed2 * model2)),
    scale: dot / model2,
  }
}

/**
 * Снять один слой прежнего знака: sharp рисует слои как base*(1-a) + цвет*a,
 * поэтому обратный ход возвращает кадр под знаком. Тень и кант в кадр цвета не
 * добавляют (они чёрные), знак добавляет своё золото, умноженное на альфу.
 */
function removeMarkLayer(photo: RawPhoto, model: MarkModel): Buffer {
  const { layer, left, top } = model
  const out = Buffer.from(photo.data)
  for (let y = 0; y < layer.height; y++) {
    const gy = top + y
    if (gy < 0 || gy >= photo.height) continue
    for (let x = 0; x < layer.width; x++) {
      const gx = left + x
      if (gx < 0 || gx >= photo.width) continue
      const li = (y * layer.width + x) * 4
      const mark = layer.data[li + 3] / 255
      const a = markAlpha(model, y * layer.width + x)
      if (a < 0.002 || mark <= 0) continue
      const at = (gy * photo.width + gx) * photo.channels
      for (let c = 0; c < 3; c++) {
        const value = (photo.data[at + c] - layer.data[li + c] * mark) / (1 - a)
        out[at + c] = Math.max(0, Math.min(255, Math.round(value)))
      }
    }
  }
  return out
}

/**
 * Место прежнего знака на кадре и — если место спорное — нынешний знак на том
 * же месте для сравнения. Спорно только центральное место: нынешний знак лежит
 * там же и нарисован почти так же. В правом нижнем углу нынешнего знака не
 * бывает (он там был у знака до 24.09.2026), сравнивать не с чем.
 */
type MarkPlacement = { model: MarkModel; rival?: MarkModel }

async function previousModels(mark: Buffer, width: number, height: number): Promise<MarkPlacement[]> {
  const now = readMark()
  return [
    {
      model: await centerModel(mark, width, height),
      rival: now ? await centerModel(now, width, height) : undefined,
    },
    { model: await previousCornerModel(mark, width, height) },
  ]
}

/**
 * Опознан ли знак на этом месте: совпадение узора и сила слоя — не ниже порогов,
 * а если рядом есть нынешний знак (rival), то прежний должен объяснять кадр
 * строго лучше него. Иначе на кадре нынешний знак: он совпадает с прежним
 * шаблоном по монограмме и ключику, а снимать его прежним шаблоном нельзя —
 * подпись прежнего шире и ниже, и по ней вышло бы размазанное пятно.
 */
async function markRecognized(photo: RawPhoto, model: MarkModel, rival?: MarkModel): Promise<boolean> {
  const fit = await fitMark(photo, model)
  if (!fit || fit.fit < MARK_MIN_FIT || fit.scale < MARK_MIN_SCALE) return false
  if (!rival) return true
  const other = await fitMark(photo, rival)
  return !other || other.fit < fit.fit
}

/**
 * Сколько мест кадра занято прежним знаком «Н15» (0 — знака нет). Опознание без
 * снятия: по нему вызывающий решает, снимать ли знак вовсе (см.
 * src/lib/media-marking.ts), и только потом зовёт applyWatermark со снятием —
 * снять знак дважды значит испортить кадр.
 */
export async function previousMarkLayers(photo: RawPhoto): Promise<number> {
  const mark = readPrevMark()
  // Чёрно-белый кадр разбирать нечем: модель цветная, а один канал не даёт
  // понять, золото под штрихами или нет
  if (!mark || photo.channels < 3) return 0
  let layers = 0
  for (const { model, rival } of await previousModels(mark, photo.width, photo.height)) {
    if (await markRecognized(photo, model, rival)) layers++
  }
  return layers
}

/**
 * Снять с кадра прежний знак «Н15» (рисунок public/img/watermark-v2.png) — по
 * одному слою на каждом из двух мест, где знак лежал: по центру кадра и в
 * правом нижнем углу. Работает только там, где знак опознан: кадр, на котором
 * модели нет, возвращается нетронутым.
 *
 * Слой снимается ровно один, даже если знак в кадре опознаётся и после снятия:
 * у четырёх фото (media 936–939) он лёг дважды, но под вторым слоем от кадра
 * остаётся меньше пятой части, и обратный ход вытаскивает вместо кадра шум
 * пережима (проверено — на месте штрихов цветные пятна). Один снятый слой
 * оставляет такие фото с прежним знаком: это лучше, чем испорченный кадр.
 *
 * Кадр возвращается в пикселях: вызывающий накладывает поверх новый знак и
 * пережимает файл один раз, а не дважды.
 */
export async function stripPreviousMark(photo: RawPhoto): Promise<{ data: Buffer; layers: number }> {
  const mark = readPrevMark()
  if (!mark || photo.channels < 3) return { data: photo.data, layers: 0 }

  let data = photo.data
  let layers = 0
  for (const { model, rival } of await previousModels(mark, photo.width, photo.height)) {
    // Опознаём на уже снятом кадре: если знак лежал дважды, второй слой виден
    // точнее, когда первый снят
    const frame = { ...photo, data }
    if (!(await markRecognized(frame, model, rival))) continue
    data = removeMarkLayer(frame, model)
    layers++
  }
  return { data: layers ? data : photo.data, layers }
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

export type WatermarkOptions = {
  /**
   * Снять прежний знак перед наложением нынешнего — так перекладывают знак у
   * фото, помеченных WATERMARK_REDO: второй знак поверх первого на кадре
   * выглядел бы двойным, а в кропе плитки их было бы видно сразу два. Снятие
   * идёт в пикселях, поэтому файл пережимается один раз, а не дважды.
   */
  replacePrevious?: boolean
}

/**
 * Наложить знак «Н15» на фото объекта. Фото важнее знака: если что-то не
 * сошлось, вызывающий сохраняет исходный файл (status 'skipped'), а о
 * нечитаемом кадре говорит сотруднику понятной ошибкой (status 'unreadable').
 */
export async function applyWatermark(
  input: Buffer,
  mimetype: string,
  filename = '',
  options: WatermarkOptions = {},
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

    // Кадр с прежним знаком (WATERMARK_REDO): сперва снимаем тот знак, иначе на
    // фото легли бы два — и в файле, и в кропе плитки
    let base: Sharp = sharp(input).rotate()
    if (options.replacePrevious) {
      const decoded = await sharp(input).rotate().raw().toBuffer({ resolveWithObject: true })
      const stripped = await stripPreviousMark({
        data: decoded.data,
        width: decoded.info.width,
        height: decoded.info.height,
        channels: decoded.info.channels,
      })
      if (stripped.layers) {
        base = sharp(stripped.data, {
          raw: {
            width: decoded.info.width,
            height: decoded.info.height,
            channels: decoded.info.channels as 3 | 4,
          },
        })
      }
    }

    const data = await encode(
      base.composite([
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
