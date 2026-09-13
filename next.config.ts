import type { NextConfig } from 'next'
import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3000' },
      { protocol: 'https', hostname: 'n15-realty.ru' },
      { protocol: 'https', hostname: 'www.n15-realty.ru' },
    ],
    // Разрешённые качества next/image (иначе q=85 → 400 Bad Request)
    qualities: [75, 85],
  },
  // VPS всего 2 ядра и ~2 ГБ свободной RAM: ограничиваем число воркеров
  // сборки, иначе Next разворачивает по воркеру на ядро и упирается в память
  experimental: {
    cpus: 2,
  },
  // Фоновая музыка (public/audio): файлы тяжёлые, а браузер по умолчанию
  // (max-age=0) перепроверяет их на каждой странице. Кэш на неделю, как
  // у статики в Caddyfile; при замене трека менять имя файла, а не только
  // содержимое (см. public/audio/CREDITS.md).
  async headers() {
    return [
      {
        source: '/audio/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ]
  },
}

export default withPayload(nextConfig)
