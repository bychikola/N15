'use client'

// ---------------------------------------------------------------------------
// Блок «Юридическая проверка объекта» в CRM (открывается кнопкой в карточке
// объекта, см. CrmObjects). Модуль Н15: закрытые документы и отчёт.
//
// Права определяет сервер (маршруты /api/objects/legal/*):
//   • документы смотрит и загружает агент, ведущий объект, администратор и
//     сотрудник, ответственный за юр. проверки (Лана) — у остальных блок
//     показывает только пояснение, не раскрывая ни документов, ни факта
//     отчёта;
//   • сведения по документам (форма facts) и полный отчёт с PDF видны только
//     Лане (officer — сервер возвращает isLegalOfficer).
// Отчёт клиентам и на сайт не попадает; в форме и примечаниях запрещены
// паспортные данные (серия/номер). Оговорка о предварительности показана
// в шапке блока и в каждом PDF.
// ---------------------------------------------------------------------------

import { useEffect, useState, type FC } from 'react'
import {
  FACTS_FIELDS,
  LEGAL_DOC_TYPES,
  LEGAL_REPORT_DISCLAIMER,
  LEGAL_STATUS_LABELS,
  fmtDate,
} from '@/lib/legal-check'

/** Правовой статус объекта глазами текущего сотрудника (ответ status-маршрута) */
interface PermState {
  canManage: boolean
  officer: boolean
  docsCount: number
  report?: {
    status: string
    statusLabel: string
    checkedAt?: string | null
    docsActualAt?: string | null
  } | null
}

interface DocMeta {
  id: number
  docType: string
  docDate?: string | null
  fileName?: string
  size?: number
  uploadedByName?: string
}

/** Отчёт для показа: и ответ run-маршрута, и запись legal-reports сводим сюда */
interface ReportView {
  status: string
  checkedAt?: string | null
  docsActualAt?: string | null
  checkedBy?: string | null
  items?: { key: string; title: string; status: string; note?: string | null }[]
  findings?: { level: string; itemKey: string; text: string }[]
  missingDocs?: string[]
  recommendations?: string[]
  sources?: { name: string; url: string }[]
  docs?: { docTypeLabel?: string; docDate?: string | null; fileName?: string; size?: number }[]
  facts?: Record<string, string>
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ok: { bg: '#e6efe1', color: '#3f6b34' },
  issues: { bg: '#f7e6cf', color: '#a1661f' },
  risk: { bg: '#f4ddd8', color: '#9b4e43' },
  manual: { bg: '#e8e4dc', color: '#716b62' },
}

const FINDING_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  risk: { bg: '#f4ddd8', color: '#9b4e43', label: 'РИСК' },
  warn: { bg: '#f7e6cf', color: '#a1661f', label: 'Замечание' },
  info: { bg: '#ede8de', color: '#716b62', label: 'Информация' },
}

const fmtSize = (bytes?: number): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/** Приведение записи legal-reports (или ответа run) к единому виду показа */
function toView(src: Record<string, unknown>): ReportView {
  const str = (v: unknown) => (v == null ? '' : String(v))
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    status: str(src.status),
    checkedAt: src.checkedAt ? str(src.checkedAt) : null,
    docsActualAt: src.docsActualAt ? str(src.docsActualAt) : null,
    checkedBy: src.checkedBy ? str(src.checkedBy) : null,
    items: arr(src.items).map((it) => {
      const r = it as Record<string, unknown>
      return {
        key: str(r.key),
        title: str(r.title),
        status: str(r.status) || 'manual',
        note: r.note ? str(r.note) : null,
      }
    }),
    findings: arr(src.findings).map((f) => {
      const r = f as Record<string, unknown>
      return { level: str(r.level) || 'info', itemKey: str(r.itemKey), text: str(r.text) }
    }),
    missingDocs: arr(src.missingDocs).map(str),
    recommendations: arr(src.recommendations).map(str),
    sources: arr(src.sources).map((s) => {
      const r = s as Record<string, unknown>
      return { name: str(r.name), url: str(r.url) }
    }),
    docs: arr(src.docs).map((d) => {
      const r = d as Record<string, unknown>
      return {
        docTypeLabel: str(r.docTypeLabel),
        docDate: r.docDate ? str(r.docDate) : null,
        fileName: str(r.fileName),
        size: Number(r.size) || 0,
      }
    }),
    facts: (src.facts && typeof src.facts === 'object' ? src.facts : {}) as Record<string, string>,
  }
}

const LABEL_OF: Record<string, string> = Object.fromEntries(LEGAL_DOC_TYPES.map((d) => [d.value, d.label]))

export const LegalCheckBlock: FC<{ objectId: number; onClose: () => void }> = ({ objectId, onClose }) => {
  const [perm, setPerm] = useState<PermState | null>(null)
  const [docs, setDocs] = useState<DocMeta[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  // Форма загрузки документа
  const [upType, setUpType] = useState<string>(LEGAL_DOC_TYPES[0].value)
  const [upDate, setUpDate] = useState('')
  const [upNotes, setUpNotes] = useState('')
  const [upFile, setUpFile] = useState<File | null>(null)

  // Сведения по документам (форма facts) — только у ответственной за проверки
  const [facts, setFacts] = useState<Record<string, string>>({})
  // Текущий отчёт (показать) — только у ответственной за проверки
  const [report, setReport] = useState<ReportView | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  // Первичная загрузка прав и документов
  const [loaded, setLoaded] = useState(false)

  // Первичная загрузка прав и документов (первый вызов — из эффекта ниже;
  // последующие — после загрузки/удаления документа, ошибку сбрасывает caller)
  async function loadAll() {
    try {
      const res = await fetch(`/api/objects/legal/status?objectId=${objectId}`, { credentials: 'include' })
      const data = (await res.json()) as PermState & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Не удалось получить статус проверки')
      setPerm(data)
      if (data.canManage) {
        const docsRes = await fetch(`/api/objects/legal/docs?objectId=${objectId}`, { credentials: 'include' })
        const docsData = (await docsRes.json()) as { docs?: DocMeta[]; error?: string }
        if (!docsRes.ok) throw new Error(docsData.error || 'Не удалось получить документы')
        setDocs(docsData.docs || [])
        // Ответственной за проверки сразу показываем последний отчёт (если есть)
        if (data.officer && data.report) {
          const repRes = await fetch(`/api/objects/legal/report?objectId=${objectId}`, { credentials: 'include' })
          const repData = (await repRes.json()) as { exists?: boolean; report?: Record<string, unknown>; error?: string }
          if (repRes.ok && repData.exists && repData.report) {
            const view = toView(repData.report)
            setReport(view)
            if (view.facts) setFacts(view.facts)
          } else if (repData.error) {
            setError(repData.error)
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoaded(true)
    }
  }

  // Первичная загрузка прав, документов и отчёта (один раз при открытии блока).
  // Отложена на тик, как в остальных экранах CRM: сетевые ответы меняют
  // состояние уже после await, без каскадных рендеров из эффекта.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadAll()
      }
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadDoc = async () => {
    if (!upFile) {
      setError('Выберите файл документа')
      return
    }
    setBusy('upload')
    setError('')
    try {
      const form = new FormData()
      form.append('objectId', String(objectId))
      form.append('docType', upType)
      if (upDate) form.append('docDate', upDate)
      if (upNotes) form.append('notes', upNotes)
      form.append('file', upFile)
      const res = await fetch('/api/objects/legal/docs', { method: 'POST', credentials: 'include', body: form })
      const data = (await res.json()) as { doc?: DocMeta; error?: string }
      if (!res.ok || !data.doc) throw new Error(data.error || 'Не удалось загрузить документ')
      setUpFile(null)
      setUpNotes('')
      setUpDate('')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const deleteDoc = async (id: number) => {
    if (!window.confirm('Удалить документ? Это действие необратимо.')) return
    setBusy(`del${id}`)
    setError('')
    try {
      const res = await fetch(`/api/objects/legal/docs/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'Не удалось удалить документ')
      }
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  /** Запуск проверки: движок считает отчёт по документам и сведениям */
  const runCheck = async () => {
    if (reportBusy) return
    setReportBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = { objectId }
      if (perm?.officer) {
        // Пустые строки не передаём — движок сам разберёт «не указано»
        const clean: Record<string, string> = {}
        for (const [k, v] of Object.entries(facts)) {
          if (v != null && String(v).trim() !== '') clean[k] = String(v).trim()
        }
        body.facts = clean
      }
      const res = await fetch('/api/objects/legal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { formed?: boolean; report?: Record<string, unknown>; error?: string; checkedAt?: string }
      if (!res.ok || !data.formed) throw new Error(data.error || 'Не удалось провести проверку')
      if (perm?.officer && data.report) {
        const view = toView(data.report)
        setReport(view)
        if (view.facts) setFacts(view.facts)
      } else {
        setReport({ status: '', checkedAt: data.checkedAt || null, items: [], findings: [] })
        await loadAll()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportBusy(false)
    }
  }

  /** Скачивание PDF отчёта (кнопка — только у ответственной за проверки) */
  const downloadPdf = async () => {
    setBusy('pdf')
    setError('')
    try {
      const res = await fetch(`/api/objects/legal/pdf?objectId=${objectId}`, { credentials: 'include' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || 'Не удалось сформировать PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `yur-proverka-obekta-${objectId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  const officer = !!perm?.officer
  const canManage = !!perm?.canManage
  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #d9d1c4',
    borderRadius: 7,
    background: '#fff',
    color: '#25241f',
    padding: '8px 10px',
    font: '13px Arial, Helvetica, sans-serif',
    boxSizing: 'border-box',
  }
  const smallBtn: React.CSSProperties = {
    border: '1px solid #e1d8ca',
    borderRadius: 6,
    background: '#fff',
    color: '#716b62',
    padding: '7px 10px',
    fontSize: 10,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
  const goldBtn: React.CSSProperties = {
    border: 0,
    borderRadius: 7,
    background: '#a7814e',
    color: '#fff',
    padding: '11px 16px',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    cursor: 'pointer',
  }

  const reportStatusStyle = report ? STATUS_STYLE[report.status] || STATUS_STYLE.manual : undefined

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            Юридическая проверка объекта
          </h2>
          <p style={{ margin: '4px 0 0', color: '#817b70', fontSize: 12 }}>Объект №{objectId} · модуль CRM Н15</p>
        </div>
        <button type="button" onClick={onClose}
          style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>
          ✕
        </button>
      </div>

      {/* Обязательная оговорка — в шапке блока и в каждом PDF отчёта */}
      <div style={{ marginTop: 12, border: '1px solid #d9b98c', borderRadius: 8, background: '#fbf3e6', padding: '10px 14px', fontSize: 12, color: '#7a5a2e' }}>
        {LEGAL_REPORT_DISCLAIMER}. Результаты сверки носят предварительный характер и не публикуются: документы и отчёт хранятся только в закрытой части CRM.
      </div>

      {!loaded ? (
        <p style={{ color: '#817b70', fontSize: 12, marginTop: 14 }}>Загрузка…</p>
      ) : !perm ? null : !canManage ? (
        // Чужой объект: не раскрываем ни документы, ни факт проверки
        <div style={{ marginTop: 16, border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: '18px 16px' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            Работать с юридической проверкой этого объекта может агент, который его ведёт, администратор
            или сотрудник, ответственный за юридические проверки. Если вам нужен отчёт — обратитесь к нему.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- Документы объекта (закрытое хранилище) ---------- */}
          <h3 style={{ margin: '18px 0 4px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 17 }}>
            Документы для проверки
          </h3>
          <p style={{ margin: '0 0 10px', color: '#817b70', fontSize: 11, lineHeight: 1.5 }}>
            Загрузите скан или фото документа (PDF, изображения, Word, Excel — до 20 МБ). Исходные файлы
            хранятся только здесь, в закрытой CRM: в отчёт попадает лишь перечень, без содержимого.
          </p>

          {docs && docs.length > 0 && (
            <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', overflow: 'hidden', marginBottom: 10 }}>
              {docs.map((d, idx) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: idx ? '1px solid #f0ebe2' : 0 }}>
                  <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
                    {LABEL_OF[d.docType] || d.docType}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#25241f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.fileName}
                      {fmtSize(d.size) ? <span style={{ color: '#9b958a' }}> · {fmtSize(d.size)}</span> : null}
                    </div>
                    {d.docDate ? <div style={{ fontSize: 10, color: '#9b958a' }}>документ от {fmtDate(d.docDate)}</div> : null}
                  </div>
                  <a href={`/api/objects/legal/docs/${d.id}`} target="_blank" rel="noopener" style={smallBtn}>Открыть</a>
                  <button type="button" onClick={() => void deleteDoc(d.id)} disabled={busy === `del${d.id}`}
                    style={{ ...smallBtn, borderColor: '#e3cfc7', color: '#9b4e43', background: 'transparent' }}>
                    {busy === `del${d.id}` ? '…' : 'Удалить'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {docs && docs.length === 0 && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#817b70' }}>
              Документы ещё не загружены. Для проверки нужны минимум выписка из ЕГРН и правоустанавливающий документ.
            </p>
          )}

          {/* Загрузка документа */}
          <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <label style={{ fontSize: 10, color: '#817b70' }}>
              Тип документа
              <select value={upType} onChange={(e) => setUpType(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                {LEGAL_DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 10, color: '#817b70' }}>
              Дата документа
              <input type="date" value={upDate} onChange={(e) => setUpDate(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 10, color: '#817b70' }}>
              Файл
              <input type="file" onChange={(e) => setUpFile(e.target.files?.[0] || null)} style={{ ...inputStyle, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 10, color: '#817b70', gridColumn: '1 / -1' }}>
              Примечание (кем и когда выдан документ, что подтверждает). Паспортные данные — серию и номер — указывать нельзя.
              <textarea value={upNotes} onChange={(e) => setUpNotes(e.target.value)} rows={2} style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }} />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={() => void uploadDoc()} disabled={busy === 'upload'}
                style={{ ...goldBtn, background: '#8d6b40' }}>
                {busy === 'upload' ? 'Загрузка…' : 'Загрузить документ'}
              </button>
              {error && <span style={{ color: '#9b4e43', fontSize: 11 }}>{error}</span>}
            </div>
          </div>

          {/* ---------- Сведения и отчёт — только у ответственной за проверки ---------- */}
          {!officer ? (
            <div style={{ marginTop: 16, border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: '14px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55 }}>
                Проверку проводит сотрудник, ответственный за юридические проверки: он сверяет документы
                по 12 пунктам (ЕГРН, собственники, обременения, суды, семья и согласия, перепланировки и др.)
                и формирует закрытый отчёт. Клиентам и на сайте отчёт не показывается.
              </p>
              <button type="button" onClick={() => void runCheck()} disabled={reportBusy}
                style={{ ...goldBtn, background: reportBusy ? '#c9b894' : '#a7814e' }}>
                {reportBusy ? 'Проверка…' : 'Провести юридическую проверку'}
              </button>
              {report && !report.status && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#3f6b34' }}>
                  Проверка проведена (по документам на {report.checkedAt ? fmtDate(report.checkedAt) : 'сегодня'}). Подробный отчёт формирует сотрудник, ответственный за юридические проверки.
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: '14px 16px' }}>
                <h3 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 17 }}>
                  Сведения по документам (сверка пунктов 1–12)
                </h3>
                <p style={{ margin: '4px 0 10px', color: '#817b70', fontSize: 11, lineHeight: 1.5 }}>
                  Внесите данные из выписки ЕГРН и результаты ручных проверок по официальным реестрам —
                  по ним система сверит пункты и сформирует предварительный отчёт. Поля с «не указано»
                  трактуются как «нужна ручная проверка юристом».
                </p>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  {FACTS_FIELDS.map((f) => {
                    const hiddenBy = f.showWhen && facts[f.showWhen.field] !== f.showWhen.value
                    if (hiddenBy) return null
                    const value = facts[f.name] || ''
                    const common = { ...inputStyle, marginTop: 4 }
                    const setV = (v: string) => setFacts((prev) => ({ ...prev, [f.name]: v }))
                    return (
                      <label key={f.name} style={{ fontSize: 10, color: '#817b70', gridColumn: f.kind === 'multiline' || f.kind === 'area' ? '1 / -1' : undefined }}>
                        {f.label}
                        {f.kind === 'select' ? (
                          <select value={value} onChange={(e) => setV(e.target.value)} style={common}>
                            {(f.options || []).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : f.kind === 'multiline' ? (
                          <textarea value={value} onChange={(e) => setV(e.target.value)} rows={3} style={{ ...common, resize: 'vertical' }} />
                        ) : (
                          <input
                            type={f.kind === 'date' ? 'date' : f.kind === 'area' ? 'text' : 'text'}
                            inputMode={f.kind === 'area' ? 'decimal' : undefined}
                            value={value}
                            onChange={(e) => setV(e.target.value)}
                            style={common}
                          />
                        )}
                        {f.hint && <span style={{ display: 'block', marginTop: 3, fontSize: 9.5, lineHeight: 1.4 }}>{f.hint}</span>}
                      </label>
                    )
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void runCheck()} disabled={reportBusy}
                    style={{ ...goldBtn, opacity: reportBusy ? 0.6 : 1 }}>
                    {reportBusy ? 'Формирование отчёта…' : 'Провести проверку и сформировать отчёт'}
                  </button>
                  {error && <span style={{ color: '#9b4e43', fontSize: 11 }}>{error}</span>}
                </div>
              </div>

              {/* ---------- Отчёт (только Лана) ---------- */}
              {report && report.status ? (
                <div style={{ marginTop: 14, border: '1px solid #ded5c7', borderRadius: 10, background: '#fff', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Итог проверки</div>
                      <div style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 8, background: reportStatusStyle?.bg || '#e8e4dc', color: reportStatusStyle?.color || '#716b62', fontWeight: 600, fontSize: 13 }}>
                        {LEGAL_STATUS_LABELS[report.status as keyof typeof LEGAL_STATUS_LABELS] || report.status}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, color: '#817b70', lineHeight: 1.5 }}>
                        Проверка: {fmtDate(report.checkedAt)}
                        {report.docsActualAt ? ` · документы актуальны на: ${fmtDate(report.docsActualAt)}` : ' · дата актуальности документов не определена'}
                        {report.checkedBy ? ` · провела: ${report.checkedBy}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => void downloadPdf()} disabled={busy === 'pdf'}
                      style={{ ...goldBtn, background: busy === 'pdf' ? '#c9b894' : '#a7814e' }}>
                      {busy === 'pdf' ? 'Формирование…' : 'Скачать отчёт PDF'}
                    </button>
                  </div>

                  {/* 12 пунктов */}
                  <div style={{ marginTop: 14 }}>
                    {(report.items || []).map((it) => {
                      const st = STATUS_STYLE[it.status] || STATUS_STYLE.manual
                      return (
                        <div key={it.key} style={{ padding: '7px 0', borderTop: '1px solid #f0ebe2', fontSize: 12 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                            <span style={{ minWidth: 26, color: '#817b70' }}>{it.key}.</span>
                            <span style={{ flex: 1, color: '#25241f' }}>{it.title}</span>
                            <span style={{ whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 9.5 }}>{LEGAL_STATUS_LABELS[it.status as keyof typeof LEGAL_STATUS_LABELS] || it.status}</span>
                          </div>
                          {it.note ? <div style={{ marginLeft: 34, marginTop: 3, color: '#716b62', fontSize: 11, lineHeight: 1.45 }}>{it.note}</div> : null}
                        </div>
                      )
                    })}
                  </div>

                  {/* Найденные несоответствия */}
                  {report.findings && report.findings.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Найденные несоответствия и риски</div>
                      {report.findings.map((f, i) => {
                        const st = FINDING_STYLE[f.level] || FINDING_STYLE.info
                        return (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', fontSize: 12 }}>
                            <span style={{ flex: 0, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 9.5, whiteSpace: 'nowrap' }}>{st.label}</span>
                            <span style={{ color: '#25241f', lineHeight: 1.45 }}>{f.text} <span style={{ color: '#9b958a', fontSize: 10 }}>(пункт {f.itemKey})</span></span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Отсутствующие документы */}
                  {report.missingDocs && report.missingDocs.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Отсутствующие документы</div>
                      {report.missingDocs.map((m, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#9b4e43', padding: '2px 0' }}>— {m}</div>
                      ))}
                    </div>
                  )}

                  {/* Рекомендации */}
                  {report.recommendations && report.recommendations.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Рекомендации</div>
                      {report.recommendations.map((r, i) => (
                        <div key={i} style={{ fontSize: 12, padding: '2px 0', lineHeight: 1.45 }}>{i + 1}. {r}</div>
                      ))}
                    </div>
                  )}

                  {/* Перечень загруженных документов */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Загруженные документы (перечень)</div>
                    {report.docs && report.docs.length > 0 ? (
                      report.docs.map((d, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#716b62', padding: '1px 0' }}>
                          — {d.docTypeLabel || d.fileName}{d.docDate ? `, от ${fmtDate(d.docDate)}` : ''}
                          {d.fileName ? ` · «${d.fileName}»` : ''}{fmtSize(d.size) ? ` (${fmtSize(d.size)})` : ''}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#9b958a' }}>—</div>
                    )}
                  </div>

                  {/* Источники для ручной проверки */}
                  {report.sources && report.sources.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Официальные источники для ручной проверки</div>
                      {report.sources.map((s, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '1px 0' }}>
                          — {s.name}{s.url ? (
                            <a href={s.url} target="_blank" rel="noopener" style={{ color: '#8d6b40' }}> ({s.url})</a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ margin: '14px 0 0', fontSize: 10.5, color: '#9b958a', lineHeight: 1.5 }}>
                    Отчёт сформирован системой автоматически и носит предварительный характер: не заменяет заключение
                    юриста и официальные документы. В отчёте нет паспортных данных, подписей и полного текста документов.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
