import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentDivider } from '@/components/ui/OrnamentDivider'
import { getDictionary } from '@/i18n/dictionaries'
// Безопасный вывод Rich Text: экранирование и белый список тегов/атрибутов
// (аудит задачи №6). Раньше HTML собирался склейкой строк без экранирования.
import { renderRichText } from '@/lib/rich-text'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string; slug: string }>
}

export default async function BlogPostPage({ params }: PageProps) {
  const { lang, slug } = await params
  const t = getDictionary(lang)
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'blog',
    where: { id: { equals: parseInt(slug) } },
    limit: 1,
    depth: 2,
  })

  const post = docs[0] as unknown as {
    id: number; title: string; excerpt?: string; category?: string
    publishedAt?: string
    coverImage?: { url?: string; alt?: string }
    content?: { root?: { children?: unknown[] } }
    author?: { id: number; name?: string }
    tags?: { tag?: string; id?: string }[]
    // Новости с официальных источников: в публикации обязательна строка
    // «Источник: …» (см. src/lib/news.ts)
    sourceName?: string
    sourceUrl?: string
  } | undefined

  if (!post) notFound()

  const contentHtml = renderRichText(post.content, { imagePlaceholder: t.blog.imagePlaceholder })

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark">
          <div className="max-w-3xl mx-auto">
            {/* Cover image */}
            {post.coverImage?.url && (
              <div className="aspect-[21/9] bg-[var(--n15-charcoal)] mb-8 overflow-hidden border border-[var(--n15-gold)]/10">
                <img src={post.coverImage.url} alt={post.coverImage.alt || post.title} className="w-full h-full object-cover" />
              </div>
            )}

            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">{post.category || t.blog.articleFallback}</span>
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-2 mb-4">{post.title}</h1>

            <div className="flex items-center gap-4 text-xs text-[var(--n15-muted)] mb-8">
              <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(t.locale) : ''}</span>
              {post.author?.name && <><span>•</span><span>{post.author.name}</span></>}
              <span>•</span>
              <span>{t.blog.readingTime}</span>
            </div>

            {post.tags?.length && (
              <div className="flex flex-wrap gap-2 mb-8">
                {post.tags.filter((tag) => tag.tag).map((tag) => (
                  <span key={tag.id || tag.tag} className="text-[10px] tracking-wider uppercase px-2 py-1 border border-[var(--n15-gold)]/10 text-[var(--n15-muted)]">
                    #{tag.tag}
                  </span>
                ))}
              </div>
            )}

            {post.excerpt && (
              <div className="border-l-2 border-[var(--n15-gold)]/30 pl-4 mb-8">
                <p className="text-[var(--n15-silver)] italic">{post.excerpt}</p>
              </div>
            )}

            {contentHtml ? (
              <div className="prose prose-invert prose-gold max-w-none" dangerouslySetInnerHTML={{ __html: contentHtml }} />
            ) : (
              <p className="text-[var(--n15-silver)] leading-relaxed">{post.excerpt || ''}</p>
            )}

            {/* Атрибуция новости: название официального источника и прямая ссылка */}
            {post.sourceName && (
              <p className="text-xs text-[var(--n15-muted)] mt-8 border-t border-[var(--n15-gold)]/10 pt-4">
                {t.blog.source}:{' '}
                {post.sourceUrl ? (
                  <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--n15-gold)]/80 hover:text-[var(--n15-gold)] transition-colors">
                    {post.sourceName}
                  </a>
                ) : (
                  post.sourceName
                )}
              </p>
            )}

            <OrnamentDivider variant="solar" />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
