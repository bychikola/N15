import type { CollectionConfig } from 'payload'

/**
 * «Жилые комплексы» — комплексы застройщика (коллекция developers). У
 * комплекса минимум сведений: название, застройщик, населённый пункт и
 * улица; в карточке объекта выбирается комплекс выбранного застройщика
 * (см. поле complex коллекции Objects и форму CRM CrmObjects).
 *
 * Раздел ведут только администраторы. Читают справочник сотрудники CRM;
 * на сайте и в публичном API комплексов нет.
 */
export const Complexes: CollectionConfig = {
  slug: 'complexes',
  labels: { singular: 'Жилой комплекс', plural: 'Жилые комплексы' },
  admin: {
    useAsTitle: 'name',
    group: 'Недвижимость',
    defaultColumns: ['name', 'developer', 'locality', 'street'],
    description: 'Жилые комплексы застройщиков: название, населённый пункт и улица',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    create: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Название комплекса',
      required: true,
      admin: { description: 'Например: «ЖК Весенний»' },
    },
    {
      name: 'developer',
      type: 'relationship',
      relationTo: 'developers',
      label: 'Застройщик',
      required: true,
      admin: { description: 'Компания, которой принадлежит комплекс' },
    },
    {
      name: 'locality',
      type: 'text',
      label: 'Населённый пункт',
      admin: { description: 'Например: Владикавказ, Ногир, Заводской…' },
    },
    { name: 'street', type: 'text', label: 'Улица' },
  ],
}
