import { buildConfig } from 'payload'
import { ru } from '@payloadcms/translations/languages/ru'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Objects } from './collections/Objects'
import { Agents } from './collections/Agents'
import { Tasks } from './collections/Tasks'
import { Customers } from './collections/Customers'
import { Emails } from './collections/Emails'
import { MailAttachments } from './collections/MailAttachments'
import { AgentTasks } from './collections/AgentTasks'
import { Applications } from './collections/Applications'
import { Messages } from './collections/Messages'
import { Blog } from './collections/Blog'
import { News } from './collections/News'
import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { MarketListings } from './collections/MarketListings'
// «Реклама на сайте»: рекламодатели, рекламные материалы (с маркировкой
// «Реклама»), заявки с формы страницы /advertising и закрытое хранилище
// материалов заявок (см. src/lib/advertising.ts, src/lib/advertising-legal.ts)
import { Advertisers } from './collections/Advertisers'
import { Advertisements } from './collections/Advertisements'
import { AdvertisingRequests } from './collections/AdvertisingRequests'
import { AdvertisingMaterials } from './collections/AdvertisingMaterials'
// «Юридическая экспертиза объекта»: закрытые хранилища документов и отчётов —
// доступ только через маршруты /api/objects/legal/* (см. src/lib/legal-service.ts)
import { LegalDocuments } from './collections/LegalDocuments'
import { LegalReports } from './collections/LegalReports'
// «Межрегиональная недвижимость»: справочник регионов и населённых пунктов
// (страница /interregional, фильтр «Город» каталога). Пустые коллекции при
// старте заполняет список из кода — см. src/lib/interregional-service.ts
import { Regions } from './collections/Regions'
import { Settlements } from './collections/Settlements'
import { seedInterregional } from '@/lib/interregional-service'
import { SiteSettings } from './globals/SiteSettings'
import { MailSettings } from './globals/MailSettings'
import { AgentSettings } from './globals/AgentSettings'
// «Новости (автосбор)»: состояние чтения официальных RSS-каналов
// (см. src/lib/news.ts и news-service.ts)
import { NewsSettings } from './globals/NewsSettings'
// «Интеграции площадок»: доступы к официальным каналам Авито/ЦИАН/Домклика
// и результаты проверок соединения (см. src/lib/platform-integration-service.ts)
import { PlatformSettings } from './globals/PlatformSettings'
// Форматы и предел размера фото — общие для браузера и сервера
// (см. src/lib/photo-rules.ts)
import { PHOTO_FORMATS_LABEL, PHOTO_MAX_BYTES, PHOTO_MAX_LABEL } from '@/lib/photo-rules'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'n15-dev-secret-change-in-production',
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  // Админка живёт на поддомене — его origin тоже должен быть доверенным,
  // иначе POST-запросы (создание/редактирование) падают с 403 «You are not allowed».
  csrf: [
    'http://localhost:3000',
    process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
    ...(process.env.NEXT_PUBLIC_ADMIN_URL ? [process.env.NEXT_PUBLIC_ADMIN_URL] : []),
  ],
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: './src',
    },
  },
  // Секретный маршрут админки (задаётся в .env на сервере; локально — /admin)
  routes: {
    admin: process.env.ADMIN_ROUTE || '/admin',
  },
  // Предел размера загружаемого файла: у коллекции в Payload v3 такого
  // параметра нет — разбор multipart настраивается здесь (limits — опции
  // busboy, abortOnLimit — что делать при превышении). Без abortOnLimit
  // разбор молча отдаёт усечённый файл (truncated), а без лимита запрос на
  // сотни мегабайт съедает память контейнера на VPS (~2 ГБ). Предел общий
  // для приложения, но коллекция с загрузкой файлов одна — media
  // (см. src/payload/collections/Media.ts, лимиты — src/lib/photo-rules.ts).
  bodyParser: {
    limits: { fileSize: PHOTO_MAX_BYTES },
  },
  upload: {
    abortOnLimit: true,
    responseOnLimit: `Файл больше ${PHOTO_MAX_LABEL} — допустимы ${PHOTO_FORMATS_LABEL} до ${PHOTO_MAX_LABEL}`,
  },
  collections: [Users, Media, Objects, Agents, Applications, Tasks, Messages, Blog, News, Pages, Customers, Emails, MailAttachments, AgentTasks, MarketListings, LegalDocuments, LegalReports, Advertisers, Advertisements, AdvertisingRequests, AdvertisingMaterials, Regions, Settlements],
  globals: [SiteSettings, MailSettings, AgentSettings, NewsSettings, PlatformSettings],
  editor: lexicalEditor(),
  i18n: {
    // Интерфейс админки — только на русском (без переключателя языков)
    supportedLanguages: { ru },
    fallbackLanguage: 'ru',
  },
  db: process.env.DATABASE_URI
    ? postgresAdapter({
        pool: { connectionString: process.env.DATABASE_URI },
      })
    : sqliteAdapter({
        client: {
          url: process.env.DATABASE_URL || 'file:./n15.db',
        },
      }),
  typescript: {
    outputFile: './src/payload-types.ts',
  },
  // Первый запуск на пустой базе: заполняем справочник межрегиональной
  // недвижимости списком из кода. Если в regions уже есть записи, сид ничего
  // не делает — справочник ведётся в CRM, а не в коде (см.
  // src/lib/interregional-service.ts). Ошибка сида старт не роняет: страницы
  // просто покажут пустой справочник, а сид повторится при следующем запуске.
  onInit: async (payload) => {
    try {
      const created = await seedInterregional(payload)
      if (created > 0) {
        console.log(`[interregional] справочник заполнен: записей — ${created}`)
      }
    } catch (e) {
      console.error('[interregional] не удалось заполнить справочник:', e)
    }
  },
  sharp,
})
