import type { CollectionConfig } from 'payload'
import {
  AD_FORMAT_OPTIONS,
  AD_PAYMENT_OPTIONS,
  AD_STATUS_LABELS,
  AD_STATUS_OPTIONS,
  adAddDays,
  adIso,
  adMarking,
  adPublishIssue,
  adValue,
  advertiserInfo,
  type AdLike,
  type AdvertiserLike,
} from '@/lib/advertising'

/**
 * «Рекламные материалы» — само объявление на сайте: текст, ссылка, картинка,
 * срок размещения, стоимость и статус оплаты (модуль «Реклама на сайте»,
 * см. src/lib/advertising.ts).
 *
 * Публикация (status = «Опубликовано») проходит только проверку размещения:
 * рекламодатель подтверждён, содержание проверено, материал оплачен, заданы
 * срок и идентификатор интернет-рекламы (erid). При публикации в материал
 * автоматически добавляется маркировка — пометка «Реклама», сведения о
 * рекламодателе и данные интернет-рекламы (группа «Маркировка»).
 * Кнопки публикации и снятия — в разделе CRM «Реклама» (маршрут
 * /api/advertising/publish-manage), там же виден журнал.
 */

/** id связи «Рекламодатель» из данных хука (число, строка или объект) */
const advertiserIdOf = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  if (v && typeof v === 'object') {
    const id = (v as { id?: unknown; value?: unknown }).id ?? (v as { value?: unknown }).value
    return advertiserIdOf(id)
  }
  return null
}

export const Advertisements: CollectionConfig = {
  slug: 'advertisements',
  labels: { singular: 'Рекламный материал', plural: 'Рекламные материалы' },
  admin: {
    useAsTitle: 'title',
    group: 'Реклама',
    defaultColumns: ['title', 'advertiser', 'status', 'paymentStatus', 'cost', 'startDate', 'endDate'],
    description:
      'Материал показывается на сайте только со статусом «Опубликовано» и внутри оплаченного срока. Маркировка «Реклама» добавляется автоматически.',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [
      // Пустые select-поля из форм и API: '' — не вариант выбора, приводим
      // к null до проверки полей (как в коллекции objects)
      ({ data }) => {
        if (!data) return data
        for (const key of ['format', 'paymentStatus', 'status'] as const) {
          if (typeof data[key] === 'string' && !data[key].trim()) {
            data[key] = null
          }
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        const prev = (originalDoc || {}) as Record<string, unknown>

        // Срок размещения: дата окончания считается от даты начала и срока
        // в днях, если окончание не задали вручную
        const startDate = adIso(data.startDate !== undefined ? data.startDate : prev.startDate)
        const termDays = Number(data.termDays !== undefined ? data.termDays : prev.termDays)
        const endDate = adIso(data.endDate !== undefined ? data.endDate : prev.endDate)
        if (startDate && !endDate && Number.isFinite(termDays) && termDays > 0) {
          data.endDate = adAddDays(startDate, termDays)
        }

        const status = String((data.status !== undefined ? data.status : prev.status) || '')
        const wasPublished = String(prev.status || '') === 'published'

        // Снимаем с публикации: маркировку и дату публикации оставляем как
        // есть (это история показа), меняется только статус и журнал
        if (wasPublished && status !== 'published') {
          const log = Array.isArray(data.log) ? data.log : Array.isArray(prev.log) ? [...(prev.log as unknown[])] : []
          log.push({
            event: 'unpublish',
            at: new Date().toISOString(),
            by: req.user?.email || 'админка',
          })
          data.log = log
          return data
        }

        if (status !== 'published') return data

        // Публикация: тянем карточку рекламодателя и проверяем условия
        const adId = advertiserIdOf(data.advertiser !== undefined ? data.advertiser : prev.advertiser)
        let advertiser: AdvertiserLike | null = null
        if (adId) {
          try {
            advertiser = (await req.payload.findByID({
              collection: 'advertisers',
              id: adId,
              depth: 0,
              overrideAccess: true,
            })) as unknown as AdvertiserLike
          } catch {
            advertiser = null
          }
        }

        // Значения собираем из изменённых полей и прежней записи: в админке
        // сохраняется только изменённое
        const merged = { ...prev, ...data } as Record<string, unknown>
        const ad: AdLike = {
          title: (adValue(merged.title) || '') as string,
          status: 'published',
          paymentStatus: adValue(merged.paymentStatus),
          cost: typeof merged.cost === 'number' ? merged.cost : null,
          startDate: adIso(merged.startDate),
          endDate: adIso(merged.endDate),
          termDays: typeof merged.termDays === 'number' ? merged.termDays : null,
          contentChecked: Boolean(merged.contentChecked),
          erid: adValue(merged.erid),
        }
        const issue = adPublishIssue(ad, advertiser)
        if (issue) {
          throw new Error(`Нельзя опубликовать материал: ${issue}`)
        }

        // Маркировка собирается заново на каждой публикации: реквизиты
        // рекламодателя и erid могли измениться. Дата публикации — первая
        const markedAt = wasPublished
          ? ((prev.marking as { markedAt?: string } | undefined)?.markedAt || new Date().toISOString())
          : new Date().toISOString()
        data.marking = adMarking(ad, advertiser, markedAt)
        data.publishedAt = data.publishedAt || prev.publishedAt || markedAt
        // Сведения о рекламодателе дублируем в материал: сайт показывает
        // материал, даже если карточка рекламодателя потом изменится
        data.advertiserInfo = advertiserInfo(advertiser)

        const log = Array.isArray(data.log) ? data.log : Array.isArray(prev.log) ? [...(prev.log as unknown[])] : []
        // Отмечаем каждое событие: первая публикация — publish, повторное
        // сохранение уже опубликованного — update
        log.push({
          event: wasPublished ? 'update' : 'publish',
          at: new Date().toISOString(),
          by: req.user?.email || 'админка',
        })
        data.log = log
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название материала',
      required: true,
      admin: { description: 'Служебное название — как материал называть в списке' },
    },
    {
      name: 'advertiser',
      type: 'relationship',
      relationTo: 'advertisers',
      label: 'Рекламодатель',
      required: true,
      index: true,
      admin: {
        description: 'Обязательно: без подтверждённого рекламодателя материал не публикуется',
      },
    },
    {
      name: 'format',
      type: 'select',
      label: 'Формат',
      options: AD_FORMAT_OPTIONS,
      defaultValue: 'card',
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Текст материала',
      admin: { description: 'Что видит посетитель. Содержание проверяется до публикации' },
    },
    {
      name: 'link',
      type: 'text',
      label: 'Ссылка',
      admin: { description: 'Куда ведёт материал (сайт рекламодателя или его страница)' },
    },
    {
      name: 'linkLabel',
      type: 'text',
      label: 'Подпись ссылки',
      admin: { description: 'Например: «Перейти на сайт». Пусто — покажем «Подробнее»' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Изображение',
    },
    {
      type: 'collapsible',
      label: 'Срок размещения',
      fields: [
        {
          name: 'termDays',
          type: 'number',
          label: 'Срок размещения, дней',
          min: 1,
          admin: {
            description:
              'Если дата окончания не задана, она посчитается от даты начала. Договорной срок — в заметке',
          },
        },
        {
          name: 'startDate',
          type: 'date',
          label: 'Дата начала размещения',
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
        {
          name: 'endDate',
          type: 'date',
          label: 'Дата окончания размещения',
          admin: {
            date: { pickerAppearance: 'dayOnly' },
            description: 'После этой даты материал автоматически исчезает с сайта',
          },
        },
        {
          name: 'termNote',
          type: 'text',
          label: 'Заметка о сроке',
          admin: { description: 'Например: «продлено до конца месяца по письму от 05.09»' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Стоимость и оплата',
      fields: [
        {
          name: 'cost',
          type: 'number',
          label: 'Стоимость размещения, ₽',
          min: 0,
        },
        {
          name: 'paymentStatus',
          type: 'select',
          label: 'Статус оплаты',
          options: AD_PAYMENT_OPTIONS,
          defaultValue: 'unpaid',
          admin: { description: 'Публикация возможна только после оплаты' },
        },
        {
          name: 'paidAt',
          type: 'date',
          label: 'Дата оплаты',
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
        {
          name: 'paymentNote',
          type: 'text',
          label: 'Заметка об оплате',
          admin: { description: 'Номер счёта, договор, кто оплатил' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Проверка содержания',
      fields: [
        {
          name: 'contentChecked',
          type: 'checkbox',
          label: 'Содержание проверено',
          defaultValue: false,
          admin: {
            description:
              'Отмечается после проверки материала: достоверность, законность, отсутствие запрещённых сведений',
          },
        },
        {
          name: 'contentCheckedBy',
          type: 'text',
          label: 'Кто проверил',
        },
        {
          name: 'contentNote',
          type: 'textarea',
          label: 'Замечания по содержанию',
        },
      ],
    },
    {
      name: 'erid',
      type: 'text',
      label: 'Идентификатор интернет-рекламы (erid)',
      admin: {
        description:
          'Выдаёт оператор рекламных данных (ОРД). Обязателен для публикации — попадает в маркировку материала',
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: AD_STATUS_OPTIONS,
      defaultValue: 'draft',
      index: true,
      admin: {
        description: `«${AD_STATUS_LABELS.published}» ставится после проверки условий: рекламодатель, содержание, оплата, срок, erid. Кнопки публикации и снятия — в CRM, раздел «Реклама»`,
      },
    },
    {
      name: 'marking',
      type: 'group',
      label: 'Маркировка (заполняется автоматически)',
      admin: {
        readOnly: true,
        description:
          'Пометка «Реклама», сведения о рекламодателе и данные интернет-рекламы. Собирается при публикации, вручную не редактируется',
      },
      fields: [
        { name: 'label', type: 'text', label: 'Пометка' },
        { name: 'advertiserInfo', type: 'text', label: 'Сведения о рекламодателе' },
        { name: 'erid', type: 'text', label: 'Идентификатор интернет-рекламы (erid)' },
        { name: 'platform', type: 'text', label: 'Площадка размещения' },
        { name: 'markedAt', type: 'date', label: 'Когда размечено', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      name: 'advertiserInfo',
      type: 'text',
      label: 'Сведения о рекламодателе (копия на момент публикации)',
      admin: { readOnly: true },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата публикации',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'log',
      type: 'array',
      label: 'Журнал',
      labels: { singular: 'Событие', plural: 'События' },
      admin: {
        readOnly: true,
        description: 'Публикации, обновления и снятия — с датой и тем, кто выполнил',
      },
      fields: [
        { name: 'event', type: 'text', label: 'Событие' },
        { name: 'at', type: 'date', label: 'Когда', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'by', type: 'text', label: 'Кто' },
      ],
    },
  ],
}
