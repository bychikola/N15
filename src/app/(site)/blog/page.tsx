import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'

export const dynamic = 'force-dynamic'

export default async function BlogPage() {
  const payload = await getPayload({ config })
  const { docs: posts } = await payload.find({
    collection: 'blog',
    sort: '-publishedAt',
    limit: 50,
    depth: 1,
  })

  const postsList = (posts as unknown as {
    id: number; title: string; excerpt?: string; category?: string; publishedAt?: string
    coverImage?: { url?: string; alt?: string }
  }[]).filter((p) => p.title)

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="floral">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">Блог</h1>
          <p className="text-[var(--n15-muted)] max-w-xl">Полезные статьи о недвижимости, рынке, ипотеке и жизни в регионе</p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          {postsList.length === 0 ? (
            <p className="text-center py-20 text-[var(--n15-muted)]">Статей пока нет</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {postsList.map((post) => (
                <a key={post.id} href={`/blog/${post.id}`} className="group border border-[var(--n15-gold)]/10 hover:border-[var(--n15-gold)]/30 transition-all duration-300">
                  <div className="aspect-[16/10] bg-[var(--n15-black)] flex items-center justify-center overflow-hidden">
                    {post.coverImage?.url ? (
                      <img src={post.coverImage.url} alt={post.coverImage.alt || post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-20 group-hover:opacity-40 transition-opacity">
                        <rect x="4" y="8" width="40" height="32" stroke="#C8A44E" strokeWidth="1" />
                        <line x1="4" y1="16" x2="44" y2="16" stroke="#C8A44E" strokeWidth="0.5" />
                        <line x1="12" y1="20" x2="36" y2="20" stroke="#C8A44E" strokeWidth="0.3" />
                        <line x1="12" y1="26" x2="32" y2="26" stroke="#C8A44E" strokeWidth="0.3" />
                      </svg>
                    )}
                  </div>
                  <div className="p-6">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">{post.category || 'Статья'}</span>
                    <h3 className="text-base text-[var(--n15-white)] mt-2 mb-2 group-hover:text-[var(--n15-gold)] transition-colors">{post.title}</h3>
                    {post.excerpt && <p className="text-xs text-[var(--n15-muted)] mb-3 line-clamp-2">{post.excerpt}</p>}
                    <span className="text-xs text-[var(--n15-muted)]">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ru-RU') : ''}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
