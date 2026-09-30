import type { Metadata } from 'next'
import { YandexMetrika } from '@/components/analytics/YandexMetrika'
import './vars.css'
import './crm.css'

export const metadata: Metadata = {
  title: { default: 'CRM Н15', template: '%s · CRM Н15' },
  robots: { index: false, follow: false },
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased">
      {/* Иконки Material Symbols — свой файл (см. vars.css): запросов к
          fonts.googleapis.com из админки нет */}
      <body className="min-h-full bg-[#f5f2eb]">
        {children}
        {/* Счётчик Яндекс.Метрики — как на публичном сайте: тот же номер
            из настроек сайта, вебвизор выключен (в формах CRM бывают
            персональные данные клиентов) */}
        <YandexMetrika />
      </body>
    </html>
  )
}
