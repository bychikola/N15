import type { Metadata } from 'next'
import { AdvertisingLegalPage } from '@/components/advertising/LegalDoc'
import { AD_RULES } from '@/lib/advertising-legal'

interface PageProps {
  params: Promise<{ lang: string }>
}

export function generateMetadata(): Metadata {
  return { title: AD_RULES.title, description: AD_RULES.subtitle }
}

/**
 * Правила размещения рекламы (/advertising/rules) — документ второй и
 * (вместе с офертой) первой галочки формы «Ваша реклама». Текст живёт
 * в коде (src/lib/advertising-legal.ts): правила — часть принятой оферты,
 * и их редакция тоже не должна меняться задним числом.
 */
export default async function AdvertisingRulesPage({ params }: PageProps) {
  const { lang } = await params
  return <AdvertisingLegalPage lang={lang} doc={AD_RULES} />
}
