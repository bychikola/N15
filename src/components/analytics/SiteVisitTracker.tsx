'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { sendVisit } from './tracker'

/**
 * Вид события по ссылке: «Позвонить» — tel:, WhatsApp — wa.me, «Написать» —
 * письмо или Telegram. Остальные ссылки события не создают.
 */
function clickKind(href: string): string | null {
  if (href.startsWith('tel:')) return 'call_click'
  if (/^https?:\/\/([\w-]+\.)?(wa\.me|whatsapp\.com)\//i.test(href)) return 'whatsapp_click'
  if (href.startsWith('mailto:')) return 'write_click'
  if (/^https?:\/\/([\w-]+\.)?(t\.me|telegram\.me)\//i.test(href)) return 'write_click'
  return null
}

/**
 * Счётчик посещений сайта: при открытии страницы отправляет маячок с её
 * адресом и строкой фильтров, а при нажатиях «Позвонить», WhatsApp и
 * «Написать» — событие действия. Клиентский, а не серверный, по двум
 * причинам: переходы внутри сайта (Next меняет страницу без перезагрузки)
 * серверный счётчик не увидел бы, а вызов headers() в общем layout'е сделал
 * бы динамическими все страницы сайта, включая статические.
 *
 * Данные обезличенные (см. src/lib/site-stats.ts, src/lib/visitor-tracking.ts),
 * в CRM их видит только администратор. Маячок уходит «в фоне», а если браузер
 * его заблокирует, страница просто не попадёт в статистику.
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

    // Строка запроса нужна фильтрам каталога: по ней сервер запишет, чем
    // посетитель фильтровал выдачу (см. filterLabel в visitor-tracking)
    sendVisit({ path: pathname, referrer, search: window.location.search })

    // Начало подачи объявления на доску: форму открывают на /board/new
    if (/^\/[a-z]{2}\/board\/new\/?$/.test(pathname)) {
      sendVisit({ event: 'board_started', path: pathname })
    }
  }, [pathname])

  // Нажатия «Позвонить», WhatsApp и «Написать» — одно событие на клик.
  // Слушатель делегированный: кнопки живут в десятке разных компонентов
  // (шапка, карточка объекта, контакты, доска), вешать обработчик на каждую
  // пришлось бы вручную и легко забыть новую. Элемент с data-track задаёт
  // вид события сам — если кнопка не ссылка.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const el = target?.closest?.('a[href], [data-track]')
      if (!el) return
      const kind = el.getAttribute('data-track') || clickKind(el.getAttribute('href') || '')
      if (!kind) return
      // Номер объекта не присылаем: в публичном адресе карточки его нет (там
      // slug), и связь со записью базы восстанавливает сервер — см.
      // objectIdOfPath в /api/visit
      sendVisit({ event: kind, path: window.location.pathname })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
