import type { Metadata } from 'next'
import { AdvertisingLegalPage } from '@/components/advertising/LegalDoc'
import { AD_OFFER } from '@/lib/advertising-legal'

interface PageProps {
  params: Promise<{ lang: string }>
}

export function generateMetadata(): Metadata {
  return { title: AD_OFFER.title, description: AD_OFFER.subtitle }
}

/**
 * Договор-оферта (/advertising/offer) — документ, который принимает
 * рекламодатель, отмечая первое согласие в форме «Ваша реклама».
 * Текст живёт в коде (src/lib/advertising-legal.ts), чтобы принятая
 * редакция не менялась задним числом: её версия сохраняется в заявке.
 */
export default async function AdvertisingOfferPage({ params }: PageProps) {
  const { lang } = await params
  return <AdvertisingLegalPage lang={lang} doc={AD_OFFER} />
}
