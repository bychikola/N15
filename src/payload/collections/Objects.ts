import type { CollectionConfig, Where } from 'payload'
import { DISTRICT_OPTIONS } from '@/lib/districts'

const normPhone = (v?: string) => (v || '').replace(/[^\d+]/g, '')
const normCadastral = (v?: string) => (v || '').toLowerCase().replace(/\s+/g, '')

// База slug из названия: только латиница в нижнем регистре, цифры и дефисы.
// Любые прочие символы (кириллица, пробелы, спецсимволы) заменяются на дефис
// и затем подчищаются по краям. Если в названии не осталось ни одной
// латинской буквы (русские названия) — возвращается пустая строка,
// и вызывающий берёт резервный вариант object-<идентификатор>.
const toSlugBase = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /[a-z]/.test(base) ? base : ''
}

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
      // Автогенерация slug при каждом сохранении (создание и правка).
      // Отдельным хуком — чтобы работал и при force=true: следующий хук
      // при force выходит раньше времени. Правила:
      //  - название не менялось (или его нет в данных) — slug не трогаем,
      //    иначе каждая правка цены/статуса переименовывала бы объект;
      //  - название на латинице → slug из него; при конфликте
      //    уникальности добавляется суффикс -2, -3, …;
      //  - кириллическое/пустое название → резервный object-<идентификатор>
      //    (на правке — id записи, при создании — случайный: id БД выдаёт
      //    уже после хуков).
      // ВАЖНО: на update Payload подмешивает в data текущий документ, но id
      // кладёт только в originalDoc — «самого себя» при проверке уникальности
      // исключаем по originalDoc.id, иначе slug рос бы -2, -2-2, -2-2-2…
      // при каждом редактировании.
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        // Slug пересобираем, только когда в данных есть название: частичный
        // PATCH (например, один статус) не должен переименовывать объект.
        if (typeof data.title !== 'string') return data
        const orig = originalDoc as { id?: number | string; title?: string } | undefined
        const curId = orig?.id ?? (data.id as number | string | undefined)
        const curSlug = typeof data.slug === 'string' ? data.slug : ''
        const title = data.title.trim()
        // Название не изменилось — сохраняем текущий slug как есть.
        // Пустой curSlug (легаси-записи без slug) всё равно заполняем ниже.
        if (orig?.title !== undefined && orig.title === data.title && curSlug) {
          return data
        }
        // База slug: латиница названия либо резервный object-<идентификатор>.
        // Уже существующий резервный slug не переписываем: случайная правка
        // кириллического названия не должна переименовывать объект.
        const base =
          toSlugBase(title) ||
          (curSlug.startsWith('object-') ? curSlug : `object-${curId ?? crypto.randomUUID().slice(0, 8)}`)
        // Совпало с текущим — менять нечего (например, правка латинского
        // названия при пустом/устаревшем slug в БД).
        if (curSlug && curSlug === base) return data
        const isTaken = async (slug: string) => {
          const where: Where = curId
            ? { and: [{ slug: { equals: slug } }, { id: { not_equals: curId } }] }
            : { slug: { equals: slug } }
          const { docs } = await req.payload.find({
            collection: 'objects',
            where,
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          return docs.length > 0
        }
        let slug = base
        let n = 2
        while (await isTaken(slug)) {
          slug = `${base}-${n}`
          n += 1
        }
        data.slug = slug
        return data
      },
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
        // force=true приходит query-параметром; в разных окружениях Payload
        // кладёт его в req.query / req.searchParams / req.nextUrl
        const anyReq = req as unknown as {
          searchParams?: URLSearchParams
          nextUrl?: { searchParams?: URLSearchParams }
          query?: URLSearchParams | Record<string, unknown>
        }
        let force = false
        const sp = anyReq.searchParams || anyReq.nextUrl?.searchParams
        if (sp && typeof sp.get === 'function') {
          force = sp.get('force') === 'true'
        }
        if (!force && anyReq.query && typeof anyReq.query === 'object' && 'get' in anyReq.query) {
          force = (anyReq.query as URLSearchParams).get('force') === 'true'
        }
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
      // Поле служебное: slug всегда генерируется автоматически при
      // сохранении (см. хук beforeChange выше), пользователю не показываем.
      admin: {
        hidden: true,
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
        {
          name: 'district',
          type: 'select',
          label: 'Район',
          options: DISTRICT_OPTIONS.map((d) => ({ label: d, value: d })),
        },
        {
          name: 'locality',
          type: 'text',
          label: 'Населённый пункт',
          admin: {
            description: 'Например: Владикавказ, Ногир, Заводской…',
          },
        },
        { name: 'street', type: 'text', label: 'Улица' },
        { name: 'house', type: 'text', label: 'Дом' },
        { name: 'apartment', type: 'text', label: 'Квартира' },
      ],
    },
    {
      name: 'coordinates',
      type: 'group',
      label: 'Координаты',
      // Ручной ввод убран: координаты ставит карта в форме CRM (поиск адреса,
      // метка перетаскивается). Поля остаются в схеме — значения приходят
      // через REST, как и раньше.
      admin: {
        hidden: true,
      },
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
