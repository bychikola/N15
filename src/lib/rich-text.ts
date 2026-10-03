/**
 * Безопасный вывод Rich Text (Lexical) в HTML для страниц блога и новостей.
 *
 * Текст статьи из редактора и краткое содержание новости из внешних RSS-каналов —
 * недоверенные данные. Раньше страница статьи склеивала HTML строками и отдавала
 * его в dangerouslySetInnerHTML без экранирования: символы < > из текста
 * становились разметкой, и в статье мог исполниться произвольный скрипт
 * (аудит, задача №6).
 *
 * Здесь два рубежа:
 *   1) renderRichText обходит дерево Lexical и собирает разметку только из
 *      известных типов узлов — белый список тегов по построению;
 *   2) sanitizeRichHtml разбирает готовую строку, экранирует текст и значения
 *      атрибутов и оставляет только теги и атрибуты из белого списка. Схемы
 *      ссылок (href, src) проверяются отдельно: javascript:, data:, vbscript:
 *      и протокол-относительные // не проходят.
 *
 * Файл без внешних зависимостей: работает на сервере и в быстрых проверках node.
 */

// --- Белый список тегов и атрибутов --------------------------------------------------

/** Теги, которые разрешено выводить в статье (все остальные отбрасываются) */
const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
  'a', 'br', 'hr', 'img',
  'div', 'span', 'figure', 'figcaption',
])

/** Атрибуты по тегам; '*' — общие для всех разрешённых тегов */
const ALLOWED_ATTRS: Record<string, string[]> = {
  '*': ['class'],
  a: ['href', 'rel', 'target', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
}

/** Теги без закрывающей пары — печатаем как <br />, <img … />, <hr /> */
const SELF_CLOSING = new Set(['br', 'hr', 'img'])

/** Заголовки: только h1–h6, всё прочее сводим к h2 */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

// --- Экранирование и безопасные адреса ------------------------------------------------

/** Экранирование текста и значений атрибутов для вставки в HTML */
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * Безопасный адрес ссылки: http/https, mailto, tel, якорь (#…) и внутренний
 * путь (/…, но не //… — протокол-относительная ссылка уводит на чужой домен).
 * Всё прочее (javascript:, data:, vbscript:) — null, атрибут отбрасывается.
 */
export function safeHref(raw: string): string | null {
  const value = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  if (!value) return null
  if (value.startsWith('#')) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  return null
}

/** Безопасный адрес ресурса (src у <img>): http/https или внутренний путь */
export function safeResourceUrl(raw: string): string | null {
  const value = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  if (!value) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (/^https?:\/\//i.test(value)) return value
  return null
}

// --- Разбор тегов ---------------------------------------------------------------------

interface ParsedTag {
  closing: boolean
  name: string
  attrs: { name: string; value: string | null }[]
}

/** Индекс '>' с учётом кавычек: значение атрибута может содержать '>' */
function findTagEnd(html: string, start: number): number {
  let quote = ''
  for (let i = start + 1; i < html.length; i += 1) {
    const ch = html[i]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return i
  }
  return -1
}

/** Разбор одного тега на имя и атрибуты; null — это не тег, а просто текст */
function parseTag(raw: string): ParsedTag | null {
  const m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)\/?\s*>$/.exec(raw)
  if (!m) return null
  const attrs: { name: string; value: string | null }[] = []
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let am: RegExpExecArray | null
  while ((am = attrRe.exec(m[3])) !== null) {
    attrs.push({ name: am[1].toLowerCase(), value: am[2] ?? am[3] ?? am[4] ?? null })
  }
  return { closing: m[1] === '/', name: m[2].toLowerCase(), attrs }
}

/** Значение атрибута после проверки: null — атрибут не пропускаем */
function cleanAttr(attr: string, value: string): string | null {
  if (attr === 'class') return value.replace(/[\u0000-\u001f\u007f]/g, '')
  if (attr === 'href') return safeHref(value)
  if (attr === 'src') return safeResourceUrl(value)
  if (attr === 'alt' || attr === 'title' || attr === 'rel') return value
  if (attr === 'target') return value === '_blank' || value === '_self' ? value : null
  if (attr === 'width' || attr === 'height') return /^\d{1,5}$/.test(value) ? value : null
  if (attr === 'loading') return value === 'lazy' || value === 'eager' ? value : null
  // Всё остальное (в т.ч. on* — обработчики событий) не пропускаем
  return null
}

// --- Очистка готового HTML ------------------------------------------------------------

/**
 * Очистка HTML по белому списку тегов и атрибутов. Текст и значения атрибутов
 * экранируются; неразрешённые теги отбрасываются (их текст остаётся), а
 * <script>/<style> удаляются вместе с содержимым.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return ''
  let out = ''
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += escapeHtml(html.slice(i))
      break
    }
    out += escapeHtml(html.slice(i, lt))

    // Комментарии выкидываем целиком (в них прячут условные комментарии и теги)
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }

    const gt = findTagEnd(html, lt)
    if (gt < 0) {
      out += escapeHtml(html.slice(lt))
      break
    }
    const raw = html.slice(lt, gt + 1)
    const tag = parseTag(raw)
    if (!tag) {
      // Не тег, а текст с угловой скобкой — экранируем как есть
      out += escapeHtml(raw)
      i = gt + 1
      continue
    }

    // Содержимое script/style не выводим вовсе
    if (tag.name === 'script' || tag.name === 'style') {
      if (!tag.closing) {
        const close = new RegExp(`</${tag.name}\\s*>`, 'i').exec(html.slice(gt + 1))
        i = close ? gt + 1 + close.index + close[0].length : html.length
      } else {
        i = gt + 1
      }
      continue
    }

    if (!ALLOWED_TAGS.has(tag.name)) {
      // Тег не разрешён — убираем сам тег, текст внутри остаётся
      i = gt + 1
      continue
    }

    if (tag.closing) {
      out += `</${tag.name}>`
      i = gt + 1
      continue
    }

    const allowed = new Set([...(ALLOWED_ATTRS['*'] || []), ...(ALLOWED_ATTRS[tag.name] || [])])
    let attrs = ''
    for (const a of tag.attrs) {
      if (!allowed.has(a.name)) continue
      const value = cleanAttr(a.name, a.value ?? '')
      if (value === null) continue
      attrs += ` ${a.name}="${escapeHtml(value)}"`
    }
    out += `<${tag.name}${attrs}${SELF_CLOSING.has(tag.name) ? ' /' : ''}>`
    i = gt + 1
  }
  return out
}

// --- Разметка дерева Lexical ----------------------------------------------------------

interface LexicalNode {
  type?: string
  tag?: string
  listType?: string
  format?: number
  text?: string
  url?: string
  fields?: {
    url?: string
    newTab?: boolean
    linkType?: string
    doc?: { value?: { url?: string } | number | null }
  }
  value?: number | { url?: string; alt?: string; width?: number; height?: number } | null
  children?: LexicalNode[]
}

export interface RichTextRenderOptions {
  /** Подпись-заглушка для изображения без файла (из i18n) */
  imagePlaceholder?: string
}

/** Форматы текста Lexical (битовая маска поля format) */
const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_UNDERLINE = 8
const FORMAT_CODE = 16
const FORMAT_SUBSCRIPT = 32
const FORMAT_SUPERSCRIPT = 64

const HEADING_CLASS = 'text-xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mt-8 mb-3'
const PARAGRAPH_CLASS = 'text-[var(--n15-silver)] leading-relaxed mb-4'
const LIST_CLASS = 'pl-5 mb-4 space-y-1'
const LIST_ITEM_CLASS = 'text-[var(--n15-silver)]'
const LINK_CLASS = 'text-[var(--n15-gold)] underline hover:text-[var(--n15-gold)]/80'

function renderTextNode(node: LexicalNode): string {
  let html = node.text ?? ''
  const format = typeof node.format === 'number' ? node.format : 0
  if (format & FORMAT_CODE) html = `<code>${html}</code>`
  if (format & FORMAT_STRIKETHROUGH) html = `<s>${html}</s>`
  if (format & FORMAT_UNDERLINE) html = `<u>${html}</u>`
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`
  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`
  if (format & FORMAT_SUBSCRIPT) html = `<sub>${html}</sub>`
  if (format & FORMAT_SUPERSCRIPT) html = `<sup>${html}</sup>`
  return html
}

function renderLinkNode(node: LexicalNode, opts: RichTextRenderOptions): string {
  const fields = node.fields || {}
  const docUrl = typeof fields.doc?.value === 'object' && fields.doc.value ? fields.doc.value.url : ''
  const href = fields.url || docUrl || node.url || ''
  const internal = fields.linkType === 'internal'
  const external = !internal && /^https?:\/\//i.test(href)
  const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<a href="${href}"${attrs} class="${LINK_CLASS}">${renderNodes(node.children, opts)}</a>`
}

function renderUploadNode(node: LexicalNode, opts: RichTextRenderOptions): string {
  const value = node.value
  const media = value && typeof value === 'object' ? value : null
  if (media?.url) {
    const alt = media.alt || ''
    return (
      '<div class="my-6 flex justify-center">' +
      `<img src="${media.url}" alt="${alt}" loading="lazy" class="max-w-full h-auto border border-[var(--n15-gold)]/10" />` +
      '</div>'
    )
  }
  const placeholder = opts.imagePlaceholder || ''
  return `<div class="my-6 flex justify-center"><div class="border border-[var(--n15-gold)]/10 p-2">${placeholder}</div></div>`
}

function renderNode(node: LexicalNode, opts: RichTextRenderOptions): string {
  const type = node.type
  if (type === 'text' || (!type && typeof node.text === 'string')) return renderTextNode(node)
  if (type === 'linebreak') return '<br />'

  if (type === 'heading') {
    const tag = node.tag && HEADING_TAGS.has(node.tag) ? node.tag : 'h2'
    return `<${tag} class="${HEADING_CLASS}">${renderNodes(node.children, opts)}</${tag}>`
  }

  if (type === 'paragraph') {
    return `<p class="${PARAGRAPH_CLASS}">${renderNodes(node.children, opts)}</p>`
  }

  if (type === 'list') {
    const ordered = node.listType === 'number'
    const tag = ordered ? 'ol' : 'ul'
    const cls = ordered ? `list-decimal ${LIST_CLASS}` : `list-disc ${LIST_CLASS}`
    return `<${tag} class="${cls}">${renderNodes(node.children, opts)}</${tag}>`
  }

  if (type === 'listitem') {
    return `<li class="${LIST_ITEM_CLASS}">${renderNodes(node.children, opts)}</li>`
  }

  if (type === 'link' || type === 'autolink') return renderLinkNode(node, opts)

  if (type === 'quote') {
    return (
      '<blockquote class="border-l-2 border-[var(--n15-gold)]/30 pl-4 mb-4 italic text-[var(--n15-silver)]">' +
      `${renderNodes(node.children, opts)}</blockquote>`
    )
  }

  if (type === 'upload') return renderUploadNode(node, opts)

  if (type === 'horizontalrule') return '<hr class="my-8 border-[var(--n15-gold)]/20" />'

  // Неизвестный узел: выводим только его содержимое, без собственной разметки
  return renderNodes(node.children, opts)
}

function renderNodes(nodes: LexicalNode[] | undefined, opts: RichTextRenderOptions): string {
  if (!Array.isArray(nodes)) return ''
  return nodes.map((n) => renderNode(n, opts)).join('')
}

/**
 * Rich Text (Lexical) → безопасный HTML для dangerouslySetInnerHTML.
 * Готовая строка обязательно проходит через sanitizeRichHtml.
 */
export function renderRichText(content: unknown, options?: RichTextRenderOptions): string {
  const root = (content as { root?: { children?: LexicalNode[] } } | null | undefined)?.root
  if (!root?.children) return ''
  return sanitizeRichHtml(renderNodes(root.children, options || {}))
}
