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

function renderRichText(content: Record<string, unknown> | undefined): string {
  if (!content?.root?.children) return ''
  const children = content.root.children as Array<{ type?: string; children?: Array<{ text?: string; type?: string }>; tag?: string }>
  let html = ''
  for (const node of children) {
    if (node.type === 'heading') {
      const tag = node.tag || 'h2'
      const text = node.children?.map((c) => c.text || '').join('') || ''
      html += `<${tag} class="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-8 mb-3">${text}</${tag}>`
    } else if (node.type === 'paragraph') {
      const text = node.children?.map((c) => c.text || '').join('') || ''
      html += `<p class="text-[var(--n15-silver)] leading-relaxed mb-4">${text}</p>`
    } else if (node.type === 'ul') {
      html += `<ul class="list-disc pl-5 mb-4 space-y-1">`
      for (const li of node.children || []) {
        const text = li.children?.map((c) => c.text || '').join('') || ''
        html += `<li class="text-[var(--n15-silver)]">${text}</li>`
      }
      html += `</ul>`
    } else if (node.type === 'ol') {
      html += `<ol class="list-decimal pl-5 mb-4 space-y-1">`
      for (const li of node.children || []) {
        const text = li.children?.map((c) => c.text || '').join('') || ''
        html += `<li class="text-[var(--n15-silver)]">${text}</li>`
      }
      html += `</ol>`
    } else if (node.type === 'upload') {
      html += `<div class="my-6 flex justify-center"><div class="border border-[var(--n15-gold)]/10 p-2">изображение</div></div>`
    }
  }
  return html
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
    publishedAt?: string
    coverImage?: { url?: string; alt?: string }
    content?: { root?: { children?: unknown[] } }
    author?: { id: number; name?: string }
    tags?: { tag?: string; id?: string }[]
  } | undefined

  if (!post) notFound()

  const contentHtml = renderRichText(post.content as Record<string, unknown> | undefined)

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

            <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--n15-gold)]/60">{post.category || 'Статья'}</span>
            <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-2 mb-4">{post.title}</h1>

            <div className="flex items-center gap-4 text-xs text-[var(--n15-muted)] mb-8">
              <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ru-RU') : ''}</span>
              {post.author?.name && <><span>•</span><span>{post.author.name}</span></>}
              <span>•</span>
              <span>5 мин. чтения</span>
            </div>

            {post.tags?.length && (
              <div className="flex flex-wrap gap-2 mb-8">
                {post.tags.filter((t) => t.tag).map((t) => (
                  <span key={t.id || t.tag} className="text-[10px] tracking-wider uppercase px-2 py-1 border border-[var(--n15-gold)]/10 text-[var(--n15-muted)]">
                    #{t.tag}
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

            <OrnamentDivider variant="solar" />
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
