'use client'

import type { Dict } from '@/i18n/dictionaries'

export const CrmDenied = ({ t }: { t: Dict }) => {
  const logout = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/'
  }

  return (
    <main className="crm-access-denied">
      <div>
        <strong>Н15</strong>
        <h1>{t.crm.deniedTitle}</h1>
        <p>{t.crm.deniedText}</p>
        <button type="button" className="crm-denied-back" onClick={() => void logout()} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }}>
          {t.crm.deniedLogout}
        </button>
      </div>
    </main>
  )
}
