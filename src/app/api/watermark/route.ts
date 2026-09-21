import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { WATERMARK_VERSION, applyWatermark } from '@/lib/watermark'

/**
 * Водяной знак на уже загруженных фотографиях — только для администратора.
 *
 * Новые фото знак получают сами (см. src/lib/watermark.ts и маршрут загрузки
 * /api/crm/upload), а снимки, загруженные раньше, лежат в хранилище как есть:
 * файлы доступны только приложению (папка media — том контейнера), снаружи их
 * не переписать. Поэтому разметка идёт изнутри приложения, порциями, чтобы
 * один запрос не держал сервер минутами:
 *
 *   GET  /api/watermark                  — отчёт: сколько фото уже со знаком,
 *                                          сколько ждёт разметки, что в бэкапе;
 *   GET  /api/watermark?preview=<id|файл> — как знак ляжет на это фото
 *                                          (ничего не пишется — только показ);
 *   POST /api/watermark { mode, limit }  — разметка порцией:
 *     mode: 'apply'   — наложить знак на limit фото, ждущих разметки;
 *     mode: 'restore' — вернуть limit фото из бэкапа (откат к прежнему виду).
 *
 * Знак накладывается на сам файл-оригинал (Payload готовит размеры из него),
 * после чего заново собираются размеры thumbnail/card/hero — их и видят
 * посетители сайта. Перед записью оригинал уходит в бэкап (папка
 * media/.wm-backup, рядом с файлами — том тот же, живёт до пересоздания
 * контейнера): пока заказчик не подтвердил вид знака на реальных фото,
 * разметку можно откатить, не теряя исходники.
 *
 * Фото, загруженные после первого релиза знака (21.09.2026, 11:25 МСК), уже
 * несут прежний знак «Н15» без ключа и подписи: второй знак поверх первого
 * печатать нельзя, поэтому такие файлы разметка пропускает (в отчёте — их
 * число). Портреты сотрудников знак не получают вовсе: они грузятся с
 * kind=avatar и попадают в media с wm=1 (см. маршрут загрузки).
 */

/**
 * С этого момента фото уже размечены прежним знаком «Н15» (релиз 21.09.2026,
 * 11:25 МСК — коммит 8cd0979 «водяной знак «Н15» на фото объектов»).
 */
const OLD_MARK_SINCE = '2026-09-21T11:25:00+03:00'
/** Сколько фото обрабатывает один запрос по умолчанию и максимум */
const CHUNK_DEFAULT = 10
const CHUNK_MAX = 40
/** Папка бэкапа оригиналов — внутри хранилища media, рядом с файлами */
const BACKUP_DIR = '.wm-backup'

type SizeInfo = {
  filename?: string | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
}
type MediaDoc = {
  id: number
  filename?: string | null
  mimeType?: string | null
  sizes?: Record<string, SizeInfo> | null
}

/** Только администратор: разметка фото — правка файлов всего каталога */
async function adminGate(): Promise<NextResponse | null> {
  const user = await getCrmUser()
  if (!user || !canAccessCrm(user)) {
    return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Массовая разметка фото — только для администратора' }, { status: 403 })
  }
  return null
}

/** Папка хранилища: staticDir коллекции media (в образе — /app/media) */
function mediaDir(payload: Awaited<ReturnType<typeof getPayload>>): string {
  const collection = payload.config.collections.find((c) => c.slug === 'media')
  const upload = collection?.upload
  const staticDir = upload && typeof upload === 'object' ? upload.staticDir : 'media'
  return path.resolve(process.cwd(), String(staticDir || 'media'))
}

/** Настройки размеров из коллекции: формат и качество — одно место правды (Media.ts) */
function sizeFormat(payload: Awaited<ReturnType<typeof getPayload>>) {
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
function sizeTarget(size: SizeInfo, format: { format: string; quality: number }): { mime: string; quality: number } {
  const byName = /\.([^.]+)$/.exec(size.filename || '')?.[1].toLowerCase()
  const mime =
    size.mimeType ||
    (byName === 'jpg' || byName === 'jpeg' ? 'image/jpeg' : byName === 'png' ? 'image/png' : 'image/webp')
  const configured = 'image/' + (format.format === 'jpeg' ? 'jpeg' : format.format)
  // Формат совпал с настройками коллекции — берём их качество, иначе обычное
  // для этого формата (у старых JPEG-размеров своё качество уже не восстановить)
  const quality = mime === configured ? format.quality : mime === 'image/jpeg' ? 90 : 86
  return { mime, quality }
}

/** Пересобрать размеры (thumbnail/card/hero) из размеченного оригинала */
async function writeSizes(
  buffer: Buffer,
  sizes: MediaDoc['sizes'],
  dir: string,
  format: { format: string; quality: number },
): Promise<number> {
  let written = 0
  for (const size of Object.values(sizes ?? {})) {
    if (!size?.filename || !size.width) continue
    let image = sharp(buffer).rotate()
    image = size.height
      ? image.resize({ width: size.width, height: size.height, fit: 'cover', position: 'centre' })
      : image.resize({ width: size.width, withoutEnlargement: true })
    const { mime, quality } = sizeTarget(size, format)
    const file = path.join(dir, size.filename)
    if (mime === 'image/jpeg') await image.jpeg({ quality, chromaSubsampling: '4:4:4' }).toFile(file)
    else if (mime === 'image/png') await image.png({ compressionLevel: 9 }).toFile(file)
    else await image.webp({ quality }).toFile(file)
    written++
  }
  return written
}

/** Одно фото: прочитать оригинал из хранилища */
async function readOriginal(dir: string, doc: MediaDoc): Promise<Buffer | null> {
  if (!doc.filename) return null
  try {
    return await fs.readFile(path.join(dir, doc.filename))
  } catch {
    return null
  }
}

/** Сколько файлов и байт лежит в бэкапе */
async function backupStats(dir: string): Promise<{ files: number; bytes: number }> {
  try {
    const names = await fs.readdir(path.join(dir, BACKUP_DIR))
    let bytes = 0
    for (const name of names) {
      try {
        bytes += (await fs.stat(path.join(dir, BACKUP_DIR, name))).size
      } catch {
        /* файл исчез между readdir и stat — не мешает отчёту */
      }
    }
    return { files: names.length, bytes }
  } catch {
    return { files: 0, bytes: 0 }
  }
}

/** Фото, ждущие разметки: нашего знака нет и прежнего знака на них тоже нет */
function pendingWhere(): Where {
  return {
    and: [
      { createdAt: { less_than: OLD_MARK_SINCE } },
      { or: [{ wm: { equals: 0 } }, { wm: { exists: false } }] },
    ],
  }
}

export async function GET(req: NextRequest) {
  const denied = await adminGate()
  if (denied) return denied

  const payload = await getPayload({ config })
  const dir = mediaDir(payload)
  const preview = req.nextUrl.searchParams.get('preview')

  // Показ: знак накладывается в память и отдаётся картинкой — в хранилище
  // ничего не меняется, можно спокойно смотреть на разных фото
  if (preview) {
    // Идентификатор из админки или имя файла — как удобнее смотреть
    const doc: MediaDoc | null | undefined = /^\d+$/.test(preview)
      ? ((await payload
        .findByID({ collection: 'media', id: Number(preview), overrideAccess: true, depth: 0 })
        .catch(() => null)) as MediaDoc | null)
      : ((
        await payload.find({
          collection: 'media',
          where: { filename: { equals: preview } },
          limit: 1,
          overrideAccess: true,
          depth: 0,
        })
      ).docs[0] as MediaDoc | undefined)
    if (!doc?.filename) return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 })
    const original = await readOriginal(dir, doc)
    if (!original) return NextResponse.json({ error: 'Файла нет в хранилище' }, { status: 404 })
    const marked = await applyWatermark(original, doc.mimeType || '', doc.filename)
    if (marked.status !== 'done') {
      return NextResponse.json({ error: `Не удалось наложить знак (${marked.status})` }, { status: 422 })
    }
    return new NextResponse(new Uint8Array(marked.data), {
      headers: { 'Content-Type': marked.mimetype, 'Cache-Control': 'no-store' },
    })
  }

  const [total, done, waiting, legacy, backup] = await Promise.all([
    payload.count({ collection: 'media', overrideAccess: true }),
    payload.count({ collection: 'media', where: { wm: { equals: WATERMARK_VERSION } }, overrideAccess: true }),
    payload.find({ collection: 'media', where: pendingWhere(), limit: 0, overrideAccess: true }),
    // Прежний знак «Н15» без ключа и подписи: эти фото разметка пропускает
    payload.count({
      collection: 'media',
      where: { createdAt: { greater_than_equal: OLD_MARK_SINCE } },
      overrideAccess: true,
    }),
    backupStats(dir),
  ])

  return NextResponse.json({
    markVersion: WATERMARK_VERSION,
    total: total.totalDocs,
    marked: done.totalDocs,
    waiting: waiting.totalDocs,
    legacyMarked: legacy.totalDocs,
    backup: { files: backup.files, mb: Math.round((backup.bytes / 1024 / 1024) * 10) / 10 },
  })
}

export async function POST(req: NextRequest) {
  const denied = await adminGate()
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { mode?: string; limit?: number; includeOld?: boolean }
  const mode = body.mode === 'restore' ? 'restore' : body.mode === 'apply' ? 'apply' : null
  if (!mode) return NextResponse.json({ error: 'mode: apply или restore' }, { status: 400 })
  const limit = Math.min(CHUNK_MAX, Math.max(1, Math.round(Number(body.limit) || CHUNK_DEFAULT)))

  const payload = await getPayload({ config })
  const dir = mediaDir(payload)
  const format = sizeFormat(payload)
  const started = Date.now()
  const doneIds: number[] = []
  const failed: Array<{ id: number; file: string; reason: string }> = []
  let sizesWritten = 0

  if (mode === 'apply') {
    const where = body.includeOld
      ? { or: [{ wm: { equals: 0 } }, { wm: { exists: false } }] }
      : pendingWhere()
    const found = await payload.find({
      collection: 'media',
      where,
      limit,
      sort: 'id',
      overrideAccess: true,
      depth: 0,
    })

    for (const raw of found.docs as MediaDoc[]) {
      const filename = raw.filename
      if (!filename) {
        failed.push({ id: raw.id, file: '', reason: 'у документа нет файла' })
        continue
      }
      const original = await readOriginal(dir, raw)
      if (!original) {
        failed.push({ id: raw.id, file: filename, reason: 'файла нет в хранилище' })
        continue
      }
      const marked = await applyWatermark(original, raw.mimeType || '', filename)
      if (marked.status !== 'done') {
        failed.push({ id: raw.id, file: filename, reason: marked.status })
        continue
      }
      try {
        // Бэкап — только если его ещё нет: повторный запуск не должен затереть
        // чистый оригинал уже размеченным файлом
        const backupPath = path.join(dir, BACKUP_DIR, filename)
        await fs.mkdir(path.join(dir, BACKUP_DIR), { recursive: true })
        await fs
          .copyFile(path.join(dir, filename), backupPath, fsConstants.COPYFILE_EXCL)
          .catch((e: NodeJS.ErrnoException) => {
            if (e.code !== 'EEXIST') throw e
          })

        const filePath = path.join(dir, filename)
        await fs.writeFile(filePath, marked.data)
        sizesWritten += await writeSizes(marked.data, raw.sizes, dir, format)
        await payload.update({
          collection: 'media',
          id: raw.id,
          data: { wm: WATERMARK_VERSION },
          overrideAccess: true,
          depth: 0,
        })
        doneIds.push(raw.id)
      } catch (e) {
        console.error('watermark: не удалось разметить фото', raw.filename, e)
        failed.push({ id: raw.id, file: String(raw.filename), reason: 'сбой записи' })
      }
    }

    const left = await payload.find({ collection: 'media', where, limit: 0, overrideAccess: true })
    return NextResponse.json({
      mode,
      limit,
      done: doneIds.length,
      doneIds,
      failed,
      sizesWritten,
      waiting: left.totalDocs,
      ms: Date.now() - started,
    })
  }

  // Откат: возвращаем оригиналы из бэкапа и заново собираем размеры
  let names: string[] = []
  try {
    names = (await fs.readdir(path.join(dir, BACKUP_DIR))).slice(0, limit)
  } catch {
    return NextResponse.json({ error: 'Бэкапа нет — откатывать нечего' }, { status: 404 })
  }
  for (const name of names) {
    const doc = (
      await payload.find({ collection: 'media', where: { filename: { equals: name } }, limit: 1, overrideAccess: true })
    ).docs[0] as MediaDoc | undefined
    if (!doc?.filename) {
      failed.push({ id: 0, file: name, reason: 'нет документа media' })
      continue
    }
    try {
      const original = await fs.readFile(path.join(dir, BACKUP_DIR, name))
      await fs.writeFile(path.join(dir, name), original)
      sizesWritten += await writeSizes(original, doc.sizes, dir, format)
      await payload.update({ collection: 'media', id: doc.id, data: { wm: 0 }, overrideAccess: true, depth: 0 })
      doneIds.push(doc.id)
    } catch (e) {
      console.error('watermark: не удалось откатить фото', name, e)
      failed.push({ id: doc.id, file: name, reason: 'сбой отката' })
    }
  }
  const backup = await backupStats(dir)
  return NextResponse.json({
    mode: 'restore',
    limit,
    done: doneIds.length,
    doneIds,
    failed,
    sizesWritten,
    backup: { ...backup, mb: Math.round((backup.bytes / 1024 / 1024) * 10) / 10 },
    ms: Date.now() - started,
  })
}
