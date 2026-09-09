import { ServiceDirectionPage } from '@/components/services/ServiceDirectionPage'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

export default async function LegalServicesPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  const legal = t.services.legal

  // id строк — якоря для прямых ссылок на конкретную услугу (например
  // /services/legal#proverka-obekta)
  const items = [
    { id: 'proverka-obekta', title: legal.checkObject.title, text: legal.checkObject.text },
    { id: 'soprovozhdenie-sdelki', title: legal.sdelka.title, text: legal.sdelka.text },
    { id: 'pereplanirovki', title: legal.pereplanirovki.title, text: legal.pereplanirovki.text },
    { id: 'privatizaciya', title: legal.privatizaciya.title, text: legal.privatizaciya.text },
    { id: 'nasledstvo', title: legal.nasledstvo.title, text: legal.nasledstvo.text },
    { id: 'proverka-riskov', title: legal.risks.title, text: legal.risks.text },
  ]

  return (
    <ServiceDirectionPage
      title={legal.title}
      subtitle={legal.subtitle}
      items={items}
      cta={{ label: t.services.ctaConsult, href: `/${lang}/contacts` }}
    />
  )
}
