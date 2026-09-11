import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'

// Текст письма приходит с сервера готовым (IMAP → mailparser → html-to-text):
// ссылки в нём размечены как [https://…], картинки — как [https://…/logo.png].
// Показываем их как в обычном почтовом клиенте: подписью ссылки становится
// текстовая строка перед ней («Смотреть подборку»), сам URL уходит в href и
// виден только в подсказке при наведении.

// [url] или голый url в середине строки; скобки и хвостовая пунктуация — не часть ссылки
const INLINE_RE = /\[(https?:\/\/[^\]]+)\]|https?:\/\/[^\s<>"'«»\]]+/g
const URL_ONLY_RE = /^\[(https?:\/\/[^\]]+)\]$/
const URL_SUFFIX_RE = /^(.*?)\s*\[(https?:\/\/[^\]]+)\]\s*([.,;:!?]*)$/
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/i
// Служебные картинки (пиксель открытия письма, распорный прозрачный gif) в
// почтовых клиентах не видны — прячем, чтобы не засоряли текст
const TRACKER_RE = /(^|\/)(pixel|open|beacon|track|tracking|spacer|blank|transparent|1x1)\.(gif|png|jpe?g)(\?|$)/i
const TRAILING_PUNCT_RE = /[.,;:!?]+$/
// Строка длиннее — уже не подпись ссылки, а абзац: ссылкой её не подменяем
const LABEL_MAX = 120
// Для ссылки в конце строки текста подпись ещё короче: html-to-text переносит
// строки по словам, и перед URL может стоять кусок обычного абзаца
const TAIL_MAX = 60
const SHOWN_MAX = 64

const linkStyle: CSSProperties = {
  color: '#8a6a3a', textDecoration: 'underline', textUnderlineOffset: 2, wordBreak: 'break-word',
}
// Картинки письма мы не подгружаем из сети (трекинг и протухшие токены в URL) —
// показываем компактную подпись с иконкой, ссылка открывает файл в новой вкладке
const imageStyle: CSSProperties = {
  color: '#716b62', textDecoration: 'none', borderBottom: '1px dashed #cfc6b6', wordBreak: 'break-word',
}

function isLabel(text: string, max = LABEL_MAX): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= max && !/https?:\/\//i.test(t) && !/[\[\]]/.test(t)
}

// Картинка письма или служебный пиксель (ссылкой не подменяем — покажем как есть)
function isMedia(url: string): boolean {
  return IMAGE_RE.test(url) || TRACKER_RE.test(url)
}

// Короткая подпись для ссылки, у которой нет текста: домен и путь без www и без
// длинного query-хвоста с токеном
function shortUrl(url: string): string {
  let shown = url
  try {
    const u = new URL(url)
    shown = (u.host + decodeURIComponent(u.pathname)).replace(/^www\./, '')
  } catch {
    shown = url
  }
  return shown.length > SHOWN_MAX ? shown.slice(0, SHOWN_MAX - 1) + '…' : shown
}

function fileName(url: string): string {
  const raw = url.split('?')[0].split('/').pop() || url
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function MailLink({ href, image, children }: { href: string; image?: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={href} style={image ? imageStyle : linkStyle}>
      {image ? `🖼️ ${image}` : children}
    </a>
  )
}

// Ссылки внутри строки: [https://…], голые https://…, служебные пиксели — вон
function renderText(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  INLINE_RE.lastIndex = 0
  for (let m = INLINE_RE.exec(text); m !== null; m = INLINE_RE.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const bracketed = m[1] !== undefined
    // Хвостовая точка/запятая предложения в ссылку не входит — остаётся текстом
    const clean = bracketed ? m[1] : m[0].replace(TRAILING_PUNCT_RE, '')
    const tail = bracketed ? '' : m[0].slice(clean.length)
    if (!clean || TRACKER_RE.test(clean)) continue // служебный пиксель не показываем
    out.push(
      <MailLink key={`${keyBase}-${n++}`} href={clean} image={IMAGE_RE.test(clean) ? fileName(clean) : undefined}>
        {shortUrl(clean)}
      </MailLink>,
    )
    if (tail) out.push(tail)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Строка письма: обычный текст, готовая ссылка (href) или невидимая служебная картинка
interface Line {
  text: string
  href?: string
  after?: string
  image?: string
  hide?: boolean
}

function parseLine(raw: string): Line {
  const one = raw.trim()
  const only = URL_ONLY_RE.exec(one)
  if (only) return { text: '', href: only[1] } // url на своей строке — подпись со строки выше
  const suffix = URL_SUFFIX_RE.exec(one)
  if (suffix && isLabel(suffix[1], TAIL_MAX) && !isMedia(suffix[2])) {
    return { text: suffix[1].trim(), href: suffix[2], after: suffix[3] }
  }
  return { text: raw }
}

function buildLines(text: string): ReactNode[] {
  const lines: Line[] = text.split('\n').map(parseLine)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const url = line.href
    if (!url || line.text) continue // не url-строка или уже с готовой подписью
    if (TRACKER_RE.test(url)) {
      line.hide = true
      continue
    }
    if (IMAGE_RE.test(url)) {
      line.image = fileName(url)
      line.text = ''
      continue
    }
    // html-to-text пишет ссылку как «Текст\n[URL]» — подписью становится строка
    // перед URL, а сама строка с URL пропадает, как в почтовом клиенте
    const prev = lines[i - 1]
    if (prev && !prev.hide && !prev.href && isLabel(prev.text)) {
      prev.href = url
      prev.text = prev.text.trim()
      line.hide = true
      continue
    }
    line.text = shortUrl(url)
  }

  const nodes: ReactNode[] = []
  lines.forEach((line, i) => {
    if (line.hide) return
    if (nodes.length) nodes.push('\n')
    if (line.href) {
      nodes.push(
        <MailLink key={i} href={line.href} image={line.image}>
          {line.text}
        </MailLink>,
      )
      if (line.after) nodes.push(line.after)
    } else {
      nodes.push(<Fragment key={i}>{renderText(line.text, `t${i}`)}</Fragment>)
    }
  })
  return nodes
}

export default function MailBody({ text, emptyLabel }: { text?: string; emptyLabel: string }) {
  const body = (text || '').trim()
  if (!body) return <>{emptyLabel}</>
  return <>{buildLines(body)}</>
}
