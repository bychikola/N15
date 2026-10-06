import type { GlobalConfig } from 'payload'

// «Источники объектов»: какие разрешённые источники включены, доступы к
// подключаемым по договору каналам, журнал попыток забора и состояние
// источников (сбои и автоостановка). Реестр самих источников и правила работы
// с ними — в коде (src/lib/object-sources.ts): подключить можно только
// разрешённый канал, запрещённые в этот глобал вообще не попадают (групп для
// них нет). Каждый канал работает независимо: сбой одного источника не трогает
// ни другие, ни сайт; сбойный источник автоматически останавливается, а его
// состояние видно администратору в разделе CRM «Источники объектов».
//
// Секреты доступов закрыты на чтение (access.read: false): иначе глобал
// отдавал бы их открытым текстом в ответе /api/globals/object-source-settings.
// Сервер читает их через Local API с overrideAccess
// (см. src/lib/object-source-service.ts), а наружу отдаётся только признак
// «заполнено» и хвост значения.
const secretRead = (): false => false

export const ObjectSourceSettings: GlobalConfig = {
  slug: 'object-source-settings',
  label: 'Источники объектов',
  admin: {
    group: 'Источники объектов',
    description:
      'Какие источники объектов включены и какие доступы заданы. Работают три канала: «Заявки собственников» (читает открытые заявки из своей базы), «ГИС Торги» (публичный JSON-API портала torgi.gov.ru) и «Партнёрские агентства» (читает согласованный JSON-фид по договору). Все кладут объекты в очередь со статусом «Ждёт решения»; XML и NMarket пока не подключены. Публикация из источника — только вручную: одобренный объект сотрудник переносит в каталог черновиком. Источник, переставший отвечать или сменивший формат ответа, останавливается автоматически — на вкладке «Состояние источников» видно почему.',
  },
  access: {
    read: ({ req: { user } }) => user?.role === 'admin',
    update: ({ req: { user } }) => user?.role === 'admin',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Источники',
          fields: [
            {
              name: 'manual',
              type: 'group',
              label: 'Н15: ручной ввод',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: true,
                  admin: { description: 'Собственные объекты агентства: карточку заводит сотрудник в CRM' },
                },
              ],
            },
            {
              name: 'owner',
              type: 'group',
              label: 'Заявки собственников',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: true,
                  admin: { description: 'Заявки с формы «Предложить объект»: собственник даёт согласие сам' },
                },
              ],
            },
            {
              name: 'gisTorgi',
              type: 'group',
              label: 'ГИС Торги',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: false,
                  admin: {
                    description:
                      'Публичный JSON-API портала торгов torgi.gov.ru: доступы не нужны, канал открыт. Публикации нет — кандидаты ждут решения',
                  },
                },
              ],
            },
            {
              name: 'partner',
              type: 'group',
              label: 'Партнёрские агентства',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: false,
                  admin: { description: 'Приём объектов только по договору с партнёром' },
                },
                { name: 'feedUrl', type: 'text', label: 'Адрес выгрузки', access: { read: secretRead } },
                { name: 'token', type: 'text', label: 'Токен доступа', access: { read: secretRead } },
              ],
            },
            {
              name: 'developer',
              type: 'group',
              label: 'Застройщики',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: false,
                  admin: { description: 'Приём объектов только по договору с застройщиком' },
                },
                { name: 'feedUrl', type: 'text', label: 'Адрес выгрузки', access: { read: secretRead } },
                { name: 'token', type: 'text', label: 'Токен доступа', access: { read: secretRead } },
              ],
            },
            {
              name: 'nmarket',
              type: 'group',
              label: 'NMarket.PRO',
              fields: [
                {
                  name: 'enabled',
                  type: 'checkbox',
                  label: 'Источник включён',
                  defaultValue: false,
                  admin: { description: 'Обмен объектами по официальному API при действующем доступе' },
                },
                { name: 'apiKey', type: 'text', label: 'API-ключ', access: { read: secretRead } },
              ],
            },
          ],
        },
        {
          label: 'Журнал забора',
          fields: [
            {
              name: 'runs',
              type: 'array',
              label: 'Последние попытки забора объектов',
              admin: {
                description:
                  'Заполняется автоматически при запуске забора. У подключённых источников здесь видны попытки: сколько записей найдено, сколько добавлено в очередь и обновлено при повторном заборе.',
              },
              fields: [
                {
                  name: 'source',
                  type: 'select',
                  label: 'Источник',
                  required: true,
                  options: [
                    { label: 'Н15: ручной ввод', value: 'manual' },
                    { label: 'Заявки собственников', value: 'owner' },
                    { label: 'Партнёрские агентства', value: 'partner' },
                    { label: 'Застройщики', value: 'developer' },
                    { label: 'NMarket.PRO', value: 'nmarket' },
                  ],
                },
                { name: 'at', type: 'date', label: 'Когда', admin: { date: { pickerAppearance: 'dayAndTime' } } },
                { name: 'found', type: 'number', label: 'Найдено записей' },
                { name: 'added', type: 'number', label: 'Добавлено в очередь' },
                { name: 'message', type: 'textarea', label: 'Что произошло' },
              ],
            },
          ],
        },
        {
          label: 'Состояние источников',
          fields: [
            {
              name: 'health',
              type: 'array',
              label: 'Сбои и автоостановка источников',
              admin: {
                readOnly: true,
                description:
                  'Заполняется автоматически после каждого забора. Одна запись на источник: сколько сбоев подряд, последняя ошибка и остановлен ли забор автоматически. Источник, переставший отвечать или сменивший формат ответа, останавливается — уже полученные объекты при этом сохраняются. Возобновить забор можно в разделе CRM «Источники объектов».',
              },
              fields: [
                // Ключ источника — текстом, а не select: значения не привязаны к
                // enum в базе, поэтому новый источник не требует менять тип БД
                { name: 'source', type: 'text', label: 'Источник', required: true },
                { name: 'failCount', type: 'number', label: 'Сбоев подряд' },
                { name: 'lastFailureAt', type: 'date', label: 'Последний сбой', admin: { date: { pickerAppearance: 'dayAndTime' } } },
                { name: 'lastFailureKind', type: 'text', label: 'Вид сбоя' },
                { name: 'lastError', type: 'textarea', label: 'Что произошло при сбое' },
                { name: 'autoPaused', type: 'checkbox', label: 'Забор остановлен автоматически' },
                { name: 'autoPausedAt', type: 'date', label: 'Когда остановлен', admin: { date: { pickerAppearance: 'dayAndTime' } } },
                { name: 'autoPauseReason', type: 'textarea', label: 'Почему остановлен' },
                { name: 'lastRunAt', type: 'date', label: 'Последний забор', admin: { date: { pickerAppearance: 'dayAndTime' } } },
                { name: 'lastOutcome', type: 'text', label: 'Итог последнего забора' },
                { name: 'lastMessage', type: 'textarea', label: 'Сообщение последнего забора' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
