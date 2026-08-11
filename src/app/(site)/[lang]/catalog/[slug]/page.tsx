import { getPayload } from 'payload'
import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export const dynamic = 'force-dynamic'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import { PhotoGrid } from '@/components/ui/PhotoGrid'
import { ObjectMap } from '@/components/ui/ObjectMap'
import ObjectCard, { type ObjectListItem } from '@/components/objects/ObjectCard'
import { ObjectActions } from '@/components/objects/ObjectActions'
import { getDictionary, type Dict } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string; slug: string }>
}

function buildTypeLabel(t: Dict, key: string | undefined): string | null {
  if (!key) return null
  return t.object.buildingTypes[key as keyof typeof t.object.buildingTypes] ?? null
}

function conditionLabel(t: Dict, key: string | undefined): string | null {
  if (!key) return null
  return t.object.conditions[key as keyof typeof t.object.conditions] ?? null
}

export default async function ObjectPage({ params }: PageProps) {
  const { lang, slug } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  // Ссылки на объекты бывают двух видов: /catalog/<id> (число) и /catalog/<slug>.
  // parseInt от slug даёт NaN — такие значения в where не отправляем.
  const numericId = /^\d+$/.test(slug) ? parseInt(slug, 10) : null
  const { docs } = await payload.find({
    collection: 'objects',
    where: numericId ? { id: { equals: numericId } } : { slug: { equals: slug } },
    limit: 1,
    depth: 2,
  })

  const object = docs[0]
  if (!object) notFound()

  const obj = object as unknown as {
    id: number; title: string; type: string; category: string
    price: number; area?: number; livingArea?: number; kitchenArea?: number
    rooms?: number; floor?: number; totalFloors?: number
    buildingType?: string; condition?: string; heating?: string; balcony?: string
    address?: { city?: string; district?: string; street?: string; house?: string; apartment?: string }
    coordinates?: { lat?: number; lng?: number }
    description?: { root?: { children?: unknown[] } }
    features?: { feature?: string }[]
    isPremium?: boolean; isExclusive?: boolean
    agent?: {
      id: number
      name?: string
      position?: string
      phone?: string
      telegram?: string
      whatsapp?: string
      photo?: { url?: string }
    }
    primaryImage?: { id: number; url?: string; alt?: string; filename?: string }
    images?: { id: number; url?: string; alt?: string; filename?: string }[]
  }

  const features = obj.features?.map((f: { feature?: string }) => f.feature).filter(Boolean) || []
  const pricePerMeter = obj.area ? Math.round(obj.price / obj.area) : null
  const gallery = obj.images?.filter((i) => i.url) || []

  // Merge all images for slider: primaryImage first, then the rest
  const allSlides: { url: string; alt: string }[] = []
  if (obj.primaryImage?.url) allSlides.push({ url: obj.primaryImage.url, alt: obj.primaryImage.alt || obj.title })
  for (const img of gallery) {
    if (!allSlides.some((s) => s.url === img.url)) {
      allSlides.push({ url: img.url!, alt: img.alt || obj.title })
    }
  }

  // Similar objects: same category, exclude current, limit 3
  const { docs: similarDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { category: { equals: obj.category } },
        { id: { not_equals: obj.id } },
        { status: { equals: 'published' } },
      ],
    },
    limit: 3,
    depth: 1,
  })
  // WhatsApp: номер из поля whatsapp, при пустом — из phone агента (защита от «https://wa.me/» без номера)
  const agentWaNumber = obj.agent?.whatsapp
    ? obj.agent.whatsapp.replace(/\D/g, '') || (obj.agent.phone || '').replace(/\D/g, '')
    : ''
  // Telegram: юзернейм после t.me/ (защита от пустой ссылки «https://t.me/»)
  const agentTgHandle = (obj.agent?.telegram || '').replace(/^https?:\/\/(www\.)?t\.me\//, '').replace(/^@/, '')

  const similar: ObjectListItem[] = (similarDocs || []).map((d) => ({
    id: d.id as number,
    slug: (d as Record<string, unknown>).slug as string | undefined,
    title: d.title as string,
    type: d.type as 'sale' | 'rent',
    category: d.category as string,
    price: d.price as number,
    area: d.area as number | undefined,
    rooms: d.rooms as number | undefined,
    floor: d.floor as number | undefined,
    totalFloors: d.totalFloors as number | undefined,
    address: d.address as ObjectListItem['address'],
    primaryImage: d.primaryImage as ObjectListItem['primaryImage'],
    agent: d.agent as ObjectListItem['agent'],
  }))

  // Map inputs: manual coordinates (priority) or geocode by address.
  const mapLat = obj.coordinates?.lat
  const mapLng = obj.coordinates?.lng
  // district excluded — it can reduce geocode accuracy.
  const mapAddress = [obj.address?.city, obj.address?.street, obj.address?.house].filter(Boolean).join(', ')
  const hasValidCoords =
    typeof mapLat === 'number' && Number.isFinite(mapLat) && mapLat >= -90 && mapLat <= 90 &&
    typeof mapLng === 'number' && Number.isFinite(mapLng) && mapLng >= -180 && mapLng <= 180
  const showMap = mapAddress.length > 0 || hasValidCoords

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark">
          {/* Image slider */}
          <div className="mb-8">
            <PhotoGrid slides={allSlides} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2">
              {/* Breadcrumbs */}
              <nav aria-label="Breadcrumb" className="mb-4">
                <a href={`/${lang}/catalog`} className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
                  {t.object.breadcrumbCatalog}
                </a>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] mx-2">/</span>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)]">{obj.title}</span>
              </nav>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {obj.isPremium && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-3 py-1">{t.catalog.premium}</span>}
                {obj.isExclusive && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-burgundy)] border border-[var(--n15-burgundy)]/30 px-3 py-1">{t.object.exclusive}</span>}
              </div>

              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">{obj.title}</h1>
              <p className="text-[var(--n15-muted)] mb-4">
                {[obj.address?.city, obj.address?.district, obj.address?.street, obj.address?.house].filter(Boolean).join(', ')}
              </p>

              {/* Hero price */}
              <div className="text-[32px] leading-tight text-[var(--n15-gold)] font-[family-name:var(--font-display)] font-semibold mb-8">
                {obj.price.toLocaleString(t.locale)} {obj.type === 'rent' ? t.object.perMonth : t.object.currency}
                {pricePerMeter && <span className="text-sm text-[var(--n15-muted)] ml-2">({pricePerMeter.toLocaleString(t.locale)} {t.object.perMeter})</span>}
              </div>

              <OrnamentDivider variant="simple" />

              {/* Параметры — парами «лейбл: значение» в 2 колонки, как на alaniadom */}
              <div className="my-10">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.object.params}</h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 border-t border-[var(--n15-gold)]/15">
                  {[
                    { label: t.object.objectType, value: obj.category ? t.categoryLabels[obj.category as keyof typeof t.categoryLabels] : null },
                    { label: t.object.area, value: obj.area ? `${obj.area} ${t.catalog.sqm}` : null },
                    { label: t.object.living, value: obj.livingArea ? `${obj.livingArea} ${t.catalog.sqm}` : null },
                    { label: t.object.kitchen, value: obj.kitchenArea ? `${obj.kitchenArea} ${t.catalog.sqm}` : null },
                    { label: t.object.rooms, value: obj.rooms?.toString() },
                    { label: t.object.floor, value: obj.floor || obj.totalFloors ? `${obj.floor || '?'} / ${obj.totalFloors || '?'}` : null },
                    { label: t.object.buildingType, value: buildTypeLabel(t, obj.buildingType) },
                    { label: t.object.condition, value: conditionLabel(t, obj.condition) },
                    { label: t.object.heating, value: obj.heating ? t.object.heatingOptions[obj.heating as keyof typeof t.object.heatingOptions] : null },
                    { label: t.object.balcony, value: obj.balcony ? t.object.balconyOptions[obj.balcony as keyof typeof t.object.balconyOptions] : null },
                  ].filter((f) => f.value).map((f, i) => (
                    <div key={f.label}
                      className={`flex justify-between items-baseline gap-4 py-4 border-b border-[var(--n15-gold)]/15 ${
                        i % 2 === 0 ? 'md:pr-5 md:border-r md:border-[var(--n15-gold)]/15' : 'md:pl-5'
                      }`}>
                      <dt className="text-xs uppercase tracking-[0.16em] text-[var(--n15-muted)] font-semibold">{f.label}</dt>
                      <dd className="font-[family-name:var(--font-display)] font-semibold text-[var(--n15-white)] text-base text-right">{f.value}</dd>
                    </div>
                  ))}
                </dl>

                {/* Особенности — под параметрами, над разделителем */}
                {features.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.object.features}</h2>
                    <div className="flex flex-wrap gap-2">
                      {features.map((f) => (
                        <span key={f} className="text-sm px-4 py-2 border border-[var(--n15-gold)]/30 text-[var(--n15-white)]">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Описание — под особенностями, над разделителем */}
              {obj.description?.root?.children?.length ? (
                <div className="mt-10">
                  <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.object.description}</h2>
                  <div className="text-[var(--n15-silver)] leading-relaxed [&_a]:text-[var(--n15-gold)] [&_a]:underline">
                    <RichText data={obj.description as never} />
                  </div>
                </div>
              ) : null}

              <OrnamentDivider variant="simple" />

              {showMap && (
                <div className="mb-8">
                  <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.map.title}</h2>
                  <ObjectMap address={mapAddress} lat={mapLat} lng={mapLng} />
                </div>
              )}

            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                {/* В избранное / Поделиться — как на alaniadom */}
                <ObjectActions objectId={obj.id} shareUrl={`/${lang}/catalog/${obj.id}`} />

                {/* ПОЗВОНИТЬ — прямой телефон менеджера */}
                {obj.agent?.phone && (
                  <Button variant="primary" size="sm" className="w-full mb-4" href={`tel:${obj.agent.phone.replace(/\s+/g, '')}`}>
                    {t.object.phone.toUpperCase()}: {obj.agent.phone}
                  </Button>
                )}

                {/* ВАШ МЕНЕДЖЕР */}
                {obj.agent && (
                  <OrnamentBorder cornerOrnament>
                    <div className="p-6">
                      <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-4">{t.object.yourAgent}</h3>
                      <div className="flex items-center gap-4 mb-4">
                        {obj.agent.photo?.url ? (
                          <img src={obj.agent.photo.url} alt={obj.agent.name || ''} className="w-14 h-14 rounded-full object-cover border border-[var(--n15-gold)]/20" />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center">
                            <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                              {obj.agent.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'АК'}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-[var(--n15-white)]">{obj.agent.name}</div>
                          <div className="text-xs text-[var(--n15-muted)]">{obj.agent.position || t.object.leadingExpert}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {obj.agent.phone && (
                          <Button variant="outline" size="sm" className="w-full" href={`tel:${obj.agent.phone.replace(/\s+/g, '')}`}>
                            {obj.agent.phone}
                          </Button>
                        )}
                        {agentTgHandle && (
                          <Button variant="outline" size="sm" className="w-full" href={`https://t.me/${agentTgHandle}`}>
                            {t.object.telegram}
                          </Button>
                        )}
                        {agentWaNumber && (
                          <Button variant="outline" size="sm" className="w-full" href={`https://wa.me/${agentWaNumber}`}>
                            {t.object.whatsapp}
                          </Button>
                        )}
                      </div>
                    </div>
                  </OrnamentBorder>
                )}

                {/* Запросить просмотр */}
                <div className="mt-6 p-6 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
                  <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-1">{t.object.viewTitle}</h3>
                  <p className="text-xs text-[var(--n15-muted)] mb-4">{t.object.viewSubtitle}</p>
                  <form className="flex flex-col gap-3">
                    <input type="text" placeholder={t.object.namePlaceholder} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
                    <input type="tel" placeholder={t.object.phonePlaceholder} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50" />
                    <textarea placeholder={t.object.messagePlaceholder} rows={3} className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50 resize-none" />
                    <Button variant="primary" size="md" className="w-full">{t.object.submit}</Button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {similar.length > 0 && (
            <div className="mt-16">
              <div className="flex items-end justify-between mb-6">
                <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">{t.object.similarTitle}</h2>
                <a href={`/${lang}/catalog`} className="text-sm text-[var(--n15-gold)] hover:underline">{t.object.allCatalog} →</a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
                {similar.map((s) => <ObjectCard key={s.id} obj={s} lang={lang} t={t} />)}
              </div>
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
