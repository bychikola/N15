'use client'

// Контакты агента — ровно две кнопки: «Позвонить» и «WhatsApp».
// Номера телефонов не выводятся в HTML страниц (поле phone скрыто от
// посетителей полевой access-проверкой коллекции agents), поэтому контакт
// запрашивается с сервера одним запросом в момент нажатия (/api/agents/contact)
// и сразу запускает звонок (tel:) или чат (wa.me) — текстом номер не
// показывается ни до, ни после нажатия.
//
// Кому адресован звонок, решает сервер (src/lib/call-routing.ts): у карточки
// объекта это его ответственный агент, а если объект открыт без агента — общий
// (резервный) номер агентства. Личный номер агента в набор клиента не попадает:
// он уходит в АТС Н15, и с агентом соединяет уже она. WhatsApp — отдельный
// канал мимо АТС, у него номер агента свой.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { reachGoal } from '@/lib/metrika'

interface AgentContacts {
  /** Готовая ссылка tel: — её и открывает кнопка «Позвонить» */
  tel?: string
  /** Готовая ссылка wa.me — кнопка «WhatsApp» */
  wa?: string
}

// Один агент на странице встречается в нескольких кнопках (CTA объекта
// и карточка «Ваш менеджер») — контакт запрашиваем один раз на страницу.
// Ключ — то, по чему строится маршрут: объект или агент.
const inflight = new Map<string, Promise<AgentContacts | null>>()
const settled = new Map<string, AgentContacts | null>()

function getContacts(key: string, query: string): Promise<AgentContacts | null> {
  const cached = settled.get(key)
  if (cached !== undefined) return Promise.resolve(cached)
  let promise = inflight.get(key)
  if (!promise) {
    promise = (async () => {
      try {
        const res = await fetch(`/api/agents/contact?${query}`)
        if (!res.ok) return null
        const data = (await res.json()) as AgentContacts
        return data.tel || data.wa ? data : null
      } catch {
        // Нет сети/сервер недоступен — клик просто не сработает
        return null
      }
    })()
    inflight.set(key, promise)
    promise
      .then((c) => {
        settled.set(key, c)
        inflight.delete(key)
      })
      .catch(() => {})
  }
  return promise
}

export function AgentContactButtons({
  agentId,
  objectId,
  callLabel,
  primary = false,
  className = '',
}: {
  /** Агент, чья карточка открыта (страница команды): звонок идёт по нему */
  agentId?: number
  /** Объект: звонок идёт его ответственному агенту (карточка объекта) */
  objectId?: number
  callLabel: string
  // primary: «Позвонить» — золотая кнопка (главный CTA страницы объекта)
  primary?: boolean
  className?: string
}) {
  // Маршрут строим по объекту, если он есть: ответственного агента называет
  // сервер, а не страница — АТС и сайт смотрят на одно и то же поле
  const key = objectId ? `object:${objectId}` : agentId ? `agent:${agentId}` : ''
  const query = objectId ? `object=${objectId}` : `id=${agentId}`

  const [contacts, setContacts] = useState<AgentContacts | null | undefined>(
    key && settled.has(key) ? settled.get(key) : undefined,
  )

  const open = async (channel: 'tel' | 'wa') => {
    let c = contacts
    if (c === undefined) {
      c = await getContacts(key, query)
      setContacts(c)
    }
    if (!c) return
    const url = channel === 'tel' ? c.tel : c.wa
    // Навигация текущей вкладки: работает на всех платформах (в отличие от
    // window.open после асинхронного запроса, который iPhone Safari может
    // заблокировать как всплывающее окно).
    // Цель — только когда контакт реально нашёлся и переход состоялся
    if (url) {
      reachGoal(channel === 'tel' ? 'call_click' : 'whatsapp_click')
      window.location.href = url
    }
  }

  // Нечего маршрутизировать (не передан ни объект, ни агент) — кнопок нет
  if (!key) return null
  // Ответ получен, а контактов нет — кнопки не показываем;
  // пока ответ не пришёл, обе кнопки видны (по клику номер и запросится)
  if (contacts === null) return null
  const callVisible = !contacts || Boolean(contacts.tel)
  const waVisible = !contacts || Boolean(contacts.wa)
  // У объекта без ответственного агента WhatsApp некому адресовать — кнопка
  // остаётся одна. В сетке из двух колонок растягиваем её на всю ширину
  // (col-span-2), во flex-контейнере «Вашего менеджера» класс не мешает.
  const single = callVisible !== waVisible

  return (
    <div className={className}>
      {callVisible && (
        <Button
          variant={primary ? 'primary' : 'outline'}
          size="sm"
          className={single ? 'w-full col-span-2' : 'w-full'}
          onClick={() => void open('tel')}
        >
          {callLabel}
        </Button>
      )}
      {waVisible && (
        <Button
          variant="outline"
          size="sm"
          className={single ? 'w-full col-span-2' : 'w-full'}
          onClick={() => void open('wa')}
        >
          WhatsApp
        </Button>
      )}
    </div>
  )
}
