import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { canAccessCrm, getCrmUser } from '@/app/crm/auth'
import {
  publishAdRequest,
  saveAdRequestCheck,
  saveAdRequestPayment,
  sendAdRequestContract,
  setAdRequestStatus,
  unpublishAdRequest,
  type AdRequestPaymentInput,
} from '@/lib/advertising-service'
import { AD_REQUEST_STATUS_LABELS, type AdRequestStatus } from '@/lib/advertising'

/**
 * Действия раздела CRM «Реклама» по заявкам с формы «Ваша реклама».
 * Тело запроса: { action, id, ...поля действия }.
 *
 *   check        — «На проверке» (взяли заявку в работу)
 *   approve      — «Одобрено»: условия согласованы с рекламодателем
 *   clarify      — «Нужны уточнения»: размещение не начинается до ответа
 *   reject       — «Отклонено»
 *   done         — «Завершено»
 *   savePayment  — стоимость, скидка, формат, срок, состояние оплаты
 *                  (после выставления суммы одобренная заявка переходит
 *                  в «Ожидает оплаты»)
 *   saveCheck    — проверка содержания и идентификатор интернет-рекламы
 *   contract     — сформировать PDF-договор и отправить его на почту
 *   publish      — «Опубликовать»: проверка условий, копии фото в media
 *   unpublish    — «Снять с публикации»: заявка становится «Завершено»
 *
 * Условия публикации проверяет движок (adRequestPublishIssue в
 * src/lib/advertising.ts) и повторяет хук коллекции advertising-requests,
 * поэтому обойти проверку нельзя ни отсюда, ни из админки.
 * Управление рекламой — только для администратора (как и у материалов).
 *
 * Приходят только те поля, которые менеджер действительно правил: поле,
 * которого нет в теле запроса, не трогает сохранённое значение (иначе
 * сохранение стоимости затирало бы выставленную оплату).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCrmUser()
    if (!user || !canAccessCrm(user)) {
      return NextResponse.json({ error: 'Доступ только для команды Н15' }, { status: 403 })
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Рекламой управляет администратор' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Не указана заявка' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const actor = { id: user.id, email: user.email, name: user.name }
    const action = String(body?.action || '')

    /** Единый ответ: ошибка проверки — 400 с текстом причины */
    const answer = (
      result: { ok: boolean; error?: string; status?: string },
      extra: Record<string, unknown> = {},
    ): NextResponse => {
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Не удалось выполнить действие' }, { status: 400 })
      }
      const status = result.status
        ? { status: result.status, statusLabel: AD_REQUEST_STATUS_LABELS[result.status as AdRequestStatus] }
        : {}
      return NextResponse.json({ ok: true, ...status, ...extra })
    }

    /** Поле пришло в запросе (отсутствующее не трогает сохранённое значение) */
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body || {}, key)
    /** Число из тела запроса: пусто и мусор — «не задано» */
    const numField = (key: string): number | null => {
      const raw = body?.[key]
      if (raw === null || raw === undefined || raw === '') return null
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }
    const strField = (key: string): string => String(body?.[key] ?? '').trim()

    switch (action) {
      case 'check':
      case 'approve':
      case 'clarify':
      case 'reject':
      case 'done':
        return answer(await setAdRequestStatus(payload, id, action as AdRequestStatus, actor))

      case 'savePayment': {
        const input: AdRequestPaymentInput = {}
        if (has('cost')) input.cost = numField('cost')
        if (has('discount')) input.discount = numField('discount')
        if (has('format')) input.format = strField('format') || null
        if (has('termDays')) input.termDays = numField('termDays')
        if (has('paymentStatus')) input.paymentStatus = strField('paymentStatus') || null
        if (has('paymentWaived')) input.paymentWaived = Boolean(body?.paymentWaived)
        if (has('paymentNote')) input.paymentNote = strField('paymentNote')
        return answer(await saveAdRequestPayment(payload, id, input, actor))
      }

      case 'saveCheck': {
        const result = await saveAdRequestCheck(
          payload,
          id,
          {
            contentChecked: has('contentChecked') ? Boolean(body?.contentChecked) : undefined,
            contentNote: has('contentNote') ? strField('contentNote') : undefined,
            erid: has('erid') ? strField('erid') : undefined,
          },
          actor,
        )
        return answer(result)
      }

      case 'contract': {
        const result = await sendAdRequestContract(
          payload,
          id,
          { email: strField('email'), note: strField('note') },
          actor,
        )
        return answer(result, { email: result.email })
      }

      case 'publish': {
        const result = await publishAdRequest(payload, id, actor)
        return answer(result, { markingText: result.markingText })
      }

      case 'unpublish':
        return answer(await unpublishAdRequest(payload, id, actor))

      default:
        return NextResponse.json(
          {
            error:
              'Не указано действие (check, approve, clarify, reject, done, savePayment, saveCheck, contract, publish, unpublish)',
          },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('Advertising request manage error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
