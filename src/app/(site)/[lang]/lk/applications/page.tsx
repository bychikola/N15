import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import Link from 'next/link'
import { getDictionary } from '@/i18n/dictionaries'

interface PageProps {
  params: Promise<{ lang: string }>
}

const applications = [
  { id: 1, type: 'Просмотр', object: 'Просторная квартира в центре', date: '14.07.2026', status: 'new' },
  { id: 2, type: 'Консультация', object: '—', date: '10.07.2026', status: 'completed' },
]

const statusColors: Record<string, string> = {
  new: 'text-[var(--n15-gold)]', processing: 'text-blue-400', completed: 'text-green-400', cancelled: 'text-[var(--n15-muted)]',
}

export default async function ApplicationsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)

  const statusLabels: Record<string, string> = {
    new: t.lkApplications.statusNew,
    processing: t.lkApplications.statusProcessing,
    completed: t.lkApplications.statusCompleted,
    cancelled: t.lkApplications.statusCancelled,
  }

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="flex items-center gap-4 mb-8">
            <Link href={`/${lang}/lk`} className="text-xs text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors">
              {t.lkApplications.back}
            </Link>
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-8">{t.lkApplications.title}</h1>

          {applications.length === 0 ? (
            <p className="text-[var(--n15-muted)]">{t.lkApplications.empty}</p>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="flex items-center justify-between p-4 border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/20 transition-colors">
                  <div>
                    <div className="text-sm text-[var(--n15-white)]">{app.type}</div>
                    <div className="text-xs text-[var(--n15-muted)] mt-0.5">{app.object} • {app.date}</div>
                  </div>
                  <span className={`text-xs ${statusColors[app.status]}`}>{statusLabels[app.status]}</span>
                </div>
              ))}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
