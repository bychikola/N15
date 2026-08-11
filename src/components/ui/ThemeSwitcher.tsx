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
      {/* Солнце (Material Symbols) — видно в светлой теме */}
      <span className="material-symbols-outlined theme-icon-sun text-lg leading-none" aria-hidden="true">sunny</span>
      {/* Луна (Material Symbols) — видно в тёмной теме */}
      <span className="material-symbols-outlined theme-icon-moon text-lg leading-none" aria-hidden="true">dark_mode</span>
    </button>
  )
}
