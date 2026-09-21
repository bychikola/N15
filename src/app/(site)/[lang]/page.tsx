import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { getDictionary } from '@/i18n/dictionaries'
import LandingHero from '@/components/home/LandingHero'
import SearchCategories from '@/components/home/SearchCategories'
import FeaturedObjects from '@/components/home/FeaturedObjects'
import type { ObjectListItem } from '@/components/objects/ObjectCard'
import InterregionalGuide from '@/components/home/InterregionalGuide'
import ServicesAccordion from '@/components/home/ServicesAccordion'
import PopularDirections from '@/components/home/PopularDirections'
import SelectionCta from '@/components/home/SelectionCta'
import OwnersSection from '@/components/home/OwnersSection'
import AboutSection from '@/components/home/AboutSection'
import ContactSection from '@/components/home/ContactSection'
import { GoalLink } from '@/components/analytics/GoalLink'
// Справочники допустимых значений фильтров: where-запрос по select-полю
// принимает только значения из его опций — чужое значение роняет страницу
// серверной ошибкой («This page couldn't load»)
import { DISTRICT_OPTIONS, CITY_DISTRICT_OPTIONS } from '@/lib/districts'
import { SNT_AREAS } from '@/components/home/landing-data'
// Категории объектов — общий справочник схемы и фильтров
import { OBJECT_CATEGORY_VALUES } from '@/lib/object-categories'
// Регионы «Межрегиональной недвижимости» для блока на главной — из CRM
import { loadInterregionalRegions } from '@/lib/interregional-service'

export const dynamic = 'force-dynamic'

// Категории и комнаты параметров подбора — опции одноимённых полей объекта
// (см. src/payload/collections/Objects.ts); категории берём из общего
// справочника, чтобы список не расходился со схемой
const CATEGORY_PARAM_VALUES = OBJECT_CATEGORY_VALUES
const ROOMS_PARAM_VALUES = ['1', '2', '3', '4']
const isKnown = (v: string, options: readonly string[]) => options.includes(v)

interface PageProps {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Подписи чипа сводки подбора — развёрнутые, как в заголовках разделов
// (в фильтрах каталога короче, см. t.categoryLabels)
const CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  house: 'Частный дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая недвижимость',
  land: 'Земельный участок',
  room: 'Комната',
  garage: 'Гараж',
  dacha: 'Дача',
  cottage: 'Коттедж',
  part_house: 'Часть дома',
}

export default async function HomePage({ params, searchParams }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const sp = await searchParams

  // Параметры подбора с лендинга: category, rooms, district/cityDistrict,
  // locality, snt (чипы «Что вы ищете?», в т.ч. «Ближний пригород
  // Владикавказа»). Значения сверяем со справочниками — иначе where-запрос
  // по select-полю с чужим значением падает серверной ошибкой.
  const qCategory = typeof sp.category === 'string' && isKnown(sp.category, CATEGORY_PARAM_VALUES) ? sp.category : ''
  const qRooms = typeof sp.rooms === 'string' && isKnown(sp.rooms, ROOMS_PARAM_VALUES) ? sp.rooms : ''
  // Районы города (Иристонский и др.) в параметре district — устаревшие
  // ссылки: раньше чипы лендинга слали их как district. Уводим в cityDistrict
  const qDistrictParam = typeof sp.district === 'string' ? sp.district : ''
  const qCityDistrictParam = typeof sp.cityDistrict === 'string' ? sp.cityDistrict : ''
  const qCityDistrict = isKnown(qCityDistrictParam, CITY_DISTRICT_OPTIONS)
    ? qCityDistrictParam
    : !qCityDistrictParam && isKnown(qDistrictParam, CITY_DISTRICT_OPTIONS)
      ? qDistrictParam
      : ''
  const qDistrict = isKnown(qDistrictParam, DISTRICT_OPTIONS) ? qDistrictParam : ''
  const qLocality = typeof sp.locality === 'string' ? sp.locality : ''
  const qSnt = typeof sp.snt === 'string' && isKnown(sp.snt, SNT_AREAS) ? sp.snt : ''

  const payload = await getPayload({ config })

  // Сводка подбора для секции «Результаты подбора» (как на живом прототипе).
  // Считаем до запросов: от неё зависит, какие блоки вообще показывать —
  // при подборе «Особые предложения» уступают место выдаче
  const hasFilter = Boolean(qCategory || qRooms || qDistrict || qCityDistrict || qLocality || qSnt)
  const filterSummary = hasFilter
    ? [
        qCategory ? CATEGORY_LABELS[qCategory] || qCategory : null,
        qRooms ? `${qRooms === '4' ? '4+' : qRooms} комн.` : null,
        qDistrict || qCityDistrict || null,
        qLocality || null,
        qSnt || null,
      ].filter(Boolean).join(' · ')
    : undefined

  // Карточки «как в каталоге»: ObjectCard ждёт полный набор полей —
  // тип сделки, адрес улицы/дома и изображение с Payload-размерами.
  // Общий для всех блоков объектов на главной.
  const toListItem = (d: { id: number | string }): ObjectListItem => {
    const o = d as unknown as Record<string, unknown>
    const img = o.primaryImage as
      | {
          url?: string
          alt?: string
          focalPoint?: { x?: number; y?: number }
          sizes?: { thumbnail?: { url?: string }; card?: { url?: string } }
        }
      | undefined
    const addr = o.address as ObjectListItem['address'] | undefined
    return {
      id: o.id as number,
      title: o.title as string,
      type: (o.type as 'sale' | 'rent') || 'sale',
      category: (o.category as string) || '',
      price: o.price as number,
      area: o.area as number | undefined,
      areaUnit: o.areaUnit as ObjectListItem['areaUnit'],
      plotArea: o.plotArea as number | undefined,
      plotAreaUnit: o.plotAreaUnit as ObjectListItem['plotAreaUnit'],
      rooms: o.rooms as number | undefined,
      floor: o.floor as number | undefined,
      totalFloors: o.totalFloors as number | undefined,
      // Варианты покупки — значки на обложке карточки (см. purchaseBadges)
      purchaseOptions: o.purchaseOptions as string[] | undefined,
      address: addr,
      primaryImage: img
        ? { url: img.url, alt: img.alt, focalPoint: img.focalPoint, sizes: img.sizes }
        : undefined,
    }
  }

  // Особые предложения — объекты с отметкой «Особое предложение» в CRM
  // (поле urgentSale). Блок показываем, только когда такие объекты есть:
  // пустой блок с заглушками читался бы как обещание, которого нет
  const { docs: specialDocs } = await payload.find({
    collection: 'objects',
    where: { status: { equals: 'published' }, urgentSale: { equals: true } },
    sort: '-createdAt',
    limit: 4,
    depth: 1,
  })
  const specialObjects: ObjectListItem[] = specialDocs.map(toListItem)

  // Блок «Актуальные объекты»: только опубликованные (черновики скрыты).
  // Проданные, снятые с публикации и архивные в CRM переводятся в статус
  // «Архив» — такой объект автоматически исчезает из блока.
  const where: Where = { status: { equals: 'published' } }
  if (qCategory) where.category = { equals: qCategory }
  if (qRooms === '4') where.rooms = { greater_than_equal: 4 }
  else if (qRooms) where.rooms = { equals: parseInt(qRooms, 10) }
  if (qDistrict) where['address.district'] = { equals: qDistrict }
  if (qCityDistrict) where['address.cityDistrict'] = { equals: qCityDistrict }
  if (qLocality) where['address.locality'] = { equals: qLocality }
  if (qSnt) where['address.snt'] = { equals: qSnt }
  // В основной подборке не повторяем карточки из «Особых предложений»: блоки
  // идут друг за другом, и одни и те же объекты в обоих читались бы как
  // ошибка страницы. При подборе блока особых предложений нет — объекты из
  // него в выдаче не прячем
  if (!filterSummary && specialObjects.length > 0) where.id = { not_in: specialObjects.map((o) => o.id) }

  // 4 объекта: на компьютере — одна полная строка (в сетке блока xl: 4 колонки),
  // на планшете 2×2, на телефоне — в столбик
  const { docs } = await payload.find({
    collection: 'objects',
    where,
    sort: '-createdAt',
    limit: 4,
    depth: 1,
  })
  const objects: ObjectListItem[] = docs.map(toListItem)

  // Регионы блока «Межрегиональная недвижимость» — справочник CRM
  // (коллекции regions и settlements, см. src/lib/interregional-service.ts)
  const interregionalRegions = await loadInterregionalRegions(payload)

  // Телефон из глобала (fallback — из прототипа)
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const sitePhones = ((site as Record<string, unknown>).phones as { phone?: string }[] | undefined) || []
  const phone = sitePhones[0]?.phone

  // Подбор по местоположению пуст (населённый пункт, район, район города,
  // товарищество) — вместо декоративных карточек-заглушек показываем честное
  // сообщение, что объектов там пока нет
  const filterEmptyNote =
    docs.length === 0
      ? qLocality
        ? t.catalog.nothingInLocality
        : qDistrict || qCityDistrict || qSnt
          ? t.catalog.nothingFound
          : undefined
      : undefined

  return (
    <>
      <Header />
      <main>
        <LandingHero t={t} lang={lang} />
        <SearchCategories t={t} lang={lang} />
        {/* Особые предложения — до подборки: без фильтра подбора (иначе
            блок с чужими объектами встал бы над результатами клиента) */}
        {specialObjects.length > 0 && !filterSummary && (
          <FeaturedObjects
            objects={specialObjects}
            t={t}
            lang={lang}
            eyebrow={t.landing.specialEyebrow}
            title={t.landing.specialTitle}
            sectionId="special"
          />
        )}
        {/* «Новинки» отдельным блоком не показываем: те же последние
            поступления, что и в блоке «Актуальные объекты» ниже, — порядок
            по дате публикации выбирается сортировкой в каталоге */}
        <FeaturedObjects
          objects={objects}
          t={t}
          lang={lang}
          filterSummary={filterSummary}
          emptyNote={filterEmptyNote}
        />
        {/* Заявка на подбор — сразу после объектов: клиент посмотрел выдачу
            и, если подходящего не нашлось, оставляет запрос, не уходя
            со страницы (форма подбора живёт в каталоге, см. SelectionCta) */}
        <SelectionCta t={t} lang={lang} />
        {/* Популярные направления — география поиска: ссылки ведут в каталог
            с уже подставленным районом (у местной географии своей страницы
            нет). Рядом с межрегиональной недвижимостью — оба блока про «где» */}
        <PopularDirections t={t} lang={lang} />
        <InterregionalGuide t={t} lang={lang} regions={interregionalRegions} />
        <ServicesAccordion t={t} lang={lang} />
        {/* Блок собственникам — после услуг: владельцу важно, как Н15 продаёт
            его объект (тексты и условия — со страницы направления) */}
        <OwnersSection t={t} lang={lang} />
        <AboutSection t={t} />
        <ContactSection t={t} phone={phone} />
        <footer className="lp-footer">
          <a className="lp-brand" href="#top">
            <img src="/logo.png" alt="Н15" />
            <span className="lp-brand-caption">{t.landing.footerCaption}</span>
          </a>
          <p>
            {t.landing.footerText1}
            <br />
            {t.landing.footerText2}
          </p>
          {/* Звонок в подвале лендинга — с целью Метрики, как в шапке и
              на странице контактов */}
          <GoalLink
            className="lp-footer-phone"
            href={phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'}
            goal="call_click"
          >
            {phone || '8 958 116-15-15'}
          </GoalLink>
          <Link className="lp-team-login" href="/crm">{t.landing.footerTeam}</Link>
          <p>© {new Date().getFullYear()} Н15</p>
        </footer>
      </main>
    </>
  )
}
