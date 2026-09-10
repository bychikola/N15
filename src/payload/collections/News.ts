import type { CollectionConfig } from 'payload'
import { NEWS_TOPICS, newsPublishIssue, type NewsLike } from '@/lib/news'

/**
 * «Новости на проверку» — очередь официальных новостей о недвижимости
 * (см. src/lib/news.ts). Собираются по расписанию из открытых RSS-каналов
 * Банка России, Правительства России, ФНС и др. либо добавляются ссылкой
 * вручную; в блог попадают ТОЛЬКО после подтверждения сотрудника в разделе
 * CRM «Новости на проверку» — автопубликации нет (пункт 7 брифа).
 *
 * Каждая запись хранит заголовок, дату, источник, прямую ссылку, краткое
 * содержание, регион и тему (пункты 3–4); полный текст статьи не копируется.
 */
export const News: CollectionConfig = {
  slug: 'news',
  labels: { singular: 'Новость', plural: 'Новости' },
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
    defaultColumns: ['status', 'title', 'sourceName', 'region', 'publishedAt'],
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  hooks: {
    beforeChange: [
      // Страховка: перевести новость в «Опубликовано» можно только при
      // выполненном правиле «официальный источник + заголовок + дата + ссылка +
      // краткое содержание». Публикацию из админки это тоже закрывает.
      // При обновлении data содержит только изменённые поля — проверяем
      // документ целиком (данные + прежняя запись).
      ({ data, originalDoc }) => {
        const nextStatus = data?.status ?? originalDoc?.status
        if (nextStatus === 'published') {
          const merged = { ...(originalDoc || {}), ...(data || {}) }
          const issue = newsPublishIssue(merged as NewsLike)
          if (issue) throw new Error(`Публикация невозможна: ${issue}`)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Заголовок',
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
      label: 'Краткое содержание',
      admin: {
        description: 'Резюме своими словами: черновик собирается из лида официального сообщения, перед публикацией его подтверждает или правит сотрудник',
      },
    },
    {
      name: 'url',
      type: 'text',
      label: 'Прямая ссылка на источник',
      required: true,
      admin: {
        description: 'Ссылка обязана вести на официальный источник из реестра (Банк России, Росреестр, Минстрой, ДОМ.РФ, ФНС, Правительство России, органы РСО-Алания)',
      },
    },
    {
      name: 'sourceName',
      type: 'text',
      label: 'Источник',
      admin: {
        description: 'Название официального источника — попадает в публикацию после «Источник:»',
      },
    },
    {
      name: 'sourceSlug',
      type: 'text',
      label: 'Код источника',
      admin: {
        readOnly: true,
        description: 'Служебный код источника в реестре (cbr, government, fns15…)',
      },
    },
    {
      name: 'region',
      type: 'text',
      label: 'Регион',
      defaultValue: 'Россия',
    },
    {
      name: 'topic',
      type: 'select',
      label: 'Тема',
      options: NEWS_TOPICS.map((t) => ({ label: t.label, value: t.slug })),
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Дата публикации у источника',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'На проверке', value: 'new' },
        { label: 'Опубликовано', value: 'published' },
        { label: 'Отклонено', value: 'rejected' },
        { label: 'Отложено', value: 'postponed' },
      ],
      defaultValue: 'new',
      required: true,
    },
    {
      name: 'postponeUntil',
      type: 'date',
      label: 'Отложено до',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'После этой даты новость возвращается в очередь на проверку',
      },
    },
    {
      name: 'origin',
      type: 'select',
      label: 'Как попала в очередь',
      options: [
        { label: 'RSS-канал источника', value: 'feed' },
        { label: 'Ссылка добавлена вручную', value: 'manual' },
      ],
      defaultValue: 'feed',
    },
    {
      name: 'fetchedAt',
      type: 'date',
      label: 'Когда найдена',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'blogPost',
      type: 'relationship',
      label: 'Публикация в блоге',
      relationTo: 'blog',
      admin: {
        readOnly: true,
        description: 'Создаётся автоматически при подтверждении новости',
      },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      label: 'Когда проверена',
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      label: 'Проверил',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      name: 'reviewNote',
      type: 'textarea',
      label: 'Заметка проверяющего',
      admin: {
        description: 'Например, причина отклонения или на какой срок отложена',
      },
    },
  ],
}
