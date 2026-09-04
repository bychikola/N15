import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'
import { getDictionary, type Dict } from '@/i18n/dictionaries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string }>
}

async function getContacts(t: Dict) {
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'site-settings' })

  const s = settings as unknown as {
    phones?: { phone?: string; label?: string }[]
    email?: string
    address?: string
    socialLinks?: { platform?: string; url?: string }[]
  }

  const contacts: { label: string; value: string; href: string | null }[] = []

  // Phones from SiteSettings
  if (s.phones?.length) {
    for (const p of s.phones) {
      if (p.phone) {
        contacts.push({
          label: p.label || t.contacts.phone,
          value: p.phone,
          href: `tel:${p.phone.replace(/\D/g, '')}`,
        })
      }
    }
  }

  // Email
  if (s.email) {
    contacts.push({ label: t.contacts.email, value: s.email, href: `mailto:${s.email}` })
  }

  // Social links
  if (s.socialLinks?.length) {
    for (const link of s.socialLinks) {
      if (link.url) {
        contacts.push({
          label: link.platform || t.contacts.social,
          value: link.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
          href: link.url,
        })
      }
    }
  }

  // Address
  if (s.address) {
    contacts.push({ label: t.contacts.address, value: s.address, href: null })
  }

  return contacts
}

export default async function ContactsPage({ params }: PageProps) {
  const { lang } = await params
  const t = getDictionary(lang)
  let contacts: { label: string; value: string; href: string | null }[] = []

  try {
    contacts = await getContacts(t)
  } catch {
    // Fallback if Payload is not available
  }

  // Default fallback if no data in admin
  if (contacts.length === 0) {
    contacts = [
      { label: t.contacts.phone, value: '+7 (958) 116-15-15', href: 'tel:+79581161515' },
      { label: 'WhatsApp', value: '+7 (958) 116-15-15', href: 'https://wa.me/79581161515' },
      { label: 'Telegram', value: '@n15_realty', href: 'https://t.me/n15_realty' },
      { label: t.contacts.email, value: 'info@n15-realty.ru', href: 'mailto:info@n15-realty.ru' },
      { label: t.contacts.address, value: t.meta.ogLocale === 'os_RU' ? 'Дзæуджыхъæу, Мирæйы проспект, 15, офис 42' : 'г. Владикавказ, пр. Мира, 15, офис 42', href: null },
    ]
  }

  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            {t.contacts.title}
          </h1>
          <p className="text-[var(--n15-muted)] max-w-xl">
            {t.contacts.subtitle}
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <OrnamentBorder cornerOrnament>
              <div className="p-8">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                  {t.contacts.howTo}
                </h2>

                <div className="space-y-6">
                  {contacts.map((c) => (
                    <div key={c.label}>
                      <div className="text-xs tracking-wider uppercase text-[var(--n15-muted)] mb-1">
                        {c.label}
                      </div>
                      {c.href ? (
                        <a href={c.href} className="text-sm text-[var(--n15-white)] hover:text-[var(--n15-gold)] transition-colors">
                          {c.value}
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--n15-white)]">{c.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </OrnamentBorder>

            {/* Contact form */}
            <div className="p-8 bg-[var(--n15-charcoal)] border border-[var(--n15-gold)]/10">
              <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                {t.contacts.writeUs}
              </h2>
              <form className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder={t.contacts.namePlaceholder}
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                />
                <input
                  type="tel"
                  placeholder={t.contacts.phonePlaceholder}
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                />
                <textarea
                  placeholder={t.contacts.messagePlaceholder}
                  rows={4}
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50 resize-none"
                />
                <Button variant="primary" size="md">
                  {t.contacts.send}
                </Button>
              </form>
            </div>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
