import type { NextConfig } from 'next'
import { withPayload } from '@payloadcms/next/withPayload'

// В сборке (NODE_ENV=production) Next не использует eval, поэтому
// 'unsafe-eval' оставляем только для `next dev` (иначе ломается HMR).
const isDev = process.env.NODE_ENV !== 'production'

// Внешние источники, без которых не работают карты и аналитика сайта:
// JavaScript API Яндекс.Карт, тайлы и геокодер (*.yandex.ru / *.yandex.net),
// статика Яндекса (yastatic.net) и счётчик Яндекс.Метрики (mc.yandex.ru).
// Всё остальное — шрифты Inter и Material Symbols, иконки, изображения —
// отдаётся с нашего домена (см. src/app/globals.css, public/fonts).
// Список расширяется только вместе с проверкой CSP в браузере.
const YANDEX_SOURCES = [
  'https://yandex.ru',
  'https://*.yandex.ru',
  'https://*.yandex.net',
  'https://yastatic.net',
  'https://*.yastatic.net',
]

/**
 * Content-Security-Policy.
 *
 * Задача первого этапа — закрыть дыры (внешние скрипты с чужих доменов,
 * подмена base-uri, плагины, фрейминг), не сломав карты, аналитику,
 * загрузку фото (blob:) и фоновую музыку. Инлайновые скрипты и стили Next
 * и Яндекс.Карт требуют 'unsafe-inline' — без nonce (его здесь нет) иначе
 * страницы и админка просто не поднимутся. От 'unsafe-eval' в продакшене
 * отказались.
 */
function contentSecurityPolicy(): string {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${YANDEX_SOURCES.join(' ')}`,
    // Инлайн-стили пишут Next, Payload и Яндекс.Карты; внешние таблицы
    // стилей карт приходят с доменов Яндекса
    `style-src 'self' 'unsafe-inline' ${YANDEX_SOURCES.join(' ')}`,
    // blob: — предпросмотр только что выбранных фото (URL.createObjectURL)
    `img-src 'self' data: blob: ${YANDEX_SOURCES.join(' ')}`,
    "font-src 'self' data:",
    // Фоновая музыка (public/audio); blob: — на случай предпросмотра медиа
    "media-src 'self' blob:",
    // fetch/XHR/WebSocket страниц сайта и админки
    `connect-src 'self' ${YANDEX_SOURCES.join(' ')}`,
    // Фреймы только свои; на всякий случай — домены Яндекса (карты)
    `frame-src 'self' ${YANDEX_SOURCES.join(' ')}`,
    // Monaco/воркеры редактора Payload собираются из blob:
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Только в продакшене: на http://localhost:3000 апгрейд сломал бы dev
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ]
  return csp.join('; ')
}

const nextConfig: NextConfig = {
  // Не раскрываем стек (сейчас ответы отдают «x-powered-by: Next.js, Payload»)
  poweredByHeader: false,
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
      // Security headers — на все ответы приложения (сайт, CRM, админка,
      // API и статика). HSTS браузер учитывает только по HTTPS; по HTTP он
      // игнорируется, поэтому локальной разработке не мешает.
      {
        source: '/:path*',
        headers: [
          // Год + поддомены. preload не ставим: это необратимое обещание,
          // к нему стоит вернуться отдельно (см. задачу по безопасности).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Запрет MIME-сниффинга: браузер не «догадывается» о типе файла
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Сайт нигде не встраивается фреймом; CSP frame-ancestors ниже — дубль
          // для старых браузеров, которые не читают frame-ancestors
          { key: 'X-Frame-Options', value: 'DENY' },
          // Внешним сайтам — только origin (без пути и query); своим — полный URL
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
        ],
      },
      {
        source: '/audio/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ]
  },
}

export default withPayload(nextConfig)
