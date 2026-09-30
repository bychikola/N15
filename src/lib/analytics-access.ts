/**
 * Журнал доступа к аналитике посетителей (ст. 19 152-ФЗ): разделы CRM
 * «Посетители» и «Интерес к объектам» открыты только администратору, и каждый
 * такой просмотр записывается в коллекцию analytics-access — видно, кто и
 * когда смотрел данные.
 *
 * Запись не должна мешать отчёту: если журнал не записался (например, таблицы
 * ещё нет), причина уходит в лог контейнера, а страница открывается.
 */
import type { Payload } from 'payload'

export interface AnalyticsAccessInput {
  userId?: number | string | null
  userName?: string | null
  /** Что открыли — та же формулировка, что в меню CRM */
  section: string
  /** Подробность: отчёт за период или карточка конкретного посетителя */
  note?: string
}

export async function logAnalyticsAccess(payload: Payload, input: AnalyticsAccessInput): Promise<void> {
  try {
    await payload.create({
      collection: 'analytics-access',
      data: {
        section: input.section.slice(0, 200),
        note: input.note ? input.note.slice(0, 300) : undefined,
        user: input.userId != null ? Number(input.userId) : undefined,
        userName: (input.userName || '').trim() || undefined,
      },
      overrideAccess: true,
    })
  } catch (e) {
    console.error('[analytics-access] не удалось записать доступ:', e)
  }
}

/** Последние записи журнала — для блока «Журнал доступа» в отчёте */
export interface AnalyticsAccessRow {
  id: number
  section?: string | null
  userName?: string | null
  note?: string | null
  createdAt?: string | null
}

export async function loadAnalyticsAccess(payload: Payload, limit = 10): Promise<AnalyticsAccessRow[]> {
  try {
    const res = await payload.find({
      collection: 'analytics-access',
      sort: '-createdAt',
      limit,
      depth: 0,
      overrideAccess: true,
      select: { section: true, userName: true, note: true, createdAt: true },
    })
    return res.docs as unknown as AnalyticsAccessRow[]
  } catch (e) {
    console.error('[analytics-access] не удалось прочитать журнал:', e)
    return []
  }
}
