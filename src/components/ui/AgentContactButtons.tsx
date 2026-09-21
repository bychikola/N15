'use client'

// Контакты агента — ровно две кнопки: «Позвонить» и «WhatsApp».
// Текстом номера не выводятся (поле phone коллекции agents скрыто от
// посетителей полевой access-проверкой), поэтому маршрут обеих кнопок считает
// сервер (/api/agents/contact) и отдаёт готовыми ссылками: tel: для звонка и
// https://wa.me/… для WhatsApp — это разные каналы с разными номерами, одна
// ссылка на две кнопки не подставляется никогда.
//
// Ссылки подставляются в href, а не открываются скриптом по нажатию. Так
// нажатие обрабатывает сам браузер — как обычную ссылку: на телефоне
// открывается сотовый звонок, на компьютере программа звонков, WhatsApp —
// своим приложением. Переход из обработчика клика после ответа сервера часть
// мобильных браузеров (Safari на iPhone, встроенные браузеры приложений) не
// выполняет: жест к этому моменту потерян, и кнопка выглядит нерабочей.
// Поэтому контакт запрашивается сразу при открытии страницы, а не по нажатию.
//
// Кому адресован звонок, решает сервер (src/lib/call-routing.ts): у карточки
// объекта это его ответственный агент, а если объект открыт без агента — общий
// (резервный) номер агентства. Личный номер агента в набор клиента не попадает:
// он уходит в АТС Н15, и с агентом соединяет уже она. WhatsApp — отдельный
// канал мимо АТС, у него номер агента свой.
//
// Пока ответ сервера не пришёл, «Позвонить» ведёт на общий номер агентства
// (он же остаётся запасным, если номера агента нет) — кнопка работает сразу,
// ещё до ответа и даже без JavaScript. WhatsApp без номера агента показать
// нечего: кнопка появляется только когда номер известен.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { reachGoal } from '@/lib/metrika'
import { SITE_PHONE_TEL } from '@/lib/call-routing'

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
        // Нет сети/сервер недоступен — работаем по запасному номеру
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

  // Контакт спрашиваем при открытии страницы: к моменту нажатия ссылка уже
  // стоит в href и звонок открывает сам браузер (см. комментарий выше)
  useEffect(() => {
    if (!key) return
    let alive = true
    void getContacts(key, query).then((c) => {
      if (alive) setContacts(c)
    })
    return () => {
      alive = false
    }
  }, [key, query])

  // Нечего маршрутизировать (не передан ни объект, ни агент) — кнопок нет
  if (!key) return null

  // «Позвонить» — ссылка tel: на маршрут из ответа сервера; пока ответа нет
  // (или номера агента нет), ведём на общий номер агентства
  const callHref = contacts?.tel || SITE_PHONE_TEL
  // WhatsApp показываем, когда номер известен: пока ответ не пришёл — кнопкой
  // (по нажатию номер запросится), если сервер ответил «номера нет» — не
  // показываем вовсе, пустая кнопка хуже её отсутствия
  const waVisible = contacts === undefined || Boolean(contacts?.wa)
  // У объекта без ответственного агента WhatsApp некому адресуровать — кнопка
  // остаётся одна. В сетке из двух колонок растягиваем её на всю ширину
  // (col-span-2), во flex-контейнере «Вашего менеджера» класс не мешает.
  const single = !waVisible

  /**
   * Запасной путь для WhatsApp, пока номера нет: запрашиваем контакт и
   * переходим скриптом. Для https-ссылки это надёжно (в отличие от tel:,
   * которую мобильные браузеры после ответа сервера могут не открыть).
   */
  const openWa = async () => {
    let c = contacts
    if (c === undefined) {
      c = await getContacts(key, query)
      setContacts(c)
    }
    if (c?.wa) {
      reachGoal('whatsapp_click')
      window.location.href = c.wa
    }
  }

  return (
    <div className={className}>
      <Button
        variant={primary ? 'primary' : 'outline'}
        size="sm"
        className={single ? 'w-full col-span-2' : 'w-full'}
        href={callHref}
        // Ссылку открывает браузер, от аналитики переход не зависит
        onClick={() => reachGoal('call_click')}
      >
        {callLabel}
      </Button>
      {waVisible && (
        <Button
          variant="outline"
          size="sm"
          className={single ? 'w-full col-span-2' : 'w-full'}
          href={contacts?.wa}
          onClick={() => {
            // Ссылка уже есть — переходит браузер; нет — запрашиваем и переходим
            if (contacts?.wa) reachGoal('whatsapp_click')
            else void openWa()
          }}
        >
          WhatsApp
        </Button>
      )}
    </div>
  )
}
