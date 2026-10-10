import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { PurchaseFaq } from '@/components/purchase/PurchaseFaq'
import { ComplexFeedbackForm } from '@/components/complexes/ComplexFeedbackForm'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string; id: string }>
}

/** Изображение из документа media: берём размер card, если он собран */
interface MediaDoc {
  url?: string
  alt?: string
  mimeType?: string
  sizes?: Record<string, { url?: string } | undefined>
}

/** Ссылка на изображение: card-размер, иначе оригинал. null — картинки нет */
function mediaOf(value: unknown, size: 'card' | 'hero' = 'card'): { url: string; alt: string } | null {
  if (!value || typeof value !== 'object') return null
  const media = value as MediaDoc
  const url = (size && media.sizes?.[size]?.url) || media.url
  if (!url) return null
  return { url, alt: String(media.alt || '') }
}

/** Список изображений поля upload hasMany — без пустых мест */
function mediaList(value: unknown, size: 'card' | 'hero' = 'card'): { url: string; alt: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const media = mediaOf(item, size)
    return media ? [media] : []
  })
}

/**
 * Файл раздела «Медиа и документы»: изображение из media или PDF из
 * complex-documents. У изображения берём card-размер, у PDF — оригинал:
 * размеры PDF не собираются (см. src/payload/collections/ComplexDocuments.ts).
 */
function fileOf(value: unknown): { url: string; alt: string; pdf: boolean } | null {
  if (!value || typeof value !== 'object') return null
  const media = value as MediaDoc
  const pdf = media.mimeType === 'application/pdf' || /\.pdf$/i.test(String(media.url || ''))
  const url = pdf ? media.url : media.sizes?.card?.url || media.url
  if (!url) return null
  return { url, alt: String(media.alt || ''), pdf: Boolean(pdf) }
}

/** Дата из ISO в «01.09.2026» — разбором строки, без сдвига часового пояса */
function formatDate(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** Код квартала из базы → римская цифра для срока сдачи */
const QUARTER_ROMAN: Record<string, string> = { q1: 'I', q2: 'II', q3: 'III', q4: 'IV' }

/** Заголовок блока страницы комплекса — единый вид у всех секций */
function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
      {children}
    </h2>
  )
}

/** Плитка-чип «что есть»: паркинг, ипотека и другие отметки комплекса */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 border border-[var(--n15-gold)]/15 px-4 py-2 text-xs text-[var(--n15-silver)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-[var(--n15-gold)]" />
      {children}
    </span>
  )
}

/**
 * Публичная страница жилого комплекса (страница
 * /[lang]/newbuildings/complexes/[id]): описание, планировочные решения, сроки
 * сдачи, помещения и инфраструктура, способы приобретения, вопросы и ответы,
 * карточка обратной связи и фотоотчёты со стройки.
 *
 * Комплекс открывается только у опубликованного застройщика: у компании
 * выключен «Показывать на сайте» или статус «Архивный» — отдаём 404, как
 * несуществующей странице. Справочники developers и complexes закрыты на
 * чтение для гостя, поэтому выдачу собирает сервер с overrideAccess, а в
 * разметку уходят только поля комплекса: контакты ответственного представителя
 * застройщика и прочие служебные сведения на сайте не показываются.
 */
export default async function ComplexPage({ params }: PageProps) {
  const { lang, id } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  const complexId = /^\d+$/.test(id) ? parseInt(id, 10) : null
  if (complexId === null) notFound()

  const { docs } = await payload.find({
    collection: 'complexes',
    where: { id: { equals: complexId } },
    limit: 1,
    // depth 2: застройщик комплекса и изображения (планировки, фотоотчёты)
    depth: 2,
    overrideAccess: true,
  })
  const doc = docs[0] as Record<string, unknown> | undefined
  if (!doc) notFound()

  // Публикацию и статус застройщика проверяем здесь: комплекс без открытой
  // компании на сайте не показывается. Связь должна быть развёрнута — иначе
  // проверить публикацию нечем
  const developer =
    doc.developer && typeof doc.developer === 'object' ? (doc.developer as Record<string, unknown>) : null
  if (!developer || developer.showOnSite !== true || developer.status === 'archived') notFound()
  const developerName = String(developer.name || '')
  if (!developerName) notFound()

  const name = String(doc.name || '')
  if (!name) notFound()

  const place = [doc.locality, doc.street].filter(Boolean).join(', ')
  const description = String(doc.description || '').trim()

  // Планировочные решения: текст и планировки. Новый раздел «Медиа и документы»
  // (plannings) — каждая планировка с подписью, комнатами, площадью и корпусом;
  // у комплексов со старым полем planningImages картинки берём оттуда — без
  // характеристик
  const planningText = String(doc.planningText || '').trim()
  const planningCards = (Array.isArray(doc.plannings) ? doc.plannings : []).flatMap((raw) => {
    const item = raw as Record<string, unknown>
    // Планировка — изображение (image) или PDF (document)
    const file = fileOf(item.image) || fileOf(item.document)
    if (!file) return []
    const area = item.area != null && item.area !== '' ? String(item.area).replace('.', ',') : ''
    return [{
      ...file,
      name: String(item.name || '').trim(),
      rooms: String(item.rooms || '').trim(),
      area,
      building: String(item.building || '').trim(),
    }]
  })
  const planningImages = planningCards.length
    ? []
    : mediaList(doc.planningImages).map((image) => ({ ...image, pdf: false, name: '', rooms: '', area: '', building: '' }))

  // Галерея ЖК: фотографии и рендеры комплекса. Главное изображение — первым
  const galleryAll = (Array.isArray(doc.gallery) ? doc.gallery : []).flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const photo = mediaOf(item.photo)
    return photo ? [{ ...photo, isMain: item.isMain === true }] : []
  })
  const galleryMain = galleryAll.find((g) => g.isMain) || null
  const gallery = galleryMain ? [galleryMain, ...galleryAll.filter((g) => g !== galleryMain)] : galleryAll

  // Паркинг и кладовые: описание и фотографии — показываются в разделе помещений
  const parking = (doc.parking && typeof doc.parking === 'object' ? doc.parking : {}) as Record<string, unknown>
  const parkingText = String(parking.description || '').trim()
  const parkingPhotos = mediaList(parking.photos)
  const storerooms = (doc.storerooms && typeof doc.storerooms === 'object' ? doc.storerooms : {}) as Record<string, unknown>
  const storeroomsText = String(storerooms.description || '').trim()
  const storeroomsPhotos = mediaList(storerooms.photos)

  // Презентация ЖК: PDF-файл, на странице — кнопка «Смотреть презентацию»
  const presentation = fileOf(doc.presentation)

  // Сроки сдачи: корпус/очередь и квартал с годом
  const completion = (Array.isArray(doc.completion) ? doc.completion : []) as Record<string, unknown>[]
  const completionItems = completion
    .map((item) => {
      const roman = QUARTER_ROMAN[String(item.quarter || '')] || ''
      const year = item.year != null && item.year !== '' ? String(item.year) : ''
      const period = [roman ? `${roman} ${t.complex.quarter}` : '', year].filter(Boolean).join(' ')
      return { building: String(item.building || '').trim(), period }
    })
    .filter((item) => item.building || item.period)

  // Помещения и инфраструктура, способы приобретения — чипами
  const premises = (doc.premises && typeof doc.premises === 'object' ? doc.premises : {}) as Record<string, unknown>
  const premiseItems: string[] = []
  if (premises.parking) premiseItems.push(t.complex.premisesParking)
  if (premises.storage) premiseItems.push(t.complex.premisesStorage)
  if (premises.commercial) premiseItems.push(t.complex.premisesCommercial)
  if (String(premises.other || '').trim()) premiseItems.push(String(premises.other).trim())

  const purchaseMethods = (
    doc.purchaseMethods && typeof doc.purchaseMethods === 'object' ? doc.purchaseMethods : {}
  ) as Record<string, unknown>
  const purchaseItems: string[] = []
  if (purchaseMethods.mortgage) purchaseItems.push(t.complex.purchaseMortgage)
  if (purchaseMethods.familyMortgage) purchaseItems.push(t.complex.purchaseFamilyMortgage)
  if (purchaseMethods.militaryMortgage) purchaseItems.push(t.complex.purchaseMilitaryMortgage)
  if (purchaseMethods.installment) purchaseItems.push(t.complex.purchaseInstallment)
  if (purchaseMethods.cash) purchaseItems.push(t.complex.purchaseCash)
  if (String(purchaseMethods.other || '').trim()) purchaseItems.push(String(purchaseMethods.other).trim())

  // Вопросы и ответы — общий аккордеон сайта (PurchaseFaq)
  const faq = ((Array.isArray(doc.faq) ? doc.faq : []) as Record<string, unknown>[])
    .map((item) => ({ q: String(item.question || '').trim(), a: String(item.answer || '').trim() }))
    .filter((item) => item.q && item.a)

  // Фотоотчёты: дата и подпись этапа строительства + фотографии
  const photoReports = ((Array.isArray(doc.photoReports) ? doc.photoReports : []) as Record<string, unknown>[])
    .map((report) => ({
      date: formatDate(report.date),
      stage: String(report.stage || '').trim(),
      photos: mediaList(report.photos),
    }))
    .filter((report) => report.date || report.stage || report.photos.length > 0)

  // Карточка обратной связи: настройки из админки, иначе тексты словаря
  const feedback = (
    doc.feedback && typeof doc.feedback === 'object' ? doc.feedback : {}
  ) as Record<string, unknown>
  const feedbackEnabled = feedback.enabled !== false
  const feedbackTitle = String(feedback.title || '').trim() || t.complex.feedbackTitle
  const feedbackText = String(feedback.text || '').trim() || t.complex.feedbackText
  const feedbackButton =
    feedback.buttonLabel === 'details' ? t.complex.feedbackButtonDetails : t.complex.feedbackButton

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          {/* Хлебные крошки: Новостройки → Застройщики → компания → комплекс */}
          <nav
            aria-label={t.developers.breadcrumbNewbuildings}
            className="mb-4 text-[11px] tracking-wider uppercase"
          >
            <Link
              href={`/${lang}/newbuildings`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.developers.breadcrumbNewbuildings}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <Link
              href={`/${lang}/newbuildings/developers`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.developers.title}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <Link
              href={`/${lang}/newbuildings/developers/${developer.id}`}
              className="text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {developerName}
            </Link>
            <span className="mx-2 text-[var(--n15-gold)]/50" aria-hidden="true">›</span>
            <span className="text-[var(--n15-gold)]">{name}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
            {name}
          </h1>
          <p className="text-sm text-[var(--n15-muted)]">
            <span className="text-[var(--n15-gold)]">{t.complex.developer}:</span>{' '}
            <Link
              href={`/${lang}/newbuildings/developers/${developer.id}`}
              className="hover:text-[var(--n15-gold)] transition-colors"
            >
              {developerName}
            </Link>
            {place && <span className="text-[var(--n15-muted)]"> · {place}</span>}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="mb-10">
            <Link
              href={`/${lang}/newbuildings/developers/${developer.id}`}
              className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              ← {t.complex.backToDeveloper}
            </Link>
          </div>

          {/* Описание комплекса */}
          {description && (
            <section className="mb-14">
              <BlockTitle>{t.complex.aboutTitle}</BlockTitle>
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                {description}
              </p>
            </section>
          )}

          {/* Планировочные решения: описание, карточки планировок и старые схемы */}
          {(planningText || planningCards.length > 0 || planningImages.length > 0) && (
            <section className="mb-14">
              <BlockTitle>{t.complex.planningTitle}</BlockTitle>
              {planningText && (
                <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                  {planningText}
                </p>
              )}
              {planningCards.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {planningCards.map((item, index) => (
                    <div key={index} className="border border-[var(--n15-gold)]/10 p-4">
                      {item.pdf ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-44 w-full items-center justify-center border border-[var(--n15-gold)]/15 text-sm text-[var(--n15-gold)] transition-colors hover:bg-[var(--n15-gold)]/10"
                        >
                          {t.complex.planningDownload}
                        </a>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.alt || item.name || `${name} — ${t.complex.planningTitle}`}
                          loading="lazy"
                          className="h-44 w-full border border-[var(--n15-gold)]/10 object-cover"
                        />
                      )}
                      {(item.name || item.rooms || item.area || item.building) && (
                        <div className="mt-3">
                          {item.name && (
                            <div className="font-[family-name:var(--font-display)] text-base text-[var(--n15-white)]">
                              {item.name}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--n15-muted)]">
                            {item.rooms && (
                              <span>
                                <span className="text-[var(--n15-gold)]">{t.complex.planningRooms}:</span> {item.rooms}
                              </span>
                            )}
                            {item.area && (
                              <span>
                                <span className="text-[var(--n15-gold)]">{t.complex.planningArea}:</span> {item.area} {t.complex.areaUnit}
                              </span>
                            )}
                            {item.building && (
                              <span>
                                <span className="text-[var(--n15-gold)]">{t.complex.planningBuilding}:</span> {item.building}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {planningImages.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {planningImages.map((image, index) => (
                    <img
                      key={index}
                      src={image.url}
                      alt={image.alt || `${name} — ${t.complex.planningTitle}`}
                      loading="lazy"
                      className="h-44 w-full border border-[var(--n15-gold)]/10 object-cover"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Галерея ЖК: фотографии и рендеры комплекса (главное — первым) */}
          {gallery.length > 0 && (
            <section className="mb-14">
              <BlockTitle>{t.complex.galleryTitle}</BlockTitle>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {gallery.map((image, index) => (
                  <img
                    key={index}
                    src={image.url}
                    alt={image.alt || `${name} — ${t.complex.galleryTitle}`}
                    loading="lazy"
                    className={`w-full border border-[var(--n15-gold)]/10 object-cover ${
                      index === 0 && galleryMain ? 'col-span-2 h-64 sm:col-span-3 sm:h-96' : 'h-40'
                    }`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Презентация ЖК: кнопка открывает PDF в новой вкладке */}
          {presentation && (
            <section className="mb-14">
              <BlockTitle>{t.complex.presentationTitle}</BlockTitle>
              <a
                href={presentation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center border border-[var(--n15-gold)]/40 px-6 py-3 text-xs uppercase tracking-wider text-[var(--n15-gold)] transition-colors hover:bg-[var(--n15-gold)]/10"
              >
                {t.complex.presentationButton}
              </a>
            </section>
          )}

          {/* Сроки сдачи по корпусам */}
          {completionItems.length > 0 && (
            <section className="mb-14">
              <BlockTitle>{t.complex.completionTitle}</BlockTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completionItems.map((item, index) => (
                  <div key={index} className="border border-[var(--n15-gold)]/10 p-5">
                    {item.building && (
                      <div className="font-[family-name:var(--font-display)] text-lg text-[var(--n15-white)]">
                        {item.building}
                      </div>
                    )}
                    {item.period && <div className="mt-2 text-sm text-[var(--n15-gold)]">{item.period}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Помещения и инфраструктура / способы приобретения — двумя карточками.
              В карточке помещений — отметки «что есть» чипами, ниже паркинг и
              кладовые с описанием и фотографиями (раздел «Медиа и документы») */}
          {(premiseItems.length > 0 ||
            purchaseItems.length > 0 ||
            parkingText ||
            parkingPhotos.length > 0 ||
            storeroomsText ||
            storeroomsPhotos.length > 0) && (
            <section className="mb-14 grid gap-6 md:grid-cols-2">
              {(premiseItems.length > 0 || parkingText || parkingPhotos.length > 0 || storeroomsText || storeroomsPhotos.length > 0) && (
                <div className="border border-[var(--n15-gold)]/10 p-6">
                  {premiseItems.length > 0 && (
                    <>
                      <h3 className="mb-4 text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                        {t.complex.premisesTitle}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {premiseItems.map((item, index) => (
                          <Chip key={index}>{item}</Chip>
                        ))}
                      </div>
                    </>
                  )}
                  {(parkingText || parkingPhotos.length > 0) && (
                    <div className={premiseItems.length > 0 ? 'mt-6 border-t border-[var(--n15-gold)]/10 pt-5' : ''}>
                      <h4 className="mb-3 font-[family-name:var(--font-display)] text-base text-[var(--n15-white)]">
                        {t.complex.parkingTitle}
                      </h4>
                      {parkingText && (
                        <p className="mb-3 text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                          {parkingText}
                        </p>
                      )}
                      {parkingPhotos.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {parkingPhotos.map((image, index) => (
                            <img
                              key={index}
                              src={image.url}
                              alt={image.alt || `${name} — ${t.complex.parkingTitle}`}
                              loading="lazy"
                              className="h-28 w-full border border-[var(--n15-gold)]/10 object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {(storeroomsText || storeroomsPhotos.length > 0) && (
                    <div className={premiseItems.length > 0 || parkingText || parkingPhotos.length > 0 ? 'mt-6 border-t border-[var(--n15-gold)]/10 pt-5' : ''}>
                      <h4 className="mb-3 font-[family-name:var(--font-display)] text-base text-[var(--n15-white)]">
                        {t.complex.storeroomsTitle}
                      </h4>
                      {storeroomsText && (
                        <p className="mb-3 text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                          {storeroomsText}
                        </p>
                      )}
                      {storeroomsPhotos.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {storeroomsPhotos.map((image, index) => (
                            <img
                              key={index}
                              src={image.url}
                              alt={image.alt || `${name} — ${t.complex.storeroomsTitle}`}
                              loading="lazy"
                              className="h-28 w-full border border-[var(--n15-gold)]/10 object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {purchaseItems.length > 0 && (
                <div className="border border-[var(--n15-gold)]/10 p-6">
                  <h3 className="mb-4 text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                    {t.complex.purchaseTitle}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {purchaseItems.map((item, index) => (
                      <Chip key={index}>{item}</Chip>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Вопросы и ответы — раскрывающийся список */}
          {faq.length > 0 && (
            <section className="mb-14">
              <PurchaseFaq title={t.complex.faqTitle} items={faq} />
            </section>
          )}

          {/* Карточка обратной связи: заявка уходит в CRM */}
          {feedbackEnabled && (
            <section className="mb-14">
              <ComplexFeedbackForm
                complexName={name}
                title={feedbackTitle}
                text={feedbackText}
                buttonLabel={feedbackButton}
              />
            </section>
          )}

          {/* Фотоотчёты со стройки: по датам с подписью этапа */}
          {photoReports.length > 0 && (
            <section>
              <BlockTitle>{t.complex.photoReportsTitle}</BlockTitle>
              <div className="flex flex-col gap-10">
                {photoReports.map((report, index) => (
                  <div key={index}>
                    <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      {report.date && (
                        <span className="text-[11px] tracking-wider uppercase text-[var(--n15-gold)]">
                          {report.date}
                        </span>
                      )}
                      {report.stage && (
                        <span className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                          {report.stage}
                        </span>
                      )}
                    </div>
                    {report.photos.length > 0 && (
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {report.photos.map((image, photoIndex) => (
                          <img
                            key={photoIndex}
                            src={image.url}
                            alt={image.alt || report.stage || `${name} — ${t.complex.photoReportsTitle}`}
                            loading="lazy"
                            className="h-40 w-full border border-[var(--n15-gold)]/10 object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
