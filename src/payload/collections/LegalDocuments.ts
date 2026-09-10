import type { CollectionConfig } from 'payload'
import { LEGAL_DOC_TYPES } from '@/lib/legal-check'

// ---------------------------------------------------------------------------
// Закрытое хранилище документов юр. экспертизы объектов (модуль «Юридическая
// экспертиза объекта» в CRM). Файлы хранятся base64 в БД (как вложения писем,
// см. MailAttachments) — в файловую систему и в статические URL Payload они
// не попадают, «исходные файлы живут только в закрытой CRM».
//
// Access полностью закрыт: все операции выполняет сервер через собственные
// маршруты /api/objects/legal/* (см. src/lib/legal-service.ts), которые сами
// проверяют, кто ведёт объект. REST-доступ к коллекции не открыт никому —
// ни клиентам, ни агентам, ни администраторам, ни админке (коллекция скрыта).
// В метаданных не хранятся паспортные данные: серия/номер паспорта не
// запрашиваются и не сохраняются (см. подсказки полей notes и docNumber).
// ---------------------------------------------------------------------------

/** Дата документа: YYYY-MM-DD (для расчёта актуальности в отчёте) */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const LegalDocuments: CollectionConfig = {
  slug: 'legal-documents',
  labels: { singular: 'Документ юр. экспертизы', plural: 'Документы юр. экспертизы' },
  admin: {
    hidden: true,
    description: 'Закрытое хранилище: доступ только через маршруты /api/objects/legal/*',
  },
  access: {
    read: () => false,
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
      label: 'Объект',
      admin: { readOnly: true },
    },
    {
      name: 'docType',
      type: 'select',
      required: true,
      label: 'Тип документа',
      options: LEGAL_DOC_TYPES.map((d) => ({ label: d.label, value: d.value })),
      admin: { readOnly: true },
    },
    {
      name: 'docDate',
      type: 'text',
      label: 'Дата документа',
      validate: (value?: string | null) =>
        value == null || value === '' || DATE_RE.test(value) ? true : 'Формат даты: ГГГГ-ММ-ДД',
      admin: {
        readOnly: true,
        description: 'Дата, указанная на документе (например, дата выписки ЕГРН)',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Примечание',
      admin: {
        readOnly: true,
        description:
          'Кем и когда выдан документ, что подтверждает. Паспортные данные (серия, номер) не вводить — они в систему не сохраняются',
      },
    },
    {
      name: 'filename',
      type: 'text',
      required: true,
      label: 'Имя файла',
      admin: { readOnly: true },
    },
    {
      name: 'mimeType',
      type: 'text',
      label: 'Тип (MIME)',
      admin: { readOnly: true },
    },
    {
      name: 'size',
      type: 'number',
      label: 'Размер, байт',
      admin: { readOnly: true },
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Загрузил',
      admin: { readOnly: true },
    },
    {
      name: 'data',
      type: 'textarea',
      required: true,
      label: 'Содержимое (base64)',
      admin: { hidden: true, description: 'Файл в base64 — не редактировать вручную' },
    },
  ],
}
