import '@/app/globals.css'
import { notFound } from 'next/navigation'
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

  return (
    <html lang={lang} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-[var(--n15-black)] text-[var(--n15-silver)] font-[family-name:var(--font-body)] flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=(document.cookie.match(/(?:^|; )n15_theme=([^;]*)/)||[])[1];document.documentElement.setAttribute('data-theme',m==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`,
          }}
        />
        <I18nProvider lang={lang} dict={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
