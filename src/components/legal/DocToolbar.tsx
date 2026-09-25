'use client'

import type { FC } from 'react'
import { useI18n } from '@/i18n/i18n-provider'

interface Props {
  /** Идентификатор документа в реестре (src/lib/legal-docs.ts) */
  docId: string
  /**
   * full — кнопки страницы документа (печать и оба файла);
   * files — только ссылки на файлы: так кнопки стоят в списке документов,
   * где печатать нечего и место занимает не каждая кнопка
   */
  variant?: 'full' | 'files'
  className?: string
}

const buttonCls =
  'px-4 py-2.5 text-xs tracking-wider uppercase border border-[var(--n15-gold)]/40 text-[var(--n15-gold)] hover:bg-[var(--n15-gold)]/8 transition-all duration-300 cursor-pointer'

const fileLinkCls =
  'text-[11px] tracking-wider uppercase text-[var(--n15-muted)] hover:text-[var(--n15-gold)] transition-colors duration-300'

/**
 * Кнопки печатной формы документа: «Распечатать», «Скачать PDF» и
 * «Скачать DOCX». Стоят в шапке каждой страницы документа — и в разделе
 * «Документы», и на прежних страницах правил и оферт.
 *
 * Печать — системная (window.print): страница размечена под лист А4 и
 * печатается и с телефона, и с компьютера (см. блок @media print в
 * globals.css), а лишнее — шапка, подвал, орнаменты и сами эти кнопки —
 * на бумагу не попадает. Файлы собирает сервер без внешних библиотек
 * (см. src/lib/legal-docs-export.ts), поэтому PDF одинаковый на всех
 * устройствах: кириллический шрифт встроен в файл.
 *
 * Скачивание — обычные ссылки, а не обработчики: кнопка работает и до
 * того, как загрузится JavaScript, и её адрес можно скопировать.
 */
export const DocToolbar: FC<Props> = ({ docId, variant = 'full', className = '' }) => {
  const { lang, t } = useI18n()
  const fileHref = (format: 'pdf' | 'docx') => `/api/documents/${docId}/${format}?lang=${lang}`

  if (variant === 'files') {
    return (
      <span className={`n15-no-print inline-flex flex-wrap items-center gap-4 ${className}`}>
        <a href={fileHref('pdf')} className={fileLinkCls} download>
          {t.documents.downloadPdf}
        </a>
        <a href={fileHref('docx')} className={fileLinkCls} download>
          {t.documents.downloadDocx}
        </a>
      </span>
    )
  }

  return (
    <div className={`n15-no-print flex flex-wrap items-center gap-3 ${className}`}>
      <button type="button" onClick={() => window.print()} className={buttonCls}>
        {t.documents.print}
      </button>
      <a href={fileHref('pdf')} className={buttonCls} download>
        {t.documents.downloadPdf}
      </a>
      <a href={fileHref('docx')} className={buttonCls} download>
        {t.documents.downloadDocx}
      </a>
    </div>
  )
}
