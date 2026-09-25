// ---------------------------------------------------------------------------
// Разделы правовых документов для показа и выгрузки. Отдельный модуль, потому
// что здесь нужен словарь сайта: у политики обработки персональных данных
// собственного текста в реестре (legal-docs.ts) нет — он живёт на странице
// /privacy в двух языковых вариантах (ru и os). Второй копии текста, которая
// разошлась бы с первой, в проекте быть не должно.
//
// Модуль серверный: его читают страница документа и выгрузка в файл
// (legal-docs-export.ts). Реестр и ссылки для форм лежат в legal-docs.ts и
// словарь не тянут — те ссылки попадают в браузерный бандл.
// ---------------------------------------------------------------------------

import { getDictionary } from '@/i18n/dictionaries'
import type { LegalDoc, LegalSection } from './legal-docs'

/** Разделы документа на языке страницы: для политики — текст страницы /privacy */
export const legalDocSections = (doc: LegalDoc, lang = 'ru'): LegalSection[] => {
  if (doc.id !== 'privacy-policy') return doc.sections
  const t = getDictionary(lang)
  return [
    { title: t.privacy.title, text: t.privacy.intro },
    ...t.privacy.sections.map((s) => ({ title: s.title, text: s.text })),
    { title: t.privacy.contactTitle, text: `${t.privacy.consentNote}\n${t.privacy.contactText}` },
  ]
}
