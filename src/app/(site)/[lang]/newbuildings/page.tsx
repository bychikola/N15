import { getPayload } from 'payload'
import config from '@payload-config'
import { DirectionPage } from '@/components/directions/DirectionPage'
import { Button } from '@/components/ui/Button'
import NewbuildingsPick from '@/components/newbuildings/NewbuildingsPick'
import { getDictionary } from '@/i18n/dictionaries'
import { loadNewbuildingRows } from '@/lib/newbuildings-selection'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Строки подбора меняются в CRM (публикация квартиры, застройщик, продажа) —
// страницу собираем при каждом запросе, без кэша сборки
export const dynamic = 'force-dynamic'

/**
 * Страница направления «Новостройки». Кнопка «Подбор» раскрывает таблицу
 * квартир от застройщиков (см. src/components/newbuildings/NewbuildingsPick.tsx):
 * опубликованные квартиры-новостройки с привязкой к застройщику, фильтры по
 * столбцам, нажатие на строку открывает карточку квартиры. Рядом — спокойная
 * кнопка заявки на подбор.
 *
 * Под шагами — блок-ссылка на раздел «Застройщики»
 * (страница /[lang]/newbuildings/developers): компании, которые строят
 * новостройки, с их жилыми комплексами и объектами в продаже.
 */
export default async function NewbuildingsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })
  const rows = await loadNewbuildingRows(payload)

  return (
    <DirectionPage
      t={t}
      direction={t.directions.newbuildings}
      actions={
        <NewbuildingsPick
          rows={rows}
          secondary={{ label: t.directions.ctaRequest, href: `/${lang}/contacts` }}
        />
      }
    >
      <div className="mb-12 border border-[var(--n15-gold)]/10 p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
          {t.developers.newbuildingsBlockTitle}
        </h2>
        <p className="text-sm text-[var(--n15-muted)] max-w-2xl mb-5">
          {t.developers.newbuildingsBlockText}
        </p>
        <Button variant="outline" href={`/${lang}/newbuildings/developers`}>
          {t.developers.newbuildingsBlockCta}
        </Button>
      </div>
    </DirectionPage>
  )
}
