'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

// Блок для собственников на главной. Заголовок, пояснение и тексты берутся
// со страницы направления (/services/owners/vygodnaya-prodazha, словарь
// t.services.owners) — на главной и на самой странице они одни и те же,
// поэтому тексты не расходятся. Третья плашка ведёт на оценку объекта.
//
// Две зелёные плашки одного оформления (.lp-button, как в герое) раскрывают
// каждый свой блок: «План продажи» показывает четыре пункта плана, «Условия
// собственника» — что Н15 делает для владельца. Блоки работают аккордеоном —
// открыт может быть только один, открытие второй плашки закрывает первую.
// Подписи плашек лежат в словаре главной (t.landing.owners*Cta) и не
// совпадают с подписью блока выше. На телефоне плашки встают друг под
// другом, во всю ширину колонки (см. .lp-owners-actions в globals.css).
export default function OwnersSection({ t, lang }: Props) {
  const s = t.services.owners.salePage
  const o = t.services.owners.items
  // Четыре пункта плана — цена и стратегия, сроки, показы, отчётность
  const terms = [s.terms.price, s.terms.timing, s.terms.shows, s.terms.report]
  // Что делает Н15 — оценка по рынку, подготовка, продвижение, проверка
  // документов и сопровождение сделки (те же пункты, что на странице
  // владельцам, /services/owners)
  const benefits = [o.valuation, o.preparation, o.marketing, o.legal, o.deal]

  // Аккордеон: открыт максимум один блок, повторное нажатие закрывает
  // открытый. Блоки лежат в разметке всегда (скрыты атрибутом hidden) —
  // иначе их тексты не попадали бы в серверный HTML страницы
  const [openPanel, setOpenPanel] = useState<'terms' | 'benefits' | null>(null)
  const togglePanel = (panel: 'terms' | 'benefits') =>
    setOpenPanel((current) => (current === panel ? null : panel))

  return (
    <section className="lp-section lp-owners" id="owners">
      <div className="lp-container">
        <p className="lp-eyebrow">{t.landing.ownersEyebrow}</p>
        <h2 className="lp-h2 lp-owners-title">{s.title}</h2>
        <p className="lp-owners-copy">{s.subtitle}</p>

        {/* Плашки одного оформления (.lp-button, как в герое): «План
            продажи» и «Условия собственника» раскрывают свои блоки ниже
            (открыт только один — аккордеон), третья ведёт на страницу
            оценки объекта */}
        <div className="lp-hero-actions lp-owners-actions">
          <button
            type="button"
            className="lp-button"
            aria-expanded={openPanel === 'terms'}
            aria-controls="owners-terms"
            onClick={() => togglePanel('terms')}
          >
            {t.landing.ownersPlanCta} <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="lp-button"
            aria-expanded={openPanel === 'benefits'}
            aria-controls="owners-benefits"
            onClick={() => togglePanel('benefits')}
          >
            {t.landing.ownersTermsCta} <span aria-hidden="true">→</span>
          </button>
          <Link className="lp-button" href={`/${lang}/services/valuation`}>
            {t.landing.ownersValuationCta} <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Блок плашки «План продажи»: четыре пункта плана и ссылка
            на страницу направления — как у прежней плашки-ссылки */}
        <div className="lp-owners-panel" id="owners-terms" hidden={openPanel !== 'terms'}>
          <ul className="lp-owners-terms">
            {terms.map((term) => (
              <li key={term.title}>
                <h3>{term.title}</h3>
                <p>{term.text}</p>
              </li>
            ))}
          </ul>
          <Link className="lp-owners-more" href={`/${lang}/services/owners/vygodnaya-prodazha`}>
            {s.title}
          </Link>
        </div>

        {/* Блок плашки «Условия собственника»: что Н15 делает для владельца */}
        <div className="lp-owners-panel" id="owners-benefits" hidden={openPanel !== 'benefits'}>
          <ul className="lp-owners-benefits">
            {benefits.map((item) => (
              <li key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
