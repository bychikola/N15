'use client'

// ---------------------------------------------------------------------------
// Блок «Юридическая экспертиза объекта» в CRM (открывается кнопкой в карточке
// объекта, см. CrmObjects). Модуль Н15: закрытые документы и закрытый отчёт.
//
// Права определяет сервер (маршруты /api/objects/legal/*): документы, выписку
// ЕГРН, паспорт собственника, отчёт и PDF видит только администратор — у
// остальных сотрудников блок показывает лишь пояснение и не раскрывает ни
// документов, ни факта отчёта (закрытые поля и разделы не отображаются вовсе,
// см. требования к правам CRM).
// Экспертиза идёт по карточке объекта, загруженной выписке ЕГРН (XML
// Росреестра разбирается автоматически, см. legal-egrn.ts) и отметкам юриста
// о ручных проверках. Автоматического доступа к официальным реестрам нет —
// в отчёте это сказано прямо, результат не имитируется.
// Отчёт клиентам и на сайт не попадает; паспорт и его данные в отчёт не
// переносятся, серию/номер паспорта система не запрашивает и не хранит.
// ---------------------------------------------------------------------------

import { useEffect, useState, type FC } from 'react'
import {
  LEGAL_DOC_TYPES,
  LEGAL_ITEM_STATUS_LABELS,
  LEGAL_MANUAL_FIELDS,
  LEGAL_REPORT_DISCLAIMER,
  LEGAL_STATUS_LABELS,
  fmtDate,
} from '@/lib/legal-check'

/** Правовой статус объекта глазами текущего сотрудника (ответ status-маршрута) */
interface PermState {
  canManage: boolean
  canReadReport: boolean
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

/** Дополнительные сведения отчёта (JSON-поле facts / ответ run-маршрута) */
interface ExtrasView {
  cadastralNumber?: string
  cadastralSource?: string
  ownerCard?: string
  ownersEgrn?: string[]
  rightType?: string
  basis?: string
  addressEgrn?: string
  areaEgrn?: string
  areaCard?: number | null
  encumbrances?: string[]
  egrn?: { status?: string; fileName?: string; format?: string; reason?: string; docDate?: string | null; notes?: string[] }
  manual?: Record<string, string>
  autoChecks?: string[]
  autoUnavailable?: string[]
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
  extras: ExtrasView
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

const CADASTRAL_SOURCE_LABEL: Record<string, string> = {
  card: 'из карточки объекта',
  input: 'введён для проверки',
  egrn: 'распознан из выписки ЕГРН',
  none: 'не указан',
}

const EGRN_STATUS_LABEL: Record<string, string> = {
  parsed: 'файл выписки распознан автоматически',
  unrecognized: 'файл загружен, но автоматически не распознан',
  missing: 'файл выписки не загружен',
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
  // run-маршрут отдаёт extras, запись из БД — то же содержимое в поле facts
  const rawExtras = (src.extras && typeof src.extras === 'object' ? src.extras : src.facts) as Record<string, unknown> | undefined
  const extras = (rawExtras && typeof rawExtras === 'object' ? rawExtras : {}) as ExtrasView
  const egrnRaw = (extras.egrn && typeof extras.egrn === 'object' ? extras.egrn : {}) as Record<string, unknown>
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
    extras: {
      cadastralNumber: str(extras.cadastralNumber),
      cadastralSource: str(extras.cadastralSource) || 'none',
      ownerCard: str(extras.ownerCard),
      ownersEgrn: arr(extras.ownersEgrn).map(str),
      rightType: str(extras.rightType),
      basis: str(extras.basis),
      addressEgrn: str(extras.addressEgrn),
      areaEgrn: str(extras.areaEgrn),
      areaCard: typeof extras.areaCard === 'number' ? extras.areaCard : null,
      encumbrances: arr(extras.encumbrances).map(str),
      egrn: {
        status: str(egrnRaw.status) || 'missing',
        fileName: str(egrnRaw.fileName),
        reason: str(egrnRaw.reason),
        docDate: egrnRaw.docDate ? str(egrnRaw.docDate) : null,
        notes: arr(egrnRaw.notes).map(str),
      },
      manual: (extras.manual && typeof extras.manual === 'object' ? extras.manual : {}) as Record<string, string>,
      autoChecks: arr(extras.autoChecks).map(str),
      autoUnavailable: arr(extras.autoUnavailable).map(str),
    },
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

  // Экспертиза: кадастровый номер (если не заполнен в карточке) и отметки
  // юриста о проверках, которые система выполнить не может
  const [cadastral, setCadastral] = useState('')
  const [manual, setManual] = useState<Record<string, string>>({})
  const [manualComment, setManualComment] = useState('')
  const [report, setReport] = useState<ReportView | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  // Первичная загрузка прав и документов
  const [loaded, setLoaded] = useState(false)

  // Первичная загрузка прав, документов и отчёта (первый вызов — из эффекта
  // ниже; последующие — после загрузки/удаления документа или проверки)
  async function loadAll() {
    try {
      const res = await fetch(`/api/objects/legal/status?objectId=${objectId}`, { credentials: 'include' })
      const data = (await res.json()) as PermState & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Не удалось получить статус экспертизы')
      setPerm(data)
      if (data.canManage) {
        const docsRes = await fetch(`/api/objects/legal/docs?objectId=${objectId}`, { credentials: 'include' })
        const docsData = (await docsRes.json()) as { docs?: DocMeta[]; error?: string }
        if (!docsRes.ok) throw new Error(docsData.error || 'Не удалось получить документы')
        setDocs(docsData.docs || [])
      }
      // Отчёт сразу показываем администратору (если он сформирован)
      if (data.canReadReport && data.report) {
        const repRes = await fetch(`/api/objects/legal/report?objectId=${objectId}`, { credentials: 'include' })
        const repData = (await repRes.json()) as { exists?: boolean; report?: Record<string, unknown>; error?: string }
        if (repRes.ok && repData.exists && repData.report) {
          const view = toView(repData.report)
          setReport(view)
          if (view.extras.manual) {
            const marks: Record<string, string> = {}
            for (const [k, v] of Object.entries(view.extras.manual)) if (k !== 'comment') marks[k] = String(v)
            setManual(marks)
            if (view.extras.manual.comment) setManualComment(String(view.extras.manual.comment))
          }
        } else if (repData.error) {
          setError(repData.error)
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

  /** Запуск экспертизы: карточка объекта + загруженная выписка + отметки юриста */
  const runCheck = async () => {
    if (reportBusy) return
    setReportBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = { objectId }
      if (perm?.canReadReport) {
        if (cadastral.trim()) body.cadastralNumber = cadastral.trim()
        const marks: Record<string, string> = {}
        for (const [k, v] of Object.entries(manual)) if (v) marks[k] = v
        if (manualComment.trim()) marks.comment = manualComment.trim()
        body.manual = marks
      }
      const res = await fetch('/api/objects/legal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { formed?: boolean; report?: Record<string, unknown>; error?: string; checkedAt?: string }
      if (!res.ok || !data.formed) throw new Error(data.error || 'Не удалось провести экспертизу')
      if (perm?.canReadReport && data.report) {
        setReport(toView(data.report))
      } else {
        await loadAll()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportBusy(false)
    }
  }

  /** Скачивание PDF отчёта (кнопка — только у администратора) */
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
      a.download = `yur-ekspertiza-obekta-${objectId}.pdf`
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

  const canReadReport = !!perm?.canReadReport
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
  const sectionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 12, marginBottom: 4 }

  const reportStatusStyle = report ? STATUS_STYLE[report.status] || STATUS_STYLE.manual : undefined
  const extras = report?.extras

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            Юридическая экспертиза объекта
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
        {LEGAL_REPORT_DISCLAIMER}. Отчёт закрытый: его видит только администратор, клиентам и на сайт он не показывается.
      </div>

      {!loaded ? (
        <p style={{ color: '#817b70', fontSize: 12, marginTop: 14 }}>Загрузка…</p>
      ) : !perm ? null : !canManage ? (
        // Не администратор: документы, выписки и отчёт не раскрываем вовсе
        <div style={{ marginTop: 16, border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: '18px 16px' }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            Документы, выписка ЕГРН и отчёт юридической экспертизы доступны только администратору.
            Если вам нужен отчёт — обратитесь к нему.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- Документы объекта (закрытое хранилище) ---------- */}
          <h3 style={{ margin: '18px 0 4px', fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 17 }}>
            Документы для экспертизы
          </h3>
          <p style={{ margin: '0 0 10px', color: '#817b70', fontSize: 11, lineHeight: 1.5 }}>
            Нужны выписка ЕГРН (XML-файл из личного кабинета Росреестра система разбирает автоматически;
            PDF и скан — нет, их сверяет юрист) и паспорт собственника для сверки личности. Файлы хранятся
            только здесь, в закрытой CRM: в отчёт попадает лишь перечень, без содержимого и паспортных данных.
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
              Документы ещё не загружены. Для экспертизы нужны выписка ЕГРН и паспорт собственника.
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

          {/* ---------- Экспертиза, отметки и отчёт — только администратору ---------- */}
          <div style={{ marginTop: 16 }}>
            <div style={{ border: '1px solid #e5dfd3', borderRadius: 10, background: '#fff', padding: '14px 16px' }}>
              <h3 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 17 }}>
                Провести экспертизу
              </h3>
              <p style={{ margin: '4px 0 10px', color: '#817b70', fontSize: 11, lineHeight: 1.5 }}>
                Система проверит карточку объекта и загруженную выписку ЕГРН (XML-файл разбирается
                автоматически). Данные, которых в документах нет, вносить не нужно: ниже — только отметки
                о проверках, которые выполняет юрист вручную. Официальные реестры автоматически не
                опрашиваются, отчёт скажет об этом прямо.
              </p>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={{ fontSize: 10, color: '#817b70' }}>
                  Кадастровый номер для проверки (если не заполнен в карточке)
                  <input type="text" value={cadastral} onChange={(e) => setCadastral(e.target.value)}
                    placeholder="15:07:0030021:123" style={{ ...inputStyle, marginTop: 4 }} />
                </label>
                {LEGAL_MANUAL_FIELDS.map((f) => (
                  <label key={f.name} style={{ fontSize: 10, color: '#817b70' }}>
                    {f.label}
                    <select value={manual[f.name] || ''} onChange={(e) => setManual((prev) => ({ ...prev, [f.name]: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 4 }}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {f.hint && <span style={{ display: 'block', marginTop: 3, fontSize: 9.5, lineHeight: 1.4 }}>{f.hint}</span>}
                  </label>
                ))}
                <label style={{ fontSize: 10, color: '#817b70', gridColumn: '1 / -1' }}>
                  Комментарий к ручным проверкам (что именно выявлено)
                  <textarea value={manualComment} onChange={(e) => setManualComment(e.target.value)} rows={2}
                    style={{ ...inputStyle, marginTop: 4, resize: 'vertical' }} />
                </label>
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void runCheck()} disabled={reportBusy}
                  style={{ ...goldBtn, opacity: reportBusy ? 0.6 : 1 }}>
                  {reportBusy ? 'Формирование отчёта…' : 'Провести экспертизу'}
                </button>
                {report?.status ? (
                  <button type="button" onClick={() => void downloadPdf()} disabled={busy === 'pdf'}
                    style={{ ...goldBtn, background: busy === 'pdf' ? '#c9b894' : '#8d6b40' }}>
                    {busy === 'pdf' ? 'Формирование…' : 'Скачать отчёт PDF'}
                  </button>
                ) : null}
                {error && <span style={{ color: '#9b4e43', fontSize: 11 }}>{error}</span>}
              </div>
            </div>

            {/* ---------- Отчёт (только администратор) ---------- */}
            {report && report.status ? (
              <div style={{ marginTop: 14, border: '1px solid #ded5c7', borderRadius: 10, background: '#fff', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Итог экспертизы</div>
                    <div style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 8, background: reportStatusStyle?.bg || '#e8e4dc', color: reportStatusStyle?.color || '#716b62', fontWeight: 600, fontSize: 13 }}>
                      {LEGAL_STATUS_LABELS[report.status as keyof typeof LEGAL_STATUS_LABELS] || report.status}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#817b70', lineHeight: 1.5 }}>
                      Проверка: {fmtDate(report.checkedAt)}
                      {report.docsActualAt ? ` · документы актуальны на: ${fmtDate(report.docsActualAt)}` : ' · дата актуальности документов не определена'}
                      {report.checkedBy ? ` · сформировал: ${report.checkedBy}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => void downloadPdf()} disabled={busy === 'pdf'}
                    style={{ ...goldBtn, background: busy === 'pdf' ? '#c9b894' : '#a7814e' }}>
                    {busy === 'pdf' ? 'Формирование…' : 'Скачать отчёт PDF'}
                  </button>
                </div>

                {/* Сведения об объекте */}
                <div style={{ marginTop: 14 }}>
                  <div style={sectionTitle}>Сведения об объекте</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: '#25241f' }}>
                    <div>Кадастровый номер: {extras?.cadastralNumber || '—'}{' '}
                      <span style={{ color: '#9b958a', fontSize: 10 }}>({CADASTRAL_SOURCE_LABEL[extras?.cadastralSource || 'none']})</span>
                    </div>
                    {extras?.addressEgrn ? <div>Адрес по выписке ЕГРН: {extras.addressEgrn}</div> : null}
                    <div>
                      Площадь: {[
                        extras?.areaEgrn ? `по выписке — ${extras.areaEgrn} м²` : '',
                        extras?.areaCard != null ? `по карточке — ${String(extras.areaCard).replace('.', ',')} м²` : '',
                      ].filter(Boolean).join(', ') || 'не указана'}
                    </div>
                    <div style={{ color: '#716b62' }}>
                      Выписка ЕГРН: {EGRN_STATUS_LABEL[extras?.egrn?.status || 'missing']}
                      {extras?.egrn?.fileName ? ` · «${extras.egrn.fileName}»` : ''}
                      {extras?.egrn?.docDate ? `, от ${fmtDate(extras.egrn.docDate)}` : ''}
                    </div>
                    {extras?.egrn?.reason ? (
                      <div style={{ color: '#a1661f', fontSize: 11, marginTop: 2 }}>{extras.egrn.reason}</div>
                    ) : null}
                  </div>
                </div>

                {/* Сведения о собственнике */}
                <div style={{ marginTop: 14 }}>
                  <div style={sectionTitle}>Сведения о собственнике</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: '#25241f' }}>
                    <div>По карточке объекта: {extras?.ownerCard || '—'}</div>
                    <div>По выписке ЕГРН: {extras?.ownersEgrn?.length ? extras.ownersEgrn.join(', ') : '—'}</div>
                    <div>Вид права: {extras?.rightType || '—'}</div>
                    <div>Основание приобретения: {extras?.basis || '—'}</div>
                    <div>Зарегистрированные обременения: {extras?.encumbrances?.length ? extras.encumbrances.join('; ') : '—'}</div>
                    <div style={{ color: '#716b62' }}>
                      Паспорт: {extras?.manual?.passportCheck === 'match'
                        ? 'сверен юристом, расхождений нет'
                        : extras?.manual?.passportCheck === 'mismatch'
                          ? 'выявлены расхождения'
                          : 'сверка не отмечена — паспорт читает юрист визуально'}
                    </div>
                  </div>
                </div>

                {/* Результаты проверок */}
                <div style={{ marginTop: 14 }}>
                  <div style={sectionTitle}>Результаты проверок</div>
                  {(report.items || []).map((it) => {
                    const st = STATUS_STYLE[it.status] || STATUS_STYLE.manual
                    return (
                      <div key={it.key} style={{ padding: '7px 0', borderTop: '1px solid #f0ebe2', fontSize: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                          <span style={{ minWidth: 26, color: '#817b70' }}>{it.key}.</span>
                          <span style={{ flex: 1, color: '#25241f' }}>{it.title}</span>
                          <span style={{ whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 9.5 }}>
                            {LEGAL_ITEM_STATUS_LABELS[it.status as keyof typeof LEGAL_ITEM_STATUS_LABELS] || it.status}
                          </span>
                        </div>
                        {it.note ? <div style={{ marginLeft: 34, marginTop: 3, color: '#716b62', fontSize: 11, lineHeight: 1.45 }}>{it.note}</div> : null}
                      </div>
                    )
                  })}
                </div>

                {/* Что проверено автоматически и что недоступно */}
                <div style={{ marginTop: 14, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  {extras?.autoChecks?.length ? (
                    <div style={{ border: '1px solid #e2e8dc', borderRadius: 8, background: '#f6f8f3', padding: '10px 12px' }}>
                      <div style={{ ...sectionTitle, color: '#3f6b34' }}>Проверено автоматически</div>
                      {extras.autoChecks.map((line, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#4c5a44', padding: '1px 0', lineHeight: 1.45 }}>— {line}</div>
                      ))}
                    </div>
                  ) : null}
                  {extras?.autoUnavailable?.length ? (
                    <div style={{ border: '1px solid #e8e0d2', borderRadius: 8, background: '#fbf7f0', padding: '10px 12px' }}>
                      <div style={{ ...sectionTitle, color: '#7a5a2e' }}>Автоматическая проверка недоступна</div>
                      {extras.autoUnavailable.map((line, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#7a6d5a', padding: '1px 0', lineHeight: 1.45 }}>— {line}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Риски и замечания */}
                {report.findings && report.findings.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={sectionTitle}>Найденные риски и замечания</div>
                    {report.findings.map((f, i) => {
                      const st = FINDING_STYLE[f.level] || FINDING_STYLE.info
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', fontSize: 12 }}>
                          <span style={{ flex: 0, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 9.5, whiteSpace: 'nowrap' }}>{st.label}</span>
                          <span style={{ color: '#25241f', lineHeight: 1.45 }}>{f.text} <span style={{ color: '#9b958a', fontSize: 10 }}>(проверка {f.itemKey})</span></span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Отсутствующие документы */}
                {report.missingDocs && report.missingDocs.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={sectionTitle}>Чего не хватает из документов</div>
                    {report.missingDocs.map((m, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#9b4e43', padding: '2px 0' }}>— {m}</div>
                    ))}
                  </div>
                )}

                {/* Рекомендации */}
                {report.recommendations && report.recommendations.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={sectionTitle}>Рекомендации</div>
                    {report.recommendations.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '2px 0', lineHeight: 1.45 }}>{i + 1}. {r}</div>
                    ))}
                  </div>
                )}

                {/* Источники и дата проверки */}
                {report.sources && report.sources.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={sectionTitle}>Источники и дата проверки</div>
                    <div style={{ fontSize: 11, color: '#716b62', padding: '1px 0' }}>
                      Проверка выполнена {fmtDate(report.checkedAt)}{report.checkedBy ? `, сотрудник: ${report.checkedBy}` : ''}
                    </div>
                    {report.sources.map((s, i) => (
                      <div key={i} style={{ fontSize: 11, padding: '1px 0' }}>
                        — {s.name}{s.url ? (
                          <a href={s.url} target="_blank" rel="noopener" style={{ color: '#8d6b40' }}> ({s.url})</a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {/* Перечень загруженных документов */}
                <div style={{ marginTop: 12 }}>
                  <div style={sectionTitle}>Загруженные документы (перечень)</div>
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

                <p style={{ margin: '14px 0 0', fontSize: 10.5, color: '#9b958a', lineHeight: 1.5 }}>
                  Отчёт сформирован системой и носит предварительный характер: он фиксирует результаты
                  проверок и не заменяет заключение юриста и официальные документы. В отчёте нет паспортных
                  данных, содержимого документов и подписей; клиентам он не показывается.
                </p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
