import '@/app/globals.css'

export default function AdminAddLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-[var(--n15-black)] text-[var(--n15-silver)] font-[family-name:var(--font-body)] flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=(document.cookie.match(/(?:^|; )n15_theme=([^;]*)/)||[])[1];document.documentElement.setAttribute('data-theme',m==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
