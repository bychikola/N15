import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Н15 — Агентство недвижимости',
    template: '%s | Н15',
  },
  description: 'Премиальное агентство недвижимости Н15. Квартиры, дома, коммерческая недвижимость. Северная Осетия.',
  keywords: ['недвижимость', 'Владикавказ', 'Осетия', 'квартиры', 'дома', 'Н15'],
  icons: { icon: '/logo.svg' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Н15',
    title: 'Н15 — Агентство недвижимости',
    description: 'Премиальное агентство недвижимости Н15. Квартиры, дома, коммерческая недвижимость.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
