import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import { markLayer } from './watermark'

/**
 * Снятие прежних водяных знаков с уже загруженных фотографий.
 *
 * До 22.09.2026 знак рисовался иначе, и его отпечаток остался на снимках:
 *   • 21.08–22.08.2026 — оранжевые «Н15» в левом верхнем углу (canvas в
 *     карточке объекта, /img/watermark.png того времени). Знак лёг в сам файл
 *     до загрузки, поэтому чистить нужно файл;
 *   • 22.08–21.09.2026 — серые «Н15» по центру кадра, тем же canvas, но в
 *     четыре прохода (так накапливалась непрозрачность: 1-(1-a)^4);
 *   • 21.09.2026 11:25–22:31 МСК — серверная версия знака: «Н15» без ключика
 *     в правом нижнем углу (commit 8cd0979), опять в самом файле.
 *
 * Накладывать текущий знак поверх прежнего нельзя: в правом нижнем углу два
 * знака наложатся друг на друга, а по центру останется чужой логотип. Поэтому
 * прежний знак снимаем — обратной композицией: если знак лёг как
 * obs = a·c + dst·(1-a), то исходный кадр восстанавливается как
 * dst = (obs - a·c) / (1-a). Все параметры прежних знаков известны (файл
 * образца, место, размер, непрозрачность), поэтому снятие точное, а не
 * «замазывание».
 *
 * Опасность обратной композиции — снять знак там, где его нет: тогда на фото
 * останется светлый отпечаток букв. Поэтому перед снятием кадр проверяется:
 * подгоняем модель знака к кадру и требуем, чтобы контур знака совпал с
 * картинкой (r), а сила отпечатка (k) и его амплитуда (amp) были в разумных
 * пределах. Если проверка не прошла — знак не снимаем (лучше чужой знак, чем
 * испорченное фото), в отчёте такие кадры видны.
 */

/** Ширина кадра при проверке: на ней же меряются r, k и amp */
const ANALYSIS_WIDTH = 1000
/** Размытие фона при проверке (в пикселях кадра проверки) */
const ANALYSIS_BLUR = 30
/** Ниже этого совпадения контура знак не снимаем */
const MIN_SHAPE = 0.55
/** Амплитуда отпечатка в уровнях яркости: слабее — не отличить от шума */
const MIN_AMPLITUDE = 15
/** Во сколько раз непрозрачность на фото может отличаться от образца */
const MIN_SCALE = 0.45
const MAX_SCALE = 3.5

export type LegacyEra = 'start' | 'center' | 'corner'

type Layer = { data: Buffer; width: number; height: number }
type Frame = { width: number; height: number }

type LegacyPlan = {
  era: LegacyEra
  /** Файл образца знака в public/img: как он выглядел в те дни */
  asset: string
  /** Сколько раз знак рисовался поверх кадра (canvas накапливал непрозрачность) */
  passes: number
  /** Общая непрозрачность слоя при наложении */
  opacity: number
  /** Тень под знаком (была только у серверной версии) */
  shadow?: { opacity: number; blurRatio: number }
  /** Размер знака в кадре: как считала та версия */
  width: (frame: Frame) => number
  /** Место знака в кадре: как считала та версия */
  place: (frame: Frame, layer: Layer) => { left: number; top: number }
}

/** Знак первых дней: левый верхний угол, отступ 3% ширины */
const START_PLAN: LegacyPlan = {
  era: 'start',
  asset: 'watermark-legacy-start.png',
  passes: 1,
  opacity: 1,
  width: (frame) => Math.round(frame.width * 0.28),
  place: (frame) => {
    const margin = Math.round(frame.width * 0.03)
    return { left: margin, top: margin }
  },
}

/** Знак по центру кадра (четыре прохода canvas) */
const CENTER_PLAN: LegacyPlan = {
  era: 'center',
  asset: 'watermark-legacy-center.png',
  passes: 4,
  opacity: 1,
  width: (frame) => Math.round(frame.width * 0.28),
  place: (frame, layer) => ({
    left: Math.round((frame.width - layer.width) / 2),
    top: Math.round((frame.height - layer.height) / 2),
  }),
}

/** Серверный знак «Н15» без ключика: правый нижний угол (commit 8cd0979) */
const CORNER_PLAN: LegacyPlan = {
  era: 'corner',
  asset: 'watermark-v1.png',
  passes: 1,
  opacity: 0.72,
  shadow: { opacity: 0.3, blurRatio: 0.035 },
  width: (frame) => Math.max(48, Math.round(Math.min(frame.width, frame.height) * 0.18)),
  place: (frame, layer) => {
    const margin = Math.round(Math.min(frame.width, frame.height) * 0.04)
    return {
      left: Math.max(0, frame.width - layer.width - margin),
      top: Math.max(0, frame.height - layer.height - margin),
    }
  },
}

const PLANS: Record<LegacyEra, LegacyPlan> = {
  start: START_PLAN,
  center: CENTER_PLAN,
  corner: CORNER_PLAN,
}

const ASSET_DIR = path.join(process.cwd(), 'public', 'img')

// Файлы образцов читаем один раз на процесс (они меняются только с деплоем)
const assetCache = new Map<string, Buffer | null>()

function readAsset(file: string): Buffer | null {
  if (!assetCache.has(file)) {
    try {
      assetCache.set(file, readFileSync(path.join(ASSET_DIR, file)))
    } catch (e) {
      console.error('watermark-legacy: не читается образец знака', file, e)
      assetCache.set(file, null)
    }
  }
  return assetCache.get(file) ?? null
}

/**
 * Какие прежние знаки могли остаться на фото, судя по времени загрузки.
 * Окна — время работы каждой версии (по истории коммитов), с запасом в
 * несколько минут: фото ровно на границе проверяются двумя версиями, лишнюю
 * отсечёт проверка контура.
 */
export function legacyErasFor(createdAt: string | Date | undefined): LegacyEra[] {
  if (!createdAt) return []
  const at = new Date(createdAt).getTime()
  if (Number.isNaN(at)) return []
  const eras: LegacyEra[] = []
  // 21.08.2026 16:20 UTC (19:20 МСК) — релиз знака в карточке объекта
  if (at >= Date.UTC(2026, 7, 21, 16, 20) && at < Date.UTC(2026, 7, 22, 11, 35)) eras.push('start')
  // 22.08.2026 11:20 UTC — знак переехал в центр кадра
  if (at >= Date.UTC(2026, 7, 22, 11, 20) && at < Date.UTC(2026, 8, 21, 8, 35)) eras.push('center')
  // 21.09.2026 08:15 UTC (11:15 МСК) — серверный знак в углу
  if (at >= Date.UTC(2026, 8, 21, 8, 15) && at < Date.UTC(2026, 8, 21, 22, 40)) eras.push('corner')
  return eras
}

/** Слой знака: альфа с накоплением по проходам (canvas рисовал знак несколько раз) */
async function layerAt(plan: LegacyPlan, asset: Buffer, width: number): Promise<Layer> {
  const layer = await markLayer(asset, width, plan.opacity)
  if (plan.passes <= 1) return layer
  const out = Buffer.alloc(layer.data.length)
  for (let i = 0; i < layer.width * layer.height; i++) {
    const a0 = layer.data[i * 4 + 3] / 255
    const a = 1 - Math.pow(1 - a0, plan.passes)
    out[i * 4] = layer.data[i * 4]
    out[i * 4 + 1] = layer.data[i * 4 + 1]
    out[i * 4 + 2] = layer.data[i * 4 + 2]
    out[i * 4 + 3] = Math.round(a * 255)
  }
  return { data: out, width: layer.width, height: layer.height }
}

/** Яркость цвета знака в пикселе — по ней считается вклад знака в кадр */
function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114
}

type Fit = {
  era: LegacyEra
  /** Во сколько раз непрозрачность на фото отличается от образца */
  scale: number
  /** Совпадение контура знака с картинкой (0..1) */
  shape: number
  /** Средняя сила отпечатка в уровнях яркости */
  amplitude: number
}

/**
 * Подгонка знака к кадру на уменьшенной копии: obs - S ≈ scale·a·(c - S), где
 * a — альфа образца, c — его цвет, S — фон кадра под знаком (его считаем
 * размытием кадра, из которого пиксели знака исключены, иначе знак «увидит»
 * сам себя). Правильный знак даёт scale ≈ 1, высокое shape и заметную
 * amplitude; случайное совпадение контура — низкое shape.
 */
async function fitPlan(
  frame: Buffer,
  meta: { width: number; height: number },
  plan: LegacyPlan,
  asset: Buffer,
): Promise<Fit | null> {
  const assetMeta = await sharp(asset).metadata()
  if (!assetMeta.width || !assetMeta.height) return null
  const factor = Math.min(1, ANALYSIS_WIDTH / meta.width)
  const width = Math.max(16, Math.round(meta.width * factor))
  const { data, info } = await sharp(frame)
    .rotate()
    .resize({ width })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const full: Frame = { width: meta.width, height: meta.height }
  const layerFull: Layer = {
    data: Buffer.alloc(0),
    width: plan.width(full),
    height: 0,
  }
  layerFull.height = Math.round((layerFull.width * assetMeta.height) / assetMeta.width)
  const spot = plan.place(full, layerFull)

  const layer = await layerAt(plan, asset, Math.max(8, Math.round(layerFull.width * factor)))
  const lw = layer.width
  const lh = layer.height
  const left = Math.max(0, Math.round(spot.left * factor))
  const top = Math.max(0, Math.round(spot.top * factor))
  const bw = Math.max(1, Math.min(info.width - left, lw))
  const bh = Math.max(1, Math.min(info.height - top, lh))
  if (bw < 8 || bh < 8) return null

  let peak = 0
  for (let i = 0; i < lw * lh; i++) if (layer.data[i * 4 + 3] > peak) peak = layer.data[i * 4 + 3]
  if (!peak) return null

  // Фон: кадр без пикселей знака, размытый; в дырах знака значение берётся из
  // окружения, поэтому вклад самого знака в оценку фона не попадает
  const fw = info.width
  const fh = info.height
  const keep = new Uint8Array(fw * fh).fill(255)
  for (let y = 0; y < lh; y++) {
    const iy = top + y
    if (iy < 0 || iy >= fh) continue
    for (let x = 0; x < lw; x++) {
      const ix = left + x
      if (ix < 0 || ix >= fw) continue
      if (layer.data[(y * lw + x) * 4 + 3] > peak * 0.05) keep[iy * fw + ix] = 0
    }
  }
  const masked = Buffer.alloc(fw * fh)
  for (let i = 0; i < masked.length; i++) masked[i] = Math.round((data[i] * keep[i]) / 255)
  const blur = (buf: Buffer) =>
    sharp(buf, { raw: { width: fw, height: fh, channels: 1 } })
      .blur(ANALYSIS_BLUR)
      .raw()
      .toBuffer()
  const [sum, weight] = await Promise.all([blur(masked), blur(Buffer.from(keep))])

  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let amp = 0
  let n = 0
  for (let y = 0; y < bh; y++) {
    const iy = top + y
    for (let x = 0; x < bw; x++) {
      const ix = left + x
      const li = y * lw + x
      const a = layer.data[li * 4 + 3] / 255
      if (a < (peak / 255) * 0.5) continue
      const i = iy * fw + ix
      // в дырах знака вес размытия меньше 255 — фон достраиваем по окружению
      const background = weight[i] > 6 ? sum[i] / (weight[i] / 255) : data[i]
      const color = luminance(layer.data[li * 4], layer.data[li * 4 + 1], layer.data[li * 4 + 2])
      const predicted = a * (color - background)
      const observed = data[i] - background
      sx += predicted
      sy += observed
      sxx += predicted * predicted
      syy += observed * observed
      sxy += predicted * observed
      amp += Math.abs(observed)
      n++
    }
  }
  if (n < 200) return null
  const cov = sxy / n - (sx / n) * (sy / n)
  const sd1 = Math.sqrt(Math.max(1e-9, sxx / n - (sx / n) ** 2))
  const sd2 = Math.sqrt(Math.max(1e-9, syy / n - (sy / n) ** 2))
  return {
    era: plan.era,
    scale: sxx ? sxy / sxx : 0,
    shape: sd1 * sd2 > 0 ? cov / (sd1 * sd2) : 0,
    amplitude: amp / n,
  }
}

/** Знак снят: кадр без прежнего отпечатка */
export type LegacyStripResult =
  | { status: 'clean' }
  | { status: 'stripped'; data: Buffer; eras: LegacyEra[]; fits: Fit[] }
  | { status: 'unreadable' }
  | { status: 'skipped' }

/**
 * Снять прежние знаки с кадра. Формат и качество сохраняются: файл остаётся
 * тем же JPEG/PNG/WebP, меняются только пиксели под знаком.
 */
export async function stripLegacyMarks(
  input: Buffer,
  mimetype: string,
  filename: string,
  eras: LegacyEra[],
  format: 'jpeg' | 'png' | 'webp' | null,
): Promise<LegacyStripResult> {
  if (!eras.length || !format) return { status: 'clean' }
  let meta: { width?: number; height?: number; orientation?: number }
  try {
    meta = await sharp(input).metadata()
  } catch {
    return { status: 'unreadable' }
  }
  if (!meta.width || !meta.height) return { status: 'unreadable' }
  // Кадр в фактической ориентации: sharp().rotate() развернёт по EXIF
  const swapped = (meta.orientation ?? 1) >= 5
  const frame: Frame = {
    width: swapped ? meta.height : meta.width,
    height: swapped ? meta.width : meta.height,
  }

  const hits: Array<{ plan: LegacyPlan; asset: Buffer; fit: Fit; place: { left: number; top: number }; layer: Layer }> = []
  for (const era of eras) {
    const plan = PLANS[era]
    const asset = readAsset(plan.asset)
    if (!asset) continue
    const fit = await fitPlan(input, frame, plan, asset).catch(() => null)
    if (!fit) continue
    if (fit.shape < MIN_SHAPE || fit.amplitude < MIN_AMPLITUDE) continue
    if (fit.scale < MIN_SCALE || fit.scale > MAX_SCALE) continue
    const layer = await layerAt(plan, asset, plan.width(frame))
    hits.push({ plan, asset, fit, place: plan.place(frame, layer), layer })
  }
  if (!hits.length) return { status: 'clean' }

  try {
    const base = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const data = base.data
    const fw = base.info.width
    const fh = base.info.height
    const shadowCache = new Map<string, Layer | null>()
    for (const hit of hits) {
      const { plan, layer, place, fit } = hit
      let shadow: Layer | null = null
      if (plan.shadow) {
        const blur = Math.max(4, Math.round(layer.width * plan.shadow.blurRatio))
        const key = `${plan.era}:${layer.width}:${blur}`
        if (!shadowCache.has(key)) {
          shadowCache.set(key, await markLayer(hit.asset, layer.width, plan.shadow.opacity, { color: [0, 0, 0], blur }))
        }
        shadow = shadowCache.get(key) ?? null
      }
      // Обратная композиция по пикселям знака: obs = c_m·a_m + (1-a_sh)(1-a_m)·dst
      const scale = fit.scale
      for (let y = 0; y < layer.height; y++) {
        const iy = place.top + y
        if (iy < 0 || iy >= fh) continue
        for (let x = 0; x < layer.width; x++) {
          const ix = place.left + x
          if (ix < 0 || ix >= fw) continue
          const li = (y * layer.width + x) * 4
          const am = Math.min(0.98, (layer.data[li + 3] / 255) * scale)
          const as = shadow ? Math.min(0.98, (shadow.data[li + 3] / 255) * scale) : 0
          if (am <= 0 && as <= 0) continue
          const den = (1 - as) * (1 - am)
          if (den <= 0.02) continue
          const i = (iy * fw + ix) * 4
          for (let ch = 0; ch < 3; ch++) {
            const value = (data[i + ch] - layer.data[li + ch] * am) / den
            data[i + ch] = value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
          }
        }
      }
    }
    const encoded = await encodeRaw(data, fw, fh, format)
    return { status: 'stripped', data: encoded, eras: hits.map((h) => h.plan.era), fits: hits.map((h) => h.fit) }
  } catch (e) {
    console.error('watermark-legacy: не удалось снять прежний знак', e)
    return { status: 'skipped' }
  }
}

/** Пережим сырого кадра в исходном формате файла */
async function encodeRaw(
  data: Buffer,
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp',
): Promise<Buffer> {
  const image = sharp(data, { raw: { width, height, channels: 4 } })
  if (format === 'png') return image.png({ compressionLevel: 9 }).toBuffer()
  if (format === 'webp') return image.webp({ quality: 92 }).toBuffer()
  return image.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()
}
