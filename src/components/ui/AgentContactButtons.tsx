'use client'

// Контакты агента — ровно две кнопки: «Позвонить» и «WhatsApp».
// Номера телефонов не выводятся в HTML страниц (поле phone скрыто от
// посетителей полевой access-проверкой коллекции agents), поэтому контакт
// запрашивается с сервера одним запросом в момент нажатия (/api/agents/contact)
// и сразу запускает звонок (tel:) или чат (wa.me) — текстом номер не
// показывается ни до, ни после нажатия.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface AgentContacts {
  tel?: string
  wa?: string
}

// Один агент на странице встречается в нескольких кнопках (CTA объекта
// и карточка «Ваш менеджер») — контакт запрашиваем один раз на страницу.
const inflight = new Map<number, Promise<AgentContacts | null>>()
const settled = new Map<number, AgentContacts | null>()

function getContacts(agentId: number): Promise<AgentContacts | null> {
  const cached = settled.get(agentId)
  if (cached !== undefined) return Promise.resolve(cached)
  let promise = inflight.get(agentId)
  if (!promise) {
    promise = (async () => {
      try {
        const res = await fetch(`/api/agents/contact?id=${agentId}`)
        if (!res.ok) return null
        const data = (await res.json()) as AgentContacts
        return data.tel || data.wa ? data : null
      } catch {
        // Нет сети/сервер недоступен — клик просто не сработает
        return null
      }
    })()
    inflight.set(agentId, promise)
    promise
      .then((c) => {
        settled.set(agentId, c)
        inflight.delete(agentId)
      })
      .catch(() => {})
  }
  return promise
}

export function AgentContactButtons({
  agentId,
  callLabel,
  primary = false,
  className = '',
}: {
  agentId: number
  callLabel: string
  // primary: «Позвонить» — золотая кнопка (главный CTA страницы объекта)
  primary?: boolean
  className?: string
}) {
  const [contacts, setContacts] = useState<AgentContacts | null | undefined>(
    settled.has(agentId) ? settled.get(agentId) : undefined,
  )

  const open = async (channel: 'tel' | 'wa') => {
    let c = contacts
    if (c === undefined) {
      c = await getContacts(agentId)
      setContacts(c)
    }
    if (!c) return
    const url =
      channel === 'tel'
        ? c.tel
          ? `tel:${c.tel}`
          : null
        : c.wa
          ? `https://wa.me/${c.wa}`
          : null
    // Навигация текущей вкладки: работает на всех платформах (в отличие от
    // window.open после асинхронного запроса, который iPhone Safari может
    // заблокировать как всплывающее окно)
    if (url) window.location.href = url
  }

  // Ответ получен, а контактов у агента нет — кнопки не показываем;
  // пока ответ не пришёл, обе кнопки видны (по клику номер и запросится)
  if (contacts === null) return null
  const callVisible = !contacts || Boolean(contacts.tel)
  const waVisible = !contacts || Boolean(contacts.wa)

  return (
    <div className={className}>
      {callVisible && (
        <Button
          variant={primary ? 'primary' : 'outline'}
          size="sm"
          className="w-full"
          onClick={() => void open('tel')}
        >
          {callLabel}
        </Button>
      )}
      {waVisible && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void open('wa')}
        >
          WhatsApp
        </Button>
      )}
    </div>
  )
}
