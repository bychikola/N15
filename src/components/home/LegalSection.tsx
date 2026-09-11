import type { Dict } from '@/i18n/dictionaries'

// Семь направлений юр-блока: каждая строка раскрывается в короткое описание
// (тексты — legal1..legal7 в landing-словаре). «Ипотечный брокер» и
// «Независимый оценщик» здесь не значатся: они переехали в общий раздел
// «Услуги» (страницы /services/broker, /services/valuation)
const ITEMS = [
  { title: 'legal1Title', text: 'legal1Text' },
  { title: 'legal2Title', text: 'legal2Text' },
  { title: 'legal3Title', text: 'legal3Text' },
  { title: 'legal4Title', text: 'legal4Text' },
  { title: 'legal5Title', text: 'legal5Text' },
  { title: 'legal6Title', text: 'legal6Text' },
  { title: 'legal7Title', text: 'legal7Text' },
] as const

// Имена групп раскрывающихся строк (атрибут name у <details>): открытым может
// быть только один пункт. Блок ходит в ту же группу, что «Дизайн и ремонт
// под ключ» и «Межрегиональная недвижимость»
const BLOCK_ROW_GROUP = 'n15-landing-row'
const ITEM_ROW_GROUP = 'n15-legal-item'

// Блок «Юридические услуги» — одна широкая строка того же формата, что
// «Дизайн и ремонт под ключ»: название слева, «+» справа, по умолчанию
// свёрнута. Внутри — семь направлений: строки с номером, названием и «+»
// раскрываются в короткое описание; карточки и описания сразу не показываем
export default function LegalSection({ t }: { t: Dict }) {
  return (
    <section className="lp-legal" id="legal">
      <details className="lp-legal-row" name={BLOCK_ROW_GROUP}>
        <summary>
          <h2>{t.landing.legalTitle}</h2>
          <i>+</i>
        </summary>
        <p className="lp-row-lead">{t.landing.legalSubtitle}</p>
        <div className="lp-legal-list">
          {ITEMS.map((item, i) => (
            <details key={item.title} name={ITEM_ROW_GROUP}>
              <summary>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{t.landing[item.title]}</strong>
                <i>+</i>
              </summary>
              <p>{t.landing[item.text]}</p>
            </details>
          ))}
        </div>
        <a className="lp-legal-action" href="#contact">
          {t.landing.legalCta} <span aria-hidden="true">→</span>
        </a>
      </details>
    </section>
  )
}
