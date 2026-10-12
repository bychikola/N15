import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import ObjectCard from '@/components/objects/ObjectCard'
import { getDictionary } from '@/i18n/dictionaries'
import { objectToListItem } from '@/lib/object-list-item'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Выдача читается из CRM при каждом запросе: опубликованный посуточный объект
// появляется на странице сразу, без пересборки сайта (как в каталоге)
export const dynamic = 'force-dynamic'

// Порция выдачи (§12): больше карточек — не в один рендер, а ссылкой на
// полную выдачу каталога. Посуточных объектов немного, поэтому и порция
// небольшая — ряд плиток остаётся обозримым на телефоне
const DAILY_LIMIT = 12

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return { title: t.daily.metaTitle, description: t.daily.metaDescription }
}

/**
 * «Посуточно» — опубликованные объекты посуточной аренды из CRM (тип сделки
 * daily, см. src/lib/object-deal-types.ts). Продажа и долгосрочная аренда в
 * раздел не попадают: фильтр по типу сделки. Карточки — те же, что в каталоге
 * (ObjectCard): фото, публичный адрес, стоимость за сутки и переход в полную
 * карточку объекта. Пустая выдача честно сообщает состояние «Пока нет
 * доступных предложений» и даёт связь с Н15 (§8). Отдельный пункт верхнего
 * меню (см. Header).
 */
export default async function DailyPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const s = t.daily
  const payload = await getPayload({ config })

  // Только опубликованные объекты посуточной аренды, свежие публикации первыми.
  // overrideAccess: сервер отдаёт карточкам те же публичные поля, что и
  // каталог (фото, адрес, цена, агент) — читаем без полевой проверки гостя
  const { docs, totalDocs } = await payload.find({
    collection: 'objects',
    where: {
      and: [{ status: { equals: 'published' } }, { type: { equals: 'daily' } }],
    },
    sort: '-createdAt',
    limit: DAILY_LIMIT,
    depth: 1,
    overrideAccess: true,
  })
  const cards = (docs as unknown as Record<string, unknown>[]).map(objectToListItem)
  // Полная выдача раздела живёт в каталоге: там же фильтры и догрузка плиток
  const catalogHref = `/${lang}/catalog?type=daily`

  return (
    <>
      <Header />
      <main className="pt-20">
        {/* Первый экран — зелёный, как у «Как работает площадка» и «Партнёров» */}
        <section className="n15-green-block n15-section">
          <div className="n15-container">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[var(--n15-gold)] mb-3">
              {s.eyebrow}
            </p>
            <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4 max-w-2xl">
              {s.title}
            </h1>
            <p className="max-w-2xl text-sm md:text-[15px] leading-relaxed text-[var(--n15-silver)]">
              {s.lead}
            </p>
          </div>
        </section>

        <SectionWrapper variant="charcoal">
          {cards.length > 0 ? (
            <>
              <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">
                {s.listTitle}
              </h2>
              {/* Та же сетка плиток, что в каталоге и у населённого пункта:
                  одна карточка в столбик на телефоне, 4 — на десктопе */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
                {cards.map((obj) => (
                  <ObjectCard key={obj.id} obj={obj} lang={lang} t={t} />
                ))}
              </div>
              {totalDocs > cards.length && (
                <div className="text-center mt-12">
                  <Button variant="outline" href={catalogHref}>{s.showAll}</Button>
                </div>
              )}
            </>
          ) : (
            // Пусто ≠ ничего (§8): объясняем состояние и предлагаем связаться
            <OrnamentBorder cornerOrnament>
              <div className="px-6 py-10 text-center">
                <p className="max-w-2xl mx-auto text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                  {s.empty}
                </p>
                <p className="max-w-xl mx-auto text-[var(--n15-silver)] leading-relaxed mb-8">
                  {s.emptyNote}
                </p>
                <Button variant="primary" href={`/${lang}/contacts`}>{s.cta}</Button>
              </div>
            </OrnamentBorder>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
