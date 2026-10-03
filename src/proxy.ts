import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, isLocale } from '@/i18n/dictionaries'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/** Сколько попыток входа с одного IP допускаем за окно */
const LOGIN_MAX_ATTEMPTS = 20
/** Окно лимита попыток входа, мс (10 минут) */
const LOGIN_WINDOW_MS = 10 * 60_000

/**
 * Ограничение перебора пароля по IP: до входа в Payload считаем попытки
 * с одного адреса и отвечаем 429. Аккаунт дополнительно блокирует сам
 * Payload (maxLoginAttempts/lockTime в коллекции users), но это не мешает
 * перебирать разные логины с одного IP — этот лимит закрывает и такой сценарий.
 * Пароли и тела запросов здесь не читаются и никуда не пишутся.
 */
function loginGuard(request: NextRequest): NextResponse | undefined {
  const ip = clientIp(request.headers)
  // Без адреса клиента (локальная разработка, запрос изнутри) не ограничиваем:
  // общий счётчик заблокировал бы всех разом
  if (ip === 'unknown') return undefined
  if (rateLimited(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)) {
    return NextResponse.json(
      { message: 'Слишком много попыток входа — попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(LOGIN_WINDOW_MS / 1000)) } },
    )
  }
  return undefined
}

/**
 * Локализация маршрутов: `/` и пути без префикса локали редиректятся на
 * `/${lang}/...`. Язык берётся из cookie `n15_lang` (выставленного
 * переключателем), иначе — дефолтный `ru`.
 *
 * Matcher исключает Payload admin, API, статику и файлы с расширением
 * (медиа, логотип, robots.txt и т.д.), чтобы не трогать их; отдельно в
 * matcher добавлен только вход `/api/users/login` — его ограничивает loginGuard.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Вход: лимит по IP до обработки Payload (см. loginGuard). Дальше запрос
  // не локализуем — иначе /api/users/login ушёл бы в /ru/api/users/login.
  if (pathname === '/api/users/login') {
    return loginGuard(request) ?? NextResponse.next()
  }

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
  matcher: [
    // Только вход: здесь работает лимит попыток по IP
    '/api/users/login',
    // Витрина: локализация маршрутов
    '/((?!api|_next|admin|admin-add|crm|.*\\..*).*)',
  ],
}
