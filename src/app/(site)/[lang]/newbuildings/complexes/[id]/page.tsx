import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { PhotoGrid } from '@/components/ui/PhotoGrid'
import { PurchaseFaq } from '@/components/purchase/PurchaseFaq'
import { ComplexFeedbackForm } from '@/components/complexes/ComplexFeedbackForm'
import ComplexUnits, { type ComplexUnit } from '@/components/complexes/ComplexUnits'
import ComplexPlannings from '@/components/complexes/ComplexPlannings'
import { getDictionary } from '@/i18n/dictionaries'
// Категории объектов новостройки — машино-места и коммерческие помещения
// (см. src/lib/complex-units.ts)
import { UNIT_CATEGORIES } from '@/lib/complex-units'

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

/** Слайд для лайтбокса PhotoGrid: оригинал для просмотра, card — плитка, thumbnail — лента */
interface Slide {
  url: string
  alt: string
  thumb?: string
  tile?: string
}

/**
 * Изображение для лайтбокса: `url` — оригинал (полноэкранный просмотр с
 * ресайзом средствами next/image), `tile` — card 800px для плитки,
 * `thumb` — thumbnail для ленты миниатюр. null — картинки нет.
 */
function slideOf(value: unknown): Slide | null {
  if (!value || typeof value !== 'object') return null
  const media = value as MediaDoc
  if (!media.url) return null
  return {
    url: media.url,
    alt: String(media.alt || ''),
    thumb: media.sizes?.thumbnail?.url || media.sizes?.card?.url || media.url,
    tile: media.sizes?.card?.url || media.sizes?.thumbnail?.url || media.url,
  }
}

/** Список слайдов поля upload hasMany — без пустых мест */
function slideList(value: unknown): Slide[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const slide = slideOf(item)
    return slide ? [slide] : []
  })
}

/**
 * Файл раздела «Медиа и документы»: изображение из media или PDF из
 * complex-documents. У изображения на плитку берём card-размер, а `full` —
 * оригинал: планировку открывают в новой вкладке на весь экран (на телефоне
 * так её можно приблизить). У PDF размеры не собираются, поэтому url и full —
 * один и тот же файл (см. src/payload/collections/ComplexDocuments.ts).
 */
function fileOf(value: unknown): { url: string; full: string; alt: string; pdf: boolean } | null {
  if (!value || typeof value !== 'object') return null
  const media = value as MediaDoc
  const pdf = media.mimeType === 'application/pdf' || /\.pdf$/i.test(String(media.url || ''))
  const url = pdf ? media.url : media.sizes?.card?.url || media.url
  if (!url) return null
  return { url, full: String(media.url || url), alt: String(media.alt || ''), pdf: Boolean(pdf) }
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
    const name = String(item.name || '').trim()
    const rooms = String(item.rooms || '').trim()
    const building = String(item.building || '').trim()
    // Подпись кнопки: ведущее число комнат даёт «2-комнатная», иначе текст как
    // введён («Студия», «Кухня-гостиная + спальня»), иначе название планировки
    const digits = /^\s*(\d+)/.exec(rooms)
    const head = digits
      ? `${digits[1]}-${t.complex.planningRoomSuffix}`
      : rooms || name || t.complex.planningLabel
    const label = [head, area ? `${area} ${t.complex.areaUnit}` : '', building].filter(Boolean).join(' · ')
    return [{ ...file, name, rooms, area, building, label }]
  })
  const planningImages = planningCards.length ? [] : slideList(doc.planningImages)

  // Галерея ЖК: фотографии и рендеры комплекса. Главное изображение — первым
  const galleryAll = (Array.isArray(doc.gallery) ? doc.gallery : []).flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const photo = slideOf(item.photo)
    return photo ? [{ ...photo, isMain: item.isMain === true }] : []
  })
  const galleryMain = galleryAll.find((g) => g.isMain) || null
  const gallery = galleryMain ? [galleryMain, ...galleryAll.filter((g) => g !== galleryMain)] : galleryAll

  // Паркинг и кладовые: описание и фотографии — показываются в разделе помещений
  const parking = (doc.parking && typeof doc.parking === 'object' ? doc.parking : {}) as Record<string, unknown>
  const parkingText = String(parking.description || '').trim()
  const parkingPhotos = slideList(parking.photos)
  const storerooms = (doc.storerooms && typeof doc.storerooms === 'object' ? doc.storerooms : {}) as Record<string, unknown>
  const storeroomsText = String(storerooms.description || '').trim()
  const storeroomsPhotos = slideList(storerooms.photos)

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

  // Помещения и инфраструктура, способы приобретения — чипами. Паркинг и
  // коммерческие помещения здесь не чипами: это активные кнопки раздела
  // объектов новостройки ниже (ComplexUnits) — они открывают подборку
  // машино-мест и помещений этого ЖК
  const premises = (doc.premises && typeof doc.premises === 'object' ? doc.premises : {}) as Record<string, unknown>
  const premiseItems: string[] = []
  if (premises.storage) premiseItems.push(t.complex.premisesStorage)
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

  // Объекты новостройки: машино-места (категория «гараж») и коммерческие
  // помещения этого ЖК. Связь объекта с комплексом закрыта для гостя
  // (privateFieldsAccess в Objects.ts), поэтому читаем сервером с
  // overrideAccess — как и сам комплекс. Реализованные объекты («Реализован»)
  // в подборку не попадают: их отсеивает unitOf ниже, а не where, — у объектов
  // без статуса unitStatus = null, и not_equals отбросил бы и их
  const { docs: unitDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [
        { status: { equals: 'published' } },
        { complex: { equals: complexId } },
        { category: { in: [...UNIT_CATEGORIES] } },
      ],
    },
    sort: '-createdAt',
    limit: 100,
    depth: 2,
    overrideAccess: true,
  })

  const unitOf = (raw: unknown): ComplexUnit | null => {
    const u = raw as Record<string, unknown>
    const id = Number(u.id)
    if (!Number.isInteger(id)) return null
    // Реализованный объект — уже не предложение: на странице не показываем
    if (String(u.unitStatus || '') === 'sold') return null
    const price = typeof u.price === 'number' ? u.price : Number(u.price)
    if (!Number.isFinite(price)) return null
    const category = String(u.category || '')
    // Фото: главное, иначе первое из галереи; планировка — отдельное поле
    const photoDoc = u.primaryImage || (Array.isArray(u.images) ? u.images[0] : null)
    const photo = fileOf(photoDoc)
    const plan = fileOf(u.floorPlan)
    return {
      id,
      slug: String(u.slug || '') || undefined,
      title:
        String(u.title || '').trim() ||
        t.categoryLabels[category as keyof typeof t.categoryLabels] ||
        category,
      category,
      area: typeof u.area === 'number' ? u.area : undefined,
      price,
      purchaseOptions: (Array.isArray(u.purchaseOptions) ? u.purchaseOptions : []).map(String),
      paymentTerms: String(u.paymentTerms || '').trim() || undefined,
      unitStatus: String(u.unitStatus || '') || undefined,
      photo: photo ? { url: photo.url, alt: photo.alt } : undefined,
      floorPlan: plan ? { url: plan.url, full: plan.full, pdf: plan.pdf } : undefined,
    }
  }

  const unitItems = unitDocs.map(unitOf).filter((u): u is ComplexUnit => u !== null)
  const parkingUnits = unitItems.filter((u) => u.category === 'garage')
  const commercialUnits = unitItems.filter((u) => u.category === 'commercial')
  // Кнопку типа показываем, если он помечен в комплексе или уже заведены
  // объекты: без этого тип с объектами, но без отметки, пропал бы
  const showParkingUnits = premises.parking === true || parkingUnits.length > 0
  const showCommercialUnits = premises.commercial === true || commercialUnits.length > 0

  // Вопросы и ответы — общий аккордеон сайта (PurchaseFaq)
  const faq = ((Array.isArray(doc.faq) ? doc.faq : []) as Record<string, unknown>[])
    .map((item) => ({ q: String(item.question || '').trim(), a: String(item.answer || '').trim() }))
    .filter((item) => item.q && item.a)

  // Фотоотчёты: дата и подпись этапа строительства + фотографии
  const photoReports = ((Array.isArray(doc.photoReports) ? doc.photoReports : []) as Record<string, unknown>[])
    .map((report) => ({
      date: formatDate(report.date),
      stage: String(report.stage || '').trim(),
      photos: slideList(report.photos),
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

          {/* Планировочные решения: описание, компактные кнопки планировок
              (клик открывает план крупно — ComplexPlannings) и старые схемы */}
          {(planningText || planningCards.length > 0 || planningImages.length > 0) && (
            <section className="mb-14">
              <BlockTitle>{t.complex.planningTitle}</BlockTitle>
              {planningText && (
                <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                  {planningText}
                </p>
              )}
              {planningCards.length > 0 && (
                <ComplexPlannings
                  items={planningCards.map((item) => ({
                    label: item.label,
                    name: item.name,
                    rooms: item.rooms,
                    area: item.area,
                    building: item.building,
                    thumb: item.url,
                    full: item.full,
                    alt: item.alt,
                    pdf: item.pdf,
                  }))}
                />
              )}
              {planningImages.length > 0 && (
                <PhotoGrid slides={planningImages} />
              )}
            </section>
          )}

          {/* Галерея ЖК: фотографии и рендеры комплекса (главное — первым).
              Плитка открывает полноэкранный просмотр со свайпами (PhotoGrid) */}
          {gallery.length > 0 && (
            <section className="mb-14">
              <BlockTitle>{t.complex.galleryTitle}</BlockTitle>
              <PhotoGrid slides={gallery} />
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
              кладовые с описанием и кнопкой-галереей фото («Паркинг · Фото»,
              «Кладовые · Фото» — раздел «Медиа и документы») */}
          {(premiseItems.length > 0 ||
            purchaseItems.length > 0 ||
            parkingText ||
            parkingPhotos.length > 0 ||
            storeroomsText ||
            storeroomsPhotos.length > 0) && (
            <section className="mb-14 grid gap-6 md:grid-cols-2">
              {(premiseItems.length > 0 || parkingText || parkingPhotos.length > 0 || storeroomsText || storeroomsPhotos.length > 0) && (
                <div className="border border-[var(--n15-gold)]/10 p-6">
                  {/* Заголовок карточки показываем всегда, когда она есть:
                      чипов может и не остаться (паркинг и коммерция ушли
                      кнопками в раздел объектов новостройки), а описания
                      паркинга и кладовых — нет */}
                  <h3 className="mb-4 text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                    {t.complex.premisesTitle}
                  </h3>
                  {premiseItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {premiseItems.map((item, index) => (
                        <Chip key={index}>{item}</Chip>
                      ))}
                    </div>
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
                        <PhotoGrid slides={parkingPhotos} triggerLabel={t.complex.parkingPhotosButton} />
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
                        <PhotoGrid slides={storeroomsPhotos} triggerLabel={t.complex.storeroomsPhotosButton} />
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

          {/* Объекты новостройки: кнопки «Паркинг» и «Коммерческие помещения»
              открывают только машино-места и помещения этого ЖК. Реализованные
              объекты сюда не попадают, у пустого типа — «Предложения скоро
              появятся» без перехода в общий каталог (см. ComplexUnits) */}
          {(showParkingUnits || showCommercialUnits) && (
            <ComplexUnits
              parking={parkingUnits}
              commercial={commercialUnits}
              parkingVisible={showParkingUnits}
              commercialVisible={showCommercialUnits}
            />
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
                    {report.photos.length > 0 && <PhotoGrid slides={report.photos} />}
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
