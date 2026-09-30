'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { CONSENT_EVENT, clearConsent, readConsent, saveConsent } from '@/lib/consent'

/**
 * Баннер согласия на cookie: показывается на публичном сайте, пока посетитель
 * не выбрал — «Только необходимые» или «Разрешить аналитику». Выбор хранится
 * в технически необходимой cookie n15_consent (см. src/lib/consent.ts),
 * аналитический счётчик Метрики до согласия не подключается вовсе.
 *
 * Показываем после монтирования: на сервере cookie браузера не видно, и если
 * отрисовать баннер сразу, у посетителя с готовым выбором он мигал бы на
 * каждой странице. Слушаем CONSENT_EVENT — «Настройки cookie» в подвале
 * сбрасывают выбор, и баннер возвращается.
 */
export function CookieConsent() {
  const { lang, t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const sync = () => setVisible(readConsent() === null)
    sync()
    window.addEventListener(CONSENT_EVENT, sync)
    return () => window.removeEventListener(CONSENT_EVENT, sync)
  }, [])

  if (!visible) return null

  const choose = (analytics: boolean) => {
    saveConsent(analytics)
    setVisible(false)
  }

  return (
    // role="dialog" с aria-modal="false": это не модальное окно — страница
    // остаётся доступной, баннер лишь сообщает о выборе
    <div
      className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-4"
      role="dialog"
      aria-modal="false"
      aria-label={t.cookie.title}
    >
      <div className="n15-container max-w-4xl mx-auto border border-[var(--n15-gold)]/35 bg-[var(--n15-charcoal)] shadow-lg p-5">
        <h2 className="text-sm tracking-[0.2em] uppercase text-[var(--n15-gold)] m-0">
          {t.cookie.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--n15-silver)]">
          {t.cookie.text}
        </p>

        {/* Категории: необходимые — всегда включены, аналитика — по выбору */}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="border border-[var(--n15-gold)]/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-[var(--n15-white)]">{t.cookie.essential}</strong>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--n15-gold)]">
                {t.cookie.alwaysOn}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--n15-muted)]">{t.cookie.essentialNote}</p>
          </div>
          <div className="border border-[var(--n15-gold)]/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-[var(--n15-white)]">{t.cookie.analytics}</strong>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--n15-muted)]">
                {t.cookie.offByDefault}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--n15-muted)]">{t.cookie.analyticsNote}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => choose(true)}
            className="border border-[var(--n15-gold)] bg-[var(--n15-gold)] px-5 py-2.5 text-xs uppercase tracking-[0.12em] text-[var(--n15-charcoal)] cursor-pointer"
          >
            {t.cookie.allow}
          </button>
          <button
            type="button"
            onClick={() => choose(false)}
            className="border border-[var(--n15-gold)]/40 bg-transparent px-5 py-2.5 text-xs uppercase tracking-[0.12em] text-[var(--n15-gold)] cursor-pointer"
          >
            {t.cookie.deny}
          </button>
          <Link
            href={`/${lang}/documents/cookies-analytics`}
            className="text-xs text-[var(--n15-silver)] underline underline-offset-4"
          >
            {t.cookie.more}
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * «Настройки cookie» в подвале: сбрасывает выбор, баннер показывается заново.
 * Если аналитика была разрешена, страницу перезагружаем — скрипт Метрики уже
 * загружен, и выгрузить его на месте нельзя.
 */
export function CookieSettingsButton() {
  const { t } = useI18n()

  const reset = () => {
    const allowed = readConsent()?.analytics === true
    clearConsent()
    if (allowed) window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={reset}
      className="text-base text-[var(--n15-silver)] underline underline-offset-4 hover:text-[var(--n15-gold)] cursor-pointer bg-transparent border-0 p-0"
    >
      {t.cookie.settings}
    </button>
  )
}
