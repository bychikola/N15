/**
 * Сетевые адаптеры публикации: VK и Telegram (официальные API). Сайт N15
 * публикуется не сетью, а сменой статуса объекта — его «адаптер» живёт
 * в publish-service.ts рядом с записью статусов.
 *
 * Адаптеры не зависят от Payload (как и движок publishing.ts): принимают
 * готовый «объект публикации» (текст, абсолютные URL фото) и хранимые
 * remoteId. Ключи площадок — переменные окружения:
 *   VK:          VK_GROUP_TOKEN (токен сообщества), VK_GROUP_ID (id группы)
 *   Telegram:    TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (@имя или -100…)
 *
 * Только официальные методы API — обхода защиты сайтов нет. Файл использует
 * глобальный fetch (Node 18+), поэтому легко проверяется мок-прогонами.
 */
import {
  buildListingMessage,
  cutMessage,
  publishPlatformBySlug,
  platformConfigured,
  type PublishObjectLike,
} from './publishing'

export interface AdapterResult {
  ok: boolean
  /** id объявления на площадке (для обновления/снятия) */
  remoteId?: string
  /** Прямая ссылка на объявление (если площадка её даёт) */
  externalUrl?: string
  error?: string
}

/** До 10 фото на пост (лимиты VK и Telegram media group) */
const MAX_PHOTOS = 10
const HTTP_TIMEOUT_MS = 25_000

const fetchTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Читает фото по URL и кладёт файлом в FormData (для upload-серверов) */
async function photoToForm(fileField: string, photoUrl: string): Promise<FormData> {
  const res = await fetchTimeout(photoUrl, {})
  if (!res.ok) throw new Error(`не удалось загрузить фото (HTTP ${res.status})`)
  const buf = await res.arrayBuffer()
  const name = photoUrl.split('/').pop()?.split('?')[0] || 'photo.jpg'
  const fd = new FormData()
  fd.append(fileField, new Blob([buf], { type: 'image/jpeg' }), name)
  return fd
}

// --- VK (официальный API ВКонтакте) ----------------------------------------------

const vkToken = (): string => String(process.env.VK_GROUP_TOKEN || '').trim()
const vkGroupId = (): string => String(process.env.VK_GROUP_ID || '').trim()

/** Вызов метода VK API. Параметры уходят urlencoded (токен — не в URL). */
async function vkApi(method: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams()
  body.set('access_token', vkToken())
  body.set('v', '5.199')
  for (const [k, v] of Object.entries(params)) body.set(k, String(v))
  const res = await fetchTimeout(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`VK API HTTP ${res.status}`)
  const data = (await res.json()) as { response?: unknown; error?: { error_code?: number; error_msg?: string } }
  if (data.error) {
    throw new Error(`VK API ${data.error.error_code}: ${data.error.error_msg}`)
  }
  return (data.response || {}) as Record<string, unknown>
}

/** Загрузка фото в группу → список вложений photo<owner>_<id> */
async function vkUploadPhotos(photoUrls: string[]): Promise<string[]> {
  const gid = vkGroupId().replace(/^-/, '')
  const up = await vkApi('photos.getWallUploadServer', { group_id: gid })
  const uploadUrl = String(up.upload_url || '')
  if (!uploadUrl) throw new Error('VK: пустой upload_url')
  const attachments: string[] = []
  for (const url of photoUrls) {
    const fd = await photoToForm('photo', url)
    const upRes = await fetchTimeout(uploadUrl, { method: 'POST', body: fd })
    if (!upRes.ok) throw new Error(`VK: загрузка фото не удалась (HTTP ${upRes.status})`)
    const saved = (await upRes.json()) as { server?: string; photo?: string; hash?: string }
    const savedPhotos = await vkApi('photos.saveWallPhoto', {
      group_id: gid,
      server: String(saved.server || ''),
      photo: String(saved.photo || ''),
      hash: String(saved.hash || ''),
    })
    const first = Array.isArray(savedPhotos) ? (savedPhotos[0] as { owner_id?: number; id?: number }) : null
    if (!first || !first.owner_id || !first.id) throw new Error('VK: не удалось сохранить фото')
    attachments.push(`photo${first.owner_id}_${first.id}`)
  }
  return attachments
}

/** Проверка готовности канала VK (для UI: «не настроено», если нет ключей) */
export function vkReady(): { ready: boolean; reason?: string } {
  const spec = publishPlatformBySlug('vk')
  if (!spec || !platformConfigured(spec)) {
    return { ready: false, reason: 'Не заданы VK_GROUP_TOKEN и VK_GROUP_ID в окружении сервера' }
  }
  return { ready: true }
}

/** Публикация поста в сообщество группы (официальный API ВКонтакте) */
export async function vkPublish(obj: PublishObjectLike): Promise<AdapterResult> {
  const ready = vkReady()
  if (!ready.ready) return { ok: false, error: `VK: ${ready.reason}` }
  try {
    const gid = vkGroupId().replace(/^-/, '')
    const photos = (obj.photos || []).filter(Boolean).slice(0, MAX_PHOTOS)
    const attachments = photos.length ? await vkUploadPhotos(photos) : []
    const msg = cutMessage(buildListingMessage(obj), publishPlatformBySlug('vk')!.messageLimit)
    const posted = await vkApi('wall.post', {
      owner_id: `-${gid}`,
      from_group: 1,
      message: msg,
      ...(attachments.length ? { attachments: attachments.join(',') } : {}),
    })
    const postId = Number(posted.post_id)
    if (!postId) throw new Error('VK: пустой post_id в ответе')
    return {
      ok: true,
      remoteId: `-${gid}_${postId}`,
      externalUrl: `https://vk.com/wall-${gid}_${postId}`,
    }
  } catch (e) {
    return { ok: false, error: `VK: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/**
 * Обновление поста VK (текст, при изменении фото — новые вложения).
 * remoteId хранится в формате "-<group>_<post_id>".
 */
export async function vkUpdate(remoteId: string, obj: PublishObjectLike, photosChanged: boolean): Promise<AdapterResult> {
  const m = /^(-?\d+)_(\d+)$/.exec(remoteId)
  if (!m) return { ok: false, error: `VK: нераспознанный remoteId «${remoteId}»` }
  const ownerId = m[1]
  const postId = m[2]
  try {
    const photos = (obj.photos || []).filter(Boolean).slice(0, MAX_PHOTOS)
    const attachments = photosChanged && photos.length ? await vkUploadPhotos(photos) : []
    const msg = cutMessage(buildListingMessage(obj), publishPlatformBySlug('vk')!.messageLimit)
    await vkApi('wall.edit', {
      owner_id: ownerId,
      post_id: postId,
      message: msg,
      ...(attachments.length ? { attachments: attachments.join(',') } : {}),
    })
    return { ok: true, remoteId, externalUrl: `https://vk.com/wall${ownerId}_${postId}` }
  } catch (e) {
    return { ok: false, error: `VK: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Снятие поста VK (официальный метод wall.delete) */
export async function vkWithdraw(remoteId: string): Promise<AdapterResult> {
  const m = /^(-?\d+)_(\d+)$/.exec(remoteId)
  if (!m) return { ok: false, error: `VK: нераспознанный remoteId «${remoteId}»` }
  try {
    await vkApi('wall.delete', { owner_id: m[1], post_id: m[2] })
    return { ok: true, remoteId }
  } catch (e) {
    return { ok: false, error: `VK: ${e instanceof Error ? e.message : String(e)}` }
  }
}

// --- Telegram (официальный Bot API) ----------------------------------------------

const tgToken = (): string => String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
const tgChat = (): string => String(process.env.TELEGRAM_CHANNEL_ID || '').trim()

async function tgApi(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetchTimeout(`https://api.telegram.org/bot${tgToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Telegram API HTTP ${res.status}`)
  const data = (await res.json()) as { ok?: boolean; result?: unknown; description?: string }
  if (!data.ok) throw new Error(`Telegram API: ${data.description || 'неизвестная ошибка'}`)
  return (data.result || {}) as Record<string, unknown>
}

/** Проверка готовности канала Telegram */
export function telegramReady(): { ready: boolean; reason?: string } {
  const spec = publishPlatformBySlug('telegram')
  if (!spec || !platformConfigured(spec)) {
    return { ready: false, reason: 'Не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_CHANNEL_ID в окружении сервера' }
  }
  return { ready: true }
}

/** Публикация media group (фото с подписью) в канал Telegram */
export async function telegramPublish(obj: PublishObjectLike): Promise<AdapterResult> {
  const ready = telegramReady()
  if (!ready.ready) return { ok: false, error: `Telegram: ${ready.reason}` }
  try {
    const photos = (obj.photos || []).filter(Boolean).slice(0, MAX_PHOTOS)
    if (!photos.length) return { ok: false, error: 'Telegram: нет фотографий для публикации' }
    const caption = cutMessage(buildListingMessage(obj), publishPlatformBySlug('telegram')!.messageLimit)
    // Подпись несёт только первое фото media group — как у обычного объявления
    const media = photos.map((url, i) =>
      i === 0
        ? { type: 'photo', media: url, caption }
        : { type: 'photo', media: url },
    )
    const result = await tgApi('sendMediaGroup', { chat_id: tgChat(), media })
    const sent = Array.isArray(result) ? result : null
    const first = sent && (sent[0] as { message_id?: number })
    if (!sent || !first?.message_id) throw new Error('Telegram: пустой ответ sendMediaGroup')
    const messageId = first.message_id
    return {
      ok: true,
      remoteId: String(messageId),
      // Для канала с @username ссылка на сообщение строится по имени
      externalUrl: tgChat().startsWith('@') ? `https://t.me/${tgChat().slice(1)}/${messageId}` : undefined,
    }
  } catch (e) {
    return { ok: false, error: `Telegram: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Правка подписи (фото не менялись) — caption живёт на первом фото группы */
export async function telegramEditCaption(remoteId: string, obj: PublishObjectLike): Promise<AdapterResult> {
  try {
    const caption = cutMessage(buildListingMessage(obj), publishPlatformBySlug('telegram')!.messageLimit)
    await tgApi('editMessageCaption', { chat_id: tgChat(), message_id: Number(remoteId), caption })
    return { ok: true, remoteId }
  } catch (e) {
    return { ok: false, error: `Telegram: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Снятие сообщения канала */
export async function telegramWithdraw(remoteId: string): Promise<AdapterResult> {
  try {
    await tgApi('deleteMessage', { chat_id: tgChat(), message_id: Number(remoteId) })
    return { ok: true, remoteId }
  } catch (e) {
    return { ok: false, error: `Telegram: ${e instanceof Error ? e.message : String(e)}` }
  }
}
