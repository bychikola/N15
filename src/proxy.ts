import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, isLocale } from '@/i18n/dictionaries'

/**
 * Локализация маршрутов: `/` и пути без префикса локали редиректятся на
 * `/${lang}/...`. Язык берётся из cookie `n15_lang` (выставленного
 * переключателем), иначе — дефолтный `ru`.
 *
 * Matcher исключает Payload admin, API, статику и файлы с расширением
 * (медиа, логотип, robots.txt и т.д.), чтобы не трогать их.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Админка Payload — пропускаем локализацию (секретный путь из .env,
  // локально — /admin). Без этого /n15-adminka редиректился бы на /ru/... и падал в 404.
  const adminRoute = process.env.ADMIN_ROUTE || '/admin'
  if (pathname === adminRoute || pathname.startsWith(`${adminRoute}/`)) return

  // Уже локализованный путь — пропускаем.
  if (locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return

  const raw = request.cookies.get('n15_lang')?.value
  const lang = raw && isLocale(raw) ? raw : defaultLocale

  request.nextUrl.pathname = `/${lang}${pathname}`
  const res = NextResponse.redirect(request.nextUrl)
  res.cookies.set('n15_lang', lang, { path: '/', maxAge: 31536000 })
  return res
}

export const config = {
  matcher: ['/((?!api|_next|admin|admin-add|.*\\..*).*)'],
}
