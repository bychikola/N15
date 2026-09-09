import { permanentRedirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Аренда недвижимости переехала в раздел «Недвижимость»: каталог
// с фильтром по типу сделки. Старая страница услуг перенаправляет,
// чтобы внешние ссылки продолжали работать.
export default async function RentRedirectPage({ params }: PageProps) {
  const { lang } = await params
  permanentRedirect(`/${lang}/catalog?type=rent`)
}
