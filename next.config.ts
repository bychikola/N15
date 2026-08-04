import type { NextConfig } from 'next'
import { withPayload } from '@payloadcms/next/withPayload'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3000' },
      { protocol: 'https', hostname: 'n15.ru' },
      { protocol: 'https', hostname: 'www.n15.ru' },
    ],
  },
}

export default withPayload(nextConfig)
