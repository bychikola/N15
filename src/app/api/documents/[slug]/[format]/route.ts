import { NextRequest, NextResponse } from 'next/server'
import { isLocale } from '@/i18n/dictionaries'
import { legalDocById } from '@/lib/legal-docs'
import { buildLegalDocFile, isLegalDocFormat } from '@/lib/legal-docs-export'

/**
 * Скачивание правового документа раздела «Документы» в файле:
 * /api/documents/<адрес-документа>/<pdf|docx>?lang=ru.
 *
 * Документы публичные — доступ без входа на сайт, как и сами страницы: их
 * печатают и прикладывают к заявкам, а передумавший посетитель не должен
 * упираться в форму входа. Файл собирается на сервере без внешних библиотек
 * (см. legal-docs-export.ts): PDF — со встроенным кириллическим шрифтом,
 * DOCX — сборкой OOXML.
 *
 * Язык влияет на один документ — политику обработки персональных данных: её
 * текст двуязычный и приходит из словаря сайта (см. legalDocSections). Для
 * остальных документов язык в адресе можно не указывать.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; format: string }> },
) {
  try {
    const { slug, format } = await params
    if (!isLegalDocFormat(format)) {
      return NextResponse.json({ error: 'Неизвестный формат файла' }, { status: 404 })
    }
    const doc = legalDocById(slug)
    if (!doc) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const requested = req.nextUrl.searchParams.get('lang') || 'ru'
    const file = buildLegalDocFile(doc, format, isLocale(requested) ? requested : 'ru')
    if (!file) {
      console.error(`Legal docs: не удалось собрать файл ${slug}.${format}`)
      return NextResponse.json({ error: 'Не удалось собрать файл документа' }, { status: 500 })
    }

    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.data.length),
        'Content-Disposition': `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        // Файл меняется только с выпуском новой редакции документа: кэш на
        // десять минут — кнопка скачивания работает мгновенно при повторе
        'Cache-Control': 'public, max-age=600',
      },
    })
  } catch (error) {
    console.error('Legal docs download error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
