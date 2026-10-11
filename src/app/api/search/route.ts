import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import { getDictionary } from '@/i18n/dictionaries'
import { searchSite } from '@/lib/site-search-service'
import { SEARCH_MIN_QUERY, type SearchResult } from '@/lib/site-search'

/**
 * Поиск по сайту — точка входа для шапки (src/components/layout/SiteSearch.tsx).
 *
 * Параметры: ?q=суворов — слово или часть слова (регистр не важен);
 * ?lang=ru|os — язык сайта: подписи услуг и ссылки собираются на нём.
 *
 * Отвечаем списком строк выдачи — название, вид материала, короткий фрагмент
 * и ссылка (см. src/lib/site-search.ts). В выдачу уходят только открытые
 * материалы и открытые поля: черновики, архив, заявки, телефоны и имена
 * собственников, точный номер дома в ответ не попадают (см.
 * src/lib/site-search-service.ts). Запрос короче двух символов базу не
 * трогает — отдаём пустой список.
 */

// Выдача зависит от свежести CRM (публикация объекта, правка ЖК) — без кэша
export const dynamic = 'force-dynamic'

interface SearchResponse {
  q: string
  results: SearchResult[]
}

export async function GET(req: NextRequest): Promise<NextResponse<SearchResponse>> {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const lang = req.nextUrl.searchParams.get('lang') === 'os' ? 'os' : 'ru'

  if (q.length < SEARCH_MIN_QUERY) {
    return NextResponse.json({ q, results: [] })
  }

  try {
    const payload = await getPayload({ config })
    const results = await searchSite(payload, q, lang, getDictionary(lang))
    return NextResponse.json({ q, results })
  } catch (error) {
    // Ошибку не разворачиваем на клиенте техническим текстом: там покажется
    // «Не удалось выполнить поиск» (см. SiteSearch)
    console.error('Site search failed:', error)
    return NextResponse.json({ q, results: [] }, { status: 500 })
  }
}
