import type { Dict } from '@/i18n/dictionaries'
// Районы Владикавказа и районы республики — справочники сайта
// (см. src/lib/districts.ts): те же значения, что в фильтрах каталога,
// поэтому ссылка открывает ровно ту выдачу, что и выбранный вручную фильтр
import { CITY_DISTRICT_OPTIONS, VLAV_OKRUG } from '@/lib/districts'

interface Props {
  t: Dict
  lang: string
}

/**
 * «Популярные направления» на главной — география поиска Н15: город целиком,
 * районы Владикавказа и районы республики, где у агентства есть объекты.
 *
 * Список подобран, а не посчитан: «популярные» — редакционный выбор, как
 * категории и услуги главной. В нём районы с объектами в каталоге (городские
 * — с заметным числом объектов, из республики — Пригородный, Алагирский и
 * Ардонский). Пустые направления не показываем: ссылка, ведущая на «ничего
 * не найдено», хуже её отсутствия. Если объекты из района уйдут, страница
 * не сломается — каталог покажет своё честное пустое состояние с заявкой
 * на подбор.
 *
 * Ведём на выдачу каталога по району, а не на страницы-направления
 * (новостройки, межрегион, зарубеж — они и так в шапке и в каталоге):
 * у местной географии своей страницы нет, и фильтр каталога — единственный
 * способ её показать. Фильтры читают cityDistrict и district прямо из ссылки.
 */
const DIRECTIONS = [
  // Город целиком — самое популярное направление (округ, а не район:
  // в address.district у городских объектов лежит Владикавказский округ)
  { key: 'district', value: VLAV_OKRUG },
  // Районы города: порядок — по числу объектов в каталоге
  // (Северо-Западный, Иристонский, Затеречный, Промышленный)
  { key: 'cityDistrict', value: CITY_DISTRICT_OPTIONS[0] },
  { key: 'cityDistrict', value: CITY_DISTRICT_OPTIONS[1] },
  { key: 'cityDistrict', value: CITY_DISTRICT_OPTIONS[3] },
  { key: 'cityDistrict', value: CITY_DISTRICT_OPTIONS[2] },
  // Районы республики — только те, где есть объекты
  { key: 'district', value: 'Пригородный район' },
  { key: 'district', value: 'Алагирский район' },
  { key: 'district', value: 'Ардонский район' },
] as const

export default function PopularDirections({ t, lang }: Props) {
  const href = (d: (typeof DIRECTIONS)[number]) =>
    `/${lang}/catalog?${d.key}=${encodeURIComponent(d.value)}`

  // Подпись: город — словарём (округ в адресе города не называют), у района
  // городского округа добавляем «район» — как в адресе объекта и в фильтре
  // каталога (в справочнике лежат только названия: «Иристонский» и т.д.)
  const label = (d: (typeof DIRECTIONS)[number]) =>
    d.value === VLAV_OKRUG
      ? t.landing.popularCity
      : d.key === 'cityDistrict'
        ? `${d.value} ${t.landing.popularDistrictSuffix}`
        : d.value

  return (
    <section className="lp-section lp-objects" id="directions">
      <div className="lp-objects-heading">
        <h2 className="lp-h2">{t.landing.popularTitle}</h2>
      </div>

      <div className="lp-categories">
        {DIRECTIONS.map((d, index) => (
          <a className="lp-category-card" key={`${d.key}-${d.value}`} href={href(d)}>
            <span className="lp-category-num">{String(index + 1).padStart(2, '0')}</span>
            <h3>{label(d)}</h3>
            <i aria-hidden="true">→</i>
          </a>
        ))}
      </div>
    </section>
  )
}
