import type { CollectionConfig } from 'payload'
import { LEGAL_OFFICER_EMAIL, LEGAL_STATUS_LABELS, type LegalCheckStatus } from '@/lib/legal-check'

// ---------------------------------------------------------------------------
// Отчёты «Юридической проверки объекта» (модуль CRM). Отчёт — закрытый
// документ: читать его может только аккаунт Ланы Козыревой (LEGAL_OFFICER_EMAIL);
// клиентам, другим агентам, сайту и админ-панели коллекция недоступна
// (read по email-правилу, панель скрыта, изменения — только серверными
// маршрутами /api/objects/legal/*, см. src/lib/legal-service.ts).
//
// В отчёте нет паспортных данных, подписей, личных контактов и полного
// текста закрытых документов — только результаты сверки по пунктам 1–12,
// найденные несоответствия, отсутствующие документы и рекомендации.
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = (Object.keys(LEGAL_STATUS_LABELS) as LegalCheckStatus[]).map((s) => ({
  label: LEGAL_STATUS_LABELS[s],
  value: s,
}))

export const LegalReports: CollectionConfig = {
  slug: 'legal-reports',
  labels: { singular: 'Отчёт юр. проверки', plural: 'Отчёты юр. проверки' },
  admin: {
    hidden: true,
    description: 'Закрытые отчёты: читает только ответственная за проверки, правки — только серверные маршруты',
  },
  access: {
    // Отчёт доступен только аккаунту Ланы Козыревой — даже администраторам
    read: ({ req: { user } }) => !!user && user.email === LEGAL_OFFICER_EMAIL,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'object',
      type: 'relationship',
      relationTo: 'objects',
      required: true,
      index: true,
      unique: true,
      label: 'Объект',
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      label: 'Итоговый статус',
      options: STATUS_OPTIONS,
      admin: { readOnly: true },
    },
    {
      name: 'checkedAt',
      type: 'date',
      required: true,
      label: 'Дата проверки',
      admin: { readOnly: true },
    },
    {
      name: 'docsActualAt',
      type: 'date',
      label: 'Дата актуальности документов',
      admin: { readOnly: true },
    },
    {
      name: 'checkedBy',
      type: 'text',
      label: 'Проверку сформировал',
      admin: { readOnly: true },
    },
    {
      name: 'engineVersion',
      type: 'number',
      label: 'Версия движка',
      admin: { readOnly: true },
    },
    {
      name: 'items',
      type: 'array',
      label: 'Пункты проверки',
      admin: { readOnly: true },
      fields: [
        { name: 'key', type: 'text', label: 'Номер пункта', admin: { readOnly: true } },
        { name: 'title', type: 'text', label: 'Пункт', admin: { readOnly: true } },
        {
          name: 'status',
          type: 'select',
          label: 'Статус',
          options: STATUS_OPTIONS,
          admin: { readOnly: true },
        },
        { name: 'note', type: 'textarea', label: 'Комментарий', admin: { readOnly: true } },
      ],
    },
    {
      name: 'findings',
      type: 'array',
      label: 'Найденные несоответствия',
      admin: { readOnly: true },
      fields: [
        {
          name: 'level',
          type: 'select',
          label: 'Уровень',
          options: [
            { label: 'Информация', value: 'info' },
            { label: 'Замечание', value: 'warn' },
            { label: 'Риск', value: 'risk' },
          ],
          admin: { readOnly: true },
        },
        { name: 'itemKey', type: 'text', label: 'Пункт', admin: { readOnly: true } },
        { name: 'text', type: 'textarea', label: 'Описание', admin: { readOnly: true } },
      ],
    },
    {
      name: 'missingDocs',
      type: 'text',
      hasMany: true,
      label: 'Отсутствующие документы',
      admin: { readOnly: true },
    },
    {
      name: 'recommendations',
      type: 'text',
      hasMany: true,
      label: 'Рекомендации',
      admin: { readOnly: true },
    },
    {
      name: 'sources',
      type: 'array',
      label: 'Ссылки на источники',
      admin: { readOnly: true },
      fields: [
        { name: 'name', type: 'text', label: 'Источник', admin: { readOnly: true } },
        { name: 'url', type: 'text', label: 'Ссылка', admin: { readOnly: true } },
      ],
    },
    {
      name: 'docs',
      type: 'array',
      label: 'Загруженные документы (перечень)',
      admin: { readOnly: true },
      fields: [
        { name: 'id', type: 'number', label: 'id', admin: { readOnly: true } },
        { name: 'docType', type: 'text', label: 'Тип (код)', admin: { readOnly: true } },
        { name: 'docTypeLabel', type: 'text', label: 'Тип документа', admin: { readOnly: true } },
        { name: 'docDate', type: 'text', label: 'Дата документа', admin: { readOnly: true } },
        { name: 'fileName', type: 'text', label: 'Файл', admin: { readOnly: true } },
        { name: 'size', type: 'number', label: 'Размер, байт', admin: { readOnly: true } },
      ],
    },
    {
      name: 'facts',
      type: 'json',
      label: 'Сведения, на основе которых сформирован отчёт',
      admin: { readOnly: true, description: 'Предзаполняют форму при повторной проверке' },
    },
    // Снимок карточки объекта на момент проверки — отчёт самодостаточен и не
    // меняется, если карточку позже отредактируют (поля служебные, скрыты)
    {
      name: 'objectTitle',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'objectAddress',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'category',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'dealType',
      type: 'text',
      admin: { hidden: true },
    },
  ],
}
