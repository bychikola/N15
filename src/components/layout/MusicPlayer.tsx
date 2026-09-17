'use client'

import { useEffect, useSyncExternalStore, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import {
  MUSIC_TRACKS,
  getMusicServerState,
  getMusicState,
  initMusic,
  setMusicLocale,
  setMusicVolume,
  subscribeMusic,
  toggleMusic,
} from '@/lib/background-music'

/**
 * Кнопка фоновой музыки и регулятор громкости.
 *
 * Состояние живёт в модуле-синглтоне (см. @/lib/background-music), поэтому
 * кнопка и ползунок в шапке и в мобильном меню всегда показывают одно и то же,
 * а сама музыка не обрывается ни при переходах между страницами, ни при
 * переключении языка — меняется только трек.
 *
 * variant="desktop" — компактная кнопка в шапке, ползунок и подпись о лицензии
 *   раскрываются при наведении (и по фокусу с клавиатуры);
 * variant="mobile" — строка в мобильном меню, ползунок виден сразу.
 */
export const MusicPlayer: FC<{ variant?: 'desktop' | 'mobile' }> = ({ variant = 'desktop' }) => {
  const { lang, t } = useI18n()
  const { playing, volume } = useSyncExternalStore(subscribeMusic, getMusicState, getMusicServerState)

  // Сохранённая громкость — один раз при появлении плеера.
  useEffect(() => {
    initMusic()
  }, [])

  // Язык сайта — источник истины для трека: переключили РУ/ИР — сменился трек.
  useEffect(() => {
    setMusicLocale(lang)
  }, [lang])

  const label = playing ? t.music.pause : t.music.play
  const icon = playing ? 'music_note' : 'music_off'
  const volumeInput = (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={volume}
      onChange={(event) => setMusicVolume(Number(event.target.value))}
      aria-label={t.music.volume}
      className="h-1 w-full cursor-pointer appearance-none bg-[var(--n15-gold)]/25 accent-[var(--n15-gold)]"
    />
  )

  if (variant === 'mobile') {
    return (
      <div className="mt-2 border border-[var(--n15-gold)]/30 px-5 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void toggleMusic()}
            aria-pressed={playing}
            aria-label={label}
            className="flex items-center gap-2 text-sm tracking-wider uppercase text-[var(--n15-gold)] cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg leading-none" aria-hidden="true">
              {icon}
            </span>
            {t.music.label}
          </button>
          <span className="material-symbols-outlined text-base leading-none text-[var(--n15-muted)]" aria-hidden="true">
            volume_up
          </span>
          {volumeInput}
        </div>
        <MusicCredit className="mt-2 text-left" />
      </div>
    )
  }

  return (
    // group: ползунок и подпись о лицензии раскрываются при наведении на кнопку
    // Отступ слева задаёт родитель (шапка — через gap), свой ml-3 здесь
    // ломал бы равномерность зазоров правого блока
    <div className="group relative">
      <button
        type="button"
        onClick={() => void toggleMusic()}
        aria-pressed={playing}
        aria-label={label}
        title={label}
        className="flex items-center justify-center w-9 h-9 border border-[var(--n15-gold)]/30 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer"
      >
        <span className="material-symbols-outlined text-lg leading-none" aria-hidden="true">
          {icon}
        </span>
      </button>
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-60 border border-[var(--n15-gold)]/30 bg-[var(--n15-black)] p-3 opacity-0 transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <p className="mb-2 text-[10px] tracking-[0.2em] uppercase text-[var(--n15-muted)]">{t.music.volume}</p>
        {volumeInput}
        <MusicCredit className="mt-3" />
      </div>
    </div>
  )
}

/**
 * Сведения об источнике и лицензии трека. Нужны и по условиям лицензий
 * (CC BY требует указания автора), и по-человечески: посетитель должен
 * видеть, что играет. Используется в плеере и в футере.
 */
export const MusicCredit: FC<{ className?: string }> = ({ className }) => {
  const { lang, t } = useI18n()
  const track = MUSIC_TRACKS[lang]
  const link = 'text-[var(--n15-gold)] hover:underline underline-offset-2'

  return (
    <p className={`text-[10px] leading-snug text-[var(--n15-muted)] ${className || ''}`}>
      {t.music.label}: {track.title} — {track.author}.{' '}
      {track.licenseUrl ? (
        <a href={track.licenseUrl} target="_blank" rel="noopener noreferrer" className={link}>
          {track.license}
        </a>
      ) : (
        track.license
      )}
      {track.sourceUrl && (
        <>
          {' · '}
          <a href={track.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {t.music.source}
          </a>
        </>
      )}
    </p>
  )
}
