/**
 * Фоновая музыка сайта: треки по языку и один <audio> на всю вкладку.
 *
 * Плеер живёт в модуле (синглтон), а не в React-состоянии: шапка рендерится
 * на каждой странице и при переходах размонтируется — если бы <audio>
 * создавался внутри компонента, музыка обрывалась бы на каждой навигации.
 * Модуль живёт столько же, сколько вкладка, поэтому трек играет непрерывно,
 * а переключение языка (RU ↔ ИР) лишь меняет источник у того же плеера.
 *
 * Автозапуска нет нигде — ни на компьютере, ни на телефоне: пока посетитель
 * не нажал «включить», звук молчит (заодно это единственный надёжный способ
 * не попасть под автоплей-политику браузеров). Громкость сохраняется
 * в localStorage и переживает и переходы, и переключение языка.
 *
 * Метаданные треков — единственный источник сведений об источнике и лицензии
 * для интерфейса; подробности лежат в public/audio/CREDITS.md.
 */
import type { Locale } from '@/i18n/dictionaries'

export interface MusicTrack {
  /** Путь к файлу в public/ — скачивается только после нажатия «включить» (preload="none"). */
  src: string
  /** Название произведения. */
  title: string
  /** Композитор и исполнитель записи. */
  author: string
  /** Название лицензии для подписи в интерфейсе. */
  license: string
  licenseUrl: string
  /** Страница записи у источника (Commons) — для сведений об источнике. */
  sourceUrl: string
}

export const MUSIC_TRACKS: Record<Locale, MusicTrack> = {
  // Русская версия — спокойная классика: «Лунный свет» Дебюсси в исполнении
  // Laurens Goedhart (2011). Запись опубликована под CC BY 3.0 — лицензия
  // разрешает коммерческое использование при указании автора (указание есть
  // в плеере и футере). На странице файла на Commons проставлен ещё и
  // Public domain — ориентируемся на более строгий вариант, CC BY.
  ru: {
    src: '/audio/clair-de-lune-debussy-goedhart.mp3',
    title: 'Clair de lune (Suite bergamasque)',
    author: 'Клод Дебюсси, исп. Laurens Goedhart',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg',
  },
  // Осетинская версия — игра на дала фандыр (осетинский струнный инструмент)
  // на фестивале «Ритмы мира» (Кудрово, июль 2022). Запись Andrey N. Petrov
  // под CC BY 3.0: коммерческое использование разрешено при указании автора.
  // Аудио извлечено из видеозаписи на Commons и перекодировано в MP3 (CC BY
  // требует указывать изменения) — подробности в public/audio/CREDITS.md.
  //
  // Именно эта запись, а не осетинская классика: свободных записей осетинских
  // композиторов нет — у Плиева, Хаханова, Макоева и других авторов XX века
  // авторское право ещё действует, а в открытых библиотеках (Commons,
  // Openverse, FMA, Jamendo, archive.org, IMSLP) их записей не выложено.
  // Как только появится лицензионная студийная запись, достаточно положить
  // файл в public/audio и заменить здесь путь и подпись — код плеера не
  // меняется. Порядок замены — в public/audio/CREDITS.md.
  os: {
    src: '/audio/dala-fandyr-ritmy-mira-petrov.mp3',
    title: 'Игра на дала фандыр («Ритмы мира»)',
    author: 'запись Andrey N. Petrov, 2022',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:%D0%98%D0%B3%D1%80%D0%B0_%D0%BD%D0%B0_%D0%B4%D0%B0%D0%BB%D0%B0_%D1%84%D0%B0%D0%BD%D0%B4%D1%8B%D1%80._%D0%A4%D0%B5%D1%81%D1%82%D0%B8%D0%B2%D0%B0%D0%BB%D1%8C_%D1%80%D0%B5%D0%B4%D0%BA%D0%B8%D1%85_%D0%BC%D1%83%D0%B7%D1%8B%D0%BA%D0%B0%D0%BB%D1%8C%D0%BD%D1%8B%D1%85_%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%BE%D0%B2_%C2%AB%D0%A0%D0%B8%D1%82%D0%BC%D1%8B_%D0%BC%D0%B8%D1%80%D0%B0%C2%BB.webm',
  },
}

/** Стартовая громкость: фоновая музыка не должна перекрывать разговор. */
const DEFAULT_VOLUME = 0.3
const VOLUME_KEY = 'n15_music_volume'

export interface MusicState {
  /** Язык, трек которого сейчас в плеере. */
  locale: Locale
  playing: boolean
  volume: number
}

const INITIAL_STATE: MusicState = { locale: 'ru', playing: false, volume: DEFAULT_VOLUME }

let state: MusicState = INITIAL_STATE
let audio: HTMLAudioElement | null = null
let initialised = false
// Пока меняем трек (переключение языка), событие 'pause' от смены src —
// техническое: гасить им состояние кнопки нельзя, иначе она мигнёт «включить».
let switchingTrack = false

const listeners = new Set<() => void>()

function set(patch: Partial<MusicState>) {
  const next = { ...state, ...patch }
  if (next.locale === state.locale && next.playing === state.playing && next.volume === state.volume) return
  state = next
  listeners.forEach((listener) => listener())
}

/** Подписка для useSyncExternalStore — состояние читается из модуля, не из React. */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getMusicState(): MusicState {
  return state
}

/** Снимок для сервера: тот же, что и до первого клика, — расхождений при гидратации нет. */
export function getMusicServerState(): MusicState {
  return INITIAL_STATE
}

function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME
  } catch {
    // Приватный режим/запрет storage — играем на громкости по умолчанию.
    return DEFAULT_VOLUME
  }
}

/**
 * Восстанавливает сохранённую громкость. Вызывается один раз при монтировании
 * плеера (в эффекте — до него в localStorage не заглядываем, чтобы серверный
 * и клиентский HTML совпадали).
 */
export function initMusic() {
  if (initialised || typeof window === 'undefined') return
  initialised = true
  const volume = readStoredVolume()
  if (audio) audio.volume = volume
  set({ volume })
}

/** <audio> создаётся лениво: до первого нажатия «включить» браузер не качает ни байта. */
function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  const element = new Audio()
  element.loop = true
  element.preload = 'none'
  element.volume = state.volume
  element.src = MUSIC_TRACKS[state.locale].src
  // Состояние кнопки идёт за самим плеером: так она не «залипнет», если звук
  // остановят извне (медиаклавиши, системный микшер, блокировка автоплея).
  element.addEventListener('play', () => set({ playing: true }))
  element.addEventListener('pause', () => {
    if (!switchingTrack) set({ playing: false })
  })
  audio = element
  return element
}

/** Включить/выключить музыку. Вызывается только из обработчика клика (автозапуска нет). */
export async function toggleMusic() {
  const element = ensureAudio()
  if (element.paused) {
    try {
      await element.play()
      set({ playing: true })
    } catch {
      // Браузер запретил воспроизведение — кнопка остаётся в положении «включить».
      set({ playing: false })
    }
    return
  }
  element.pause()
  set({ playing: false })
}

export function setMusicVolume(volume: number) {
  const value = Math.min(1, Math.max(0, volume))
  if (audio) audio.volume = value
  set({ volume: value })
  try {
    window.localStorage.setItem(VOLUME_KEY, String(value))
  } catch {
    // Сохранить не удалось (приватный режим) — громкость просто не переживёт перезагрузку.
  }
}

/**
 * Переключает трек вслед за языком сайта. Музыка не запускается сама: если
 * играл русский трек — продолжит играть осетинский, если звук был выключен —
 * просто сменится источник (и включится уже по кнопке). Громкость не трогаем.
 */
export function setMusicLocale(locale: Locale) {
  if (state.locale === locale) return
  const wasPlaying = state.playing
  set({ locale })
  if (!audio) return // плеер ещё не создавали — нужный трек встанет при первом включении
  if (!wasPlaying) {
    audio.src = MUSIC_TRACKS[locale].src
    return
  }
  switchingTrack = true
  audio.src = MUSIC_TRACKS[locale].src
  void audio
    .play()
    .then(() => set({ playing: true }))
    .catch(() => set({ playing: false }))
    .finally(() => {
      switchingTrack = false
    })
}
