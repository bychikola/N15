import type { CollectionConfig } from 'payload'
import { DEVELOPER_STATUS_OPTIONS } from '@/lib/developers'

/**
 * «Застройщики» — карточки компаний-застройщиков (раздел CRM
 * /crm/developers). Жилые комплексы застройщика — отдельная коллекция
 * complexes со связью complex.developer: в карточке объекта при выборе
 * застройщика предлагаются только его комплексы.
 *
 * Раздел ведут только администраторы (create/update/delete). Читают
 * справочник сотрудники CRM — застройщик выбирается в карточке объекта;
 * на публичной части сайта и в публичном API застройщиков нет (коллекция
 * закрыта на чтение). Контакт ответственного представителя дополнительно
 * скрыт полевым доступом: это персональные данные, их видят только
 * администраторы (ст. 5, 19 152-ФЗ).
 */
export const Developers: CollectionConfig = {
  slug: 'developers',
  labels: { singular: 'Застройщик', plural: 'Застройщики' },
  admin: {
    useAsTitle: 'name',
    group: 'Недвижимость',
    defaultColumns: ['name', 'status', 'website', 'updatedAt'],
    description: 'Компании-застройщики и их жилые комплексы. Ведут только администраторы',
  },
  access: {
    // Справочник внутренний: застройщика выбирают в карточке объекта, поэтому
    // читают его сотрудники CRM. Гостю и клиенту сайта коллекция недоступна —
    // публичных страниц застройщиков нет.
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Название компании',
      required: true,
      admin: { description: 'Как в договоре: «ООО «Стройинвест»»' },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: 'Логотип',
      admin: {
        description: 'Логотип компании. Знак «Н15» на логотип не накладывается — он уходит в хранилище как есть',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Краткое описание',
      admin: {
        description: 'О компании в двух-трёх предложениях: специализация, города работы, срок на рынке',
      },
    },
    {
      name: 'website',
      type: 'text',
      label: 'Официальный сайт',
      admin: { description: 'Например: https://example.ru' },
    },
    {
      // Контакт ответственного представителя — персональные данные: группу
      // видят и правят только администраторы, в публичный API она не попадает.
      // Храним минимум (имя и служебные контакты), без паспортов и иных
      // избыточных сведений (ст. 5 152-ФЗ).
      name: 'contacts',
      type: 'group',
      label: 'Контакт ответственного представителя',
      access: {
        read: ({ req: { user } }) => user?.role === 'admin',
      },
      admin: {
        description: 'Персональные данные: видны только администраторам и не показываются на сайте',
      },
      fields: [
        { name: 'contactName', type: 'text', label: 'Имя представителя' },
        { name: 'contactPhone', type: 'text', label: 'Телефон' },
        { name: 'contactEmail', type: 'email', label: 'Электронная почта' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: DEVELOPER_STATUS_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
      defaultValue: 'active',
      required: true,
      admin: {
        description: 'Активные застройщики предлагаются в карточке объекта; архивные остаются в базе, но новых привязок не получают',
      },
    },
  ],
}
