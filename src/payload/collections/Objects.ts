import type { CollectionConfig, Where } from 'payload'

const normPhone = (v?: string) => (v || '').replace(/[^\d+]/g, '')
const normCadastral = (v?: string) => (v || '').toLowerCase().replace(/\s+/g, '')

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
  hooks: {
    beforeChange: [
      // Нормализация полей собственника + защита от жёстких дублей.
      // Полный анализ (включая адрес и имя) делает клиент через
      // /api/objects/check-duplicate; здесь — телефон и кадастровый,
      // чтобы дубль нельзя было создать ни через API, ни через админку.
      async ({ data, req }) => {
        if (!data) return data
        if (data.ownerPhone) {
          data.ownerPhone = normPhone(data.ownerPhone)
        }
        if (data.cadastralNumber) {
          data.cadastralNumber = normCadastral(data.cadastralNumber)
        }
        const q = req.query as URLSearchParams | Record<string, unknown> | undefined
        const force = typeof q === 'object' && q !== null && 'get' in q
          ? (q as URLSearchParams).get('force') === 'true'
          : false
        if (force) return data
        const or: Where[] = []
        if (data.ownerPhone) {
          or.push({ ownerPhone: { equals: data.ownerPhone } })
        }
        if (data.cadastralNumber) {
          or.push({ cadastralNumber: { equals: data.cadastralNumber } })
        }
        if (or.length) {
          const where: Where = data.id ? { and: [{ or }, { id: { not_equals: data.id } }] } : { or }
          const { docs } = await req.payload.find({
            collection: 'objects',
            where,
            limit: 5,
            depth: 0,
            overrideAccess: true,
          })
          if (docs.length) {
            throw new Error('Такой объект уже есть в базе: совпал телефон или кадастровый номер собственника')
          }
        }
        return data
      },
    ],
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
      type: 'text',
      label: 'Тип дома',
      admin: {
        description: 'Любое значение. Например: Кирпичный, Монолитный, Панельный',
      },
    },
    {
      name: 'condition',
      type: 'text',
      label: 'Состояние',
      admin: {
        description: 'Любое значение. Например: Новое, Хорошее, Требует ремонта',
      },
    },
    {
      name: 'heating',
      type: 'text',
      label: 'Отопление',
      admin: {
        description: 'Любое значение. Например: Центральное, Автономное, Газовое',
      },
    },
    {
      name: 'water',
      type: 'text',
      label: 'Вода',
      admin: {
        description: 'Любое значение. Например: Есть, Центральная, Своя',
      },
    },
    {
      name: 'sewerage',
      type: 'text',
      label: 'Канализация',
      admin: {
        description: 'Любое значение. Например: Есть, Центральная, Септик',
      },
    },
    {
      name: 'electricity',
      type: 'text',
      label: 'Электричество',
      admin: {
        description: 'Любое значение. Например: Есть, Нет',
      },
    },
    {
      name: 'gas',
      type: 'text',
      label: 'Газ',
      admin: {
        description: 'Любое значение. Например: Есть, Магистральный, Баллонный',
      },
    },
    {
      name: 'internet',
      type: 'text',
      label: 'Интернет',
      admin: {
        description: 'Любое значение. Например: Есть, Нет',
      },
    },
    {
      name: 'balcony',
      type: 'text',
      label: 'Балкон',
      admin: {
        description: 'Любое значение. Например: Есть, Лоджия, Несколько',
      },
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
      name: 'ownerName',
      type: 'text',
      label: 'Собственник (имя)',
      admin: {
        description: 'По имени и телефону собственника система находит дубли объекта',
      },
    },
    {
      name: 'ownerPhone',
      type: 'text',
      label: 'Собственник (телефон)',
      admin: {
        description: 'Хранится нормализованно: только цифры и +',
      },
    },
    {
      name: 'cadastralNumber',
      type: 'text',
      label: 'Кадастровый номер',
      admin: {
        description: 'Например: 15:07:0030021:123',
      },
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
