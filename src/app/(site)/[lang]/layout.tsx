import '@/app/globals.css'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { getDictionary, isLocale, locales } from '@/i18n/dictionaries'
import { I18nProvider } from '@/i18n/i18n-provider'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { lang } = await params
  const t = getDictionary(lang)
  return {
    title: { default: t.meta.title, template: '%s | N15' },
    description: t.meta.description,
    openGraph: {
      type: 'website',
      locale: t.meta.ogLocale,
      siteName: 'N15',
      title: t.meta.title,
      description: t.meta.description,
    },
  }
}

export default async function SiteLayout({ children, params }: LayoutProps) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const t = getDictionary(lang)

  // Тема известна на сервере из cookie — data-theme ставится прямо в HTML,
  // без клиентского скрипта: нет FOUC и нет React-ворнинга про <script>.
  const cookieStore = await cookies()
  const theme = cookieStore.get('n15_theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang={lang} data-theme={theme} className="h-full antialiased" suppressHydrationWarning>
      {/* Google Material Symbols (иконки Material Design).
          Полный шрифт без icon_names: API отдаёт subset только по ПЕРВОМУ имени
          (несколько icon_names игнорируются), а лигатуры без subset не работают. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        precedence="default"
      />
      <body className="min-h-full bg-[var(--n15-black)] text-[var(--n15-silver)] font-[family-name:var(--font-body)] flex flex-col">
        <I18nProvider lang={lang} dict={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
