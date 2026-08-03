'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ru, type Dict, type Locale } from './dictionaries'

export interface I18n {
  lang: Locale
  t: Dict
}

/**
 * Дефолт = русский: без провайдера (например, на странице /admin-add)
 * компоненты рендерятся на русском и не падают.
 */
const I18nContext = createContext<I18n>({ lang: 'ru', t: ru })

export function I18nProvider({ lang, dict, children }: { lang: Locale; dict: Dict; children: ReactNode }) {
  return <I18nContext.Provider value={{ lang, t: dict }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
