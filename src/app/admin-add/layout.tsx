import '@/app/globals.css'

export default function AdminAddLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-[var(--n15-black)] text-[var(--n15-silver)] font-[family-name:var(--font-body)] flex flex-col">
        {children}
      </body>
    </html>
  )
}
