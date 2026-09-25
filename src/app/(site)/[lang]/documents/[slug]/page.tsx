import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { LegalDocPage } from '@/components/legal/LegalDocPage'
import { LEGAL_DOC_LIST, legalDocById, legalDocBySlug } from '@/lib/legal-docs'
import { legalDocSections } from '@/lib/legal-docs-content'

interface PageProps {
  params: Promise<{ lang: string; slug: string }>
}

/** Адреса всех документов раздела: остальное отдаёт notFound */
export function generateStaticParams() {
  return LEGAL_DOC_LIST.map((doc) => ({ slug: doc.path.split('/').pop() as string }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const doc = legalDocBySlug(slug)
  if (!doc) return {}
  return { title: doc.title, description: doc.subtitle }
}

/**
 * Страница документа раздела «Документы» (/documents/<адрес>). Текст живёт в
 * реестре (src/lib/legal-docs.ts), поэтому у документа одна редакция и одна
 * версия — их видно в шапке и в файле, а форма сохраняет версию в заявке.
 *
 * Единственное исключение — политика обработки персональных данных: её текст
 * двуязычный и уже опубликован на /privacy, куда ведут ссылки форм. Второй
 * копии текста на сайте быть не должно, поэтому адрес /documents/privacy-policy
 * уводит на страницу политики.
 */
export default async function LegalDocumentPage({ params }: PageProps) {
  const { lang, slug } = await params
  // В адресе — конец пути документа («personal-data-consent»). Если пришли по
  // внутреннему имени записи (privacy-policy, advertising-offer, board-rules —
  // так зовутся файлы выгрузки и адреса API), уводим на страницу этого
  // документа, а не показываем «не найдено»
  const doc = legalDocBySlug(slug) || legalDocById(slug)
  if (!doc) notFound()
  if (doc.path !== `/documents/${slug}`) redirect(`/${lang}${doc.path}`)

  return <LegalDocPage lang={lang} doc={doc} sections={legalDocSections(doc, lang)} />
}
