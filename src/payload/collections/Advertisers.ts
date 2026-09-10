import type { CollectionConfig } from 'payload'
import {
  ADVERTISER_KIND_LABELS,
  ADVERTISER_KIND_OPTIONS,
  ADVERTISER_STATUS_OPTIONS,
} from '@/lib/advertising'

/**
 * «Рекламодатели» — карточки компаний и людей, размещающих рекламу на сайте
 * Н15 (модуль «Реклама на сайте», см. src/lib/advertising.ts).
 *
 * Подтверждение рекламодателя (status = «Подтверждён») — обязательное условие
 * публикации его материалов: без него материал не публикуется ни из админки,
 * ни из CRM (проверку делает adPublishIssue). Сведения из карточки попадают
 * в пометку «Реклама» на опубликованном материале, поэтому ИНН/ОГРН (или сайт)
 * должны быть заполнены до подтверждения.
 */
export const Advertisers: CollectionConfig = {
  slug: 'advertisers',
  labels: { singular: 'Рекламодатель', plural: 'Рекламодатели' },
  admin: {
    useAsTitle: 'name',
    group: 'Реклама',
    defaultColumns: ['name', 'kind', 'inn', 'status', 'contactName'],
    description:
      'Рекламодатели сайта. Материал публикуется только после подтверждения рекламодателя.',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [
      // Подтверждённый рекламодатель без наименования и реквизитов не даёт
      // собрать сведения в пометке «Реклама» — предупреждаем сразу при
      // подтверждении, а не при первой публикации материала
      ({ data }) => {
        if (!data) return data
        if (data.status === 'confirmed' && !String(data.name || '').trim()) {
          throw new Error('Нельзя подтвердить рекламодателя без наименования')
        }
        if (data.status === 'confirmed' && !data.inn && !data.ogrn && !data.site) {
          throw new Error('Для подтверждения укажите ИНН или ОГРН (либо сайт рекламодателя)')
        }
        return data
      },
    ],
    beforeChange: [
      // Когда рекламодателя подтвердили — фиксируем дату: она видна в карточке
      // и попадает в журнал материалов
      ({ data, originalDoc }) => {
        if (!data) return data
        const prev = (originalDoc || {}) as { status?: string; confirmedAt?: string }
        if (data.status === 'confirmed' && prev.status !== 'confirmed') {
          data.confirmedAt = new Date().toISOString()
        }
        if (data.status && data.status !== 'confirmed' && prev.status === 'confirmed') {
          data.confirmedAt = null
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Наименование рекламодателя',
      required: true,
      admin: {
        description: 'Как в договоре: «ООО «Ромашка»», «ИП Иванов И. И.», «Петров Пётр»',
      },
    },
    {
      name: 'kind',
      type: 'select',
      label: 'Тип рекламодателя',
      options: ADVERTISER_KIND_OPTIONS,
      defaultValue: 'legal',
      admin: { description: Object.values(ADVERTISER_KIND_LABELS).join(' · ') },
    },
    {
      name: 'inn',
      type: 'text',
      label: 'ИНН',
      admin: { description: 'Попадает в сведения о рекламодателе под пометкой «Реклама»' },
    },
    {
      name: 'ogrn',
      type: 'text',
      label: 'ОГРН / ОГРНИП',
    },
    {
      name: 'site',
      type: 'text',
      label: 'Сайт',
      admin: { description: 'Нужен, если у рекламодателя-физлица нет ИНН/ОГРН' },
    },
    {
      name: 'contactName',
      type: 'text',
      label: 'Контактное лицо',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Телефон',
    },
    {
      name: 'email',
      type: 'email',
      label: 'Электронная почта',
    },
    {
      name: 'address',
      type: 'text',
      label: 'Адрес',
    },
    {
      name: 'status',
      type: 'select',
      label: 'Подтверждение рекламодателя',
      options: ADVERTISER_STATUS_OPTIONS,
      defaultValue: 'pending',
      admin: {
        description:
          'Реклама не размещается без подтверждения рекламодателя: пока статус не «Подтверждён», материалы не публикуются',
      },
    },
    {
      name: 'confirmedAt',
      type: 'date',
      label: 'Когда подтверждён',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка',
      admin: {
        description: 'Как подтверждали (письмо, договор), что обсудили, особые условия',
      },
    },
    {
      name: 'agreement',
      type: 'upload',
      relationTo: 'media',
      label: 'Договор / подтверждение',
      admin: {
        description: 'Скан договора или письма-подтверждения. Не публикуется на сайте',
      },
    },
  ],
}
