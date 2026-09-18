'use client'

import type { FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'

interface ConsentProps {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}

/**
 * Обязательная галочка «Я даю согласие на обработку персональных данных
 * и принимаю Политику конфиденциальности» — единая для всех публичных форм
 * сайта: контакты (/contacts), заявка на просмотр объекта (/catalog/[slug]),
 * расчёт ипотеки (/services/mortgage) и «Ваша реклама» (/advertising).
 *
 * Галочка стоит перед кнопкой отправки и изначально снята: пока её не
 * отметили, кнопка неактивна и форма не отправляется (проверка есть и в самой
 * форме — на случай отправки по Enter). «Политику конфиденциальности» —
 * ссылка на действующую страницу политики (/{lang}/privacy) прямо в тексте
 * отметки; она открывается в новой вкладке, чтобы заполненная форма
 * не потерялась.
 */
export const ConsentCheckbox: FC<ConsentProps> = ({ checked, onChange, className = '' }) => {
  const { lang, t } = useI18n()
  // Текст отметки приходит из словаря одним куском: %s — место ссылки
  const [before, after] = t.consent.dataText.split('%s')

  return (
    <label className={`flex items-start gap-3 text-xs leading-relaxed text-[var(--n15-silver)] ${className}`}>
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--n15-gold)]"
      />
      <span>
        {before}
        <Link
          href={`/${lang}/privacy`}
          target="_blank"
          className="text-[var(--n15-gold)] underline underline-offset-4 hover:text-[var(--n15-gold-light)]"
        >
          {t.consent.privacyLink}
        </Link>
        {after}
      </span>
    </label>
  )
}

/**
 * Галочка согласия на рекламные сообщения — отдельная и необязательная:
 * с согласием на обработку персональных данных не объединяется (ст. 18
 * ФЗ «О рекламе»), на отправку формы не влияет и изначально снята.
 */
export const MarketingConsent: FC<ConsentProps> = ({ checked, onChange, className = '' }) => {
  const { t } = useI18n()

  return (
    <label className={`flex items-start gap-3 text-xs leading-relaxed text-[var(--n15-silver)] ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--n15-gold)]"
      />
      <span>
        {t.consent.marketingText}
        <span className="block mt-1 text-[11px] text-[var(--n15-muted)]">{t.consent.marketingNote}</span>
      </span>
    </label>
  )
}
