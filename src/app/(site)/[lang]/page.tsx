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
import MortgageCalculator from '@/components/home/MortgageCalculator'
import CountryGuide from '@/components/home/CountryGuide'
import ServicesSection from '@/components/home/ServicesSection'
import LegalSection from '@/components/home/LegalSection'
import AboutSection from '@/components/home/AboutSection'
import ContactSection from '@/components/home/ContactSection'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const CATEGORY_LABELS: Record<string, string> = {
  apartment: 'Квартира',
  house: 'Частный дом',
  townhouse: 'Таунхаус',
  commercial: 'Коммерческая недвижимость',
  land: 'Земельный участок',
}

export default async function HomePage({ params, searchParams }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const sp = await searchParams

  // Параметры подбора с лендинга: category, rooms, district, snt (чипы «Что вы ищете?»)
  const qCategory = typeof sp.category === 'string' ? sp.category : ''
  const qRooms = typeof sp.rooms === 'string' ? sp.rooms : ''
  const qDistrict = typeof sp.district === 'string' ? sp.district : ''
  const qSnt = typeof sp.snt === 'string' ? sp.snt : ''

  const payload = await getPayload({ config })

  const where: Where = { status: { equals: 'published' } }
  if (qCategory) where.category = { equals: qCategory }
  if (qRooms === '4') where.rooms = { greater_than_equal: 4 }
  else if (qRooms) where.rooms = { equals: parseInt(qRooms, 10) }
  if (qDistrict) where['address.district'] = { equals: qDistrict }
  if (qSnt) where['address.snt'] = { equals: qSnt }

  const { docs } = await payload.find({
    collection: 'objects',
    where,
    sort: '-createdAt',
    limit: 6,
    depth: 1,
  })

  // Карточки «как в каталоге»: ObjectCard ждёт полный набор полей —
  // тип сделки, адрес улицы/дома и изображение с Payload-размерами
  const objects: ObjectListItem[] = docs.map((d) => {
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
      rooms: o.rooms as number | undefined,
      floor: o.floor as number | undefined,
      totalFloors: o.totalFloors as number | undefined,
      address: addr,
      primaryImage: img
        ? { url: img.url, alt: img.alt, focalPoint: img.focalPoint, sizes: img.sizes }
        : undefined,
    }
  })

  // Телефон из глобала (fallback — из прототипа)
  const site = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  const sitePhones = ((site as Record<string, unknown>).phones as { phone?: string }[] | undefined) || []
  const phone = sitePhones[0]?.phone

  // Сводка подбора для секции «Результаты подбора» (как на живом прототипе)
  const hasFilter = Boolean(qCategory || qRooms || qDistrict || qSnt)
  const filterSummary = hasFilter
    ? [
        qCategory ? CATEGORY_LABELS[qCategory] || qCategory : null,
        qRooms ? `${qRooms === '4' ? '4+' : qRooms} комн.` : null,
        qDistrict || null,
        qSnt || null,
      ].filter(Boolean).join(' · ')
    : undefined

  return (
    <>
      <Header />
      <main>
        <LandingHero t={t} lang={lang} />
        <SearchCategories t={t} lang={lang} />
        <FeaturedObjects objects={objects} t={t} lang={lang} filterSummary={filterSummary} />
        <MortgageCalculator t={t} />
        <CountryGuide t={t} lang={lang} />
        <ServicesSection t={t} />
        <LegalSection t={t} />
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
          <a className="lp-footer-phone" href={phone ? `tel:${phone.replace(/\s+/g, '')}` : 'tel:+79581161515'}>
            {phone || '8 958 116-15-15'}
          </a>
          <Link className="lp-team-login" href="/crm">{t.landing.footerTeam}</Link>
          <p>© {new Date().getFullYear()} Н15</p>
        </footer>
      </main>
    </>
  )
}
