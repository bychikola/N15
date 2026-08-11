'use client'

import { useEffect, useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface Props {
  objectId: number
  shareTitle: string
  shareText: string
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
export const ObjectActions: FC<Props> = ({ objectId, shareTitle, shareText, shareUrl }) => {
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
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl })
        return
      } catch {
        // Пользователь отменил — пробуем fallback ниже
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // нет доступа к буферу — молча игнорируем
    }
  }

  const btnBase = 'flex-1 px-4 py-2.5 text-xs tracking-wider uppercase border transition-all duration-300 cursor-pointer'

  return (
    <div className="flex gap-2 mb-4">
      <button type="button" onClick={toggleFav} aria-pressed={isFav}
        className={`${btnBase} ${
          isFav
            ? 'border-[var(--n15-gold)] text-[var(--n15-gold)] bg-[var(--n15-gold)]/8'
            : 'border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)]'
        }`}>
        {isFav ? t.object.inFavorites : t.object.favorite}
      </button>
      <button type="button" onClick={() => void share()}
        className={`${btnBase} border-[var(--n15-gold)]/30 text-[var(--n15-silver)] hover:border-[var(--n15-gold)]/60 hover:text-[var(--n15-gold)]`}>
        {copied ? t.object.copied : t.object.share}
      </button>
    </div>
  )
}
