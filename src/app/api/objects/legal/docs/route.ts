import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import { canManageObjectLegal, getObjectDocs } from '@/lib/legal-service'
import { LEGAL_DOC_TYPES } from '@/lib/legal-check'

// Документы юридической экспертизы объекта (закрытое хранилище, см.
// коллекцию legal-documents). Файлы живут base64 в БД — в файловую систему и
// на сайт не попадают. Доступ: агент, который ведёт объект; администратор;
// Лана (юр. экспертизы). Метаданные списком — GET, загрузка файла — POST
// (multipart).
//
// Выписка ЕГРН принимается и XML-файлом Росреестра (его система разбирает
// автоматически, см. legal-egrn.ts), и PDF/сканом — тогда данные сверяет
// юрист по документу. В примечании запрещены паспортные данные
// (серия/номер), файл паспорта хранится только для сверки личности и в
// отчёт не переносится.

/** Ограничение размера одного файла */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/** Типы файлов, которые принимаем (сканы/фото документов и офисные файлы) */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  // XML-выписка ЕГРН из личного кабинета Росреестра
  'application/xml',
  'text/xml',
])

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DOC_TYPE_VALUES = new Set(LEGAL_DOC_TYPES.map((d) => d.value))

/** Имя файла без пути и служебных символов */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'document'
  const clean = base.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').trim().slice(0, 180)
  return clean || 'document'
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    const objectId = Number(req.nextUrl.searchParams.get('objectId') || 0)
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!(await canManageObjectLegal(payload, actor, objectId))) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }
    const docs = await getObjectDocs(payload, objectId)
    return NextResponse.json({ docs })
  } catch (error) {
    console.error('Legal docs GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Нужна multipart-форма' }, { status: 400 })
    }
    const objectId = Number(String(form.get('objectId') || ''))
    if (!Number.isFinite(objectId) || objectId <= 0) {
      return NextResponse.json({ error: 'Не указан объект' }, { status: 400 })
    }
    const docType = String(form.get('docType') || '').trim()
    if (!DOC_TYPE_VALUES.has(docType as (typeof LEGAL_DOC_TYPES)[number]['value'])) {
      return NextResponse.json({ error: 'Неизвестный тип документа' }, { status: 400 })
    }
    const docDate = String(form.get('docDate') || '').trim()
    if (docDate && !DATE_RE.test(docDate)) {
      return NextResponse.json({ error: 'Дата документа в формате ГГГГ-ММ-ДД' }, { status: 400 })
    }
    const notes = String(form.get('notes') || '').trim().slice(0, 2000)
    if (/(серия|серии|номер паспорта|паспорт:? ?\d)/i.test(notes)) {
      return NextResponse.json(
        { error: 'В примечании нельзя указывать паспортные данные (серию/номер) — они не хранятся в системе' },
        { status: 400 },
      )
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Файл не приложен' }, { status: 400 })
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Файл пустой' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Файл больше 20 МБ — загрузите документ меньшего размера' }, { status: 400 })
    }
    // Браузеры часто не определяют тип .xml — принимаем XML-выписку по расширению
    const mime = String(file.type || '').toLowerCase().split(';')[0].trim() ||
      (/\.xml$/i.test(file.name) ? 'application/xml' : '')
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: 'Неподдерживаемый тип файла. Принимаются: PDF, изображения (сканы/фото), XML-выписка ЕГРН, Word, Excel, TXT' },
        { status: 400 },
      )
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, name: user.name, email: user.email, role: user.role }
    if (!(await canManageObjectLegal(payload, actor, objectId))) {
      return NextResponse.json({ error: 'Нет доступа к документам объекта' }, { status: 403 })
    }

    const dataBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const created = await payload.create({
      collection: 'legal-documents',
      data: {
        object: objectId,
        docType,
        docDate: docDate || null,
        notes: notes || null,
        filename: cleanFileName(file.name),
        mimeType: mime,
        size: file.size,
        uploadedBy: actor.id,
        data: dataBase64,
      },
      overrideAccess: true,
      depth: 0,
    })
    return NextResponse.json({
      doc: {
        id: created.id,
        docType,
        docDate: docDate || null,
        fileName: cleanFileName(file.name),
        size: file.size,
        uploadedByName: actor.name,
      },
    })
  } catch (error) {
    console.error('Legal docs POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
