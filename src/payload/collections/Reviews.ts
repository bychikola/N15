import { APIError, type CollectionConfig } from 'payload'
import {
  REVIEW_CONSENT_VERSION,
  REVIEW_MAX_RATING,
  REVIEW_MIN_RATING,
  REVIEW_STATUS_OPTIONS,
  reviewPublishIssue,
  type ReviewLike,
} from '@/lib/reviews'

/**
 * «Отзывы клиентов» — отзывы посетителей сайта (страница /reviews, модерация
 * в CRM /crm/reviews).
 *
 * Публичного создания через REST у коллекции нет: отзыв принимает серверный
 * маршрут /api/reviews/submit (overrideAccess) — он проверяет согласие, поля и
 * невидимую защиту от спама (ловушка и время заполнения, см.
 * src/lib/form-guard.ts). Отзыв создаётся со статусом «Ждут проверки»: на сайт
 * он попадает только после решения администратора.
 *
 * Персональных данных сверх имени не собираем: ни телефона, ни адреса, ни
 * паспорта. Гостю доступны на чтение только опубликованные отзывы; сотрудники
 * CRM видят все.
 *
 * ВАЖНО: набор и ПОРЯДОК значений select-поля status совпадают с enum в базе
 * (см. src/lib/reviews.ts, ReviewStatus). При добавлении статуса значение
 * сначала до-добавляется в БД (ALTER TYPE), иначе dev-push пытается пересобрать
 * enum и зависает.
 */
export const Reviews: CollectionConfig = {
  slug: 'reviews',
  labels: { singular: 'Отзыв', plural: 'Отзывы' },
  admin: {
    useAsTitle: 'name',
    group: 'Отзывы клиентов',
    defaultColumns: ['name', 'rating', 'status', 'createdAt'],
    description: 'Отзывы с сайта: проверка и публикация — в разделе CRM «Отзывы»',
  },
  access: {
    // Читают: команда — всё, гость — только опубликованные (черновики, отказы
    // и скрытые отзывы на сайте не показываются). Публичная страница собирает
    // выдачу серверно с overrideAccess, но правило чтения закрывает и REST
    read: ({ req: { user } }) => {
      if (user?.role === 'agent' || user?.role === 'admin') return true
      return { status: { equals: 'published' } }
    },
    // Создают: только команда (отзывы с сайта принимает маршрут
    // /api/reviews/submit с overrideAccess) — публичного REST-создания нет
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        const prev = (originalDoc || {}) as Record<string, unknown>

        // --- Тексты: обрезаем пробелы по краям -------------------------------
        for (const key of ['name', 'text', 'service']) {
          if (typeof data[key] === 'string') data[key] = data[key].trim()
        }
        // Пустая услуга — не значение: поле необязательное
        if (data.service === '') data.service = null

        // --- Согласие: дата и редакция документа ставятся один раз -------------
        if (data.consent === true && !prev.consentAt) {
          data.consentAt = new Date().toISOString()
          data.consentVersion = REVIEW_CONSENT_VERSION
        }

        // --- Публикация ------------------------------------------------------
        // Публикует только команда (маршрут модерации работает с overrideAccess,
        // поэтому проверка доступа здесь не сработала бы), и только полностью
        // заполненный отзыв: проверка одна на всех — reviewPublishIssue.
        const nextStatus = typeof data.status === 'string' ? data.status : prev.status
        if (nextStatus === 'published' && prev.status !== 'published') {
          if (req.user?.role !== 'agent' && req.user?.role !== 'admin') {
            throw new APIError('Опубликовать отзыв может только команда Н15', 403)
          }
          const merged = { ...prev, ...data } as ReviewLike
          const issue = reviewPublishIssue(merged)
          if (issue) throw new APIError(`Нельзя опубликовать отзыв: ${issue}`, 400)
          if (!prev.publishedAt && !data.publishedAt) data.publishedAt = new Date().toISOString()
        }
        // Снятие с публикации стирает дату: отзыв вернулся в очередь и при
        // следующей публикации получит актуальную дату показа
        if (nextStatus !== 'published' && prev.status === 'published' && data.publishedAt === undefined) {
          data.publishedAt = null
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Имя автора',
      required: true,
      maxLength: 80,
      admin: { description: 'Как подписан отзыв. Фамилию не спрашиваем — достаточно имени' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rating',
          type: 'number',
          label: 'Оценка, звёзд',
          required: true,
          min: REVIEW_MIN_RATING,
          max: REVIEW_MAX_RATING,
          admin: { description: 'Целое число от 1 до 5' },
        },
        {
          name: 'service',
          type: 'text',
          label: 'Какая услуга',
          maxLength: 100,
          admin: { description: 'Например: «Покупка квартиры», «Продажа дома», «Аренда»' },
        },
      ],
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Текст отзыва',
      required: true,
      maxLength: 2000,
      admin: { description: 'Как прошла сделка: что понравилось, что можно улучшить' },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: REVIEW_STATUS_OPTIONS,
      admin: {
        description: 'На сайте показываются только опубликованные отзывы. Из «отклонённых» и «скрытых» отзыв можно вернуть на проверку',
      },
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
        { name: 'publishedAt', type: 'date', label: 'Опубликован', admin: { readOnly: true }, index: true },
      ],
    },
    {
      name: 'moderationNote',
      type: 'textarea',
      label: 'Заметка модератора',
      maxLength: 1000,
      admin: { description: 'Служебная пометка (на сайте не показывается): почему отклонили или сняли' },
    },
    {
      // Согласие и след согласия — доказательство законной обработки имени
      // (ст. 9 152-ФЗ). Модератору видно, что человек согласие дал
      type: 'row',
      fields: [
        { name: 'consent', type: 'checkbox', label: 'Согласие на обработку данных' },
        { name: 'consentAt', type: 'date', label: 'Когда дано', admin: { readOnly: true } },
        { name: 'consentVersion', type: 'text', label: 'Редакция согласия', admin: { readOnly: true } },
        { name: 'ip', type: 'text', label: 'IP при отправке', admin: { readOnly: true } },
      ],
    },
  ],
}
