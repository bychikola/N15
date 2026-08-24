import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Objects } from './collections/Objects'
import { Agents } from './collections/Agents'
import { Tasks } from './collections/Tasks'
import { Customers } from './collections/Customers'
import { Emails } from './collections/Emails'
import { Applications } from './collections/Applications'
import { Messages } from './collections/Messages'
import { Blog } from './collections/Blog'
import { Pages } from './collections/Pages'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { SiteSettings } from './globals/SiteSettings'
import { MailSettings } from './globals/MailSettings'

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
  collections: [Users, Media, Objects, Agents, Applications, Tasks, Messages, Blog, Pages, Customers, Emails],
  globals: [SiteSettings, MailSettings],
  editor: lexicalEditor(),
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
  sharp,
})
