import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { WATERMARK_AVATAR, WATERMARK_VERSION, applyWatermark } from '@/lib/watermark'
import {
  BACKUP_DIR,
  MASTER_DIR,
  dirStats,
  diskSpace,
  markedWhere,
  mediaDir,
  pendingWhere,
  processPhoto,
  restorePhoto,
  type PhotoDoc,
} from '@/lib/media-marking'

/**
 * Водяной знак на уже загруженных фотографиях — только для администратора.
 *
 * Новые фото знак получают сами (см. src/lib/media-marking.ts и хук коллекции
 * media), а снимки, загруженные раньше, лежат в хранилище как есть: файлы
 * доступны только приложению (папка media — том контейнера), снаружи их не
 * переписать. Поэтому разметка идёт изнутри приложения, порциями, чтобы один
 * запрос не держал сервер минутами. Тот же алгоритм в фоне прогоняет
 * src/lib/media-marking-job.ts — маршрут нужен, чтобы видеть отчёт, смотреть
 * знак на конкретном фото и повторять разметку вручную:
 *
 *   GET  /api/watermark                   — отчёт: сколько фото со знаком,
 *                                           сколько ждёт разметки, сколько
 *                                           занимают чистые кадры, сколько
 *                                           места на диске;
 *   GET  /api/watermark?preview=<id|файл> — как знак ляжет на это фото
 *                                           (ничего не пишется — только показ);
 *   POST /api/watermark { mode, limit }   — разметка порцией:
 *     mode: 'apply'   — разметить limit фото, ждущих знака (со снятием
 *                       прежних знаков — см. src/lib/watermark-legacy.ts);
 *     mode: 'repair'  — пересобрать размеры (thumbnail/card/hero) из чистых
 *                       кадров у фото, размеченных прошлой версией знака:
 *                       знак в углу оригинала в кроп размера не попадал, и
 *                       на сайте такие размеры выходили без знака;
 *     mode: 'restore' — вернуть limit фото к прежнему виду (чистый кадр из
 *                       закрытой папки, размеры заново, wm=0).
 *
 * Портреты сотрудников (wm=1) разметка не трогает: на портрете знак выглядит
 * наклейкой, поэтому карточка агента грузит их с kind=avatar.
 */

/** Сколько фото обрабатывает один запрос по умолчанию и максимум */
const CHUNK_DEFAULT = 10
const CHUNK_MAX = 40

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

export async function GET(req: NextRequest) {
  const denied = await adminGate()
  if (denied) return denied

  const payload = await getPayload({ config })
  const dir = mediaDir(payload)
  const preview = req.nextUrl.searchParams.get('preview')

  // Показ: знак накладывается в память и отдаётся картинкой — в хранилище
  // ничего не меняется, можно спокойно смотреть на разных фото. Накладываем на
  // чистый кадр, если он уже сохранён: так видно, как фото будет выглядеть
  // после разметки
  if (preview) {
    // Идентификатор из админки или имя файла — как удобнее смотреть
    const doc: PhotoDoc | null | undefined = /^\d+$/.test(preview)
      ? ((await payload
        .findByID({ collection: 'media', id: Number(preview), overrideAccess: true, depth: 0 })
        .catch(() => null)) as PhotoDoc | null)
      : ((
        await payload.find({
          collection: 'media',
          where: { filename: { equals: preview } },
          limit: 1,
          overrideAccess: true,
          depth: 0,
        })
      ).docs[0] as PhotoDoc | undefined)
    if (!doc?.filename) return NextResponse.json({ error: 'Фото не найдено' }, { status: 404 })
    const clean = await fs.readFile(path.join(dir, MASTER_DIR, doc.filename)).catch(() => null)
    const source = clean ?? (await fs.readFile(path.join(dir, doc.filename)).catch(() => null))
    if (!source) return NextResponse.json({ error: 'Файла нет в хранилище' }, { status: 404 })
    const marked = await applyWatermark(source, doc.mimeType || '', doc.filename)
    if (marked.status !== 'done') {
      return NextResponse.json({ error: `Не удалось наложить знак (${marked.status})` }, { status: 422 })
    }
    return new NextResponse(new Uint8Array(marked.data), {
      headers: { 'Content-Type': marked.mimetype, 'Cache-Control': 'no-store' },
    })
  }

  const [total, marked, waiting, avatars, masters, backup, disk] = await Promise.all([
    payload.count({ collection: 'media', overrideAccess: true }),
    payload.count({ collection: 'media', where: markedWhere(), overrideAccess: true }),
    payload.find({ collection: 'media', where: pendingWhere(), limit: 0, overrideAccess: true }),
    payload.count({ collection: 'media', where: { wm: { equals: WATERMARK_AVATAR } }, overrideAccess: true }),
    dirStats(path.join(dir, MASTER_DIR)),
    dirStats(path.join(dir, BACKUP_DIR)),
    diskSpace(dir),
  ])

  return NextResponse.json({
    markVersion: WATERMARK_VERSION,
    total: total.totalDocs,
    marked: marked.totalDocs,
    waiting: waiting.totalDocs,
    avatars: avatars.totalDocs,
    masters,
    backup,
    disk,
  })
}

export async function POST(req: NextRequest) {
  const denied = await adminGate()
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { mode?: string; limit?: number }
  const mode = body.mode === 'restore' ? 'restore' : body.mode === 'repair' ? 'repair' : body.mode === 'apply' ? 'apply' : null
  if (!mode) return NextResponse.json({ error: 'mode: apply, repair или restore' }, { status: 400 })
  const limit = Math.min(CHUNK_MAX, Math.max(1, Math.round(Number(body.limit) || CHUNK_DEFAULT)))

  const payload = await getPayload({ config })
  const dir = mediaDir(payload)
  const started = Date.now()
  const doneIds: number[] = []
  const failed: Array<{ id: number; file: string; status: string; reason?: string }> = []
  let sizesWritten = 0
  let stripped = 0

  // Что берём в работу: ждущие знака (apply), размеченные прошлой версией —
  // чтобы пересобрать размеры (repair), или размеченные — на откат (restore).
  // Имена чистых кадров совпадают с именами файлов в хранилище, поэтому откат
  // идёт по документам media, а не по списку папки
  const where =
    mode === 'restore' ? { wm: { equals: WATERMARK_VERSION } } : mode === 'repair' ? markedWhere() : pendingWhere()
  const found = await payload.find({ collection: 'media', where, limit, sort: 'id', overrideAccess: true, depth: 0 })

  for (const doc of found.docs as unknown as PhotoDoc[]) {
    const result =
      mode === 'restore'
        ? await restorePhoto(payload, doc)
        : await processPhoto({ payload, doc, legacy: true, rebuild: mode === 'repair' })
    if (result.status === 'marked') {
      doneIds.push(doc.id)
      sizesWritten += result.sizes
      stripped += result.stripped.length
    } else {
      failed.push({ id: doc.id, file: result.file, status: result.status, reason: result.reason })
    }
  }

  const left = await payload.find({ collection: 'media', where: pendingWhere(), limit: 0, overrideAccess: true })
  const disk = await diskSpace(dir)
  return NextResponse.json({
    mode,
    limit,
    done: doneIds.length,
    doneIds,
    failed,
    stripped,
    sizesWritten,
    waiting: left.totalDocs,
    disk,
    ms: Date.now() - started,
  })
}
