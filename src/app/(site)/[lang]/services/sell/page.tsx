import { permanentRedirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ lang: string }>
}

// Продажа недвижимости переехала из услуг в направление раздела
// «Недвижимость» (страница /sell). Старый адрес перенаправляет,
// чтобы внешние ссылки продолжали работать.
export default async function SellRedirectPage({ params }: PageProps) {
  const { lang } = await params
  permanentRedirect(`/${lang}/sell`)
}
