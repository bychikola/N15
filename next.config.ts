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
}

export default withPayload(nextConfig)
