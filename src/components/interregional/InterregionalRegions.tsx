import Link from 'next/link'
import type { Dict } from '@/i18n/dictionaries'
// Индекс формы слова по числу — тот же, что у «6 соток» (см. area-format)
import { pluralIndex } from '@/lib/area-format'
import {
  settlementHref,
  type InterregionalOtherCity,
  type InterregionalRegion,
  type InterregionalSettlement,
} from '@/lib/interregional'

interface Props {
  t: Dict
  lang: string
  regions: InterregionalRegion[]
  /** Города с объектами, которых нет в справочнике (ссылка — на каталог) */
  otherCities: InterregionalOtherCity[]
}

/** «1 населённый пункт» / «3 населённых пункта» / «14 населённых пунктов» —
 *  размер справочника, а не число объектов (см. описание компонента) */
const placesWord = (n: number, words: Dict['interregional']['placeWords']): string =>
  [words.one, words.few, words.many][pluralIndex(n)]

/**
 * Справочник раздела «Межрегиональная недвижимость»: строки-регионы
 * раскрываются в населённые пункты (нативный details/summary — работает и без
 * JavaScript). Каждый населённый пункт ведёт на свою страницу с объектами
 * квартир; населённый пункт без объектов Н15 помечаем честно — «Объектов Н15
 * пока нет».
 *
 * Количества объектов рядом с названиями нет намеренно: общее число объектов
 * компании на публичном сайте не показываем. Сколько объектов у населённого
 * пункта, сервис по-прежнему считает — по нему решается, показывать ли пункт
 * в справочнике (см. src/lib/interregional-service.ts), но наружу это число
 * не выводится.
 *
 * Данные приходят из CRM (регионы и населённые пункты, см.
 * src/lib/interregional-service.ts) — в компоненте списков нет: новый регион
 * или населённый пункт, заведённый сотрудником, появляется здесь сам.
 */
export default function InterregionalRegions({ t, lang, regions, otherCities }: Props) {
  const placesTotal = regions.reduce((sum, region) => sum + region.settlements.length, 0)

  return (
    <section className="mt-14 text-left" id="regions">
      <h2 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
        {t.interregional.regionsTitle}
      </h2>
      <p className="text-sm text-[var(--n15-muted)] max-w-2xl mb-8">{t.interregional.regionsHint}</p>

      {placesTotal === 0 ? (
        <p className="text-[var(--n15-muted)]">{t.interregional.regionsEmpty}</p>
      ) : (
        <div className="border-t border-[var(--n15-gold)]/15">
          {regions.map((region, index) => (
            <details className="ir-region" id={`region-${region.slug}`} key={region.id}>
              <summary className="flex items-center gap-4 py-5 cursor-pointer list-none border-b border-[var(--n15-gold)]/15">
                <span className="text-xs text-[var(--n15-gold)]/60 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong className="flex-1 font-[family-name:var(--font-display)] font-normal text-lg md:text-xl text-[var(--n15-white)]">
                  {region.title}
                </strong>
                <em className="hidden sm:block text-xs not-italic text-[var(--n15-muted)]">
                  {region.settlements.length} {placesWord(region.settlements.length, t.interregional.placeWords)}
                </em>
                <i className="ir-region-plus text-xl not-italic text-[var(--n15-gold)]" aria-hidden="true">
                  +
                </i>
              </summary>

              <div className="pb-6">
                {region.groups.length === 0 ? (
                  <p className="text-sm text-[var(--n15-muted)] py-2">
                    {t.interregional.regionEmpty}{' '}
                    <Link className="text-[var(--n15-gold)] underline" href={`/${lang}/contacts`}>
                      {t.directions.ctaRequest}
                    </Link>
                  </p>
                ) : (
                  region.groups.map((group) => (
                    <div key={group.label || region.slug}>
                      {group.label && (
                        <p className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/70 mt-4 mb-2">
                          {group.label}
                        </p>
                      )}
                      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
                        {group.settlements.map((place) => (
                          <SettlementRow key={place.id} t={t} lang={lang} region={region} place={place} />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {otherCities.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-2">
            {t.interregional.otherTitle}
          </h3>
          <p className="text-xs text-[var(--n15-muted)] mb-4 max-w-2xl">{t.interregional.otherHint}</p>
          <ul className="flex flex-wrap gap-2">
            {otherCities.map((city) => (
              <li key={city.name}>
                <Link
                  className="inline-flex items-baseline gap-2 px-4 py-2.5 text-xs border border-[var(--n15-gold)]/25 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 transition-colors"
                  href={`/${lang}/catalog?city=${encodeURIComponent(city.name)}&category=apartment`}
                >
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Строка населённого пункта: название, пометка «объектов пока нет» и переход
 *  на его страницу. Счётчика объектов нет — см. описание справочника выше */
function SettlementRow({
  t,
  lang,
  region,
  place,
}: {
  t: Dict
  lang: string
  region: InterregionalRegion
  place: InterregionalSettlement
}) {
  return (
    <li className="border-b border-[var(--n15-gold)]/10">
      <Link
        className="flex items-baseline justify-between gap-4 py-3 text-sm text-[var(--n15-silver)] hover:text-[var(--n15-gold)] transition-colors"
        href={settlementHref(lang, region.slug, place.slug)}
      >
        {/* min-w-0 и перенос: в справочнике Крыма есть длинные названия
            («1-е отделение Золотой Балки») — на узком экране они должны
            переноситься, а не выдавливать соседний элемент из строки */}
        <span className="min-w-0 break-words">{place.name}</span>
        {place.count === 0 && (
          <small className="text-[11px] text-[var(--n15-muted)]/70 whitespace-nowrap">
            {t.interregional.placeNone}
          </small>
        )}
      </Link>
    </li>
  )
}
