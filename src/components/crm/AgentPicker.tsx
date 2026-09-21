'use client'

import { useId, useState, type FC } from 'react'
import type { Dict } from '@/i18n/dictionaries'

/**
 * Ответственный агент в карточке объекта: поле с поиском по агентам.
 *
 * Раньше это был обычный выпадающий список (а у агента — нередактируемое
 * поле): в агентстве уже больше десятка профилей, и найти нужного глазами в
 * общем списке неудобно. Здесь то же поле, но с подсказками: список
 * открывается по фокусу, ищет по подстроке (фамилия, имя, должность),
 * стрелки и Enter выбирают строку, Escape закрывает — как у полей адреса
 * (см. SuggestInput в CrmObjects). Первая строка списка — «—»: агент не
 * выбран (у старых карточек ответственного может не быть).
 *
 * Значение — id агента строкой, как в остальной форме (пустая строка — не
 * выбран). Сохраняет выбранного агента карточка объекта: поле agent уходит в
 * запрос вместе с формой, а право менять ответственного есть только у
 * администратора (см. access поля agent в коллекции Objects).
 */

export interface AgentOption {
  id: number
  name: string
  /** Должность — показываем подсказкой в строке списка */
  position?: string
}

/** Строка выпадающего списка: id агента строкой ('' — строка «—») */
interface Row {
  id: string
  name: string
  position?: string
}

interface Props {
  t: Dict
  /** Агенты в порядке показа (алфавитный — см. sortAgents) */
  agents: AgentOption[]
  /** id выбранного агента строкой ('' — не выбран) */
  value: string
  onChange: (id: string) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d9d1c4',
  borderRadius: 7,
  background: 'white',
  color: '#25241f',
  padding: 12,
}

/** Текст для поиска: регистр и «ё» не должны мешать найти агента */
const norm = (v: string) => v.trim().toLowerCase().replace(/ё/g, 'е')

export const AgentPicker: FC<Props> = ({ t, agents, value, onChange }) => {
  const [open, setOpen] = useState(false)
  // Что набрано в поле, пока список открыт ('' — показываем всех агентов)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  // id списка для aria-controls: на странице может быть несколько полей выбора
  const listId = useId()

  const selected = agents.find((a) => String(a.id) === value)
  const q = norm(query)
  // Строки списка: «—» (снять выбор) и подходящие под поиск агенты — id
  // строкой, как значение поля
  const items: Row[] = agents
    .filter((a) => !q || norm(a.name).includes(q) || norm(a.position || '').includes(q))
    .map((a) => ({ id: String(a.id), name: a.name, position: a.position }))
  const rows: Row[] = [{ id: '', name: '—' }, ...items]
  // Выбор агента, которого нет в списке (снят с публикации, удалён), — показываем
  // номер, чтобы поле не выглядело пустым при сохранённом значении
  const selectedText = selected?.name || (value ? `#${value}` : '')
  // Пока список открыт, в поле набранное (пусто — выбранное имя подсказкой):
  // набор сразу заменяет прежнее значение, а не дописывается к нему
  const shown = open ? query : selectedText
  const placeholder = open && selectedText ? selectedText : t.crm.objAgentPh

  const pick = (id: string) => {
    onChange(id)
    setQuery('')
    setActive(-1)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((prev) => {
        const next = e.key === 'ArrowDown' ? prev + 1 : prev - 1
        return next < 0 ? rows.length - 1 : next >= rows.length ? 0 : next
      })
      return
    }
    if (e.key === 'Enter') {
      // Enter выбирает подсвеченную строку; если строка одна — её же
      const row = rows[active] ?? (rows.length === 2 ? rows[1] : undefined)
      if (open && row) {
        e.preventDefault()
        pick(row.id)
      }
    }
  }

  return (
    <div className="crm-suggest-wrap">
      <input
        value={shown}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          // Показываем всех агентов: набор букв сузит список
          setQuery('')
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
          // Набранное, но не выбранное имя не сохраняем: в поле остаётся
          // выбранный агент (или пусто) — иначе значение выглядело бы выбранным
          setQuery('')
        }}
        onKeyDown={onKeyDown}
        // Роль combobox — чтобы состояние раскрытого списка читалось
        // вспомогательными технологиями (см. роль listbox ниже)
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        style={inputStyle}
      />
      {open && (
        <div className="crm-suggest" role="listbox" id={listId}>
          {rows.map((row, i) => {
            const isSelected = row.id === value && row.id !== ''
            return (
              <button
                key={row.id || 'none'}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={i === active ? 'crm-suggest-item active' : 'crm-suggest-item'}
                // mousedown раньше blur: выбор не теряется при клике и на телефоне
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(row.id)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{row.name}</span>
                {row.position && <em>{row.position}</em>}
              </button>
            )
          })}
          {q && !items.length && <p className="crm-field-note">{t.crm.objAgentNotFound}</p>}
        </div>
      )}
    </div>
  )
}
