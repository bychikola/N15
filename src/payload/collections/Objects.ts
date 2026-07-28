import type { CollectionConfig } from 'payload'

export const Objects: CollectionConfig = {
  slug: 'objects',
  admin: {
    useAsTitle: 'title',
    group: 'Недвижимость',
    defaultColumns: ['title', 'type', 'category', 'price', 'status'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название объекта',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL-путь',
      unique: true,
      admin: {
        position: 'sidebar',
      },
      hooks: {
        beforeValidate: [
          ({ data }) => {
            if (data?.slug) return data.slug
            if (data?.title) {
              return data.title
                .toLowerCase()
                .replace(/[^a-zа-яё0-9\s]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
            }
          },
        ],
      },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      options: [
        { label: 'Черновик', value: 'draft' },
        { label: 'Опубликован', value: 'published' },
        { label: 'Архив', value: 'archived' },
      ],
      defaultValue: 'draft',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      label: 'Тип сделки',
      options: [
        { label: 'Продажа', value: 'sale' },
        { label: 'Аренда', value: 'rent' },
      ],
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      label: 'Категория',
      options: [
        { label: 'Квартира', value: 'apartment' },
        { label: 'Дом', value: 'house' },
        { label: 'Таунхаус', value: 'townhouse' },
        { label: 'Коммерческая', value: 'commercial' },
        { label: 'Участок', value: 'land' },
      ],
      required: true,
    },
    {
      name: 'price',
      type: 'number',
      label: 'Цена (₽)',
      required: true,
      min: 0,
    },
    {
      name: 'area',
      type: 'number',
      label: 'Площадь (м²)',
    },
    {
      name: 'livingArea',
      type: 'number',
      label: 'Жилая площадь (м²)',
    },
    {
      name: 'kitchenArea',
      type: 'number',
      label: 'Площадь кухни (м²)',
    },
    {
      name: 'rooms',
      type: 'number',
      label: 'Кол-во комнат',
    },
    {
      name: 'floor',
      type: 'number',
      label: 'Этаж',
    },
    {
      name: 'totalFloors',
      type: 'number',
      label: 'Всего этажей',
    },
    {
      name: 'buildingType',
      type: 'select',
      label: 'Тип дома',
      options: [
        { label: 'Кирпичный', value: 'brick' },
        { label: 'Монолитный', value: 'monolith' },
        { label: 'Панельный', value: 'panel' },
        { label: 'Сталинский', value: 'stalin' },
        { label: 'Исторический', value: 'historic' },
      ],
    },
    {
      name: 'condition',
      type: 'select',
      label: 'Состояние',
      options: [
        { label: 'Новостройка', value: 'new' },
        { label: 'Отличное', value: 'excellent' },
        { label: 'Хорошее', value: 'good' },
        { label: 'Требует ремонта', value: 'needsRepair' },
        { label: 'Свободная планировка', value: 'shell' },
      ],
    },
    {
      name: 'heating',
      type: 'select',
      label: 'Отопление',
      options: [
        { label: 'Центральное', value: 'central' },
        { label: 'Автономное', value: 'autonomous' },
        { label: 'Газовое', value: 'gas' },
        { label: 'Электрическое', value: 'electric' },
      ],
    },
    {
      name: 'balcony',
      type: 'select',
      label: 'Балкон',
      options: [
        { label: 'Нет', value: 'none' },
        { label: 'Балкон', value: 'balcony' },
        { label: 'Лоджия', value: 'loggia' },
        { label: 'Несколько', value: 'several' },
      ],
    },
    {
      name: 'address',
      type: 'group',
      label: 'Адрес',
      fields: [
        { name: 'city', type: 'text', label: 'Город', defaultValue: 'Владикавказ' },
        { name: 'district', type: 'text', label: 'Район' },
        { name: 'street', type: 'text', label: 'Улица' },
        { name: 'house', type: 'text', label: 'Дом' },
        { name: 'apartment', type: 'text', label: 'Квартира' },
      ],
    },
    {
      name: 'coordinates',
      type: 'group',
      label: 'Координаты',
      fields: [
        { name: 'lat', type: 'number', label: 'Широта' },
        { name: 'lng', type: 'number', label: 'Долгота' },
      ],
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Описание',
    },
    {
      name: 'features',
      type: 'array',
      label: 'Особенности',
      fields: [
        { name: 'feature', type: 'text', label: 'Особенность' },
      ],
    },
    {
      name: 'images',
      type: 'upload',
      label: 'Фотографии',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'primaryImage',
      type: 'upload',
      label: 'Главное фото',
      relationTo: 'media',
    },
    {
      name: 'floorPlan',
      type: 'upload',
      label: 'План этажа',
      relationTo: 'media',
    },
    {
      name: 'agent',
      type: 'relationship',
      label: 'Агент',
      relationTo: 'agents',
    },
    {
      name: 'isPremium',
      type: 'checkbox',
      label: 'Премиум-объект',
      defaultValue: false,
    },
    {
      name: 'isExclusive',
      type: 'checkbox',
      label: 'Эксклюзив',
      defaultValue: false,
    },
  ],
}
