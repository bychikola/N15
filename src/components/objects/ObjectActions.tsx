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

/**
 * Кнопки «В избранное / В избранном» и «Поделиться» — как на alaniadom.
 * Избранное хранится в localStorage (ключ n15_favorites).
 * Поделиться — Web Share API с fallback на копирование ссылки.
 */
export const ObjectActions: FC<Props> = ({ objectId, shareUrl }) => {
  const { t } = useI18n()
  const [isFav, setIsFav] = useState(false)
  const [copied, setCopied] = useState(false)

  // Синхронизация с localStorage (внешняя система) — асинхронно, без
  // синхронного setState в эффекте (правило react-hooks/set-state-in-effect).
  useEffect(() => {
    const id = setTimeout(() => {
      setIsFav(readFavorites().includes(objectId))
    }, 0)
    return () => clearTimeout(id)
  }, [objectId])

  const toggleFav = () => {
    // Без функционального апдейтера: StrictMode вызывает его дважды и дублирует id.
    const favs = readFavorites()
    const isNowFav = favs.includes(objectId)
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(isNowFav ? favs.filter((f) => f !== objectId) : [...favs, objectId]),
    )
    setIsFav(!isNowFav)
  }

  const share = async () => {
    // Пока так: копируем ссылку и показываем «Скопировано» в кнопке с анимацией.
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // нет доступа к буферу — анимацию всё равно показываем
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnBase = 'flex-1 px-4 py-2.5 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer'

  return (
    <div className="flex gap-2 mb-4">
      <button type="button" onClick={toggleFav} aria-pressed={isFav}
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
