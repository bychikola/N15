// ---------------------------------------------------------------------------
// «Юридическая экспертиза объекта» — серверный слой хранения и доступов.
//
// Коллекции legal-documents (закрытое хранилище исходных файлов: выписка
// ЕГРН, паспорт собственника, правоустанавливающие документы) и legal-reports
// (отчёты) имеют полностью закрытые access-правила — все операции идут через
// маршруты /api/objects/legal/* (см. app/api/objects/legal), которые
// проверяют права здесь. Права — только у администратора: документы, выписка
// ЕГРН, паспорт, отчёт и PDF сотрудникам (агентам), клиентам и сайту не
// показываются вовсе. Паспорт и отчёт клиенту не показываются.
// ---------------------------------------------------------------------------

import type { Payload } from 'payload'
import {
  LEGAL_ENGINE_VERSION,
  runLegalExpertise,
  sanitizeManualMarks,
  type LegalDocMeta,
  type LegalManualMarks,
  type LegalReportData,
  type LegalReportExtras,
} from './legal-check'
import { parseEgrnExtract, type EgrnExtract } from './legal-egrn'

export interface LegalActor {
  id: number
  name: string
  email: string
  role: string
}

/** Кому открыт отчёт и PDF экспертизы: только администратору */
export function canReadLegalReport(actor: Pick<LegalActor, 'role'> | null | undefined): boolean {
  return !!actor && actor.role === 'admin'
}

/** ids профилей агентов (коллекция agents), привязанных к пользователю */
async function myAgentIds(payload: Payload, userId: number): Promise<Set<number>> {
  const ids = new Set<number>()
  try {
    const { docs } = await payload.find({
      collection: 'agents',
      where: { user: { equals: userId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const agent of docs) {
      if (typeof agent.id === 'number') ids.add(agent.id)
    }
  } catch {
    // нет профилей — считаем, что своих объектов у пользователя нет
  }
  return ids
}

/** id объектов, которые ведёт пользователь (через свои профили агентов) */
export async function myObjectIds(payload: Payload, userId: number): Promise<Set<number>> {
  const ids = new Set<number>()
  const agentIds = await myAgentIds(payload, userId)
  if (!agentIds.size) return ids
  try {
    const { docs } = await payload.find({
      collection: 'objects',
      where: { agent: { in: [...agentIds] } },
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    })
    for (const o of docs) {
      if (typeof o.id === 'number') ids.add(o.id)
    }
  } catch {
    // база объектов недоступна — своих объектов нет
  }
  return ids
}

/**
 * Может ли сотрудник работать с документами и экспертизой объекта (смотреть
 * документы, загружать их, запускать проверку): только администратор.
 * Выписка ЕГРН, паспорт собственника, правоустанавливающие документы и отчёт
 * экспертизы — закрытые сведения, сотрудникам они не показываются вовсе,
 * независимо от того, кто ведёт объект.
 */
export function canManageObjectLegal(actor: LegalActor): boolean {
  return actor.role === 'admin'
}

/** Метаданные документов объекта (без содержимого — data никогда не читаем) */
export async function getObjectDocs(payload: Payload, objectId: number): Promise<LegalDocMeta[]> {
  const { docs } = await payload.find({
    collection: 'legal-documents',
    where: { object: { equals: objectId } },
    sort: 'createdAt',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((d) => {
    const doc = d as unknown as {
      id: number
      docType?: string
      docDate?: string | null
      createdAt?: string
      filename?: string
      size?: number
    }
    return {
      id: doc.id,
      docType: doc.docType || 'other',
      docDate: doc.docDate || null,
      createdAt: doc.createdAt || new Date().toISOString(),
      fileName: doc.filename || '',
      size: doc.size || 0,
    }
  })
}

/** Полный документ (с содержимым) для скачивания — только после проверки прав */
export async function getLegalDocFile(payload: Payload, docId: number) {
  const doc = await payload
    .findByID({ collection: 'legal-documents', id: docId, overrideAccess: true })
    .catch(() => null)
  return doc as unknown as {
    id: number
    object?: number
    docType?: string
    filename?: string
    mimeType?: string
    size?: number
    docDate?: string | null
    notes?: string
    data?: string
  } | null
}

/** Содержимое последнего документа нужного типа (только внутри сервера) */
async function getLatestDocData(
  payload: Payload,
  objectId: number,
  docType: string,
): Promise<{ data: Buffer; mimeType: string | null; fileName: string | null } | null> {
  const { docs } = await payload
    .find({
      collection: 'legal-documents',
      where: { object: { equals: objectId }, docType: { equals: docType } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[] }))
  const doc = docs[0] as unknown as { data?: string; mimeType?: string; filename?: string } | undefined
  if (!doc?.data) return null
  return { data: Buffer.from(String(doc.data), 'base64'), mimeType: doc.mimeType || null, fileName: doc.filename || null }
}

/**
 * Разбор загруженной выписки ЕГРН. XML Росреестра читается автоматически
 * (см. legal-egrn.ts), PDF и сканы система не распознаёт и сообщает об этом
 * в отчёте — результат не имитируется.
 */
export async function loadEgrnExtract(payload: Payload, objectId: number): Promise<EgrnExtract | null> {
  const file = await getLatestDocData(payload, objectId, 'egrn')
  if (!file) return null
  try {
    return parseEgrnExtract(file)
  } catch {
    return {
      recognized: false,
      format: 'unknown',
      reason: 'файл выписки не удалось прочитать — данные сверяет юрист по документу',
      owners: [],
      encumbrances: [],
      encumbrancesAbsent: false,
      notes: [],
    }
  }
}

/** Отчёт по объекту (последний сформированный) */
export async function getReportByObject(payload: Payload, objectId: number) {
  const { docs } = await payload.find({
    collection: 'legal-reports',
    where: { object: { equals: objectId } },
    sort: '-checkedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] as Record<string, unknown> | undefined
}

/**
 * Формирование и сохранение отчёта экспертизы: движок (legal-check.ts)
 * проверяет объект по карточке, загруженной выписке ЕГРН и отметкам юриста;
 * результат хранится в закрытой коллекции legal-reports (один отчёт на
 * объект, перезапуск обновляет его).
 *
 * Запускает проверку только администратор (см. app/api/objects/legal/run),
 * он же заполняет отметки ручных проверок — их и принимает input.manual.
 */
export async function buildAndStoreReport(
  payload: Payload,
  objectId: number,
  input: { cadastralNumber?: string; manual?: LegalManualMarks },
  checkedBy: string,
  now?: Date,
): Promise<LegalReportData> {
  const objectDoc = (await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as {
    id: number
    title?: string
    type?: string
    category?: string
    area?: number | null
    address?: { city?: string | null; locality?: string | null; street?: string | null; house?: string | null; apartment?: string | null } | null
    cadastralNumber?: string | null
    ownerName?: string | null
  } | null
  if (!objectDoc) throw new Error('Объект не найден')

  const [docs, egrn] = await Promise.all([
    getObjectDocs(payload, objectId),
    loadEgrnExtract(payload, objectId),
  ])

  const data = runLegalExpertise({
    object: {
      id: objectDoc.id,
      title: objectDoc.title || '',
      type: objectDoc.type,
      category: objectDoc.category,
      area: objectDoc.area,
      address: objectDoc.address,
      cadastralNumber: objectDoc.cadastralNumber,
      ownerName: objectDoc.ownerName,
    },
    docs,
    egrn,
    cadastralNumber: input.cadastralNumber,
    manual: input.manual,
    now,
  })
  data.checkedBy = checkedBy

  // Один отчёт на объект: перезапуск проверки обновляет прежний
  const existing = await getReportByObject(payload, objectId)

  const store = {
    object: objectId,
    status: data.status,
    checkedAt: data.checkedAt,
    docsActualAt: data.docsActualAt,
    checkedBy: data.checkedBy,
    items: data.items.map((i) => ({ key: i.key, title: i.title, status: i.status, note: i.note || null })),
    findings: data.findings.map((fnd) => ({ level: fnd.level, itemKey: fnd.itemKey, text: fnd.text })),
    missingDocs: data.missingDocs,
    recommendations: data.recommendations,
    sources: data.sources.map((s) => ({ name: s.name, url: s.url })),
    docs: data.docs.map((d) => ({
      id: d.id,
      docType: d.docType,
      docTypeLabel: d.docTypeLabel,
      docDate: d.docDate,
      fileName: d.fileName,
      size: d.size,
    })),
    // Сведения об объекте, собственнике, разборе выписки и отметках юриста —
    // в JSON-поле facts (схема коллекции не меняется)
    facts: data.extras,
    engineVersion: data.engineVersion,
    // Снимок карточки на момент проверки — для шапки отчёта (печатается в PDF
    // даже после правок карточки)
    objectTitle: data.objectTitle,
    objectAddress: data.objectAddress,
    category: data.category,
    dealType: data.dealType,
  }

  if (existing) {
    await payload.update({
      collection: 'legal-reports',
      id: existing.id as number,
      data: store,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'legal-reports',
      data: store,
      overrideAccess: true,
    })
  }
  return data
}

/** Дополнительные сведения отчёта из JSON-поля facts (устойчиво к старым записям) */
function readExtras(value: unknown): LegalReportExtras {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const str = (v: unknown): string => (v == null ? '' : String(v))
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const egrnSrc = src.egrn && typeof src.egrn === 'object' ? (src.egrn as Record<string, unknown>) : {}
  const egrnStatus = str(egrnSrc.status)
  const cadastralSource = str(src.cadastralSource)
  return {
    cadastralNumber: str(src.cadastralNumber),
    cadastralSource: cadastralSource === 'card' || cadastralSource === 'input' || cadastralSource === 'egrn' ? cadastralSource : 'none',
    ownerCard: str(src.ownerCard),
    ownersEgrn: arr(src.ownersEgrn).map(str),
    rightType: str(src.rightType),
    basis: str(src.basis),
    addressEgrn: str(src.addressEgrn),
    areaEgrn: str(src.areaEgrn),
    areaCard: typeof src.areaCard === 'number' ? src.areaCard : null,
    encumbrances: arr(src.encumbrances).map(str),
    egrn: {
      status: egrnStatus === 'parsed' || egrnStatus === 'unrecognized' ? egrnStatus : 'missing',
      fileName: str(egrnSrc.fileName),
      format: str(egrnSrc.format),
      reason: str(egrnSrc.reason),
      docDate: egrnSrc.docDate ? str(egrnSrc.docDate) : null,
      notes: arr(egrnSrc.notes).map(str),
    },
    manual: sanitizeManualMarks(src.manual),
    autoChecks: arr(src.autoChecks).map(str),
    autoUnavailable: arr(src.autoUnavailable).map(str),
  }
}

/** Запись из коллекции legal-reports → данные отчёта (для PDF и превью) */
export function reportRecordToData(rec: Record<string, unknown>): LegalReportData {
  const asStr = (v: unknown): string => (v == null ? '' : String(v))
  const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const items = asArr(rec.items).map((it) => {
    const r = it as Record<string, unknown>
    return {
      key: asStr(r.key),
      title: asStr(r.title),
      status: (['ok', 'issues', 'risk', 'manual'].includes(asStr(r.status)) ? asStr(r.status) : 'manual') as LegalReportData['status'],
      note: r.note == null || r.note === '' ? undefined : asStr(r.note),
    }
  })
  return {
    objectId: Number(rec.object),
    objectTitle: asStr(rec.objectTitle),
    objectAddress: asStr(rec.objectAddress),
    category: asStr(rec.category),
    dealType: rec.dealType === 'rent' ? 'rent' : 'sale',
    status: (['ok', 'issues', 'risk', 'manual'].includes(asStr(rec.status)) ? asStr(rec.status) : 'manual') as LegalReportData['status'],
    checkedAt: asStr(rec.checkedAt),
    docsActualAt: rec.docsActualAt ? asStr(rec.docsActualAt) : null,
    checkedBy: asStr(rec.checkedBy),
    items,
    findings: asArr(rec.findings).map((f) => {
      const r = f as Record<string, unknown>
      return {
        level: (['info', 'warn', 'risk'].includes(asStr(r.level)) ? asStr(r.level) : 'info') as LegalReportData['findings'][number]['level'],
        itemKey: asStr(r.itemKey),
        text: asStr(r.text),
      }
    }),
    missingDocs: asArr(rec.missingDocs).map(asStr),
    recommendations: asArr(rec.recommendations).map(asStr),
    sources: asArr(rec.sources).map((s) => {
      const r = s as Record<string, unknown>
      return { name: asStr(r.name), url: asStr(r.url) }
    }),
    docs: asArr(rec.docs).map((d) => {
      const r = d as Record<string, unknown>
      return {
        id: Number(r.id),
        docType: asStr(r.docType),
        docTypeLabel: asStr(r.docTypeLabel),
        docDate: r.docDate ? asStr(r.docDate) : null,
        fileName: asStr(r.fileName),
        size: Number(r.size) || 0,
      }
    }),
    extras: readExtras(rec.facts),
    engineVersion: Number(rec.engineVersion) || LEGAL_ENGINE_VERSION,
  }
}
