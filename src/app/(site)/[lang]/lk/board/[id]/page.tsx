'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useI18n } from '@/i18n/i18n-provider'
import { LkShell } from '@/components/lk/LkShell'
import { BoardAdForm } from '@/components/board/BoardAdForm'
import type { BoardAdForEdit } from '@/lib/board-service'

/**
 * Правка своего объявления (/lk/board/<id>).
 *
 * Данные берём из /api/board/ads/manage?id=… — маршрут отдаёт объявление
 * только его автору, чужой (или чужой id) вернёт 404. Форма та же, что при
 * подаче: те же поля, та же проверка, только согласия не спрашиваем (они уже
 * приняты) и фотографии показываем прежние — можно убрать лишние и добавить
 * новые.
 *
 * После сохранения объявление возвращается на проверку: на сайте остаётся
 * прежняя опубликованная версия, пока модератор не посмотрит правку.
 */
export default function LkBoardEditPage() {
  // Язык и id объявления — из параметров маршрута: их отдаёт Next
  // (см. useParams в других страницах кабинета)
  const params = useParams<{ lang: string; id: string }>()
  const lang = params?.lang || 'ru'
  const id = params?.id || ''
  const { t } = useI18n()
  const [ad, setAd] = useState<BoardAdForEdit | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!id) return
    fetch(`/api/board/ads/manage?id=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setState('missing')
          return
        }
        const data = (await res.json()) as { ad?: BoardAdForEdit }
        if (!data?.ad) {
          setState('missing')
          return
        }
        setAd(data.ad)
        setState('ready')
      })
      .catch(() => setState('missing'))
  }, [id])

  return (
    <LkShell active="board">
      <Link
        href={`/${lang}/lk/board`}
        style={{ display: 'inline-block', marginBottom: 14, color: 'var(--n15-gold)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}
      >
        ← {t.board.myTitle}
      </Link>

      {state === 'loading' ? (
        <p style={{ color: 'var(--n15-muted)', fontSize: 13 }}>{t.common.loading}</p>
      ) : state === 'missing' || !ad ? (
        <div style={{ border: '1px solid rgba(167,129,78,.25)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14 }}>{t.board.missingAd}</p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--n15-muted)' }}>{t.board.missingAdText}</p>
        </div>
      ) : (
        <>
          <h1 style={{ margin: '0 0 18px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 24 }}>
            {t.board.editTitle}
          </h1>
          <BoardAdForm lang={lang} initial={ad} />
        </>
      )}
    </LkShell>
  )
}
