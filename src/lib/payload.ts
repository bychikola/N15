// Data fetching helpers for Payload CMS REST API
// All requests go through Next.js API routes (/api/...)

const BASE = ''

interface FetchOptions {
  page?: number
  limit?: number
  sort?: string
  where?: Record<string, unknown>
  depth?: number
}

async function fetchCollection<T>(collection: string, options: FetchOptions = {}): Promise<{ docs: T[]; totalDocs: number }> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.sort) params.set('sort', options.sort)
  if (options.depth) params.set('depth', String(options.depth))
  if (options.where) params.set('where', JSON.stringify(options.where))

  const res = await fetch(`${BASE}/api/${collection}?${params}`, {
    credentials: 'include',
  })
  if (!res.ok) return { docs: [], totalDocs: 0 }
  return res.json()
}

async function fetchByID<T>(collection: string, id: string, depth = 1): Promise<T | null> {
  const res = await fetch(`${BASE}/api/${collection}/${id}?depth=${depth}`, {
    credentials: 'include',
  })
  if (!res.ok) return null
  return res.json()
}

export interface ObjectData {
  id: number
  title: string
  slug?: string
  type: 'sale' | 'rent'
  category: 'apartment' | 'house' | 'townhouse' | 'commercial' | 'land'
  price: number
  area?: number
  livingArea?: number
  kitchenArea?: number
  rooms?: number
  floor?: number
  totalFloors?: number
  buildingType?: string
  condition?: string
  heating?: string
  balcony?: string
  address?: {
    city?: string
    district?: string
    street?: string
    house?: string
    apartment?: string
  }
  coordinates?: { lat?: number; lng?: number }
  description?: Record<string, unknown>
  features?: { feature?: string }[]
  images?: { url?: string; alt?: string }[]
  primaryImage?: { url?: string; alt?: string }
  floorPlan?: { url?: string }
  agent?: { id: number; name?: string }
  isPremium?: boolean
  isExclusive?: boolean
  createdAt: string
}

export interface AgentData {
  id: number
  name: string
  photo?: { url?: string }
  position?: string
  phone?: string
  email?: string
  telegram?: string
  whatsapp?: string
  bio?: Record<string, unknown>
  objectsSold?: number
  experience?: number
  isActive?: boolean
}

export interface BlogData {
  id: number
  title: string
  excerpt?: string
  content?: Record<string, unknown>
  coverImage?: { url?: string }
  category?: string
  tags?: { tag?: string }[]
  author?: { id: number; name?: string }
  publishedAt?: string
  isFeatured?: boolean
}

export async function getObjects(options: FetchOptions = {}) {
  return fetchCollection<ObjectData>('objects', { ...options, depth: 1 })
}

export async function getObject(id: string) {
  return fetchByID<ObjectData>('objects', id, 2)
}

export async function getPremiumObjects() {
  return fetchCollection<ObjectData>('objects', {
    where: { isPremium: { equals: true } },
    limit: 6,
    depth: 1,
  })
}

export async function getAgents() {
  return fetchCollection<AgentData>('agents', {
    where: { isActive: { equals: true } },
    sort: 'sortOrder',
    depth: 1,
  })
}

export async function getBlogPosts() {
  return fetchCollection<BlogData>('blog', {
    sort: '-publishedAt',
    limit: 20,
    depth: 1,
  })
}

export async function getBlogPost(id: string) {
  return fetchByID<BlogData>('blog', id, 2)
}
