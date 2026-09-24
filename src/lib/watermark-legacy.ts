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
 * obs = c·a_m + (1-a_m)·(1-a_s)·dst (слой знака поверх тени поверх кадра), то
 * исходный кадр восстанавливается как dst = (obs - c·a_m) / ((1-a_m)(1-a_s)).
 * Образец знака, место, размер и непрозрачность известны, поэтому снятие
 * точное, а не «замазывание».
 *
 * Опасность обратной композиции — снять знак там, где его нет: тогда на фото
 * останется отпечаток букв (и наоборот, снятый «наизнанку» знак оставит
 * цветной след). Поэтому кадр проверяется дважды: до снятия (сверка знака с
 * кадром: совпал ли контур, есть ли отпечаток) и после него (пропал ли
 * отпечаток). Не прошла проверка — кадр остаётся нетронутым: лучше чужой знак,
 * чем испорченное фото.
 *
 * Проверка — опыт на заведомо чистых кадрах: знак кладётся так, как его клала
 * прежняя версия, и очистка должна вернуть кадр к исходному. Опыт же показал,
 * что по этой модели нельзя подгонять непрозрачности: фон под знаком знаешь
 * только приблизительно, и на живом кадре подгонка уводит множитель (p=1.34
 * вместо 1, остаток на месте знака в 37 уровней), тогда как паспортные
 * непрозрачности дают остаток в 3 уровня. Поэтому множители не подгоняются —
 * берутся из плана.
 */

/** Ширина кадра при проверке (на ней меряется и отпечаток знака) */
const ANALYSIS_WIDTH = 1000
/** Размытие фона при проверке (в пикселях кадра проверки) */
const ANALYSIS_BLUR = 30
/** Ниже этого совпадения контура знак не снимаем */
const MIN_SHAPE = 0.55
/**
 * Амплитуда отпечатка (в уровнях серого): слабее — не отличить от шума. Порог
 * низкий нарочно: пропустить знак (он останется на фото) не так страшно, как
 * снять его там, где его нет, — а от такой ошибки бережёт ещё и проверка
 * снятия. Опыт на ровном фоне: серый знак 21.09 на сером же фоне даёт в
 * среднем 3.4 уровня отпечатка — сам знак светлее фона на 16 уровней, а мягкие
 * края штрихов тянут среднее вниз. С порогом 6 такой знак не опознавался бы
 * вовсе, хотя контур совпадал идеально (0.94).
 */
const MIN_AMPLITUDE = 3
/**
 * Проверка снятия: какая доля узора знака осталась на кадре (см. residueShape).
 * Выше этого — считаем снятие неудачным и кадр не трогаем
 */
const RESIDUE_SHAPE = 0.35

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

/**
 * Отпечаток знака в пикселе меряется по среднему каналов — и на кадре, и в
 * модели. Считать яркость по-человечески (0.299·R + 0.587·G + 0.114·B) нельзя:
 * sharp().greyscale() берёт линейный свет, и та же мера по значениям каналов
 * расходится с кадром на несколько процентов — подгонка тогда завышает
 * непрозрачность знака (на ровном фоне выходило 1.07 вместо 1.00).
 */
function average(r: number, g: number, b: number): number {
  return (r + g + b) / 3
}

type Fit = {
  era: LegacyEra
  /** Совпадение контура знака с картинкой (0..1): по нему знак и опознаётся */
  shape: number
  /** Средняя сила отпечатка в уровнях серого */
  amplitude: number
}

/**
 * Сверка знака с кадром на уменьшенной копии. Модель — ровно то, как знак
 * ложился на фото: слой знака поверх тени поверх кадра,
 *   obs = a_m·c + (1 - a_m)·(1 - a_s)·S,
 * откуда obs - S = a_m·(c - S) - a_s·S·(1 - a_m), где a_m и a_s — альфа знака и
 * тени в пикселе, c — цвет знака, S — фон кадра под ним (его считаем размытием
 * кадра, из которого пиксели знака исключены, иначе знак «увидит» сам себя).
 * Неизвестных нет: непрозрачности заданы планом, поэтому отпечаток считается
 * таким, каким он должен быть. Сверка отвечает на один вопрос — тот ли знак
 * лежит на кадре: настоящий даёт высокое shape (контур совпал с картинкой) и
 * заметную amplitude, случайное совпадение — низкое shape.
 *
 * Подгонять по этой модели множители непрозрачности нельзя: фон под знаком
 * знаешь только приблизительно, и ошибка фона уводит множитель (см. strip).
 */
/**
 * Кадр проверки — в среднем каналов (см. average): так и модель знака, и сам
 * кадр считаются в одной мере, и сверка не сбивается на цветности
 */
async function analysisFrame(
  frame: Buffer,
  meta: { width: number; height: number },
): Promise<{ data: Buffer; width: number; height: number }> {
  const width = Math.max(16, Math.round(meta.width * Math.min(1, ANALYSIS_WIDTH / meta.width)))
  const { data: rgb, info } = await sharp(frame)
    .rotate()
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const data = Buffer.alloc(info.width * info.height)
  for (let i = 0; i < data.length; i++) {
    const j = i * info.channels
    data[i] = info.channels === 1 ? rgb[j] : Math.round((rgb[j] + rgb[j + 1] + rgb[j + 2]) / 3)
  }
  return { data, width: info.width, height: info.height }
}

/**
 * Проверка снятия: остался ли на кадре узор знака. Меряется по мелкой
 * структуре — крупный фон и промах его оценки сюда не попадают: кадр минус его
 * размытие (рябь) сопоставляется с контуром знака минус его размытие. У верно
 * очищенного кадра корреляция около нуля (остаётся только текстура фото), у
 * недоснятого знака — высокая, у снятого «наизнанку» — высокая со знаком минус.
 */
async function residueShape(
  frame: Buffer,
  meta: { width: number; height: number },
  plan: LegacyPlan,
  asset: Buffer,
): Promise<number | null> {
  const assetMeta = await sharp(asset).metadata()
  if (!assetMeta.width || !assetMeta.height) return null
  const info = await analysisFrame(frame, meta)
  const factor = info.width / meta.width
  const full: Frame = { width: meta.width, height: meta.height }
  const layerFullWidth = plan.width(full)
  const layerFullHeight = Math.round((layerFullWidth * assetMeta.height) / assetMeta.width)
  const spot = plan.place(full, { data: Buffer.alloc(0), width: layerFullWidth, height: layerFullHeight })
  const layer = await layerAt(plan, asset, Math.max(8, Math.round(layerFullWidth * factor)))
  const left = Math.max(0, Math.round(spot.left * factor))
  const top = Math.max(0, Math.round(spot.top * factor))
  const bw = Math.max(1, Math.min(info.width - left, layer.width))
  const bh = Math.max(1, Math.min(info.height - top, layer.height))
  if (bw < 16 || bh < 16) return null

  // Радиус размытия — мелкая структура: штрихи знака шире него, фон — глаже
  const radius = Math.max(2, Math.round(layer.width * 0.06))
  const blurThe = (buf: Buffer, width: number, height: number) =>
    sharp(buf, { raw: { width, height, channels: 1 } })
      .blur(radius)
      .raw()
      .toBuffer()
  const box = Buffer.alloc(bw * bh)
  const alphaBox = Buffer.alloc(bw * bh)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      box[y * bw + x] = info.data[(top + y) * info.width + (left + x)]
      alphaBox[y * bw + x] = layer.data[(y * layer.width + x) * 4 + 3]
    }
  }
  const [frameBlur, alphaBlur] = await Promise.all([
    blurThe(box, bw, bh),
    blurThe(alphaBox, bw, bh),
  ])
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let n = 0
  for (let i = 0; i < box.length; i++) {
    const a = alphaBox[i] - alphaBlur[i]
    if (Math.abs(a) < 8) continue
    const y = box[i] - frameBlur[i]
    sx += a
    sy += y
    sxx += a * a
    syy += y * y
    sxy += a * y
    n++
  }
  if (n < 200) return null
  const cov = sxy / n - (sx / n) * (sy / n)
  const sd1 = Math.sqrt(Math.max(1e-9, sxx / n - (sx / n) ** 2))
  const sd2 = Math.sqrt(Math.max(1e-9, syy / n - (sy / n) ** 2))
  return sd1 * sd2 > 0 ? cov / (sd1 * sd2) : null
}

async function fitPlan(
  frame: Buffer,
  meta: { width: number; height: number },
  plan: LegacyPlan,
  asset: Buffer,
): Promise<Fit | null> {
  const assetMeta = await sharp(asset).metadata()
  if (!assetMeta.width || !assetMeta.height) return null
  const info = await analysisFrame(frame, meta)
  const data = info.data
  const factor = info.width / meta.width
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

  // Тень — второй слой модели: та же альфа, но размытая и чёрная. Её размытие
  // считается от ширины слоя, как при наложении, поэтому подгонка не зависит
  // от размера кадра
  const shadow = plan.shadow
    ? await markLayer(asset, lw, plan.shadow.opacity, {
      color: [0, 0, 0],
      blur: Math.max(4, Math.round(lw * plan.shadow.blurRatio)),
    })
    : null
  let shadowPeak = 0
  if (shadow) {
    for (let i = 0; i < shadow.width * shadow.height; i++) {
      if (shadow.data[i * 4 + 3] > shadowPeak) shadowPeak = shadow.data[i * 4 + 3]
    }
  }

  // Фон: кадр без пикселей знака и его тени, размытый; в дырах значение берётся
  // из окружения, поэтому вклад самого знака в оценку фона не попадает
  const fw = info.width
  const fh = info.height
  const keep = new Uint8Array(fw * fh).fill(255)
  for (let y = 0; y < lh; y++) {
    const iy = top + y
    if (iy < 0 || iy >= fh) continue
    for (let x = 0; x < lw; x++) {
      const ix = left + x
      if (ix < 0 || ix >= fw) continue
      const a = layer.data[(y * lw + x) * 4 + 3]
      const s = shadow ? shadow.data[(y * lw + x) * 4 + 3] : 0
      if (a > peak * 0.05 || s > shadowPeak * 0.05) keep[iy * fw + ix] = 0
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

  // Пиксели для подгонки: штрихи знака и его тень. Собираем вклады обоих слоёв
  // (predictor) и то, что видно на кадре (observed)
  const samples: Array<{ am: number; as: number; x1: number; x2: number; y: number }> = []
  for (let y = 0; y < bh; y++) {
    const iy = top + y
    for (let x = 0; x < bw; x++) {
      const ix = left + x
      const li = y * lw + x
      const am = layer.data[li * 4 + 3] / 255
      const as = shadow ? shadow.data[li * 4 + 3] / 255 : 0
      if (am < (peak / 255) * 0.25 && as < (shadowPeak / 255) * 0.25) continue
      const i = iy * fw + ix
      // в дырах знака вес размытия меньше 255 — фон достраиваем по окружению
      const background = weight[i] > 6 ? sum[i] / (weight[i] / 255) : data[i]
      const color = average(layer.data[li * 4], layer.data[li * 4 + 1], layer.data[li * 4 + 2])
      samples.push({
        am,
        as,
        x1: am * (color - background),
        x2: -as * background,
        y: data[i] - background,
      })
    }
  }
  if (samples.length < 200) return null

  // Отпечаток берём таким, каким он должен быть по образцу: множителей не
  // подгоняем. На ровном фоне подгонка давала 1.07 вместо 1.00, а на живом
  // кадре фон под знаком угадывается по окружению и врёт уже на десятки
  // процентов: на кадре 1000573502 выходило p = 1.34, и очистка по такой
  // подгонке оставляла на месте знака цветной след. Непрозрачности прежних
  // версий известны точно (они записаны в плане), поэтому снимаем по ним
  const q = shadow ? 1 : 0

  // Сверка модели с кадром: корреляция предсказания и того, что видно
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let amp = 0
  let n = 0
  for (const s of samples) {
    const predicted = s.x1 + q * s.x2 * (1 - s.am)
    sx += predicted
    sy += s.y
    sxx += predicted * predicted
    syy += s.y * s.y
    sxy += predicted * s.y
    if (s.am >= (peak / 255) * 0.5) {
      amp += Math.abs(s.y)
      n++
    }
  }
  if (!n) return null
  const cov = sxy / samples.length - (sx / samples.length) * (sy / samples.length)
  const sd1 = Math.sqrt(Math.max(1e-9, sxx / samples.length - (sx / samples.length) ** 2))
  const sd2 = Math.sqrt(Math.max(1e-9, syy / samples.length - (sy / samples.length) ** 2))
  return {
    era: plan.era,
    shape: sd1 * sd2 > 0 ? cov / (sd1 * sd2) : 0,
    amplitude: amp / n,
  }
}

/** Знак снят: кадр без прежнего отпечатка */
export type LegacyStripResult =
  | { status: 'clean' }
  | { status: 'stripped'; data: Buffer; eras: LegacyEra[] }
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

  const hits: Array<{ plan: LegacyPlan; asset: Buffer; place: { left: number; top: number }; layer: Layer }> = []
  for (const era of eras) {
    const plan = PLANS[era]
    const asset = readAsset(plan.asset)
    if (!asset) continue
    const fit = await fitPlan(input, frame, plan, asset).catch(() => null)
    if (!fit) continue
    // Знак опознаётся по контуру и силе отпечатка: контур совпал с картинкой,
    // а отпечаток заметно сильнее шума. Снятие пойдёт по паспортным
    // непрозрачностям плана — подгонять их по кадру нельзя (см. заголовок)
    if (fit.shape < MIN_SHAPE || fit.amplitude < MIN_AMPLITUDE) continue
    const layer = await layerAt(plan, asset, plan.width(frame))
    hits.push({ plan, asset, place: plan.place(frame, layer), layer })
  }
  if (!hits.length) return { status: 'clean' }

  try {
    const base = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const data = base.data
    const fw = base.info.width
    const fh = base.info.height
    const shadowCache = new Map<string, Layer | null>()
    for (const hit of hits) {
      const { plan, layer, place } = hit
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
      for (let y = 0; y < layer.height; y++) {
        const iy = place.top + y
        if (iy < 0 || iy >= fh) continue
        for (let x = 0; x < layer.width; x++) {
          const ix = place.left + x
          if (ix < 0 || ix >= fw) continue
          const li = (y * layer.width + x) * 4
          // Непрозрачности берём из самого плана (в слое они уже учтены), а не
          // из подгонки: подогнанные на живом фото врут — фон под знаком
          // угадывается по окружению, и множитель уезжает (на кадре 1000573502
          // выходило p=1.34, и очистка оставляла цветной след на месте знака)
          const am = Math.min(0.98, layer.data[li + 3] / 255)
          const as = shadow ? Math.min(0.98, shadow.data[li + 3] / 255) : 0
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
    // Проверка снятия: подгоняем модель к тому, что получилось. Если контур
    // знака всё ещё совпадает с картинкой и отпечаток остался заметным, снятие
    // не удалось — отдаём кадр нетронутым: лучше чужой знак, чем следы подгонки
    for (const hit of hits) {
      const residue = await residueShape(encoded, frame, hit.plan, hit.asset).catch(() => null)
      if (residue === null) continue
      // Знак со знаком: узор на месте знака, но перевёрнутый (сняли «наизнанку»,
      // на фото цветной след), — такая же порча кадра, как и недоснятый знак
      if (Math.abs(residue) >= RESIDUE_SHAPE) {
        console.error(
          'watermark-legacy: снятие не прошло проверку', hit.plan.era,
          'узор остался', residue.toFixed(2),
        )
        return { status: 'clean' }
      }
    }
    return { status: 'stripped', data: encoded, eras: hits.map((h) => h.plan.era) }
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
