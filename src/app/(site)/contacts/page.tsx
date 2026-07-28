import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'
import { Button } from '@/components/ui/Button'

export default function ContactsPage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <SectionWrapper variant="dark" ornament="solar">
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-4">
            Контакты
          </h1>
          <p className="text-[var(--n15-muted)] max-w-xl">
            Свяжитесь с нами удобным способом — мы на связи ежедневно с 9:00 до 21:00
          </p>
        </SectionWrapper>

        <SectionWrapper variant="charcoal">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <OrnamentBorder cornerOrnament>
              <div className="p-8">
                <h2 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-6">
                  Как с нами связаться
                </h2>

                <div className="space-y-6">
                  {[
                    { label: 'Телефон', value: '+7 (8672) 12-34-56', href: 'tel:+78672123456' },
                    { label: 'WhatsApp', value: '+7 (928) 123-45-67', href: 'https://wa.me/79281234567' },
                    { label: 'Telegram', value: '@n15_realty', href: 'https://t.me/n15_realty' },
                    { label: 'Email', value: 'info@n15.ru', href: 'mailto:info@n15.ru' },
                    { label: 'Адрес', value: 'г. Владикавказ, пр. Мира, 15, офис 42', href: null },
                  ].map((c) => (
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
                Напишите нам
              </h2>
              <form className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Ваше имя"
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                />
                <input
                  type="tel"
                  placeholder="Телефон"
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50"
                />
                <textarea
                  placeholder="Ваше сообщение"
                  rows={4}
                  className="bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-3 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50 resize-none"
                />
                <Button variant="primary" size="md">
                  Отправить
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
