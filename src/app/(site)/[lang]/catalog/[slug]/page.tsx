import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export const dynamic = 'force-dynamic'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import { ImageSlider } from '@/components/ui/ImageSlider'
import { ObjectMap } from '@/components/ui/ObjectMap'
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

  const { docs } = await payload.find({
    collection: 'objects',
    where: { id: { equals: parseInt(slug) } },
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
    agent?: { id: number; name?: string }
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
            <ImageSlider slides={allSlides} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {obj.isPremium && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)] border border-[var(--n15-gold)]/30 px-3 py-1">{t.catalog.premium}</span>}
                {obj.isExclusive && <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-burgundy)] border border-[var(--n15-burgundy)]/30 px-3 py-1">{t.object.exclusive}</span>}
                <span className="text-xs tracking-wider uppercase text-[var(--n15-muted)]">{obj.type === 'sale' ? t.object.sale : t.object.rent} • {obj.category}</span>
              </div>

              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">{obj.title}</h1>
              <p className="text-[var(--n15-muted)] mb-6">
                {[obj.address?.city, obj.address?.district, obj.address?.street, obj.address?.house].filter(Boolean).join(', ')}
              </p>

              {showMap && (
                <div className="mb-8">
                  <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.map.title}</h2>
                  <ObjectMap address={mapAddress} lat={mapLat} lng={mapLng} />
                </div>
              )}

              <div className="text-3xl text-[var(--n15-gold)] font-[family-name:var(--font-display)] mb-8">
                {obj.price.toLocaleString(t.locale)} {obj.type === 'rent' ? t.object.perMonth : t.object.currency}
                {pricePerMeter && <span className="text-sm text-[var(--n15-muted)] ml-2">({pricePerMeter.toLocaleString(t.locale)} {t.object.perMeter})</span>}
              </div>

              <OrnamentDivider variant="simple" />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 my-10">
                {[
                  { label: t.object.area, value: obj.area ? `${obj.area} ${t.catalog.sqm}` : null },
                  { label: t.object.living, value: obj.livingArea ? `${obj.livingArea} ${t.catalog.sqm}` : null },
                  { label: t.object.kitchen, value: obj.kitchenArea ? `${obj.kitchenArea} ${t.catalog.sqm}` : null },
                  { label: t.object.rooms, value: obj.rooms?.toString() },
                  { label: t.object.floor, value: obj.floor || obj.totalFloors ? `${obj.floor || '?'} / ${obj.totalFloors || '?'}` : null },
                  { label: t.object.buildingType, value: buildTypeLabel(t, obj.buildingType) },
                  { label: t.object.condition, value: conditionLabel(t, obj.condition) },
                  { label: t.object.heating, value: obj.heating },
                ].filter((f) => f.value).map((f) => (
                  <div key={f.label}>
                    <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-1">{f.label}</div>
                    <div className="text-sm text-[var(--n15-white)]">{f.value}</div>
                  </div>
                ))}
              </div>

              <OrnamentDivider variant="simple" />

              {features.length > 0 && (
                <div className="my-10">
                  <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">{t.object.features}</h2>
                  <div className="flex flex-wrap gap-2">
                    {features.map((f) => (
                      <span key={f} className="text-xs px-3 py-1.5 border border-[var(--n15-gold)]/20 text-[var(--n15-silver)]">{f}</span>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                {obj.agent && (
                  <OrnamentBorder cornerOrnament>
                    <div className="p-6">
                      <h3 className="text-sm tracking-wider uppercase text-[var(--n15-gold)] mb-4">{t.object.yourAgent}</h3>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-full bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/20 flex items-center justify-center">
                          <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-gold)]">
                            {obj.agent.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'АК'}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm text-[var(--n15-white)]">{obj.agent.name}</div>
                          <div className="text-xs text-[var(--n15-muted)]">{t.object.leadingExpert}</div>
                        </div>
                      </div>
                      <Button variant="primary" size="sm" className="w-full mb-2">+7 (8672) 12-34-56</Button>
                      <Button variant="outline" size="sm" className="w-full">{t.object.whatsapp}</Button>
                    </div>
                  </OrnamentBorder>
                )}

                <div className="mt-6 p-6 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
                  <h3 className="text-sm tracking-wider uppercase text-[var(--n15-white)] mb-4">{t.object.viewTitle}</h3>
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
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
