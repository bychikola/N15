'use client'

import { useEffect, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface Props {
  objectId: number
  shareUrl: string
}

const FAVORITES_KEY = 'n15_favorites'

function readFavorites(): number[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') as number[]
  } catch {
    return []
  }
}

function writeFavorites(ids: number[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
}

/** Слияние гостевого localStorage-избранного в серверное после входа. */
export async function mergeLocalFavorites(userId: number): Promise<void> {
  const local = readFavorites()
  if (local.length === 0) return
  const meRes = await fetch('/api/users/me?depth=1', { credentials: 'include' })
  const meData = await meRes.json()
  const serverFavs = ((meData?.user?.favorites as { id?: number }[] | number[] | undefined) || []).map(
    (f) => (typeof f === 'object' && f ? (f.id as number) : (f as number)),
  )
  const merged = Array.from(new Set([...serverFavs, ...local]))
  await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ favorites: merged }),
  })
  localStorage.removeItem(FAVORITES_KEY)
}

/**
 * Кнопки «В избранное / В избранном» и «Поделиться».
 * Избранное: залогинен — сервер (Users.favorites), гость — localStorage,
 * слияние происходит при входе (mergeLocalFavorites).
 */
export const ObjectActions: FC<Props> = ({ objectId, shareUrl }) => {
  const { t } = useI18n()
  const [isFav, setIsFav] = useState(false)
  const [copied, setCopied] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const [serverFavs, setServerFavs] = useState<number[]>([])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const local = readFavorites().includes(objectId)
      try {
        const meRes = await fetch('/api/users/me?depth=1', { credentials: 'include' })
        const meData = await meRes.json()
        const me = meData?.user
        if (cancelled) return
        if (me?.id) {
          const favs = ((me.favorites as { id?: number }[] | number[] | undefined) || []).map(
            (f) => (typeof f === 'object' && f ? (f.id as number) : (f as number)),
          )
          setUserId(me.id as number)
          setServerFavs(favs)
          setIsFav(favs.includes(objectId))
          return
        }
      } catch {
        // гость
      }
      if (!cancelled) setIsFav(local)
    }
    void init()
    return () => { cancelled = true }
  }, [objectId])

  const toggleFav = async () => {
    const next = !isFav
    setIsFav(next)
    if (userId !== null) {
      const merged = next
        ? Array.from(new Set([...serverFavs, objectId]))
        : serverFavs.filter((f) => f !== objectId)
      setServerFavs(merged)
      await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ favorites: merged }),
      })
    } else {
      const favs = readFavorites()
      writeFavorites(next ? [...favs, objectId] : favs.filter((f) => f !== objectId))
    }
  }

  const share = async () => {
    // Пока так: копируем ссылку и показываем «Скопировано» в кнопке с анимацией.
    // shareUrl относительный — подставляем origin, чтобы в буфере был полный адрес сайта.
    try {
      await navigator.clipboard.writeText(new URL(shareUrl, window.location.origin).toString())
    } catch {
      // нет доступа к буферу — анимацию всё равно показываем
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnBase = 'flex-1 px-4 py-2.5 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer'

  return (
    <div className="flex gap-2 mb-4">
      <button type="button" onClick={() => void toggleFav()} aria-pressed={isFav}
        className={`${btnBase} flex items-center justify-center gap-1.5 ${
          isFav
            ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
            : 'border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)]'
        }`}>
        {/* Material Symbols: favorite — контур, заливка при «В избранном» */}
        <span
          className="material-symbols-outlined text-base leading-none"
          style={{ fontVariationSettings: isFav ? "'FILL' 1, 'wght' 400" : "'FILL' 0, 'wght' 400" }}
          aria-hidden="true"
        >
          favorite
        </span>
        {isFav ? t.object.inFavorites : t.object.favorite}
      </button>
      <button type="button" onClick={() => void share()}
        className={`${btnBase} flex items-center justify-center gap-1.5 ${
          copied
            ? 'border-[var(--n15-gold)] bg-[var(--n15-gold)] text-[var(--on-accent)] scale-[1.03]'
            : 'border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)]'
        }`}>
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4 12.5 5.5 5.5L20 6.5" />
            </svg>
            {t.object.copied}
          </>
        ) : (
          t.object.share
        )}
      </button>
    </div>
  )
}
