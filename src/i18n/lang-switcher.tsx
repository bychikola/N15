'use client'

import { usePathname, useRouter } from 'next/navigation'
import type { FC } from 'react'
import { useI18n } from './i18n-provider'

const LOCALE_RE = /^\/(ru|os)(?:\/|$)/

/**
 * Переключатель языка «РУ | ИР». Меняет префикс пути /ru/... ↔ /os/...,
 * сохраняя остальную часть URL. На не-локализованных путях (например,
 * /admin-add) ничего не рендерит.
 */
export const LangSwitcher: FC<{ onNavigate?: () => void; className?: string }> = ({ onNavigate, className }) => {
  const pathname = usePathname()
  const router = useRouter()
  const { lang, t } = useI18n()

  const m = pathname.match(LOCALE_RE)
  if (!m) return null

  const target = m[1] === 'ru' ? 'os' : 'ru'
  const rest = pathname.replace(/^\/(ru|os)/, '')
  const targetPath = `/${target}${rest}`

  const handleClick = (next: 'ru' | 'os') => {
    if (next === lang) return
    document.cookie = `n15_lang=${next}; path=/; max-age=31536000`
    onNavigate?.()
    router.push(next === 'ru' ? `/ru${rest}` : `/os${rest}`)
    router.refresh()
  }

  const segClass = (active: boolean) =>
    `px-2 py-1 text-[10px] tracking-wider uppercase transition-colors duration-300 cursor-pointer select-none ${
      active
        ? 'text-[var(--n15-black)] bg-[var(--n15-gold)]'
        : 'text-[var(--n15-muted)] hover:text-[var(--n15-gold)]'
    }`

  return (
    <div
      className={`flex items-center border border-[var(--n15-gold)]/30 ${className || ''}`}
      role="group"
      aria-label={lang === 'ru' ? 'Ирон æвзагмæ раив' : 'Переключить на русский'}
    >
      <button type="button" onClick={() => handleClick('ru')} className={segClass(lang === 'ru')} aria-label="Русский">
        РУ
      </button>
      <button type="button" onClick={() => handleClick('os')} className={segClass(lang === 'os')} aria-label="Ирон æвзаг">
        ИР
      </button>
    </div>
  )
}
