import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { PhotoGrid } from '@/components/ui/PhotoGrid'
import { BoardPhoneButton } from '@/components/board/BoardPhoneButton'
import { BoardMessageForm } from '@/components/board/BoardMessageForm'
import { getDictionary } from '@/i18n/dictionaries'
import { loadBoardAd } from '@/lib/board-service'
import { areaHuman, type AreaUnit } from '@/lib/area-format'
import { floorHuman } from '@/lib/floor-format'
import { isHouseCategoryCode } from '@/lib/object-categories'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string; id: string }>
}

const dateText = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Страница объявления доски: /board/<id>.
 *
 * Ссылка — по числовому id, как у объектов каталога (см. ObjectCard):
 * кириллические slug-сегменты не матчатся роутером этой сборки Next.js.
 *
 * Номер автора в разметке страницы не выводится — его отдаёт кнопка
 * «Показать телефон» отдельным запросом (см. BoardPhoneButton). Неопубликованное
 * объявление открывается только автору и команде — как предпросмотр с плашкой;
 * остальным страница отвечает 404.
 */
export default async function BoardAdPage({ params }: PageProps) {
  const { lang, id } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  // Кто смотрит: автор объявления видит своё и до публикации, команда — тоже
  const { user } = await payload.auth({ headers: await headers() })
  const adId = Number(id)
  const ad = Number.isInteger(adId) && adId > 0
    ? await loadBoardAd(payload, adId, user ? { id: user.id, role: user.role } : null)
    : null
  if (!ad) notFound()

  const areaFmt = (n: number) => n.toLocaleString(t.locale, { maximumFractionDigits: 3 })
  const areaWords = { are: t.catalog.areaUnits, ha: t.catalog.hectareUnits }
  const areaLabel = areaHuman(ad.area, ad.areaUnit as AreaUnit, areaWords, areaFmt)
  const plotAreaLabel = areaHuman(ad.plotArea, (ad.plotAreaUnit || undefined) as AreaUnit | undefined, areaWords, areaFmt)
  const isHouse = isHouseCategoryCode(ad.category)
  const floorsLabel = isHouse
    ? ad.totalFloors
      ? floorHuman(ad.totalFloors, t.object.floorUnits, areaFmt)
      : ''
    : ad.floor || ad.totalFloors
      ? `${ad.floor || '?'}/${ad.totalFloors || '?'} ${t.object.floor.toLowerCase()}`
      : ''

  const isAgency = ad.authorKind === 'agency'
  const categoryLabel = t.categoryLabels[ad.category as keyof typeof t.categoryLabels] || ad.category

  // Характеристики — парами «подпись — значение», пустые не показываем
  const rows = [
    { label: t.board.paramCategory, value: categoryLabel },
    { label: t.board.paramArea, value: areaLabel || '' },
    { label: t.board.paramPlot, value: plotAreaLabel || '' },
    { label: t.board.paramRooms, value: ad.rooms ? String(ad.rooms) : '' },
    { label: t.board.paramFloor, value: floorsLabel },
  ].filter((p) => p.value)

  const slides = ad.photos.map((p) => ({
    url: p.url || '',
    alt: p.alt || ad.title,
    tile: p.sizes?.card?.url || p.sizes?.thumbnail?.url || p.url || '',
    thumb: p.sizes?.thumbnail?.url || p.url || '',
  })).filter((s) => s.url)

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-8">
          <div className="n15-container">
            <nav aria-label={t.board.breadcrumbAria} className="mb-4">
              <Link href={`/${lang}/board`} className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
                {t.board.title}
              </Link>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] mx-2">/</span>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)]">{ad.title}</span>
            </nav>

            {/* Предпросмотр: объявление ещё не на сайте — видно только автору и команде */}
            {ad.preview && (
              <div className="mb-4 border border-[var(--n15-gold)]/40 bg-[var(--n15-gold)]/8 px-4 py-3 text-sm text-[var(--n15-gold)]">
                {t.board.previewNotice}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-black)] bg-[var(--n15-gold)] px-3 py-1">
                {ad.dealType === 'rent' ? t.object.rent : t.object.sale}
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-white)] border border-[var(--n15-gold)]/30 px-3 py-1">
                {categoryLabel}
              </span>
              <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-white)] border border-[var(--n15-gold)]/30 px-3 py-1">
                {isAgency ? t.board.authorAgency : t.board.authorPrivate}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">
              {ad.title}
            </h1>
            {ad.address && <p className="text-[var(--n15-muted)] mb-3">{ad.address}</p>}
            <div className="text-[32px] leading-tight text-[var(--n15-gold)] font-[family-name:var(--font-display)] font-semibold">
              {ad.price != null ? ad.price.toLocaleString(t.locale) : '—'}{' '}
              {ad.dealType === 'rent' ? t.catalog.perMonth : t.catalog.currency}
            </div>
          </div>
        </section>

        <section className="bg-[var(--n15-charcoal)] py-8">
          <div className="n15-container">
            {slides.length > 0 && (
              <div className="mb-8">
                <PhotoGrid slides={slides} />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
                  {t.board.paramsTitle}
                </h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 border-t border-[var(--n15-gold)]/15">
                  {rows.map((p) => (
                    <div key={p.label} className="flex justify-between gap-4 py-3 border-b border-[var(--n15-gold)]/15">
                      <dt className="text-sm text-[var(--n15-muted)]">{p.label}</dt>
                      <dd className="text-sm text-[var(--n15-white)] text-right">{p.value}</dd>
                    </div>
                  ))}
                </dl>

                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-8 mb-3">
                  {t.board.descriptionTitle}
                </h2>
                <p className="text-[var(--n15-silver)] whitespace-pre-line leading-relaxed">{ad.description}</p>

                {/* Безопасность сделки: доска — площадка объявлений, деньги
                    и ключи передаются между людьми, и об этом честно предупреждаем */}
                <div className="mt-8 border border-[var(--n15-gold)]/20 px-5 py-4">
                  <p className="text-sm text-[var(--n15-gold)] mb-1">{t.board.safetyTitle}</p>
                  <p className="text-sm text-[var(--n15-muted)] leading-relaxed">{t.board.safetyText}</p>
                </div>
              </div>

              {/* Автор и связь с ним: телефон отдаётся кнопкой, номер в разметке
                  страницы не выводится */}
              <aside className="lg:col-span-1">
                <div className="lg:sticky lg:top-24 border border-[var(--n15-gold)]/20 bg-[var(--n15-black)]/40 p-5">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)] mb-2">
                    {t.board.authorTitle}
                  </p>
                  <p className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                    {isAgency ? t.board.authorAgency : ad.authorName}
                  </p>
                  <p className="text-xs text-[var(--n15-muted)] mt-1 mb-4">
                    {isAgency ? t.board.authorAgencyHint : t.board.authorPrivateHint}
                  </p>
                  <BoardPhoneButton t={t} adId={ad.id} />

                  {/* Переписка: покупатель пишет автору, ответ приходит
                      в личный кабинет. Автору своей же объявление писать
                      не предлагаем — он и есть вторая сторона */}
                  {!ad.viewerIsAuthor && (
                    <div className="mt-4 pt-4 border-t border-[var(--n15-gold)]/15">
                      <BoardMessageForm t={t} adId={ad.id} loggedIn={Boolean(user)} lang={lang} />
                    </div>
                  )}
                  <p className="mt-4 text-[11px] text-[var(--n15-muted)]">
                    {ad.publishedAt && <>{t.board.publishedAt}: {dateText(ad.publishedAt)}<br /></>}
                    {ad.expiresAt && !ad.preview && <>{t.board.expiresAt}: {dateText(ad.expiresAt)}</>}
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
