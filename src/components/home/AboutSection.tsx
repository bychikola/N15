'use client'

import { useRef, useState } from 'react'
import type { Dict } from '@/i18n/dictionaries'

export default function AboutSection({ t }: { t: Dict }) {
  // Карточка-история Фатимы: на десктопе её показывает CSS-:hover
  // (глобальные стили), здесь — открытие по нажатию на телефоне,
  // где hover отсутствует. Тип указателя берём из pointerdown:
  // тап по фото (touch/pen) переключает карточку, клик мышью
  // не мешает hover-логике.
  const [open, setOpen] = useState(false)
  const pointerType = useRef('')

  return (
    <section className="lp-about" id="about">
      <div
        className="lp-about-image"
        onPointerDown={e => {
          pointerType.current = e.pointerType
        }}
        onClick={() => pointerType.current !== 'mouse' && setOpen(v => !v)}
      >
        <img src="/img/fatima-ossetia.png" alt="" />
        <div
          className={open ? 'lp-fatima-card lp-fatima-card--open' : 'lp-fatima-card'}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className="lp-fatima-card-close"
            aria-label={t.landing.aboutFatimaClose}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <p className="lp-fatima-card-title">{t.landing.aboutFatimaTitle}</p>
          <p className="lp-fatima-card-text">{t.landing.aboutFatimaText1}</p>
          <p className="lp-fatima-card-text">{t.landing.aboutFatimaText2}</p>
        </div>
      </div>
      <div className="lp-about-copy">
        <p className="lp-eyebrow">{t.landing.aboutEyebrow}</p>
        <h2 className="lp-h2">
          {t.landing.aboutTitle1}
          <br />
          {t.landing.aboutTitle2}
        </h2>
        <p>{t.landing.aboutText}</p>
        <div className="lp-signature">
          <span>{t.landing.aboutSignature}</span>
          <p>{t.landing.aboutSignatureText}</p>
        </div>
        <div className="lp-directions">
          <details>
            <summary>
              {t.landing.aboutDirections} <i>+</i>
            </summary>
            <p>{t.landing.aboutDirectionsText}</p>
          </details>
        </div>
      </div>
    </section>
  )
}
