import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { checkSpam } from '@/lib/form-guard'
import { LEGAL_VERSION } from '@/lib/legal-docs'
import { ownerPhotosFromForm, parseOwnerApplicationForm, OWNER_MAX_PHOTOS } from '@/lib/owner-form'
import { generateOwnerCode, hashOwnerCode, CODE_RESEND_MAX_PER_DAY } from '@/lib/owner-verify'
import { smsConfigured, sendSms } from '@/lib/sms'
import { clientIp, rateLimited } from '@/lib/rate-limit'

/**
 * Приём заявки собственника с формы на странице /sell.
 *
 * Заявка не создаёт объект и до подтверждения телефона никуда, кроме CRM,
 * не попадает: карточка объекта появится только после того, как владелец
 * подтвердит номер (код из SMS или ручная отметка администратора) и
 * администратор одобрит заявку. Публичного создания через REST у коллекции
 * owner-applications нет — все проверки собраны здесь.
 *
 * Адрес маршрута — /submit, а не сам /api/owner-applications: собственный
 * маршрут по адресу коллекции перекрыл бы её REST-API целиком (Next отдаёт
 * приоритет точному пути), и список заявок перестал бы открываться в админке
 * Payload. По адресу коллекции REST работает как обычно: чтение и запись
 * закрыты полевой проверкой (см. OwnerApplications.ts), а заявки с сайта
 * принимает этот маршрут.
 *
 * Фотографии кладём в закрытое хранилище owner-materials: оттуда они
 * копируются в media при одобрении заявки (см. copyOwnerPhotos в
 * src/lib/owner-service.ts), поэтому непроверенные снимки на сайт не
 * попадают ни при каких условиях.
 *
 * Код подтверждения в ответе не возвращается никогда: он уходит в SMS
 * (или в консоль сервера при разработке, см. src/lib/sms.ts). Если SMS
 * отправить не удалось, заявка всё равно принята — телефон подтвердит
 * администратор вручную.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await getPayload({ config })

    // Общий потолок и лимит по IP — до чтения формы: отказ должен быть
    // дешевле самой заявки. Свой scope, чтобы не делить квоту с формой
    // заявок на просмотр (см. checkSpam)
    if (rateLimited('owner-submit:global', 60, 60 * 60_000)) {
      return NextResponse.json(
        { error: 'Заявок поступает слишком много — попробуйте позже' },
        { status: 429 },
      )
    }

    const form = await req.formData().catch(() => null)
    if (!form) {
      return NextResponse.json({ error: 'Не удалось прочитать форму' }, { status: 400 })
    }

    const failure = checkSpam(
      {
        formRef: form.get('formRef'),
        fillTime: form.get('fillTime'),
        clientPhone: form.get('ownerPhone'),
        message: form.get('description'),
      },
      req.headers,
      'owner',
    )
    if (failure) {
      return NextResponse.json({ error: failure.message }, { status: failure.status })
    }

    // Согласие на обработку персональных данных — обязательное условие
    // (ст. 9 152-ФЗ): владелец оставляет телефон и адрес объекта
    if (String(form.get('consent')) !== 'true') {
      return NextResponse.json(
        { error: 'Отметьте согласие на обработку персональных данных' },
        { status: 400 },
      )
    }

    const parsed = parseOwnerApplicationForm(form)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const photosParsed = ownerPhotosFromForm(form)
    if (!photosParsed.ok) {
      return NextResponse.json({ error: photosParsed.error }, { status: 415 })
    }
    if (photosParsed.files.length > OWNER_MAX_PHOTOS) {
      return NextResponse.json({ error: `Не больше ${OWNER_MAX_PHOTOS} фотографий` }, { status: 400 })
    }

    // Лимит на сам номер: один и тот же телефон нельзя «бомбить» кодами
    // с разных адресов — это защита владельца от чужой рассылки SMS
    const digits = parsed.data.ownerPhone.replace(/\D/g, '')
    if (rateLimited(`owner-code:${digits}`, CODE_RESEND_MAX_PER_DAY, 24 * 60 * 60_000)) {
      return NextResponse.json(
        { error: 'На этот номер код уже отправляли несколько раз — попробуйте завтра' },
        { status: 429 },
      )
    }

    // --- Фотографии: закрытое хранилище заявок ------------------------------
    const photoIds: number[] = []
    for (const file of photosParsed.files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const created = await payload.create({
          collection: 'owner-materials',
          data: { alt: parsed.data.ownerName },
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
        // принимаем заявку с половиной фотографий
        console.error('Заявки собственников: фотография не принята', error)
        return NextResponse.json(
          { error: 'Одна из фотографий не читается — выберите другую' },
          { status: 400 },
        )
      }
    }

    // --- Заявка и код подтверждения -----------------------------------------
    const code = generateOwnerCode()
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const app = await payload.create({
      collection: 'owner-applications',
      data: {
        ...parsed.data,
        photos: photoIds,
        status: 'new',
        source: 'site',
        consent: true,
        consentAt: now.toISOString(),
        legalVersion: LEGAL_VERSION,
        verifyCodeHash: hashOwnerCode(code),
        verifyCodeSentAt: now.toISOString(),
        verifyAttempts: 0,
        verifySendsToday: 1,
        verifySendsDay: day,
        ip: clientIp(req.headers),
        history: [
          {
            at: now.toISOString(),
            action: 'Заявка с сайта',
            note: `Фотографий: ${photoIds.length}`,
          },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })

    const sms = await sendSms(
      parsed.data.ownerPhone,
      `Н15: код подтверждения ${code}. Никому его не сообщайте.`,
    )
    if (!sms.ok) {
      console.error(`Заявки собственников: SMS не отправлена (${sms.reason || 'причина неизвестна'})`)
    }

    return NextResponse.json(
      {
        ok: true,
        id: app.id,
        // Маска номера: форму подтверждения человек видит сразу после подачи
        phone: parsed.data.ownerPhone,
        codeSent: sms.ok,
        smsConfigured: smsConfigured(),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Owner application submit error:', error)
    return NextResponse.json({ error: 'Не удалось отправить заявку — попробуйте ещё раз' }, { status: 500 })
  }
}
