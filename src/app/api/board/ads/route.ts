import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { countActiveBoardAds, loadBoardList, BOARD_PAGE_SIZE } from '@/lib/board-service'
import { BOARD_MAX_ACTIVE_PER_USER, BOARD_MAX_PHOTOS } from '@/lib/board'
import { boardPhotosFromForm, parseBoardAdForm } from '@/lib/board-form'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Выдача объявлений доски для страницы /board.
 *
 * Параметры — семантические (тип сделки, категория, цена от и до, район…),
 * а where собирает сервер: сырой where из браузера здесь не принимается
 * намеренно. В отличие от каталога объектов (там фильтр проверяет
 * sanitizeObjectsWhere), в объявлении лежит телефон автора — открытый where
 * позволил бы перебирать номера запросом вида { phone: { contains } }.
 *
 * Наружу уходит не документ Payload, а карточка выдачи с явным списком
 * публичных полей (см. src/lib/board-list-item.ts): телефона, почты, IP
 * и журнала модерации в ответе нет.
 *
 * Лимит по IP — как у остальных публичных выборок (см. src/lib/rate-limit.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const payload = await getPayload({ config })

    const result = await loadBoardList(payload, {
      type: sp.get('type') || undefined,
      category: sp.get('category') || undefined,
      rooms: sp.get('rooms') || undefined,
      priceMin: sp.get('price_min') || undefined,
      priceMax: sp.get('price_max') || undefined,
      areaMin: sp.get('area_min') || undefined,
      areaMax: sp.get('area_max') || undefined,
      floorMin: sp.get('floor_min') || undefined,
      floorMax: sp.get('floor_max') || undefined,
      district: sp.get('district') || undefined,
      cityDistrict: sp.get('city_district') || undefined,
      locality: sp.get('locality') || undefined,
      city: sp.get('city') || undefined,
      authorKind: sp.get('author') || undefined,
      q: sp.get('q') || undefined,
      sort: sp.get('sort') || undefined,
      page: Number(sp.get('page')) || 1,
      limit: Number(sp.get('limit')) || BOARD_PAGE_SIZE,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Board list error:', error)
    // Детали — только в серверный лог: клиенту общее сообщение
    return NextResponse.json({ error: 'Не удалось загрузить объявления' }, { status: 500 })
  }
}

// ── Подача объявления ─────────────────────────────────────────────────────────

/**
 * Лимиты подачи — три уровня, и они дополняют друг друга:
 *
 * 1. по IP — отсекает поток с одного адреса. Адрес берётся из ПОСЛЕДНЕГО
 *    элемента X-Forwarded-For: приложение не смотрит в интернет напрямую,
 *    на входе стоит Caddy, и он дописывает реальный адрес клиента в конец.
 *    Подделать этот элемент в заголовке нельзя (первый, наоборот,
 *    подделывается кем угодно, поэтому он не используется);
 * 2. по автору — отсекает поток от одного аккаунта: он не зависит от адреса
 *    вовсе и работает, даже если запросы идут через разные сети;
 * 3. общий на весь сайт — жёсткий потолок. Он не опирается ни на адрес,
 *    ни на аккаунт, поэтому его нельзя обойти ни подделкой заголовка,
 *    ни массовой регистрацией: при превышении подача закрывается всем
 *    до конца окна. Это страховка на случай, если первые два уровня
 *    почему-то не сработают.
 */
const SUBMIT_RATE_MAX = 5
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000
/** Сколько объявлений один автор может подать за сутки */
const SUBMIT_USER_MAX = 10
const SUBMIT_USER_WINDOW_MS = 24 * 60 * 60_000
/** Общий потолок подач на весь сайт за час */
const SUBMIT_GLOBAL_MAX = 60
const SUBMIT_GLOBAL_WINDOW_MS = 60 * 60_000

/**
 * Подача объявления с сайта (форма /board/new).
 *
 * Объявление принимает только этот маршрут: публичного создания через REST
 * у коллекции нет (create закрыт для не-сотрудников), поэтому все проверки
 * собраны здесь — сессия, лимиты, квота, справочники, длины текстов, согласия
 * и фотографии. Создаём со статусом «На модерации»: на сайт объявление попадёт
 * только после проверки (см. /api/board/manage).
 *
 * Фотографии кладём в закрытое хранилище board-materials: до модерации они
 * не отдаются никому, кроме автора и команды, а копии в media появятся при
 * публикации (см. publishBoardAd в src/lib/board-service.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) {
      return NextResponse.json({ error: 'Войдите, чтобы разместить объявление' }, { status: 401 })
    }

    // Общий потолок проверяем первым: он не зависит ни от адреса, ни от
    // аккаунта и закрывает подачу всем, если поток внезапно вырос
    if (rateLimited('board-submit:global', SUBMIT_GLOBAL_MAX, SUBMIT_GLOBAL_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Объявлений поступает слишком много — попробуйте позже' },
        { status: 429 },
      )
    }
    if (rateLimited(`board-submit:${clientIp(req.headers)}`, SUBMIT_RATE_MAX, SUBMIT_RATE_WINDOW_MS)) {
      return NextResponse.json({ error: 'Слишком много заявок — попробуйте позже' }, { status: 429 })
    }
    if (rateLimited(`board-submit-user:${user.id}`, SUBMIT_USER_MAX, SUBMIT_USER_WINDOW_MS)) {
      return NextResponse.json({ error: 'На сегодня объявлений достаточно — попробуйте завтра' }, { status: 429 })
    }

    const authorId = Number(user.id)
    const active = await countActiveBoardAds(payload, authorId)
    if (active >= BOARD_MAX_ACTIVE_PER_USER) {
      return NextResponse.json(
        {
          error: `Одновременно можно держать не больше ${BOARD_MAX_ACTIVE_PER_USER} объявлений — снимите лишние в личном кабинете`,
        },
        { status: 400 },
      )
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Не удалось прочитать форму' }, { status: 400 })
    }

    // --- Согласия -------------------------------------------------------------
    // Два обязательных: обработка персональных данных и правила доски.
    // Проверяем и здесь: форму может обойти кто угодно, а согласие —
    // юридически значимое действие (та же логика в /api/advertising/request)
    if (String(form.get('consent')) !== 'true' || String(form.get('consentRules')) !== 'true') {
      return NextResponse.json(
        { error: 'Отметьте согласие на обработку данных и принятие правил доски' },
        { status: 400 },
      )
    }

    // --- Поля объявления и фотографии ----------------------------------------
    // Разбор и проверки — общие с правкой автором (src/lib/board-form.ts):
    // разойдись они, правка стала бы лазейкой в обход правил подачи
    const parsed = parseBoardAdForm(form)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const photosParsed = boardPhotosFromForm(form)
    if (!photosParsed.ok) {
      return NextResponse.json({ error: photosParsed.error }, { status: 415 })
    }
    const files = photosParsed.files
    if (!files.length) {
      return NextResponse.json({ error: 'Приложите хотя бы одну фотографию объекта' }, { status: 400 })
    }
    if (files.length > BOARD_MAX_PHOTOS) {
      return NextResponse.json({ error: `Не больше ${BOARD_MAX_PHOTOS} фотографий` }, { status: 400 })
    }

    const photoIds: number[] = []
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const created = await payload.create({
          collection: 'board-materials',
          data: { alt: parsed.data.title, author: authorId },
          file: {
            data: buffer,
            mimetype: file.type || 'image/jpeg',
            name: file.name,
            size: buffer.length,
          },
          depth: 0,
          overrideAccess: true,
        })
        photoIds.push(Number(created.id))
      } catch (error) {
        // Битую картинку sharp не прочитает — говорим об этом прямо, а не
        // сохраняем объявление с половиной фотографий
        console.error('Board: фотография не принята', error)
        return NextResponse.json({ error: 'Одна из фотографий не читается — выберите другую' }, { status: 400 })
      }
    }

    // --- Объявление -----------------------------------------------------------
    const ad = await payload.create({
      collection: 'board-ads',
      data: {
        ...parsed.data,
        photos: photoIds,
        author: authorId,
        status: 'pending',
        consent: true,
        consentRules: true,
        ip: clientIp(req.headers),
      },
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, id: ad.id }, { status: 201 })
  } catch (error) {
    console.error('Board submit error:', error)
    return NextResponse.json({ error: 'Не удалось отправить объявление — попробуйте ещё раз' }, { status: 500 })
  }
}
