// ---------------------------------------------------------------------------
// «Юридическая проверка объекта» — серверный слой хранения и доступов.
//
// Коллекции legal-documents (закрытое хранилище исходных файлов) и
// legal-reports (отчёты) имеют полностью закрытые access-правила — все
// операции идут через маршруты /api/objects/legal/* (см. app/api/objects/legal),
// которые проверяют права здесь. Отчёт читает только аккаунт Ланы Козыревой
// (см. LEGAL_OFFICER_EMAIL в legal-check.ts); документы — сотрудники, которые
// ведут объект, администраторы и Лана; клиентам и сайту — ничего.
// ---------------------------------------------------------------------------

import type { Payload } from 'payload'
import {
  LEGAL_OFFICER_EMAIL,
  runLegalCheck,
  sanitizeFacts,
  type LegalDocMeta,
  type LegalFacts,
  type LegalReportData,
} from './legal-check'

export interface LegalActor {
  id: number
  name: string
  email: string
  role: string
}

export function isLegalOfficer(actor: Pick<LegalActor, 'email'> | null | undefined): boolean {
  return !!actor && actor.email === LEGAL_OFFICER_EMAIL
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
 * Может ли сотрудник работать с документами и проверкой объекта:
 * администратор — с любым, Лана (юр. проверки) — с любым, агент — только
 * с объектами своего профиля (как update-доступ коллекции Objects).
 */
export async function canManageObjectLegal(payload: Payload, actor: LegalActor, objectId: number): Promise<boolean> {
  if (actor.role === 'admin') return true
  if (isLegalOfficer(actor)) return true
  if (actor.role !== 'agent') return false
  const doc = await payload
    .findByID({ collection: 'objects', id: objectId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const agentId = (doc as { agent?: unknown } | null)?.agent
  const agentNum = typeof agentId === 'number' ? agentId : Number(agentId)
  if (!Number.isFinite(agentNum)) return false
  const mine = await myAgentIds(payload, actor.id)
  return mine.has(agentNum)
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
 * Формирование и сохранение отчёта: движок (legal-check.ts) считает статусы
 * по документам объекта и внесённым сведениям; результат хранится в закрытой
 * коллекции legal-reports (один отчёт на объект, перезапуск обновляет его).
 */
export async function buildAndStoreReport(
  payload: Payload,
  objectId: number,
  facts: LegalFacts,
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

  const docs = await getObjectDocs(payload, objectId)
  const data = runLegalCheck({
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
    facts: sanitizeFacts(facts),
    now,
  })
  data.checkedBy = checkedBy

  const existing = await payload
    .find({
      collection: 'legal-reports',
      where: { object: { equals: objectId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs[0])
    .catch(() => undefined)

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
    facts: data.facts,
    engineVersion: data.engineVersion,
    // Снимок карточки на момент проверки — для шапки отчёта (см. поля
    // коллекции legal-reports; печатается в PDF даже после правок карточки)
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
      return { name: asStr(r.name), url: asStr(r.url), items: asArr(r.items).map(asStr) }
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
    facts: (rec.facts && typeof rec.facts === 'object' ? rec.facts : {}) as LegalFacts,
    engineVersion: Number(rec.engineVersion) || 1,
  }
}
