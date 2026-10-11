'use client'

import { useEffect, useRef, useState, type FC } from 'react'
import Link from 'next/link'
import { useI18n } from '@/i18n/i18n-provider'
import { BOARD_MAX_PHOTOS } from '@/lib/board'
import type { OwnerManageAd } from '@/lib/owner-manage'

/**
 * Управление фотографиями объявления собственника по личной ссылке.
 *
 * Собственник без учётной записи открывает ссылку и попадает ровно к своему
 * объявлению: добавляет несколько снимков сразу, убирает лишние и выбирает
 * главное — оно становится обложкой. Данные и сам токен приходят со страницы,
 * запрос уходит на тот же маршрут, что и чтение (POST /api/board/owner/manage
 * с токеном): кроме фотографий по ссылке ничего не меняется.
 *
 * Сохранение возвращает опубликованное объявление на проверку, поэтому после
 * отправки показываем экран «отправлено на модерацию» с кнопкой обновления —
 * повторное открытие страницы покажет уже сохранённые снимки.
 */
interface Props {
  lang: string
  token: string
  ad: OwnerManageAd
}

export const OwnerAdPhotos: FC<Props> = ({ lang, token, ad }) => {
  const { t } = useI18n()
  // Прежние фотографии (их отдаёт страница ссылками на защищённый маршрут)
  // и новые файлы — отдельно: при сохранении важно передать, какие оставили
  const [existingPhotos, setExistingPhotos] = useState(ad.photos)
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  // Главное фото — порядок и есть главное: выбранный снимок уходит первым,
  // из начала списка берётся обложка (см. withMainPhotoFirst)
  const [mainKey, setMainKey] = useState<string>(() =>
    ad.photos[0] ? `existing:${ad.photos[0].id}` : '',
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<{ file: File; url: string }[]>([])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  // Ссылки на превью новых файлов освобождаем при закрытии страницы
  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.url)
    }
  }, [])

  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return
    const added = Array.from(files)
      .slice(0, Math.max(0, BOARD_MAX_PHOTOS - photos.length - existingPhotos.length))
      .map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotos((prev) => [...prev, ...added])
    setError('')
  }

  const removeExisting = (id: number) => {
    setExistingPhotos((prev) => prev.filter((p) => p.id !== id))
    // Убрали главное — главным станет первый оставшийся (см. mainEffective)
    if (mainKey === `existing:${id}`) setMainKey('')
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((_, i) => i !== index)
    })
    // Индексы новых файлов после удалённого сдвигаются — ключ главного
    // пересчитываем, иначе он указал бы на чужой снимок
    setMainKey((prev) => {
      if (!prev.startsWith('new:')) return prev
      const at = Number(prev.slice(4))
      if (at === index) return ''
      return at > index ? `new:${at - 1}` : prev
    })
  }

  const photoKeys = [
    ...existingPhotos.map((p) => `existing:${p.id}`),
    ...photos.map((_, i) => `new:${i}`),
  ]
  const mainEffective = mainKey && photoKeys.includes(mainKey) ? mainKey : photoKeys[0] || ''
  const photoCount = photos.length + existingPhotos.length

  // Есть ли что сохранять: сравнение с исходным порядком и составом снимков
  const initialKeys = ad.photos.map((p) => `existing:${p.id}`)
  const dirty =
    photos.length > 0 ||
    photoKeys.length !== initialKeys.length ||
    photoKeys.some((key, i) => key !== initialKeys[i]) ||
    mainEffective !== (initialKeys[0] || '')

  const canSend = photoCount > 0 && dirty && !sending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending || !dirty) return
    if (!photoCount) {
      setError(t.board.formNeedPhoto)
      return
    }
    setSending(true)
    setError('')
    try {
      const body = new FormData()
      body.append('action', 'photos')
      body.append('keepPhotos', existingPhotos.map((p) => p.id).join(','))
      if (mainEffective) body.append('mainPhoto', mainEffective)
      for (const photo of photos) body.append('photos', photo.file)

      const res = await fetch(`/api/board/owner/manage?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body,
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error || t.board.ownerManageError)
        return
      }
      setSent(true)
    } catch {
      setError(t.board.ownerManageError)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-2xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-3">
          {t.board.ownerManageSavedTitle}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--n15-silver)] mb-6">
          {t.board.ownerManageSavedText}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)] text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer"
          >
            {t.board.ownerManageReload}
          </button>
          <Link
            href={`/${lang}/board`}
            className="px-5 py-3 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/30 text-[var(--n15-muted)] hover:text-[var(--n15-silver)] transition-all duration-300"
          >
            {t.board.ownerManageBack}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="max-w-3xl flex flex-col gap-6">
      {/* Что за объявление и в каком оно состоянии — собственник видит контекст */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] tracking-wider uppercase text-[var(--n15-muted)]">
          {t.board.ownerManageFor}
        </span>
        <h1 className="text-2xl md:text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)]">
          {ad.title}
        </h1>
        <p className="text-[11px] tracking-wider uppercase text-[var(--n15-gold)]">
          {t.board.ownerManageStatus}: {ad.statusLabel}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-[var(--n15-muted)]">{t.board.ownerManageIntro}</p>

      {/* --- Фотографии --- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-[family-name:var(--font-display)] text-[var(--n15-white)]">
          {t.board.formPhotos}
        </h2>
        <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">
          {t.board.formPhotosHint.replace('%d', String(BOARD_MAX_PHOTOS))}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            addPhotos(e.target.files)
            e.target.value = ''
          }}
          className="hidden"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoCount >= BOARD_MAX_PHOTOS}
            className="px-4 py-2.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer disabled:opacity-40"
          >
            {t.board.formPhotoPick}
          </button>
          {photoCount > 0 && (
            <span className="text-[11px] text-[var(--n15-muted)]">
              {t.board.formPhotosCount.replace('%d', String(photoCount))}
            </span>
          )}
        </div>

        {photoCount === 0 ? (
          <p className="text-[11px] leading-relaxed text-[var(--n15-burgundy-light)]">
            {t.board.ownerManagePhotosEmpty}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {/* Прежние фотографии: приходят ссылками на защищённый маршрут,
                убрать можно крестиком — при сохранении список оставленных
                уходит на сервер */}
            {existingPhotos.map((photo) => {
              const key = `existing:${photo.id}`
              return (
                <div key={key} className="w-24">
                  <div className="relative">
                    <img
                      src={photo.thumb || photo.full}
                      alt=""
                      className="w-24 h-24 object-cover border border-[var(--n15-gold)]/20"
                    />
                    <button
                      type="button"
                      onClick={() => removeExisting(photo.id)}
                      aria-label={t.board.formPhotoRemove}
                      className="absolute -top-2 -right-2 w-8 h-8 grid place-items-center bg-[var(--n15-black)] border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {mainEffective === key ? (
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-[var(--n15-gold)]">
                      {t.board.formPhotoMain}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMainKey(key)}
                      className="mt-1 block w-full text-center text-[10px] leading-tight uppercase tracking-wider text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors cursor-pointer"
                    >
                      {t.board.formPhotoMakeMain}
                    </button>
                  )}
                </div>
              )
            })}
            {photos.map((photo, index) => {
              const key = `new:${index}`
              return (
                <div key={`${photo.file.name}-${index}`} className="w-24">
                  <div className="relative">
                    <img
                      src={photo.url}
                      alt=""
                      className="w-24 h-24 object-cover border border-[var(--n15-gold)]/20"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      aria-label={t.board.formPhotoRemove}
                      className="absolute -top-2 -right-2 w-8 h-8 grid place-items-center bg-[var(--n15-black)] border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {mainEffective === key ? (
                    <span className="mt-1 block text-center text-[10px] uppercase tracking-wider text-[var(--n15-gold)]">
                      {t.board.formPhotoMain}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMainKey(key)}
                      className="mt-1 block w-full text-center text-[10px] leading-tight uppercase tracking-wider text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors cursor-pointer"
                    >
                      {t.board.formPhotoMakeMain}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Номер владельца на сайте не публикуется — собственник об этом знает */}
      <p className="text-[11px] leading-relaxed text-[var(--n15-muted)]">
        {t.board.ownerManageContactNote}
      </p>

      {error && <p className="text-sm text-[var(--n15-burgundy-light)]">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSend}
          className="px-6 py-3.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 n15-cta-green transition-all duration-300 cursor-pointer disabled:opacity-40"
        >
          {sending ? t.board.ownerManageSaving : t.board.ownerManageSave}
        </button>
        {!dirty && !sending && (
          <span className="text-[11px] text-[var(--n15-muted)]">{t.board.ownerManageNoChanges}</span>
        )}
        <Link
          href={`/${lang}/board`}
          className="text-xs tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-silver)]"
        >
          {t.board.formCancel}
        </Link>
      </div>
    </form>
  )
}
