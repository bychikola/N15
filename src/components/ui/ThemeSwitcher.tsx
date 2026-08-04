'use client'

import type { FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

/**
 * Переключатель темы «☀️ / 🌙». Меняет атрибут data-theme на <html>
 * и сохраняет выбор в cookie n15_theme (1 год). Иконки переключаются
 * через CSS (.theme-icon-sun/.theme-icon-moon) — без React-state,
 * поэтому нет проблем с гидратацией.
 */
export const ThemeSwitcher: FC<{ className?: string }> = ({ className }) => {
  const { t } = useI18n()

  const toggle = () => {
    const root = document.documentElement
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    document.cookie = `n15_theme=${next}; path=/; max-age=31536000`
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.theme.toggle}
      className={`flex items-center justify-center w-9 h-9 border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer ${className || ''}`}
    >
      {/* Солнце — видно в светлой теме */}
      <svg className="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      </svg>
      {/* Луна — видно в тёмной теме */}
      <svg className="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
      </svg>
    </button>
  )
}
