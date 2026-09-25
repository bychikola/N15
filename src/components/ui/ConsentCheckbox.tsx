'use client'

import type { FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { legalDocLinks, type LegalDocLink } from '@/lib/legal-docs'

interface ConsentProps {
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}

interface ConsentLineProps extends ConsentProps {
  /** Текст галочки со знаком %s — на его место встают ссылки на документы */
  text: string
  /** Документы, которые человек принимает, отмечая галочку */
  docs: LegalDocLink[]
  /** Пояснение под текстом (необязательность, что именно подтверждается) */
  note?: string
}

/** Ссылки на документы внутри текста галочки: «…на условиях Согласия и Политики» */
const DocLinks: FC<{ docs: LegalDocLink[]; lang: string; join: string }> = ({ docs, lang, join }) => (
  <>
    {docs.map((doc, index) => (
      <span key={doc.id}>
        {index > 0 ? join : ''}
        <Link
          href={`/${lang}${doc.path}`}
          target="_blank"
          className="text-[var(--n15-gold)] underline underline-offset-4 hover:text-[var(--n15-gold-light)]"
        >
          {doc.short}
        </Link>
      </span>
    ))}
  </>
)

/**
 * Строка обязательной галочки: текст со ссылками на принимаемые документы.
 * Из неё собраны все согласия сайта — и согласие на обработку данных, и
 * согласие на обратный звонок, и согласия форм размещения. Тексты живут в
 * словаре (t.consent.*), документы — в реестре (src/lib/legal-docs.ts),
 * поэтому одна и та же строка выглядит одинаково на всех страницах, а ссылка
 * ведёт на действующую редакцию документа, а не на его название.
 *
 * Галочка стоит перед кнопкой отправки и изначально снята: пока её не
 * отметили, кнопка неактивна и форма не отправляется (проверка есть и в самой
 * форме — на случай отправки по Enter). Ссылки открываются в новой вкладке,
 * чтобы заполненная форма не потерялась.
 */
export const ConsentLine: FC<ConsentLineProps> = ({ checked, onChange, text, docs, note, className = '' }) => {
  const { lang, t } = useI18n()
  // Текст отметки приходит из словаря одним куском: %s — место ссылок
  const [before, after] = text.split('%s')

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
        <DocLinks docs={docs} lang={lang} join={t.consent.docsJoin} />
        {after}
        {note ? <span className="block mt-1 text-[11px] text-[var(--n15-muted)]">{note}</span> : null}
      </span>
    </label>
  )
}

/**
 * Обязательная галочка «Я даю согласие на обработку персональных данных» —
 * единая для всех публичных форм сайта: контакты (/contacts), заявка на
 * просмотр объекта (/catalog/[slug]), расчёт ипотеки (/services/mortgage),
 * «Ваша реклама» (/advertising) и подача объявления (/board/new).
 *
 * Ссылок две: само согласие и политика обработки данных, по которой оно
 * даётся (см. раздел «Документы»). Раньше ссылка вела только на политику —
 * по ней видно, как данные обрабатывают, но не то, на что именно человек
 * согласился.
 */
export const ConsentCheckbox: FC<ConsentProps> = ({ checked, onChange, className = '' }) => {
  const { t } = useI18n()

  return (
    <ConsentLine
      checked={checked}
      onChange={onChange}
      className={className}
      text={t.consent.dataText}
      docs={legalDocLinks('personal-data-consent', 'privacy-policy')}
    />
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
