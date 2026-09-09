import { permanentRedirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Покупка недвижимости переехала в раздел «Недвижимость»: каталог
// с фильтром по типу сделки. Старая страница услуг перенаправляет,
// чтобы внешние ссылки продолжали работать.
export default async function BuyRedirectPage({ params }: PageProps) {
  const { lang } = await params
  permanentRedirect(`/${lang}/catalog?type=sale`)
}
