import type { CollectionConfig } from 'payload'
import { translitSlug } from '@/lib/slug'
import {
  SETTLEMENT_CATEGORIES,
  SETTLEMENT_DEFAULT_CATEGORY,
  SETTLEMENT_DEFAULT_DEAL_TYPE,
  SETTLEMENT_DEAL_TYPES,
} from '@/lib/interregional'

/** Подписи категорий — те же, что у поля category объектов (см. Objects.ts) */
const CATEGORY_LABELS: Record<(typeof SETTLEMENT_CATEGORIES)[number], string> = {
  apartment: 'Квартира',
  house: 'Дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая',
  land: 'Участок',
}

/** Подписи типов сделки страницы населённого пункта */
const DEAL_LABELS: Record<(typeof SETTLEMENT_DEAL_TYPES)[number], string> = {
  sale: 'Продажа',
  rent: 'Аренда',
  any: 'Любая',
}

/**
 * «Населённые пункты» — второй уровень справочника межрегиональной
 * недвижимости: населённый пункт принадлежит региону (regions) и открывается
 * своей страницей с объектами (/<язык>/interregional/<регион>/<населённый пункт>).
 *
 * Каждый населённый пункт связан с фильтром квартир страницы: полями
 * «Город в адресах объектов» (address.city), «Категория» и «Тип сделки».
 * Значения по умолчанию — квартиры в продаже; страница показывает ровно то,
 * что описано здесь, поэтому новый населённый пункт заводится без изменения
 * кода сайта.
 *
 * «Показывать всегда»: галочка — строка видна в списке региона постоянно
 * (даже без объектов, с пометкой «Объектов Н15 пока нет»); без галочки
 * населённый пункт появляется, когда в нём есть опубликованные объекты —
 * так длинный список «и другие населённые пункты» не выдумывает предложения.
 */
export const Settlements: CollectionConfig = {
  slug: 'settlements',
  labels: { singular: 'Населённый пункт', plural: 'Населённые пункты (межрегиональная недвижимость)' },
  admin: {
    useAsTitle: 'name',
    group: 'Контент',
    defaultColumns: ['name', 'region', 'city', 'category', 'dealType', 'alwaysVisible', 'order'],
    description: 'Населённые пункты регионов: страница с объектами по фильтру ниже',
  },
  defaultSort: 'order',
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'agent' || user?.role === 'admin',
    delete: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Название населённого пункта',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'URL-путь',
      index: true,
      // Путь уникален внутри региона (а не во всей коллекции): адрес страницы
      // собирается как /interregional/<регион>/<населённый пункт>, поэтому
      // одноимённые сёла в разных регионах не конфликтуют
      admin: { hidden: true },
    },
    {
      name: 'region',
      type: 'relationship',
      relationTo: 'regions',
      label: 'Регион',
      required: true,
    },
    {
      name: 'group',
      type: 'text',
      label: 'Подгруппа',
      admin: {
        description: 'Подзаголовок внутри региона (например, «Московская область»). Пусто — населённый пункт идёт без подгруппы',
      },
    },
    {
      name: 'city',
      type: 'text',
      label: 'Город в адресах объектов',
      admin: {
        description: 'Значение поля «Город» (address.city) у объектов. Пусто — совпадает с названием населённого пункта',
      },
    },
    {
      name: 'category',
      type: 'select',
      label: 'Категория объектов',
      options: SETTLEMENT_CATEGORIES.map((value) => ({ label: CATEGORY_LABELS[value], value })),
      defaultValue: SETTLEMENT_DEFAULT_CATEGORY,
      required: true,
      admin: { description: 'Что показывать на странице населённого пункта. По умолчанию — квартиры' },
    },
    {
      name: 'dealType',
      type: 'select',
      label: 'Тип сделки',
      options: SETTLEMENT_DEAL_TYPES.map((value) => ({ label: DEAL_LABELS[value], value })),
      defaultValue: SETTLEMENT_DEFAULT_DEAL_TYPE,
      required: true,
    },
    {
      name: 'alwaysVisible',
      type: 'checkbox',
      label: 'Показывать всегда',
      defaultValue: false,
      admin: {
        description: 'Строка видна в списке региона даже без объектов (с пометкой «Объектов Н15 пока нет»). Без галочки населённый пункт появляется, когда в нём есть опубликованные объекты',
      },
    },
    {
      name: 'order',
      type: 'number',
      label: 'Порядок',
      defaultValue: 0,
      admin: { description: 'Порядок строк внутри региона: меньше — выше' },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc, operation }) => {
        if (!data) return data
        // Значение «город в адресах» подставляем сразу: страница сравнивает
        // его с address.city объектов, и пустое поле молча ломало бы выдачу
        if (typeof data.city === 'string' && !data.city.trim()) data.city = null
        const name = (typeof data.name === 'string' && data.name.trim())
          || (typeof originalDoc?.name === 'string' ? originalDoc.name : '')
        if (data.city == null && name) data.city = name

        if (operation !== 'create') {
          // На правке путь не пересобираем: ссылки на страницу населённого
          // пункта не должны меняться от правки названия
          delete data.slug
          return data
        }
        const rel = data.region
        const regionId = typeof rel === 'object' && rel !== null
          ? (rel as { id?: number | string }).id
          : rel
        const base = translitSlug(name) || `place-${crypto.randomUUID().slice(0, 8)}`
        let slug = base
        // Уникальность — внутри региона: -2, -3… для одноимённых сёл
        for (let n = 2; n < 50; n += 1) {
          const { totalDocs } = await req.payload.count({
            collection: 'settlements',
            where: {
              and: [
                { slug: { equals: slug } },
                ...(regionId != null ? [{ region: { equals: regionId } }] : []),
              ],
            },
            overrideAccess: true,
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
