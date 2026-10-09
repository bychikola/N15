import type { CollectionConfig } from 'payload'

/**
 * Кварталы сдачи: код уходит в базу, подпись показывает админка. На публичной
 * странице квартал собирается из кода (см. страницу комплекса) — «II квартал».
 */
const QUARTER_OPTIONS = [
  { label: 'I квартал', value: 'q1' },
  { label: 'II квартал', value: 'q2' },
  { label: 'III квартал', value: 'q3' },
  { label: 'IV квартал', value: 'q4' },
] as const

/**
 * «Жилые комплексы» — комплексы застройщика (коллекция developers). Базовые
 * сведения — название, застройщик, населённый пункт и улица; в карточке объекта
 * выбирается комплекс выбранного застройщика (см. поле complex коллекции
 * Objects и форму CRM CrmObjects).
 *
 * Полная карточка комплекса собирается здесь: описание, планировочные решения
 * с изображениями, сроки сдачи по корпусам, помещения и инфраструктура, способы
 * приобретения, вопросы и ответы, фотоотчёты со стройки и карточка обратной
 * связи. Блоки свёрнуты (collapsible) — иначе форма правки вытягивается на
 * несколько экранов. Показываются они на публичной странице комплекса
 * (см. src/app/(site)/[lang]/newbuildings/complexes/[id]).
 *
 * Раздел ведут только администраторы. Читают справочник сотрудники CRM;
 * публичная страница собирает выдачу сервером при опубликованном застройщике
 * (showOnSite) — на сайт уходят только поля комплекса, служебных данных
 * представителя застройщика среди них нет.
 */
export const Complexes: CollectionConfig = {
  slug: 'complexes',
  labels: { singular: 'Жилой комплекс', plural: 'Жилые комплексы' },
  admin: {
    useAsTitle: 'name',
    group: 'Недвижимость',
    defaultColumns: ['name', 'developer', 'locality', 'street'],
    description:
      'Жилые комплексы застройщиков: название, адрес и карточка комплекса для страницы на сайте',
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

    // ── Описание комплекса ─────────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Описание комплекса',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'description',
          type: 'textarea',
          label: 'Описание',
          admin: {
            description:
              'О комплексе: расположение, архитектура, что рядом. Большое текстовое поле — показывается на странице комплекса',
          },
        },
      ],
    },

    // ── Планировочные решения ──────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Планировочные решения',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'planningText',
          type: 'textarea',
          label: 'Описание планировок',
          admin: {
            description: 'Какие планировки есть: студии, однушки, двушки… Что важно знать покупателю',
          },
        },
        {
          name: 'planningImages',
          type: 'upload',
          relationTo: 'media',
          hasMany: true,
          label: 'Изображения и схемы планировок',
          admin: {
            description: 'Планы этажей и схемы планировок. Порядок — как загружены',
          },
        },
      ],
    },

    // ── Сроки сдачи ────────────────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Сроки сдачи',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'completion',
          type: 'array',
          label: 'Сроки по корпусам',
          labels: { singular: 'Срок сдачи', plural: 'Сроки сдачи' },
          admin: { description: 'Для каждого корпуса или очереди — квартал и год сдачи' },
          fields: [
            {
              name: 'building',
              type: 'text',
              label: 'Корпус / очередь',
              admin: { description: 'Например: «Корпус 1», «2-я очередь», «Литер А»' },
            },
            {
              name: 'quarter',
              type: 'select',
              label: 'Квартал',
              options: QUARTER_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
            },
            {
              name: 'year',
              type: 'number',
              label: 'Год',
              admin: { description: 'Например: 2027' },
            },
          ],
        },
      ],
    },

    // ── Помещения и инфраструктура ─────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Помещения и инфраструктура',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'premises',
          type: 'group',
          label: 'Что есть в комплексе',
          fields: [
            { name: 'parking', type: 'checkbox', label: 'Паркинг' },
            { name: 'storage', type: 'checkbox', label: 'Кладовые' },
            { name: 'commercial', type: 'checkbox', label: 'Коммерческие помещения' },
            {
              name: 'other',
              type: 'text',
              label: 'Другие помещения',
              admin: { description: 'Свободным текстом, если есть другие типы — например, колясочные' },
            },
          ],
        },
      ],
    },

    // ── Способы приобретения ───────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Способы приобретения',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'purchaseMethods',
          type: 'group',
          label: 'Как можно купить',
          fields: [
            { name: 'mortgage', type: 'checkbox', label: 'Ипотека' },
            { name: 'familyMortgage', type: 'checkbox', label: 'Семейная ипотека' },
            { name: 'militaryMortgage', type: 'checkbox', label: 'Военная ипотека' },
            { name: 'installment', type: 'checkbox', label: 'Рассрочка' },
            { name: 'cash', type: 'checkbox', label: 'Наличный расчёт' },
            {
              name: 'other',
              type: 'text',
              label: 'Другие варианты',
              admin: { description: 'Свободным текстом — например, «трейд-ин»' },
            },
          ],
        },
      ],
    },

    // ── Вопросы и ответы ───────────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Вопросы и ответы',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'faq',
          type: 'array',
          label: 'Вопросы и ответы',
          labels: { singular: 'Вопрос', plural: 'Вопросы' },
          admin: { description: 'Частые вопросы о комплексе — показываются раскрывающимся списком' },
          fields: [
            { name: 'question', type: 'text', label: 'Вопрос', required: true },
            { name: 'answer', type: 'textarea', label: 'Ответ', required: true },
          ],
        },
      ],
    },

    // ── Карточка обратной связи ────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Карточка обратной связи',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'feedback',
          type: 'group',
          label: 'Форма заявки на странице комплекса',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              label: 'Показывать карточку',
              defaultValue: true,
              admin: {
                description:
                  'Форма «имя, телефон, комментарий» на странице комплекса. Заявки уходят в CRM («Заявки», тип «Консультация»)',
              },
            },
            {
              name: 'title',
              type: 'text',
              label: 'Заголовок карточки',
              admin: { description: 'По умолчанию — «Получить консультацию»' },
            },
            {
              name: 'text',
              type: 'textarea',
              label: 'Пояснение под заголовком',
              admin: { description: 'Необязательно: чем поможет консультация' },
            },
            {
              name: 'buttonLabel',
              type: 'select',
              label: 'Подпись кнопки',
              defaultValue: 'consultation',
              options: [
                { label: 'Получить консультацию', value: 'consultation' },
                { label: 'Узнать подробнее', value: 'details' },
              ],
            },
          ],
        },
      ],
    },

    // ── Фотоотчёты со стройки ──────────────────────────────────────────────
    {
      type: 'collapsible',
      label: 'Фотоотчёты со стройки',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'photoReports',
          type: 'array',
          label: 'Фотоотчёты',
          labels: { singular: 'Фотоотчёт', plural: 'Фотоотчёты' },
          admin: {
            description: 'Каждая запись — дата и подпись этапа строительства, к ней прикладываются фото',
          },
          fields: [
            {
              name: 'date',
              type: 'date',
              label: 'Дата',
              admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'dd.MM.yyyy' } },
            },
            {
              name: 'stage',
              type: 'text',
              label: 'Этап строительства',
              admin: { description: 'Например: «Возведение 3-го этажа», «Установка лифтов»' },
            },
            {
              name: 'photos',
              type: 'upload',
              relationTo: 'media',
              hasMany: true,
              label: 'Фотографии',
            },
          ],
        },
      ],
    },
  ],
}
