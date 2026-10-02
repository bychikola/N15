'use client'

import { useEffect, useId, useRef, useState, type FC } from 'react'
// Имена полей защиты общие с сервером: по ним хук коллекции applications
// находит ловушку и время заполнения в теле заявки (см. src/lib/form-guard.ts)
import { FILL_TIME_FIELD, HONEYPOT_FIELD } from '@/lib/form-guard'

/**
 * Невидимая защита публичной формы от спама — общая для всех форм сайта,
 * которые отправляют заявку в CRM.
 *
 * Вместе с данными формы уходят два поля, которых человек не видит:
 *  - ловушка (скрытый input): спам-боты заполняют все поля подряд, поэтому
 *    непустое значение сразу выдаёт бота;
 *  - время заполнения: сколько миллисекунд прошло от показа формы до
 *    отправки — заявка, ушедшая мгновенно, написана не человеком.
 *
 * Решение принимает сервер (src/lib/form-guard.ts): форму можно обойти, а хук
 * коллекции — нет. Здесь только сбор полей, поэтому защита и остаётся
 * невидимой: клиенту нечего проверять, он ничего и не подсказывает.
 */
export function useSpamGuard() {
  // Момент показа формы: от него считаем время заполнения. Отсчёт ставит
  // эффект, а не рендер: во время рендера обращаться к часам нельзя —
  // результат должен быть одинаковым при повторном рендере (правило React)
  const startedAt = useRef(0)
  const [honeypot, setHoneypot] = useState('')

  useEffect(() => {
    startedAt.current = Date.now()
  }, [])

  /** Поля защиты для тела заявки — считаются в момент отправки */
  const spamFields = (): Record<string, string | number> => ({
    [HONEYPOT_FIELD]: honeypot,
    [FILL_TIME_FIELD]: Date.now() - startedAt.current,
  })

  return { honeypot, setHoneypot, spamFields }
}

/**
 * Скрытое поле-ловушка: уводим его за экран, из обхода по Tab исключаем
 * и прячем от скринридеров — человеку в форме оно не мешает и не видно.
 * Автозаполнению браузера оно тоже незнакомо (имя поля ни о чём не говорит,
 * autocomplete выключен) — иначе ловушка срабатывала бы на живых людях.
 */
export const HoneypotField: FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const id = useId()

  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
      <input
        id={id}
        type="text"
        name={HONEYPOT_FIELD}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  )
}

/**
 * Причина отказа с сервера: Payload отдаёт её в errors[0].message — это
 * тексты защиты («Слишком много отправок…», «Проверьте номер телефона…»)
 * и проверок заявки; собственные маршруты (заявки собственников) — в поле
 * error. Если текста нет (ответ не наш), форма показывает своё сообщение.
 */
export async function readServerError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as
    | { errors?: { message?: string }[]; error?: string }
    | null
  return body?.errors?.[0]?.message || body?.error || fallback
}
