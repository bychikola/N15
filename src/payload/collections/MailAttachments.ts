import type { CollectionConfig } from 'payload'

// Вложения писем (скачиваются IMAP-поллером воркера с ящика VK WorkSpace).
// Файл хранится base64 в поле data — без файловой системы и волюмов;
// отдаётся через /api/mail/attachment/[id] (роли агент/админ).
export const MailAttachments: CollectionConfig = {
  slug: 'mail-attachments',
  admin: {
    useAsTitle: 'filename',
    group: 'Агентство',
    defaultColumns: ['filename', 'size', 'email', 'createdAt'],
  },
  access: {
    read: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    create: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    update: ({ req: { user } }) => !!user && (user.role === 'agent' || user.role === 'admin'),
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'email',
      type: 'relationship',
      relationTo: 'emails',
      required: true,
      index: true,
      label: 'Письмо',
    },
    {
      name: 'filename',
      type: 'text',
      required: true,
      label: 'Имя файла',
    },
    {
      name: 'mimeType',
      type: 'text',
      label: 'Тип (MIME)',
    },
    {
      name: 'size',
      type: 'number',
      label: 'Размер, байт',
    },
    {
      name: 'data',
      type: 'textarea',
      required: true,
      label: 'Содержимое (base64)',
      admin: {
        hidden: true,
        description: 'Файл в base64 — не редактировать вручную',
      },
    },
  ],
}
