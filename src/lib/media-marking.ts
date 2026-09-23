import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { Sharp } from 'sharp'
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, Payload, PayloadRequest, Where } from 'payload'

import { WATERMARK_AVATAR, WATERMARK_VERSION, applyWatermark, photoFormat } from './watermark'
import { legacyErasFor, stripLegacyMarks, type LegacyEra } from './watermark-legacy'

/**
 * Разметка фотографий объектов: знак «Н15» ложится в сам файл — и в публичный
 * оригинал, и в каждый размер, — а чистый кадр остаётся в закрытой папке.
 *
 * Знак нельзя наложить один раз на оригинал и надеяться, что он доедет до
 * сайта: Payload при загрузке собирает из оригинала размеры (thumbnail, card,
 * hero) кадрированием по фокусной точке, и у вертикального кадра от фото
 * остаётся середина — знак в углу оригинала в размер просто не попадает.
 * Поэтому размечается каждый файл, который видит посетитель:
 *
 *   media/<файл>             — публичный оригинал (полноразмерное фото), знак;
 *   media/<имя>-400x300.webp — размеры каталога и карточки объекта, знак;
 *   media/originals/<файл>   — чистый кадр без знака: закрытая папка (Payload
 *                              раздаёт только файлы из корня хранилища),
 *                              посетителю не открывается.
 *
 * Чистый кадр (мастер) — основа всей разметки: знак всегда накладывается на
 * него, поэтому повторный запуск не печатает знак вторым слоем. Из мастера же
 * заново собираются размеры — когда с кадра сняли прежний знак (см.
 * src/lib/watermark-legacy.ts) или когда в CRM поменяли фокусную точку кадра.
 *
 * Один и тот же путь разметки работает для всех загрузок: хук коллекции media
 * ловит и карточку CRM, и старую форму /admin-add, и загрузку через админку
 * Payload — мимо знака пройти нельзя. Уже загруженные фото размечает фоновая
 * задача (см. startWatermarkBackfill) и маршрут /api/watermark.
 */

/** Папка с чистыми кадрами внутри хранилища: посетителю недоступна */
export const MASTER_DIR = 'originals'
/**
 * Папка прежней разметки (копия оригинала до знака). Оставлена как источник
 * мастера для фото, размеченных прошлой версией маршрута, — новых копий сюда
 * не пишем, чистые кадры живут в MASTER_DIR.
 */
export const BACKUP_DIR = '.wm-backup'

type SizeInfo = {
  filename?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
}

/** Документ media — только те поля, что нужны разметке */
export type PhotoDoc = {
  id: number
  filename?: string | null
  mimeType?: string | null
  focalX?: number | null
  focalY?: number | null
  createdAt?: string | null
  wm?: number | null
  sizes?: Record<string, SizeInfo> | null
}

/** Чем закончилась разметка одного фото */
export type PhotoOutcome = {
  status:
    /** Знак наложен — файл и размеры обновлены */
    | 'marked'
    /** Портрет сотрудника (wm=1): знака на нём быть не должно */
    | 'avatar'
    /** Файла нет в хранилище или у документа нет имени */
    | 'missing'
    /** Кадр не читается sharp: битый файл или HEIC под чужим расширением */
    | 'unreadable'
    /** Не вышло по любой другой причине — фото вернётся в следующем проходе */
    | 'failed'
  /** Имя файла в хранилище */
  file: string
  /** Прежние знаки, снятые с кадра */
  stripped: LegacyEra[]
  /** Сколько размеров получили знак */
  sizes: number
  /** Обновлённый документ media — чтобы вызывающий вернул актуальные данные */
  doc?: unknown
  /** Причина отказа (для отчёта и журнала) */
  reason?: string
}

/** Папка хранилища: staticDir коллекции media (в образе — /app/media) */
export function mediaDir(payload: Payload): string {
  const collection = payload.config.collections.find((c) => c.slug === 'media')
  const upload = collection?.upload
  const staticDir = upload && typeof upload === 'object' ? upload.staticDir : 'media'
  return path.resolve(process.cwd(), String(staticDir || 'media'))
}

/** Настройки размеров из коллекции: формат и качество — одно место правды (Media.ts) */
export function sizeConfig(payload: Payload): { format: string; quality: number } {
  const collection = payload.config.collections.find((c) => c.slug === 'media')
  const upload = collection?.upload
  const options = upload && typeof upload === 'object' ? upload.formatOptions : undefined
  return {
    format: String(options?.format || 'webp'),
    quality: Number((options?.options as { quality?: number } | undefined)?.quality ?? 86),
  }
}

/**
 * Формат конкретного размера: у файлов, собранных раньше, он свой (до перехода
 * на webp размеры были JPEG) — берём его из самого документа, а настройки
 * коллекции только подсказывают качество для текущего формата.
 */
export function sizeTarget(
  size: SizeInfo,
  config: { format: string; quality: number },
): { mime: string; quality: number } {
  const byName = /\.([^.]+)$/.exec(size.filename || '')?.[1].toLowerCase()
  const mime =
    size.mimeType ||
    (byName === 'jpg' || byName === 'jpeg' ? 'image/jpeg' : byName === 'png' ? 'image/png' : 'image/webp')
  const configured = 'image/' + (config.format === 'jpeg' ? 'jpeg' : config.format)
  // Формат совпал с настройками коллекции — берём их качество, иначе обычное
  // для этого формата (у старых JPEG-размеров своё качество уже не восстановить)
  const quality = mime === configured ? config.quality : mime === 'image/jpeg' ? 90 : 86
  return { mime, quality }
}

/** Фото, ждущие разметки: нашего знака на них нет (портреты — отдельная версия wm=1) */
export function pendingWhere(): Where {
  return {
    or: [{ wm: { equals: 0 } }, { wm: { exists: false } }],
  }
}

/** Фото с любым знаком, кроме портретного: их размеры можно пересобрать заново */
export function markedWhere(): Where {
  return { wm: { equals: WATERMARK_VERSION } }
}

async function readFileOrNull(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file)
  } catch {
    return null
  }
}

/** Прямоугольник кропа: цель не выходит за кадр, при нехватке места прижимается к краю */
function bound(center: number, target: number, total: number): number {
  let value = center - target / 2
  if (center + target / 2 > total) value = total - target
  if (value < 0) value = 0
  return value
}

/** Пережим размера в его формате */
function encodeSize(image: Sharp, target: { mime: string; quality: number }): Promise<Buffer> {
  if (target.mime === 'image/jpeg') return image.jpeg({ quality: target.quality, chromaSubsampling: '4:4:4' }).toBuffer()
  if (target.mime === 'image/png') return image.png({ compressionLevel: 9 }).toBuffer()
  return image.webp({ quality: target.quality }).toBuffer()
}

/**
 * Собрать размер из чистого кадра так же, как это делает Payload при загрузке
 * (node_modules/payload/dist/uploads/image-resizing/createImageSizes.js): кадр
 * уменьшается по ведущей стороне, затем из него вырезается прямоугольник
 * размеров целиком — по фокусной точке. Обычный fit: 'cover' режет иначе, и
 * кадр в каталоге «съезжал» бы относительно превью.
 *
 * null — размер не делается: оригинал меньше цели по обеим сторонам (в
 * документе у такого размера нет имени файла, и ссылаться не на что).
 */
async function buildSize(
  master: Buffer,
  doc: PhotoDoc,
  size: SizeInfo,
  target: { mime: string; quality: number },
): Promise<Buffer | null> {
  const meta = await sharp(master).metadata()
  if (!meta.width || !meta.height) throw new Error('кадр не читается')
  // Кадры с телефонов приходят с EXIF-ориентацией: считаем размеры так, как их
  // увидит посетитель (у поворотов на 90° стороны меняются местами)
  const swapped = [5, 6, 7, 8].includes(meta.orientation ?? 1)
  const width = swapped ? meta.height : meta.width
  const height = swapped ? meta.width : meta.height

  const targetWidth = Math.round(Number(size.width) || 0)
  const targetHeight = Math.round(Number(size.height) || 0)
  if (!targetWidth && !targetHeight) return null
  if (targetWidth && targetHeight && width < targetWidth && height < targetHeight) return null

  const aspect = width / height
  const prioritizeHeight = targetWidth / targetHeight < aspect
  const scaledWidth = prioritizeHeight ? Math.round(targetHeight * aspect) : targetWidth
  const scaledHeight = prioritizeHeight ? targetHeight : Math.round(targetWidth / aspect)
  const left = Math.floor(bound(scaledWidth * (Number(doc.focalX ?? 50) / 100), targetWidth, scaledWidth))
  const top = Math.floor(bound(scaledHeight * (Number(doc.focalY ?? 50) / 100), targetHeight, scaledHeight))

  const base = () => sharp(master).rotate()
  try {
    const sized = base().resize({
      width: prioritizeHeight ? undefined : scaledWidth,
      height: prioritizeHeight ? scaledHeight : undefined,
      fastShrinkOnLoad: false,
    })
    return await encodeSize(sized.extract({ left, top, width: targetWidth, height: targetHeight }), target)
  } catch (e) {
    // Прямоугольник не сошёлся (кадр другого размера, чем записан в документе):
    // берём центральный кроп — как в прежней версии разметки
    console.warn('media-marking: кроп размера не сошёлся, беру центр кадра', size.filename, e)
    return await encodeSize(base().resize({ width: targetWidth, height: targetHeight, fit: 'cover', position: 'centre' }), target)
  }
}

/** Пересобрать все размеры из чистого кадра (mark — наложить ли знак) */
async function rebuildSizes(
  master: Buffer,
  doc: PhotoDoc,
  dir: string,
  config: { format: string; quality: number },
  mark: boolean,
): Promise<number> {
  let written = 0
  for (const size of Object.values(doc.sizes ?? {})) {
    if (!size?.filename || !size.width) continue
    const target = sizeTarget(size, config)
    const built = await buildSize(master, doc, size, target)
    if (!built) continue
    const out = mark ? await applyWatermark(built, target.mime, size.filename) : null
    if (mark && out?.status !== 'done') throw new Error(`размер не размечен: ${size.filename} (${out?.status})`)
    await fs.writeFile(path.join(dir, size.filename), out?.status === 'done' ? out.data : built)
    written++
  }
  return written
}

/**
 * Разметить размеры на месте: файлы уже собраны из чистого кадра, знак в них не
 * впечатан — накладываем поверх самих файлов (дешевле, чем пересобирать кроп).
 */
async function markSizesInPlace(
  doc: PhotoDoc,
  dir: string,
  config: { format: string; quality: number },
): Promise<number> {
  let written = 0
  for (const size of Object.values(doc.sizes ?? {})) {
    if (!size?.filename) continue
    const file = path.join(dir, size.filename)
    const bytes = await readFileOrNull(file)
    if (!bytes) throw new Error(`размера нет в хранилище: ${size.filename}`)
    const target = sizeTarget(size, config)
    const marked = await applyWatermark(bytes, target.mime, size.filename)
    if (marked.status !== 'done') throw new Error(`размер не размечен: ${size.filename} (${marked.status})`)
    await fs.writeFile(file, marked.data)
    written++
  }
  return written
}

/**
 * Запрос для записи внутри текущей операции. Файл из запроса убираем: update не
 * должен пересобирать загруженный файл заново (иначе чистый кадр из req.file
 * затрёт уже размеченный), а правки кадра из строки запроса (uploadEdits из
 * админки) — это дело самой админки, не разметки. Транзакция при этом
 * сохраняется: без неё update ждал бы завершения create, а create ждал бы
 * разметку.
 */
function childReq(req: PayloadRequest): PayloadRequest {
  const query = { ...(req.query ?? {}) }
  delete query.uploadEdits
  return { ...req, file: undefined, files: undefined, payloadAPI: 'local', query }
}

export type ProcessOptions = {
  payload: Payload
  doc: PhotoDoc
  /**
   * Снимать ли прежние знаки (окна версий известны по дате загрузки). Новым
   * загрузкам не нужно: файл только что пришёл из браузера и чистый.
   */
  legacy?: boolean
  /** Пересобрать размеры из чистого кадра, даже если мастер уже был */
  rebuild?: boolean
  /** Запрос операции — чтобы запись документа шла в его же транзакции */
  req?: PayloadRequest
}

/**
 * Разметить одно фото: снять прежний знак, сохранить чистый кадр, наложить
 * знак на публичный оригинал и на размеры, записать версию знака в документ.
 *
 * Порядок шагов выбран так, чтобы повторный запуск был безопасен: сначала
 * чистый кадр ложится в закрытую папку, знак накладывается только на него, и
 * любой сбой оставляет фото с прежней версией wm — следующий проход продолжит.
 */
export async function processPhoto(options: ProcessOptions): Promise<PhotoOutcome> {
  const { payload, doc, legacy = false, rebuild = false, req } = options
  const none: LegacyEra[] = []
  const id = doc.id
  const file = doc.filename ? String(doc.filename) : ''
  if (!file) return { status: 'missing', file, stripped: none, sizes: 0, reason: 'у документа нет файла' }
  if (doc.wm === WATERMARK_AVATAR) return { status: 'avatar', file, stripped: none, sizes: 0 }

  const dir = mediaDir(payload)
  const config = sizeConfig(payload)
  const publicPath = path.join(dir, file)
  const masterPath = path.join(dir, MASTER_DIR, file)

  const observed = await readFileOrNull(publicPath)
  if (!observed) return { status: 'missing', file, stripped: none, sizes: 0, reason: 'файла нет в хранилище' }

  // Чистый кадр: свой мастер, копия прошлой разметки или сам файл (с него тогда
  // снимаем прежний знак — окна версий знака известны по дате загрузки)
  let master = await readFileOrNull(masterPath)
  const reused = !!master
  const stripped: LegacyEra[] = []
  if (!master) {
    master = (await readFileOrNull(path.join(dir, BACKUP_DIR, file))) ?? observed
    if (legacy) {
      const eras = legacyErasFor(doc.createdAt ?? undefined)
      const result = await stripLegacyMarks(master, doc.mimeType || '', file, eras, photoFormat(doc.mimeType || '', file))
      if (result.status === 'unreadable') {
        return { status: 'unreadable', file, stripped: none, sizes: 0 }
      }
      if (result.status === 'skipped') {
        return { status: 'failed', file, stripped: none, sizes: 0, reason: 'прежний знак не снялся' }
      }
      if (result.status === 'stripped') {
        master = result.data
        stripped.push(...result.eras)
      }
    }
  }

  // Чистый кадр — в закрытую папку, до разметки: если разметка сорвётся,
  // повторный запуск продолжит с чистого кадра (файл уже есть — не трогаем)
  if (!reused) {
    try {
      await fs.mkdir(path.dirname(masterPath), { recursive: true })
      await fs.writeFile(masterPath, master, { flag: 'wx' }).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'EEXIST') throw e
      })
    } catch (e) {
      console.error('media-marking: не удалось сохранить чистый кадр', file, e)
      return { status: 'failed', file, stripped, sizes: 0, reason: 'чистый кадр не сохранился' }
    }
  }

  const marked = await applyWatermark(master, doc.mimeType || '', file)
  if (marked.status === 'unreadable') return { status: 'unreadable', file, stripped, sizes: 0 }
  if (marked.status !== 'done') return { status: 'failed', file, stripped, sizes: 0, reason: 'знак не наложился' }

  try {
    await fs.writeFile(publicPath, marked.data)
    // Размеры пересобираем, если кадр чистили или размеры уже размечены: знак
    // на них лёг бы вторым слоем. Свежая загрузка — файлы собраны из чистого
    // кадра, знак накладываем поверх них
    const sizes =
      rebuild || stripped.length || reused
        ? await rebuildSizes(master, doc, dir, config, true)
        : await markSizesInPlace(doc, dir, config)
    const updated = await payload.update({
      collection: 'media',
      id,
      data: { wm: WATERMARK_VERSION },
      req: req ? childReq(req) : undefined,
      overrideAccess: true,
      depth: 0,
    })
    return { status: 'marked', file, stripped, sizes, doc: updated }
  } catch (e) {
    console.error('media-marking: не удалось разметить фото', file, e)
    return { status: 'failed', file, stripped, sizes: 0, reason: 'сбой записи' }
  }
}

/**
 * Вернуть фото к прежнему виду: публичный файл — чистый кадр, размеры собраны
 * из него же без знака, документ снова ждёт разметки (wm=0). Чистые кадры
 * остаются на месте: разметку можно включить снова, не теряя исходники.
 */
export async function restorePhoto(payload: Payload, doc: PhotoDoc): Promise<PhotoOutcome> {
  const none: LegacyEra[] = []
  const file = doc.filename ? String(doc.filename) : ''
  if (!file) return { status: 'missing', file, stripped: none, sizes: 0, reason: 'у документа нет файла' }

  const dir = mediaDir(payload)
  const master =
    (await readFileOrNull(path.join(dir, MASTER_DIR, file))) ??
    (await readFileOrNull(path.join(dir, BACKUP_DIR, file)))
  if (!master) return { status: 'missing', file, stripped: none, sizes: 0, reason: 'чистого кадра нет — откатывать нечем' }

  try {
    await fs.writeFile(path.join(dir, file), master)
    const sizes = await rebuildSizes(master, doc, dir, sizeConfig(payload), false)
    const updated = await payload.update({
      collection: 'media',
      id: doc.id,
      data: { wm: 0 },
      overrideAccess: true,
      depth: 0,
    })
    return { status: 'marked', file, stripped: none, sizes, doc: updated }
  } catch (e) {
    console.error('media-marking: не удалось откатить фото', file, e)
    return { status: 'failed', file, stripped: none, sizes: 0, reason: 'сбой отката' }
  }
}

/**
 * Хук media afterChange: разметка сразу после загрузки — из карточки CRM, из
 * старой формы /admin-add, из админки Payload. Работает только когда в запросе
 * есть файл: обычная правка документа (alt, фокусная точка) файлов не касается.
 */
export const mediaAfterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
  try {
    if (!req.file) return doc
    const result = await processPhoto({
      payload: req.payload,
      doc: doc as unknown as PhotoDoc,
      req,
    })
    if (result.status !== 'marked') {
      console.error('media-marking: фото осталось без знака', result.file, result.status, result.reason || '')
      return doc
    }
    return (result.doc as typeof doc) ?? doc
  } catch (e) {
    console.error('media-marking: хук разметки упал', e)
    return doc
  }
}

/** Поля документа, по которым видно, что кадр будут кропить иначе */
function focalOf(doc: Record<string, unknown> | undefined, key: 'focalX' | 'focalY'): number {
  const value = Number(doc?.[key])
  return Number.isFinite(value) ? value : 50
}

/**
 * Хук media beforeChange: смена фокусной точки кадра. Payload пересобирает
 * файлы из размеченного оригинала — знак в новом кропе может остаться за
 * кадром, поэтому помечаем фото как ждущее разметки: фоновая задача соберёт
 * размеры заново из чистого кадра с новым кропом.
 */
export const mediaFocalChange: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation !== 'update' || !data || !originalDoc) return data
  const current = data as Record<string, unknown>
  if (current.wm === WATERMARK_AVATAR) return data
  const moved =
    focalOf(current, 'focalX') !== focalOf(originalDoc, 'focalX') ||
    focalOf(current, 'focalY') !== focalOf(originalDoc, 'focalY')
  if (!moved) return data
  current.wm = 0
  return data
}

/** Сколько места на диске под хранилищем: чистые кадры занимают его столько же, сколько файлы */
export async function diskSpace(dir: string): Promise<{ freeMb: number; totalMb: number }> {
  try {
    const stat = await fs.statfs(dir)
    const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10
    return { freeMb: mb(stat.bavail * stat.bsize), totalMb: mb(stat.blocks * stat.bsize) }
  } catch {
    return { freeMb: 0, totalMb: 0 }
  }
}

/** Сколько файлов и байт лежит в папке (чистые кадры, прежний бэкап) */
export async function dirStats(dir: string): Promise<{ files: number; mb: number }> {
  try {
    const names = await fs.readdir(dir)
    let bytes = 0
    for (const name of names) {
      try {
        bytes += (await fs.stat(path.join(dir, name))).size
      } catch {
        /* файл исчез между readdir и stat — не мешает отчёту */
      }
    }
    return { files: names.length, mb: Math.round((bytes / 1024 / 1024) * 10) / 10 }
  } catch {
    return { files: 0, mb: 0 }
  }
}
