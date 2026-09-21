'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** Адрес счётчика: тот же origin, ответ — пустой 204 (см. app/api/visit) */
const ENDPOINT = '/api/visit'

/**
 * Счётчик посещений сайта: при открытии страницы отправляет маячок с её
 * адресом. Клиентский, а не серверный, по двум причинам: переходы внутри
 * сайта (Next меняет страницу без перезагрузки) серверный счётчик не увидел
 * бы, а вызов headers() в общем layout'е сделал бы динамическими все
 * страницы сайта, включая статические.
 *
 * Данные обезличенные (см. src/lib/site-stats.ts), в CRM их видит только
 * администратор. Маячок уходит «в фоне» (sendBeacon) — на скорость открытия
 * страницы он не влияет, а если браузер его заблокирует, страница просто не
 * попадёт в статистику.
 */
export function SiteVisitTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return

    // document.referrer — это источник ЗАГРУЗКИ документа, поэтому при
    // переходах внутри сайта он не меняется. Свои же адреса не отправляем:
    // переход внутри сайта — продолжение визита, а не новый канал.
    const raw = document.referrer
    const referrer = raw && !raw.startsWith(window.location.origin) ? raw : ''

    const body = JSON.stringify({ path: pathname, referrer })

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
        return
      }
      void fetch(ENDPOINT, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {})
    } catch {
      // Блокировщики и старые браузеры: статистика не важнее страницы
    }
  }, [pathname])

  return null
}
