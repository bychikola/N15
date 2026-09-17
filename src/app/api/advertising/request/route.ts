import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { clientIp, rateLimited } from '@/lib/rate-limit'
import { PHOTO_FORMATS_LABEL, PHOTO_MAX_BYTES, PHOTO_MAX_LABEL, isAllowedPhoto } from '@/lib/photo-rules'
import { AD_OFFER_VERSION } from '@/lib/advertising-legal'
import { AD_CONTACT_KIND_LABELS, AD_OBJECT_TYPE_LABELS } from '@/lib/advertising'

/**
 * Приём заявки с формы «Ваша реклама» (страница /advertising).
 *
 * Заявка уходит сюда в двух видах:
 *  - multipart/form-data — обычная отправка формы с фотографиями;
 *  - application/json — отправка без файлов (и старые формы).
 *
 * Без всех трёх согласий (оферта, права на материалы, персональные данные)
 * заявка не принимается: это одинаково проверяют форма, этот маршрут и
 * коллекция advertising-requests. Вместе с заявкой сохраняются дата и время
 * отправки, IP-адрес отправителя и принятая версия оферты.
 *
 * Фотографии кладутся в закрытое хранилище advertising-materials: до
 * проверки модератором они никому не видны и по прямой ссылке не отдаются.
 * Публичного создания через REST у заявок нет — пишем только этим маршрутом.
 */

/** Пределы полей: защита от «простыни» в базе и в CRM */
const MAX = {
  name: 120,
  company: 200,
  phone: 40,
  email: 200,
  location: 300,
  price: 200,
  description: 6000,
  listingUrl: 500,
  videoLinks: 2000,
  desiredTerm: 200,
  message: 4000,
}

/** Сколько файлов принимаем в одной заявке и как часто можно отправлять */
const MAX_PHOTOS = 6
const RATE_MAX = 5
const RATE_WINDOW_MS = 10 * 60_000

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Значение галочки: в multipart приходит строкой, в JSON — булевым */
const isTrue = (v: unknown): boolean => v === true || v === 'true' || v === 'on' || v === '1'

/** Только http(s)-ссылки: схемы javascript:/data: в заявке не нужны */
const cleanUrl = (v: unknown): string => {
  const s = clean(v)
  if (!s) return ''
  return /^https?:\/\/\S+$/i.test(s) ? s : ''
}

/** Строки ссылок на видео — по одной в строке или через запятую */
const cleanVideoLinks = (v: unknown): string => {
  const parts = clean(v)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const links = parts.filter((s) => /^https?:\/\/\S+$/i.test(s))
  return links.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers)
    // Ограничение по IP: форма публичная, без него через маршрут можно
    // заваливать CRM заявками и файлами
    if (rateLimited(`advertising-request:${ip}`, RATE_MAX, RATE_WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Слишком много отправок — попробуйте через несколько минут' },
        { status: 429 },
      )
    }

    const contentType = req.headers.get('content-type') || ''
    const isMultipart = contentType.includes('multipart/form-data')
    const form = isMultipart ? await req.formData().catch(() => null) : null
    const json = isMultipart
      ? null
      : ((await req.json().catch(() => null)) as Record<string, unknown> | null)

    if (!form && !json) {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    /** Поле из multipart или JSON — форма и API читаются одинаково */
    const field = (key: string): unknown => (form ? form.get(key) : json?.[key])

    const data = {
      contactKind: clean(field('contactKind')),
      name: clean(field('name')),
      company: clean(field('company')),
      phone: clean(field('phone')),
      email: clean(field('email')),
      objectType: clean(field('objectType')),
      location: clean(field('location')),
      price: clean(field('price')),
      description: clean(field('description')),
      listingUrl: cleanUrl(field('listingUrl')),
      videoLinks: cleanVideoLinks(field('videoLinks')),
      desiredTerm: clean(field('desiredTerm')),
      message: clean(field('message')),
      consentOffer: isTrue(field('consentOffer')),
      consentRights: isTrue(field('consentRights')),
      consent: isTrue(field('consent')),
    }

    // --- Проверка полей -------------------------------------------------------
    if (!data.name) return bad('Укажите имя контактного лица')
    if (!data.phone) return bad('Укажите телефон')
    // Номер без букв: минимум 10 цифр (городской с кодом или мобильный)
    if ((data.phone.match(/\d/g) || []).length < 10) return bad('Проверьте номер телефона')
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return bad('Проверьте адрес почты')
    if (!data.objectType || !(data.objectType in AD_OBJECT_TYPE_LABELS)) {
      return bad('Выберите тип объекта')
    }
    if (data.contactKind && !(data.contactKind in AD_CONTACT_KIND_LABELS)) {
      return bad('Выберите, как к вам обращаться')
    }
    if (!data.consentOffer || !data.consentRights || !data.consent) {
      return bad('Нужны все три согласия: оферта, права на материалы и обработка персональных данных')
    }
    for (const [key, limit] of Object.entries(MAX)) {
      const value = String(data[key as keyof typeof data] || '')
      if (value.length > limit) return bad('Слишком длинный текст — сократите, пожалуйста')
    }

    // --- Фотографии -----------------------------------------------------------
    const files: File[] = []
    if (form) {
      for (const entry of form.getAll('photos')) {
        if (entry instanceof File && entry.size > 0) files.push(entry)
      }
    }
    if (files.length > MAX_PHOTOS) {
      return bad(`Не больше ${MAX_PHOTOS} фотографий в одной заявке`)
    }
    for (const file of files) {
      if (!isAllowedPhoto({ name: file.name, type: file.type })) {
        return bad(`Фотографии — ${PHOTO_FORMATS_LABEL}: файл «${file.name}» не подходит`)
      }
      if (file.size > PHOTO_MAX_BYTES) {
        return bad(`Файл «${file.name}» больше ${PHOTO_MAX_LABEL}`)
      }
    }

    const payload = await getPayload({ config })

    // Файлы пишем в закрытое хранилище заявок (создание в коллекции закрыто —
    // здесь overrideAccess): до проверки модератором они не публикуются
    const photos: { file: number }[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const doc = await payload.create({
        collection: 'advertising-materials',
        data: { alt: data.name, note: `Заявка: ${data.name}` },
        file: {
          data: buffer,
          mimetype: file.type || 'image/jpeg',
          name: file.name,
          size: buffer.length,
        },
        depth: 0,
        overrideAccess: true,
      })
      photos.push({ file: doc.id as number })
    }

    const doc = await payload.create({
      collection: 'advertising-requests',
      data: {
        ...data,
        contactKind: data.contactKind || 'name',
        // Пустая почта — это «не указана»: поле email не принимает ''
        email: data.email || undefined,
        photos,
        status: 'new',
        // Юридически значимые отметки: время, адрес отправителя и редакция
        // оферты, которую человек принял (см. src/lib/advertising-legal.ts)
        offerVersion: AD_OFFER_VERSION,
        ip,
      },
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ ok: true, id: doc.id })
  } catch (error) {
    console.error('Advertising request error:', error)
    return NextResponse.json(
      { error: 'Не удалось отправить заявку. Позвоните нам, пожалуйста' },
      { status: 500 },
    )
  }
}

/** Однотипный ответ с ошибкой проверки: форма показывает текст как есть */
function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}
