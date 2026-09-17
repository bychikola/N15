import type { CollectionConfig } from 'payload'
import {
  AD_CONTACT_KIND_OPTIONS,
  AD_FORMAT_OPTIONS,
  AD_OBJECT_TYPE_OPTIONS,
  AD_PAYMENT_OPTIONS,
  AD_REQUEST_STATUS_LABELS,
  AD_REQUEST_STATUS_OPTIONS,
  adAddDays,
  adIso,
  adRequestAdvertiserInfo,
  adRequestConsentsOk,
  adRequestMarking,
  adRequestPublishIssue,
  adRequestTotal,
  adValue,
} from '@/lib/advertising'
import { AD_OFFER_VERSION, adDocHref } from '@/lib/advertising-legal'

/**
 * «Заявки на рекламу» — обращения с формы платного размещения «Ваша реклама»
 * (страница /advertising): кто обращается, что за объект, материалы, срок,
 * три согласия и оплата.
 *
 * Заявка приходит только серверным маршрутом /api/advertising/request:
 * публичного создания через REST нет (create запрещён, маршрут валидирует
 * поля, сохраняет три согласия, IP-адрес и версию оферты). Без всех трёх
 * согласий заявка не принимается — ни с формы, ни из админки.
 *
 * Публикация (status = «Опубликовано») проходит проверку adRequestPublishIssue:
 * заявка одобрена, содержание проверено, три согласия на месте, оплата
 * получена (или размещение без оплаты согласовано отдельно), указаны срок
 * публикации и erid. Маркировка «Реклама» собирается автоматически.
 * Кнопки CRM — в разделе «Реклама» (маршрут /api/advertising/request-manage).
 *
 * ВАЖНО: набор и порядок значений select-поля status совпадают с enum в базе
 * (см. src/lib/advertising.ts, AdRequestStatus). При добавлении статуса
 * значение сначала до-добавляется в БД (ALTER TYPE), иначе dev-push
 * пытается пересобрать enum и зависает.
 */
export const AdvertisingRequests: CollectionConfig = {
  slug: 'advertising-requests',
  labels: { singular: 'Заявка на рекламу', plural: 'Заявки на рекламу' },
  admin: {
    useAsTitle: 'name',
    group: 'Реклама',
    defaultColumns: ['name', 'company', 'objectType', 'status', 'paymentStatus', 'createdAt'],
    description:
      'Заявки с формы «Ваша реклама» на странице /advertising: проверка, оплата и публикация — в разделе CRM «Реклама»',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    // Заявки принимает только серверный маршрут формы (overrideAccess)
    create: () => false,
    update: ({ req: { user } }) => user?.role === 'admin' || user?.role === 'agent',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data
        // Пустые select-поля из форм и API: '' — не вариант выбора (как в objects)
        for (const key of ['contactKind', 'objectType', 'format', 'paymentStatus', 'status'] as const) {
          if (typeof data[key] === 'string' && !data[key].trim()) {
            data[key] = null
          }
        }
        // Три согласия обязательны при создании: без любого из них заявка
        // не принимается — это юридически значимая отметка посетителя
        if (operation === 'create') {
          const marked =
            data.consent !== undefined || data.consentOffer !== undefined || data.consentRights !== undefined
          if (marked && !adRequestConsentsOk(data)) {
            throw new Error(
              'Без всех трёх согласий (оферта, права на материалы, персональные данные) заявка не принимается',
            )
          }
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        const prev = (originalDoc || {}) as Record<string, unknown>

        // Момент согласий, IP-адрес и принятая редакция оферты фиксируются
        // один раз при создании — задним числом их не переписать
        if (operation === 'create') {
          data.consentAt = new Date().toISOString()
          data.offerVersion = AD_OFFER_VERSION
        }

        // Отправленный договор — событие журнала: сам PDF формирует и отправляет
        // sendAdRequestContract (src/lib/advertising-service.ts), здесь только отметка
        if (operation === 'update' && !adIso(prev.contractSentAt) && adIso(data.contractSentAt)) {
          appendLog(data, prev, 'contract', req.user?.email || 'админка')
        }

        // Итоговая сумма: стоимость минус скидка (правится руками только
        // если посчитанное значение не подходит — пересчёт затирает ручную правку)
        if (data.cost !== undefined || data.discount !== undefined || !prev.totalAmount) {
          const cost = data.cost !== undefined ? data.cost : prev.cost
          const discount = data.discount !== undefined ? data.discount : prev.discount
          data.totalAmount = adRequestTotal(cost, discount)
        }

        // Срок: дата окончания считается от даты начала и срока в днях,
        // если окончание не задали вручную (как в коллекции advertisements)
        const startDate = adIso(data.startDate !== undefined ? data.startDate : prev.startDate)
        const endDate = adIso(data.endDate !== undefined ? data.endDate : prev.endDate)
        const termDays = Number(data.termDays !== undefined ? data.termDays : prev.termDays)
        if (startDate && !endDate && Number.isFinite(termDays) && termDays > 0) {
          data.endDate = adAddDays(startDate, termDays)
        }

        const status = String((data.status !== undefined ? data.status : prev.status) || '')
        const wasPublished = String(prev.status || '') === 'published'

        // Снятие с публикации: маркировку и дату публикации оставляем как
        // историю показа, меняется статус и журнал
        if (wasPublished && status !== 'published') {
          appendLog(data, prev, 'unpublish', req.user?.email || 'админка')
          return data
        }

        if (status !== 'published') {
          // Смена статуса на любой другой — событие журнала (кроме создания)
          if (operation === 'update' && status && status !== String(prev.status || '')) {
            appendLog(data, prev, `status:${status}`, req.user?.email || 'админка')
          }
          return data
        }

        if (wasPublished) return data

        // Публикация: те же условия, что в правилах размещения
        const merged = { ...prev, ...data } as Record<string, unknown>
        const issue = adRequestPublishIssue({
          contactKind: adValue(merged.contactKind),
          name: adValue(merged.name),
          company: adValue(merged.company),
          objectType: adValue(merged.objectType),
          status: 'approved',
          format: adValue(merged.format),
          termDays: typeof merged.termDays === 'number' ? merged.termDays : null,
          erid: adValue(merged.erid),
          cost: typeof merged.cost === 'number' ? merged.cost : null,
          discount: typeof merged.discount === 'number' ? merged.discount : null,
          totalAmount: typeof merged.totalAmount === 'number' ? merged.totalAmount : null,
          paymentStatus: adValue(merged.paymentStatus),
          paymentWaived: Boolean(merged.paymentWaived),
          contentChecked: Boolean(merged.contentChecked),
          consent: Boolean(merged.consent),
          consentOffer: Boolean(merged.consentOffer),
          consentRights: Boolean(merged.consentRights),
        })
        if (issue) {
          throw new Error(`Нельзя опубликовать заявку: ${issue}`)
        }

        // Дата публикации — первая; срок считается от неё, если начало не задали
        const publishedAt = adIso(prev.publishedAt) || new Date().toISOString()
        data.publishedAt = publishedAt
        const start = adIso(data.startDate !== undefined ? data.startDate : prev.startDate) || publishedAt
        if (!startDate) data.startDate = start
        if (!endDate && Number.isFinite(termDays) && termDays > 0) {
          data.endDate = adAddDays(start, termDays)
        }

        data.marking = adRequestMarking(
          {
            company: adValue(merged.company),
            name: adValue(merged.name),
            erid: adValue(merged.erid),
          },
          publishedAt,
        )
        data.advertiserInfo = adRequestAdvertiserInfo({
          company: adValue(merged.company),
          name: adValue(merged.name),
        })
        appendLog(data, prev, 'publish', req.user?.email || 'админка')
        return data
      },
    ],
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Кто обращается',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'contactKind',
          type: 'select',
          label: 'Как к вам обращаться?',
          options: AD_CONTACT_KIND_OPTIONS,
          defaultValue: 'name',
          required: true,
          admin: { description: 'От этого зависит, что писать в договоре: имя, компания, агентство или застройщик' },
        },
        {
          name: 'name',
          type: 'text',
          label: 'Имя контактного лица',
          required: true,
        },
        {
          name: 'company',
          type: 'text',
          label: 'Компания / агентство / застройщик',
          admin: { description: 'Наименование как в договоре. Для частного лица — пусто' },
        },
        {
          name: 'phone',
          type: 'text',
          label: 'Телефон',
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          label: 'Электронная почта',
          admin: { description: 'Сюда уходит сформированный договор' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Объект',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'objectType',
          type: 'select',
          label: 'Тип объекта',
          options: AD_OBJECT_TYPE_OPTIONS,
          required: true,
        },
        {
          name: 'location',
          type: 'text',
          label: 'Адрес или локация',
        },
        {
          name: 'price',
          type: 'text',
          label: 'Цена',
          admin: { description: 'Как называет сам рекламодатель: «6 200 000 ₽», «от 45 000 ₽/мес», «договорная»' },
        },
        {
          name: 'description',
          type: 'textarea',
          label: 'Описание объекта',
        },
        {
          name: 'listingUrl',
          type: 'text',
          label: 'Ссылка на объявление',
          admin: { description: 'Объявление на своей площадке или в другом сервисе' },
        },
        {
          name: 'photos',
          type: 'array',
          label: 'Фотографии',
          labels: { singular: 'Фотография', plural: 'Фотографии' },
          admin: {
            description: 'Не более 6 файлов, JPG/PNG/WEBP до 20 МБ. Закрытое хранилище — до публикации никому не видны',
          },
          fields: [
            {
              name: 'file',
              type: 'upload',
              relationTo: 'advertising-materials',
              label: 'Файл',
            },
          ],
        },
        {
          name: 'videoLinks',
          type: 'textarea',
          label: 'Видео (ссылки)',
          admin: {
            description: 'Ссылки на видео во внешнем сервисе, по одной в строке. Видеофайлы на площадку не загружаются',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Размещение',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'desiredTerm',
          type: 'text',
          label: 'Желаемый срок размещения',
          admin: { description: 'Как просит рекламодатель: «месяц», «до конца сезона». Итоговый срок — ниже' },
        },
        {
          name: 'format',
          type: 'select',
          label: 'Формат размещения',
          options: AD_FORMAT_OPTIONS,
          admin: { description: 'Согласованный формат: карточка, баннер, строчная ссылка или статья' },
        },
        {
          name: 'termDays',
          type: 'number',
          label: 'Срок публикации, дней',
          min: 1,
          admin: { description: 'Дата окончания считается от даты публикации' },
        },
        {
          name: 'startDate',
          type: 'date',
          label: 'Дата начала размещения',
          admin: { date: { pickerAppearance: 'dayOnly' }, description: 'Пусто — срок начнётся в день публикации' },
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
          name: 'erid',
          type: 'text',
          label: 'Идентификатор интернет-рекламы (erid)',
          admin: {
            description:
              'Выдаёт оператор рекламных данных. Нужен для платной публикации — попадает в маркировку «Реклама»',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Стоимость и оплата',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'cost',
          type: 'number',
          label: 'Стоимость размещения, ₽',
          min: 0,
        },
        {
          name: 'discount',
          type: 'number',
          label: 'Скидка, ₽',
          min: 0,
          admin: { description: 'Итоговая сумма считается автоматически: стоимость минус скидка' },
        },
        {
          name: 'totalAmount',
          type: 'number',
          label: 'Итоговая сумма, ₽',
          admin: { readOnly: true, description: 'Считается как стоимость минус скидка' },
        },
        {
          name: 'paymentStatus',
          type: 'select',
          label: 'Статус оплаты',
          options: AD_PAYMENT_OPTIONS,
          defaultValue: 'unpaid',
          admin: { description: 'До оплаты объект не публикуется, если иное не согласовано отдельно' },
        },
        {
          name: 'paidAt',
          type: 'date',
          label: 'Дата оплаты',
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'paymentWaived',
          type: 'checkbox',
          label: 'Размещение без оплаты — согласовано отдельно',
          defaultValue: false,
          admin: {
            description:
              'Отметьте, только если оплата действительно согласована отдельно: иначе публикация без оплаты запрещена',
          },
        },
        {
          name: 'paymentNote',
          type: 'text',
          label: 'Заметка об оплате',
          admin: { description: 'Номер счёта, кто оплатил, договорённости о рассрочке' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Проверка содержания',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'contentChecked',
          type: 'checkbox',
          label: 'Содержание проверено',
          defaultValue: false,
          admin: {
            description: 'Проверены достоверность, законность, права на фото и отсутствие запрещённых сведений',
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
      type: 'collapsible',
      label: 'Согласия (отметки формы)',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'consentOffer',
          type: 'checkbox',
          label: 'Согласен(на) с договором-офертой и правилами размещения рекламы',
          required: true,
          defaultValue: false,
          admin: {
            readOnly: true,
            description: `Отметка посетителя. Документы: ${adDocHref('ru', '/advertising/offer')} и ${adDocHref('ru', '/advertising/rules')}`,
          },
        },
        {
          name: 'consentRights',
          type: 'checkbox',
          label: 'Подтверждаю, что имею право размещать объект, фотографии, видео и описание',
          required: true,
          defaultValue: false,
          admin: { readOnly: true, description: 'Отметка посетителя' },
        },
        {
          name: 'consent',
          type: 'checkbox',
          label: 'Согласие на обработку персональных данных',
          required: true,
          defaultValue: false,
          admin: {
            readOnly: true,
            description: `Отметка посетителя. Документ: ${adDocHref('ru', '/privacy')}`,
          },
        },
        {
          name: 'consentAt',
          type: 'date',
          label: 'Когда даны согласия',
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'offerVersion',
          type: 'text',
          label: 'Принятая версия оферты',
          admin: { readOnly: true, description: 'Редакция, которую человек принял при отправке заявки' },
        },
        {
          name: 'ip',
          type: 'text',
          label: 'IP-адрес отправки',
          admin: { readOnly: true, description: 'Подтверждение отправки заявки: дата, время и адрес отправителя' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Договор',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'contractDocument',
          type: 'upload',
          relationTo: 'advertising-materials',
          label: 'PDF-договор',
          admin: { description: 'Формируется кнопкой «Сформировать договор» в CRM — для крупных компаний' },
        },
        {
          name: 'contractEmail',
          type: 'email',
          label: 'Куда отправлен договор',
        },
        {
          name: 'contractSentAt',
          type: 'date',
          label: 'Когда договор отправлен',
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'contractNote',
          type: 'text',
          label: 'Заметка о договоре',
          admin: { description: 'Реквизиты, номер договора, кто подписал' },
        },
      ],
    },
    {
      name: 'publicPhotos',
      type: 'array',
      label: 'Фотографии для сайта',
      admin: {
        readOnly: true,
        description:
          'Копии фотографий в media — создаются при публикации заявки. Файлы заявки до публикации публичными не становятся',
      },
      fields: [
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          label: 'Файл',
        },
      ],
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Сообщение',
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус заявки',
      options: AD_REQUEST_STATUS_OPTIONS,
      defaultValue: 'new',
      index: true,
      admin: {
        description: `«${AD_REQUEST_STATUS_LABELS.published}» ставится кнопкой в CRM после проверки, оплаты и указания срока. Кнопки — в CRM, раздел «Реклама»`,
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
        {
          name: 'markedAt',
          type: 'date',
          label: 'Когда размечено',
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
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
      label: 'Журнал заявки',
      labels: { singular: 'Событие', plural: 'События' },
      admin: { readOnly: true, description: 'Проверки, смена статусов, оплата и публикация — с датой и тем, кто выполнил' },
      fields: [
        { name: 'event', type: 'text', label: 'Событие' },
        { name: 'at', type: 'date', label: 'Когда', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'by', type: 'text', label: 'Кто' },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка',
      admin: { description: 'Что обсудили, какие условия предложили' },
    },
  ],
}

/** Событие в журнал заявки: пишется поверх прежних, дата и автор обязательны */
function appendLog(
  data: Record<string, unknown>,
  prev: Record<string, unknown>,
  event: string,
  by: string,
): void {
  const log = Array.isArray(data.log) ? data.log : Array.isArray(prev.log) ? [...prev.log] : []
  log.push({ event, at: new Date().toISOString(), by })
  data.log = log
}
