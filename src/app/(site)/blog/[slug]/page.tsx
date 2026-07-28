import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'blog',
    where: { id: { equals: parseInt(slug) } },
    limit: 1,
    depth: 2,
  })

  const post = docs[0] as unknown as {
    id: number; title: string; excerpt?: string; category?: string
    publishedAt?: string; content?: { root?: { children?: unknown[] } }
    author?: { id: number; name?: string }
  } | undefined

  if (!post) notFound()

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark">
          <div className="max-w-3xl mx-auto">
            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">{post.category || 'Статья'}</span>
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-2 mb-4">{post.title}</h1>
            <div className="flex items-center gap-4 text-xs text-[var(--n15-muted)] mb-8">
              <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ru-RU') : ''}</span>
              {post.author?.name && <><span>•</span><span>{post.author.name}</span></>}
              <span>•</span>
              <span>5 мин. чтения</span>
            </div>

            <div className="aspect-[21/9] bg-[var(--n15-charcoal)] mb-10 flex items-center justify-center border border-[var(--n15-gold)]/10">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-20">
                <rect x="4" y="8" width="56" height="48" stroke="#C8A44E" strokeWidth="1" />
                <line x1="16" y1="28" x2="48" y2="28" stroke="#C8A44E" strokeWidth="0.5" />
                <line x1="16" y1="36" x2="42" y2="36" stroke="#C8A44E" strokeWidth="0.5" />
              </svg>
            </div>

            <div className="prose prose-invert prose-gold max-w-none">
              <p className="text-[var(--n15-silver)] leading-relaxed mb-6">{post.excerpt || ''}</p>
            </div>

            <OrnamentDivider variant="solar" />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
