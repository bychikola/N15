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
      {/* Google Material Symbols: в CRM пока нужен только глиф sync (кнопка
          «Обновить» в почте), поэтому подгружаем subset через icon_names.
          Если иконок станет больше — перейти на полный шрифт без icon_names
          (API отдаёт subset только по ПЕРВОМУ имени). */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=sync"
        precedence="default"
      />
      <body className="min-h-full bg-[#f5f2eb]">{children}</body>
    </html>
  )
}
