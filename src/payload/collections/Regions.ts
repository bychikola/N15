import type { CollectionConfig } from 'payload'
import { translitSlug } from '@/lib/slug'

/**
 * «Регионы межрегиональной недвижимости» — верхний уровень справочника раздела
 * «Межрегиональная недвижимость» (страница /interregional и карточки блока на
 * главной). Второй уровень — коллекция settlements (населённые пункты региона),
 * третий — страница населённого пункта с объектами квартир.
 *
 * Справочник ведётся в CRM: список из кода (src/lib/interregional.ts) при
 * старте только заполняет пустые коллекции, дальше сотрудник правит регионы
 * здесь — добавленный регион появляется на сайте сам.
 *
 * Порядок строк — поле order (меньше — выше), пустой slug ставится сам из
 * названия (латиницей, см. src/lib/slug.ts) и после создания не меняется:
 * адрес страницы населённого пункта не должен ломаться от правки названия.
 */
export const Regions: CollectionConfig = {
  slug: 'regions',
  labels: { singular: 'Регион', plural: 'Регионы (межрегиональная недвижимость)' },
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
    defaultColumns: ['title', 'slug', 'order', 'updatedAt'],
    description: 'Регионы раздела «Межрегиональная недвижимость»: раскрываются в населённые пункты',
  },
  defaultSort: 'order',
  access: {
    // Справочник публичный: его читают страницы сайта и фильтр «Город» каталога
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Название региона',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL-путь',
      unique: true,
      index: true,
      // Поле служебное: slug собирается из названия в хуке ниже, сотруднику
      // его показывать не нужно
      admin: { hidden: true },
    },
    {
      name: 'order',
      type: 'number',
      label: 'Порядок',
      defaultValue: 0,
      admin: { description: 'Порядок строк на странице «Межрегиональная недвижимость»: меньше — выше' },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (!data || operation !== 'create') {
          // На правке slug не трогаем: ссылки на страницы населённых пунктов
          // не должны меняться от правки названия региона
          if (data) delete data.slug
          return data
        }
        const title = typeof data.title === 'string' ? data.title.trim() : ''
        const base = translitSlug(title) || `region-${crypto.randomUUID().slice(0, 8)}`
        let slug = base
        // Уникальность slug держит поле (unique), но понятнее подобрать
        // свободный путь сразу: -2, -3… вместо ошибки сохранения
        for (let n = 2; n < 50; n += 1) {
          const { totalDocs } = await req.payload.count({
            collection: 'regions',
            where: { slug: { equals: slug } },
            overrideAccess: true,
            req,
          })
          if (!totalDocs) break
          slug = `${base}-${n}`
        }
        data.slug = slug
        return data
      },
    ],
  },
}
