import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { FILL_TIME_FIELD, HONEYPOT_FIELD } from '@/lib/form-guard'
import { clientIp, rateLimited } from '@/lib/rate-limit'
import { REVIEW_TEXT_LIMITS, reviewRating } from '@/lib/reviews'

/**
 * Приём отзыва с сайта (форма «Оставить отзыв» на странице /reviews).
 *
 * Отзыв принимает только этот маршрут: публичного создания через REST
 * у коллекции reviews нет (create закрыт для не-сотрудников). Все проверки
 * собраны здесь — согласие, поля, длины и невидимая защита от спама.
 * Создаём со статусом «Ждут проверки»: на сайт отзыв попадёт только после
 * решения администратора (см. /api/reviews/manage).
 *
 * Путь — /api/reviews/submit, а не /api/reviews: маршрут Next перекрыл бы
 * REST-адрес коллекции того же имени, и карточка отзыва в админке Payload
 * перестала бы открываться. Так же устроены остальные модули (см.
 * /api/owner-applications/submit, /api/news/review-manage).
 *
 * Персональных данных сверх имени не собираем — телефона, адреса и паспорта
 * в форме нет намеренно (ст. 5 152-ФЗ: только то, что нужно для цели).
 */

// Лимиты по IP и общий потолок на весь сайт — как у остальных публичных форм.
const SUBMIT_RATE_MAX = 4
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000
const SUBMIT_DAY_MAX = 15
const SUBMIT_DAY_WINDOW_MS = 24 * 60 * 60_000
/** Общий потолок отзывов со всего сайта за час — страховка от всплеска */
const SUBMIT_GLOBAL_MAX = 40
const SUBMIT_GLOBAL_WINDOW_MS = 60 * 60_000

/** Быстрее этого человек форму не заполнит, мс (та же граница, что в forms-guard) */
const MIN_FILL_MS = 1500
/** Больше этого числа ссылок в отзыве — уже рассылка */
const MAX_LINKS = 1

const SPAM_MESSAGE = 'Не удалось отправить отзыв. Обновите страницу и попробуйте ещё раз.'
const TOO_MANY_MESSAGE = 'Слишком много отправок — попробуйте через несколько минут'

/** Сколько ссылок в тексте (http(s) и www.) */
const linkCount = (v: unknown): number => (String(v ?? '').match(/(https?:\/\/|www\.)/gi) || []).length

export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    // Общий потолок проверяем первым: он не зависит ни от адреса, ни от формы
    if (rateLimited('reviews-submit:global', SUBMIT_GLOBAL_MAX, SUBMIT_GLOBAL_WINDOW_MS)) {
      return NextResponse.json({ error: TOO_MANY_MESSAGE }, { status: 429 })
    }
    const ip = clientIp(req.headers)
    if (ip !== 'unknown' && rateLimited(`reviews-submit:${ip}`, SUBMIT_RATE_MAX, SUBMIT_RATE_WINDOW_MS)) {
      return NextResponse.json({ error: TOO_MANY_MESSAGE }, { status: 429 })
    }
    if (ip !== 'unknown' && rateLimited(`reviews-submit-day:${ip}`, SUBMIT_DAY_MAX, SUBMIT_DAY_WINDOW_MS)) {
      return NextResponse.json({ error: TOO_MANY_MESSAGE }, { status: 429 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: 'Не удалось прочитать форму' }, { status: 400 })
    }

    // --- Невидимая защита от спама --------------------------------------------
    // Заполненная ловушка: человек это поле не видит, значит отзыв писал бот
    if (String(body[HONEYPOT_FIELD] ?? '').trim()) {
      return NextResponse.json({ error: SPAM_MESSAGE }, { status: 400 })
    }
    // Время заполнения необязательно: у запросов в обход формы его нет
    const fillTime = Number(body[FILL_TIME_FIELD])
    if (Number.isFinite(fillTime) && fillTime > 0 && fillTime < MIN_FILL_MS) {
      return NextResponse.json({ error: SPAM_MESSAGE }, { status: 400 })
    }
    if (linkCount(body.text) > MAX_LINKS) {
      return NextResponse.json({ error: 'В отзыве слишком много ссылок — уберите их и попробуйте снова' }, { status: 400 })
    }

    // --- Согласие -------------------------------------------------------------
    // Обязательная галочка: без неё отзыв не принимаем (ст. 9 152-ФЗ). Проверяем
    // и здесь: форму может обойти кто угодно, а согласие — значимое действие
    if (body.consent !== true) {
      return NextResponse.json({ error: 'Отметьте согласие на обработку персональных данных' }, { status: 400 })
    }

    // --- Поля отзыва ----------------------------------------------------------
    const name = String(body.name ?? '').trim()
    const text = String(body.text ?? '').trim()
    const service = String(body.service ?? '').trim()
    const rating = reviewRating(body.rating)

    if (!name) return NextResponse.json({ error: 'Напишите, как вас подписать' }, { status: 400 })
    if (name.length > REVIEW_TEXT_LIMITS.name) {
      return NextResponse.json({ error: `Имя длиннее ${REVIEW_TEXT_LIMITS.name} знаков` }, { status: 400 })
    }
    if (rating === null) {
      return NextResponse.json({ error: 'Поставьте оценку от 1 до 5 звёзд' }, { status: 400 })
    }
    if (!text) return NextResponse.json({ error: 'Напишите текст отзыва' }, { status: 400 })
    if (text.length > REVIEW_TEXT_LIMITS.text) {
      return NextResponse.json({ error: `Отзыв длиннее ${REVIEW_TEXT_LIMITS.text} знаков` }, { status: 400 })
    }
    if (service.length > REVIEW_TEXT_LIMITS.service) {
      return NextResponse.json({ error: `Название услуги длиннее ${REVIEW_TEXT_LIMITS.service} знаков` }, { status: 400 })
    }

    // --- Отзыв ----------------------------------------------------------------
    // Статус «Ждут проверки»: на сайте отзыв появится после решения модератора.
    // Хук коллекции сам проставит дату и редакцию согласия
    await payload.create({
      collection: 'reviews',
      data: {
        name,
        rating,
        text,
        service: service || undefined,
        consent: true,
        status: 'pending',
        ip,
      },
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('Review submit error:', error)
    return NextResponse.json({ error: 'Не удалось отправить отзыв — попробуйте ещё раз' }, { status: 500 })
  }
}
