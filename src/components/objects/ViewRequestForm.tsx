'use client'

import { useState, type FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

interface Props {
  objectId: number
  lang: string
}

export const ViewRequestForm: FC<Props> = ({ objectId, lang }) => {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sentAsUser, setSentAsUser] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError('')
    try {
      // user из сессии — если залогинен
      let userId: number | undefined
      try {
        const meRes = await fetch('/api/users/me', { credentials: 'include' })
        const meData = await meRes.json()
        if (meData?.user?.id) {
          userId = meData.user.id as number
        }
      } catch {
        // гость — заявка без user
      }

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'viewing',
          object: objectId,
          clientName: name,
          clientPhone: phone,
          message,
          status: 'unsorted',
          source: 'site',
          ...(userId ? { user: userId } : {}),
        }),
      })
      if (!res.ok) {
        setError(t.lkProfile.save + ' ✕')
        return
      }
      const appData = await res.json()

      // Текст заявки становится первым сообщением в чате (для авторизованных)
      if (userId && message.trim()) {
        const appId = appData?.doc?.id
        if (appId) {
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ application: appId, sender: userId, text: message.trim() }),
          })
        }
      }
      setSentAsUser(!!userId)
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    // Гость без аккаунта не может смотреть ЛК — вместо ссылки на чат
    // показываем, что агент позвонит, и предлагаем зарегистрироваться
    if (!sentAsUser) {
      return (
        <div className="text-center py-4">
          <p className="text-sm text-[var(--n15-white)] mb-2">{t.object.requestAcceptedGuest}</p>
          <p className="text-xs text-[var(--n15-muted)] mb-3">{t.object.guestRegisterHint}</p>
          <Link href={`/${lang}/register`} className="text-xs text-[var(--n15-gold)] underline">
            {t.object.guestRegisterCta} →
          </Link>
        </div>
      )
    }
    return (
      <div className="text-center py-4">
        <p className="text-sm text-[var(--n15-white)] mb-2">{t.object.requestAccepted}</p>
        <Link href={`/${lang}/lk/messages`} className="text-xs text-[var(--n15-gold)] underline">
          {t.lkMessages.openChat} →
        </Link>
      </div>
    )
  }

  const inputCls = 'bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] placeholder:text-[var(--n15-muted)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
      <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t.object.namePlaceholder} className={inputCls} />
      <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.object.phonePlaceholder} className={inputCls} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.object.messagePlaceholder} rows={3} className={`${inputCls} resize-none`} />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {/* цвет текста как у кнопки «Позвонить» — светлый на золотом */}
      <Button variant="primary" size="md" className="w-full" disabled={sending}
        style={{ color: 'var(--card-price-fg)' }}>
        {sending ? t.lkChat.sending : t.object.submit}
      </Button>
    </form>
  )
}
