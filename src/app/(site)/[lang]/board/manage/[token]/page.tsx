import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { OwnerAdPhotos } from '@/components/board/OwnerAdPhotos'
import { getDictionary } from '@/i18n/dictionaries'
import { OWNER_MANAGE_TOKEN_RE, resolveOwnerManageLink } from '@/lib/owner-manage-link'
import { loadOwnerManageAd } from '@/lib/owner-manage'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ lang: string; token: string }>
}

/**
 * Управление объявлением собственника по личной ссылке (/board/manage/<токен>).
 *
 * Ссылку выдаёт администратор после подтверждения контакта (см.
 * issueOwnerManageLink), поэтому учётная запись не нужна: доступ даёт сам
 * токен. Находим по нему ровно одно объявление и показываем форму фотографий;
 * любой другой токен, истёкшая или отозванная ссылка дают один и тот же экран
 * «ссылка недействительна» — перебором нельзя понять, существует ли ссылка.
 *
 * Страница ничего не пишет: правку принимает маршрут /api/board/owner/manage
 * с тем же токеном (см. src/lib/owner-manage.ts).
 */
export default async function OwnerManagePage({ params }: PageProps) {
  const { lang, token } = await params
  const t = getDictionary(lang)

  const payload = await getPayload({ config })
  // Формат токена проверяем до базы: мусор не создаёт запросов
  const link = OWNER_MANAGE_TOKEN_RE.test(token)
    ? await resolveOwnerManageLink(payload, token)
    : null
  const ad = link ? await loadOwnerManageAd(payload, link.boardAdId, token) : null

  return (
    <>
      <Header />
      <main className="pt-20">
        <section className="bg-[var(--n15-black)] py-10">
          <div className="n15-container">
            <Link
              href={`/${lang}/board`}
              className="text-xs uppercase tracking-[0.2em] text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors"
            >
              {t.board.ownerManageBack}
            </Link>
          </div>
        </section>

        <section className="bg-[var(--n15-charcoal)] py-10">
          <div className="n15-container">
            {ad ? (
              <OwnerAdPhotos lang={lang} token={token} ad={ad} />
            ) : (
              <div className="max-w-2xl">
                <h1 className="text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
                  {t.board.ownerManageInvalidTitle}
                </h1>
                <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-6">
                  {t.board.ownerManageInvalidText}
                </p>
                <Link
                  href={`/${lang}/board`}
                  className="n15-cta-green px-6 py-3.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 transition-all duration-300"
                >
                  {t.board.ownerManageBack}
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
