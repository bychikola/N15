import { APIError, type CollectionConfig } from 'payload'
import { OBJECT_CATEGORIES, HOUSE_TYPES } from '@/lib/object-categories'
import { COMMERCIAL_TYPES } from '@/lib/commercial-types'
import { CITY_DISTRICT_OPTIONS, DISTRICT_OPTIONS } from '@/lib/districts'
import { formatRuPhone } from '@/lib/phone'
import {
  BOARD_AUTHOR_KIND_OPTIONS,
  BOARD_MAX_PHOTOS,
  BOARD_STATUS_LABELS,
  BOARD_STATUS_OPTIONS,
  BOARD_TERM_DAYS,
  boardExpireAt,
  boardPublishIssue,
  type BoardAdLike,
  type BoardStatus,
} from '@/lib/board'
import { BOARD_RULES_VERSION } from '@/lib/board-legal'

/**
 * «Объявления доски» — то, что размещают на доске: частные лица со страницы
 * /board/new и агентство (объекты агентства при этом остаются в каталоге
 * objects — это разные базы, и смешивать их не нужно).
 *
 * Путь объявления: pending (на модерации) → published (после проверки в CRM)
 * либо clarification / rejected; опубликованное снимается автором (archived)
 * или гаснет по сроку (expired). Любая правка содержания автором возвращает
 * объявление в pending — после проверки содержание не должно меняться
 * (см. src/app/api/board/ads/manage/route.ts).
 *
 * Публичного создания через REST нет: объявления принимает серверный маршрут
 * /api/board/ads (overrideAccess) — он проверяет сессию, лимиты, квоту,
 * согласия и фото. Поэтому read закрыт даже для чтения: в записи лежит телефон
 * автора, и открытое чтение позволяло бы перебирать номера через where
 * (тот же класс утечки, что кадастровый номер в objects — см.
 * src/lib/objects-where.ts). Выдача сайта идёт серверными страницами
 * и маршрутом со списком публичных полей.
 *
 * ВАЖНО: набор и ПОРЯДОК значений select-поля status совпадают с enum в базе
 * (см. src/lib/board.ts, BoardStatus). При добавлении статуса значение сначала
 * до-добавляется в БД (ALTER TYPE), иначе dev-push пытается пересобрать enum
 * и зависает.
 */
export const BoardAds: CollectionConfig = {
  slug: 'board-ads',
  labels: { singular: 'Объявление', plural: 'Объявления доски' },
  admin: {
    useAsTitle: 'title',
    group: 'Доска объявлений',
    defaultColumns: ['title', 'dealType', 'category', 'price', 'status', 'createdAt'],
    description:
      'Объявления доски: проверка и публикация — в разделе CRM «Доска», подача с сайта — /board/new',
  },
  access: {
    // Читают: команда всё, автор свои, посетитель — ничего (телефоны!)
    read: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'agent' || user.role === 'admin') return true
      return { author: { equals: user.id } }
    },
    // Создают: команда (объявления агентства из админки или CRM) и серверный
    // маршрут подачи с overrideAccess — публичного REST-создания нет
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    // Правят: только команда; автор правит своим маршрутом с overrideAccess
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    /**
     * Необязательные select-поля: формы присылают '' в невыбранных полях,
     * а Payload считает пустую строку недействительным вариантом выбора
     * («Следующее поле недействительно»). Приводим '' к null до проверки.
     */
    beforeValidate: [
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        for (const key of ['houseType', 'commercialType', 'areaUnit', 'plotAreaUnit']) {
          if (data[key] === '') data[key] = null
        }
        if (data.address && typeof data.address === 'object') {
          const addr = data.address as Record<string, unknown>
          for (const key of Object.keys(addr)) {
            if (addr[key] === '') addr[key] = null
          }
        }

        // Автор — обязательное поле, а поля Payload проверяет РАНЬШЕ, чем
        // beforeChange (см. комментарий в Objects.ts): из формы автора ставит
        // маршрут, в админке — текущий пользователь, здесь же считаем вид
        // автора («Агентство Н15» или «Частное лицо») по его роли.
        const prev = (originalDoc || {}) as Record<string, unknown>
        const authorRaw = data.author ?? prev.author ?? req.user?.id
        const authorId =
          typeof authorRaw === 'object' && authorRaw && 'id' in authorRaw
            ? Number((authorRaw as { id: unknown }).id)
            : Number(authorRaw)
        if (Number.isInteger(authorId) && authorId > 0) {
          const author = await req.payload
            .findByID({ collection: 'users', id: authorId, depth: 0, overrideAccess: true })
            .catch(() => null)
          data.author = authorId
          data.authorKind =
            author?.role === 'agent' || author?.role === 'admin' ? 'agency' : 'private'
        }

        return data
      },
    ],
    beforeChange: [
      async ({ data, req, originalDoc, operation }) => {
        if (!data) return data
        const prev = (originalDoc || {}) as Record<string, unknown>

        // --- Телефон в одном виде ----------------------------------------------
        if (typeof data.phone === 'string') data.phone = formatRuPhone(data.phone)

        // --- Согласия: дата, IP и редакция правил ставятся один раз ------------
        const isPrivate = data.authorKind === 'private' || (operation === 'create' && !data.authorKind)
        if (
          isPrivate &&
          (data.consent === true ||
            data.consentRules === true ||
            data.consentOffer === true ||
            data.consentMedia === true)
        ) {
          if (!prev.consentAt) data.consentAt = new Date().toISOString()
          if (!prev.rulesVersion) data.rulesVersion = BOARD_RULES_VERSION
          if (!prev.ip && typeof data.ip === 'string') data.ip = data.ip.slice(0, 60)
        }

        // --- Публикация ---------------------------------------------------------
        // Публикует только команда (маршрут подачи и правки работает
        // с overrideAccess, поэтому проверка доступа здесь не сработала бы),
        // и только если объявление целиком заполнено: проверка одна на всех —
        // boardPublishIssue из движка.
        const nextStatus = (typeof data.status === 'string' ? data.status : prev.status) as
          | BoardStatus
          | undefined
        if (nextStatus === 'published' && prev.status !== 'published') {
          // APIError, а не Error: причина должна дойти до человека текстом
          // («нужно фото», «нет согласия»), а не превратиться в «Something
          // went wrong» с кодом 500 — объявление правят и из админки Payload
          if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
            throw new APIError('Опубликовать объявление может только команда Н15', 403)
          }
          const merged = { ...prev, ...data } as BoardAdLike
          const issue = boardPublishIssue(merged)
          if (issue) throw new APIError(`Нельзя опубликовать объявление: ${issue}`, 400)
          if (!prev.publishedAt && !data.publishedAt) {
            data.publishedAt = new Date().toISOString()
          }
          if (!data.expiresAt) {
            data.expiresAt = boardExpireAt(String(data.publishedAt || prev.publishedAt))
          }
        }

        // --- Журнал -------------------------------------------------------------
        if (typeof data.status === 'string' && data.status !== prev.status) {
          const before = typeof prev.status === 'string' ? `${prev.status} → ` : ''
          appendLog(data, prev, `${before}${data.status}`, req.user?.email || 'система')
        }

        return data
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Объявление',
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'Заголовок',
              required: true,
              maxLength: 120,
              admin: { description: 'Например: «2-комнатная квартира, 54 м², ул. Джанаева»' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'dealType',
                  type: 'select',
                  label: 'Сделка',
                  required: true,
                  options: [
                    { label: 'Продажа', value: 'sale' },
                    { label: 'Аренда', value: 'rent' },
                  ],
                },
                {
                  name: 'category',
                  type: 'select',
                  label: 'Категория',
                  required: true,
                  options: OBJECT_CATEGORIES.map((c) => ({ label: c.label, value: c.value })),
                },
                {
                  name: 'houseType',
                  type: 'select',
                  label: 'Тип дома',
                  options: HOUSE_TYPES.map((h) => ({ label: h.label, value: h.value })),
                },
              ],
            },
            {
              name: 'commercialType',
              type: 'select',
              label: 'Тип коммерческой',
              options: COMMERCIAL_TYPES.map((c) => ({ label: c.label, value: c.value })),
              admin: {
                condition: (data) => data?.category === 'commercial',
                description: 'Готовый бизнес, офис, торговое или свободное помещение, склад',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'price',
                  type: 'number',
                  label: 'Цена, ₽',
                  required: true,
                  min: 0,
                },
                {
                  name: 'area',
                  type: 'number',
                  label: 'Площадь',
                  min: 0,
                },
                {
                  name: 'areaUnit',
                  type: 'select',
                  label: 'Единица площади',
                  defaultValue: 'sqm',
                  options: [
                    { label: 'м²', value: 'sqm' },
                    { label: 'сотки', value: 'are' },
                    { label: 'га', value: 'ha' },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'plotArea', type: 'number', label: 'Площадь участка', min: 0 },
                {
                  name: 'plotAreaUnit',
                  type: 'select',
                  label: 'Единица участка',
                  options: [
                    { label: 'сотки', value: 'are' },
                    { label: 'га', value: 'ha' },
                    { label: 'м²', value: 'sqm' },
                  ],
                },
                { name: 'rooms', type: 'number', label: 'Комнат', min: 1, max: 20 },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'floor', type: 'number', label: 'Этаж', min: 0 },
                { name: 'totalFloors', type: 'number', label: 'Этажей в доме', min: 0 },
              ],
            },
            {
              name: 'description',
              type: 'textarea',
              label: 'Описание',
              required: true,
              maxLength: 6000,
              admin: { description: 'Состояние, ремонт, что рядом. Телефон в тексте писать не нужно' },
            },
            {
              name: 'videoLinks',
              type: 'textarea',
              label: 'Видео',
              admin: {
                description:
                  'Ссылки на видео (по одной в строке) — YouTube, RuTube, VK. Файлы видео не принимаем',
              },
            },
          ],
        },
        {
          label: 'Адрес',
          fields: [
            {
              name: 'address',
              type: 'group',
              label: 'Адрес',
              fields: [
                { name: 'city', type: 'text', label: 'Город', defaultValue: 'Владикавказ' },
                {
                  name: 'district',
                  type: 'select',
                  label: 'Район республики',
                  options: DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
                },
                {
                  name: 'cityDistrict',
                  type: 'select',
                  label: 'Район города',
                  options: CITY_DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
                },
                { name: 'locality', type: 'text', label: 'Населённый пункт' },
                { name: 'snt', type: 'text', label: 'Товарищество (СНТ)' },
                { name: 'street', type: 'text', label: 'Улица' },
                {
                  name: 'house',
                  type: 'text',
                  label: 'Дом',
                  admin: {
                    description:
                      'На сайте номер дома не показывается — его видит только модератор и автор (безопасность частных лиц)',
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Фото и контакты',
          fields: [
            {
              name: 'photos',
              type: 'upload',
              relationTo: 'board-materials',
              hasMany: true,
              label: 'Фотографии',
              admin: {
                description: `До ${BOARD_MAX_PHOTOS} штук. До публикации лежат в закрытом хранилище, на сайт попадают копиями в media`,
              },
            },
            {
              name: 'publicPhotos',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              label: 'Фото на сайте',
              admin: {
                readOnly: true,
                description: 'Заполняется при публикации — копии проверенных фото. Вручную не меняется',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'contactName',
                  type: 'text',
                  label: 'Контактное лицо',
                  required: true,
                  maxLength: 120,
                },
                {
                  name: 'phone',
                  type: 'text',
                  label: 'Телефон',
                  required: true,
                  admin: { description: 'На сайте номер не публикуется — отдаётся по кнопке' },
                },
                { name: 'email', type: 'email', label: 'Почта' },
              ],
            },
          ],
        },
        {
          label: 'Модерация',
          fields: [
            {
              name: 'status',
              type: 'select',
              label: 'Статус',
              required: true,
              defaultValue: 'pending',
              index: true,
              options: BOARD_STATUS_OPTIONS,
              admin: {
                description: `Опубликовать можно только полностью заполненное объявление. Путь: ${Object.values(
                  BOARD_STATUS_LABELS,
                ).join(' → ')}`,
              },
            },
            {
              name: 'moderationNote',
              type: 'textarea',
              label: 'Что уточнить или исправить',
              maxLength: 1000,
              admin: { description: 'Видит автор в личном кабинете — пишите по делу и понятно' },
            },
            {
              type: 'row',
              fields: [
                { name: 'moderatedBy', type: 'text', label: 'Проверил', admin: { readOnly: true } },
                {
                  name: 'moderatedAt',
                  type: 'date',
                  label: 'Когда проверено',
                  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
                },
                { name: 'publishedAt', type: 'date', label: 'Опубликовано', admin: { readOnly: true } },
                { name: 'expiresAt', type: 'date', label: 'Срок до', admin: { readOnly: true }, index: true },
              ],
            },
            {
              name: 'views',
              type: 'number',
              label: 'Просмотров',
              defaultValue: 0,
              admin: { readOnly: true },
            },
          ],
        },
        {
          label: 'Служебное',
          fields: [
            {
              name: 'author',
              type: 'relationship',
              relationTo: 'users',
              label: 'Автор',
              required: true,
              index: true,
              admin: { description: 'Аккаунт, с которого подано объявление (в админке — текущий пользователь)' },
            },
            {
              name: 'authorKind',
              type: 'select',
              label: 'Кто разместил',
              defaultValue: 'private',
              options: BOARD_AUTHOR_KIND_OPTIONS,
              admin: {
                readOnly: true,
                description: 'Считается автоматически по роли автора: сотрудник — «Агентство Н15»',
              },
            },
            {
              name: 'sourceObject',
              type: 'relationship',
              relationTo: 'objects',
              label: 'Объект каталога',
              admin: {
                description:
                  'Заполняется, только если объявление завели из объекта каталога. Автоматического переноса объектов на доску нет — базы раздельные',
              },
            },
            {
              type: 'row',
              fields: [
                { name: 'consent', type: 'checkbox', label: 'Согласие на обработку данных' },
                { name: 'consentRules', type: 'checkbox', label: 'Правила доски приняты' },
                // Отметки документов доски: договор-оферта (/documents/placement-offer)
                // и согласие собственника на фото, видео и описание
                // (/documents/owner-media-consent). Поля и хук ниже готовы,
                // но форма подачи их пока не присылает — галочки в неё
                // добавляются отдельной правкой
                { name: 'consentOffer', type: 'checkbox', label: 'Договор-оферта принят' },
                { name: 'consentMedia', type: 'checkbox', label: 'Согласие на фото, видео и описание' },
                { name: 'consentAt', type: 'date', label: 'Когда приняты', admin: { readOnly: true } },
                { name: 'rulesVersion', type: 'text', label: 'Версия правил', admin: { readOnly: true } },
                { name: 'ip', type: 'text', label: 'IP при подаче', admin: { readOnly: true } },
              ],
            },
            {
              name: 'log',
              type: 'array',
              label: 'Журнал объявления',
              labels: { singular: 'Событие', plural: 'События' },
              admin: {
                readOnly: true,
                description: 'Смена статусов и проверки — с датой и тем, кто выполнил',
              },
              fields: [
                { name: 'event', type: 'text', label: 'Событие' },
                {
                  name: 'at',
                  type: 'date',
                  label: 'Когда',
                  admin: { date: { pickerAppearance: 'dayAndTime' } },
                },
                { name: 'by', type: 'text', label: 'Кто' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/** Сколько дней живёт объявление — подпись для админки */
export const BOARD_TERM_TEXT = `${BOARD_TERM_DAYS} дней`

/** Событие в журнал объявления: пишется поверх прежних, дата и автор обязательны */
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
