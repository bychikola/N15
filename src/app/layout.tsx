import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'N15 — Агентство недвижимости',
    template: '%s | N15',
  },
  description:
    'Премиальное агентство недвижимости N15. Квартиры, дома, коммерческая недвижимость. Северная Осетия.',
  keywords: ['недвижимость', 'Владикавказ', 'Осетия', 'квартиры', 'дома', 'N15'],
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'N15',
    title: 'N15 — Агентство недвижимости',
    description:
      'Премиальное агентство недвижимости N15. Квартиры, дома, коммерческая недвижимость.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-[var(--n15-black)] text-[var(--n15-silver)] font-[family-name:var(--font-body)] flex flex-col">
        {children}
      </body>
    </html>
  )
}
