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

  // Планировочные решения: текст и изображения/схемы
  const planningText = String(doc.planningText || '').trim()
  const planningImages = mediaList(doc.planningImages)

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

          {/* Планировочные решения: описание и изображения/схемы */}
          {(planningText || planningImages.length > 0) && (
            <section className="mb-14">
              <BlockTitle>{t.complex.planningTitle}</BlockTitle>
              {planningText && (
                <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[var(--n15-muted)] whitespace-pre-line">
                  {planningText}
                </p>
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

          {/* Помещения и инфраструктура / способы приобретения — двумя карточками */}
          {(premiseItems.length > 0 || purchaseItems.length > 0) && (
            <section className="mb-14 grid gap-6 md:grid-cols-2">
              {premiseItems.length > 0 && (
                <div className="border border-[var(--n15-gold)]/10 p-6">
                  <h3 className="mb-4 text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
                    {t.complex.premisesTitle}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {premiseItems.map((item, index) => (
                      <Chip key={index}>{item}</Chip>
                    ))}
                  </div>
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
