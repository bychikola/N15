import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

export interface CrmUser {
  id: number
  name: string
  email: string
  role: string
  agentAccess: boolean
}

/**
 * Серверная проверка сессии CRM: Payload-auth по cookie запроса.
 * null — не залогинен; роль user — клиент (доступ в CRM запрещён).
 */
export async function getCrmUser(): Promise<CrmUser | null> {
  const headersList = await headers()
  const payload = await getPayload({ config })
  try {
    const result = await payload.auth({ headers: headersList })
    const user = result.user as { id?: number; name?: string; email?: string; role?: string; agentAccess?: boolean } | null | undefined
    if (!user?.id) return null
    return {
      id: user.id as number,
      name: (user.name as string) || (user.email as string) || 'Команда',
      email: (user.email as string) || '',
      role: (user.role as string) || 'user',
      agentAccess: Boolean(user.agentAccess),
    }
  } catch {
    return null
  }
}

export function canAccessCrm(user: CrmUser): boolean {
  return user.role === 'agent' || user.role === 'admin'
}
