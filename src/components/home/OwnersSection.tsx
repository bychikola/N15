'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'

interface Props {
  t: Dict
  lang: string
}

// Блок «Выгодные условия» на главной — для собственников: продажа по цене
// и срокам владельца. Заголовок, пояснение и тексты берутся со страницы
// направления (/services/owners/vygodnaya-prodazha, словарь
// t.services.owners) — на главной и на самой странице они одни и те же,
// поэтому тексты не расходятся. Третья плашка ведёт на оценку объекта.
//
// Две зелёные плашки одного оформления (.lp-button, как в герое) раскрывают
// каждый свой блок и не мешают друг другу: «Условия продажи» показывает
// четыре условия собственника, «Выгодные условия» — что Н15 делает для
// продажи. Подпись второй плашки совпадает с подписью блока выше (та же
// строка словаря). На телефоне плашки встают друг под другом, во всю ширину
// колонки (см. .lp-owners-actions в globals.css).
export default function OwnersSection({ t, lang }: Props) {
  const s = t.services.owners.salePage
  const o = t.services.owners.items
  // Четыре условия собственника — цена, сроки, показы, отчётность
  const terms = [s.terms.price, s.terms.timing, s.terms.shows, s.terms.report]
  // Что делает Н15 — оценка по рынку, подготовка, продвижение, проверка
  // документов и сопровождение сделки (те же пункты, что на странице
  // владельцам, /services/owners)
  const benefits = [o.valuation, o.preparation, o.marketing, o.legal, o.deal]

  // Плашки раскрываются независимо: открытие одной не закрывает вторую.
  // Блоки лежат в разметке всегда (скрыты атрибутом hidden) — иначе их
  // тексты не попадали бы в серверный HTML страницы
  const [openTerms, setOpenTerms] = useState(false)
  const [openBenefits, setOpenBenefits] = useState(false)

  return (
    <section className="lp-section lp-owners" id="owners">
      <div className="lp-container">
        <p className="lp-eyebrow">{t.landing.ownersEyebrow}</p>
        <h2 className="lp-h2 lp-owners-title">{s.title}</h2>
        <p className="lp-owners-copy">{s.subtitle}</p>

        {/* Плашки одного оформления (.lp-button, как в герое): «Условия
            продажи» и «Выгодные условия» раскрывают свои блоки ниже,
            третья ведёт на страницу оценки объекта */}
        <div className="lp-hero-actions lp-owners-actions">
          <button
            type="button"
            className="lp-button"
            aria-expanded={openTerms}
            aria-controls="owners-terms"
            onClick={() => setOpenTerms((v) => !v)}
          >
            {t.landing.ownersCta} <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className="lp-button"
            aria-expanded={openBenefits}
            aria-controls="owners-benefits"
            onClick={() => setOpenBenefits((v) => !v)}
          >
            {t.landing.ownersEyebrow} <span aria-hidden="true">→</span>
          </button>
          <Link className="lp-button" href={`/${lang}/services/valuation`}>
            {t.services.valuation.title} <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Блок плашки «Условия продажи»: четыре условия собственника и
            ссылка на страницу направления — как у прежней плашки-ссылки */}
        <div className="lp-owners-panel" id="owners-terms" hidden={!openTerms}>
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

        {/* Блок плашки «Выгодные условия»: что Н15 делает для продажи */}
        <div className="lp-owners-panel" id="owners-benefits" hidden={!openBenefits}>
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
