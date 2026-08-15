import type { Metadata } from 'next'
import './vars.css'
import './crm.css'

export const metadata: Metadata = {
  title: { default: 'CRM N15', template: '%s · CRM N15' },
  robots: { index: false, follow: false },
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-[#f5f2eb]">{children}</body>
    </html>
  )
}
