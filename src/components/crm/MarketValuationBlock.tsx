'use client'

// ---------------------------------------------------------------------------
// Блок «Оценка по рынку» в CRM — открывается кнопкой карточки объекта
// (см. CrmObjects), доступен только администратору.
//
// Считает сервер (маршрут /api/objects/market-valuation, движок
// src/lib/market-valuation.ts): базовая ставка — по фактическим объявлениям
// «Парсера рынка», поправки — по параметрам объекта (адрес и район, тип,
// площадь, комнаты, этаж и этажность, состояние, земельный участок дома).
// Отчёт-снимок хранится в самом объекте (valuation.marketRun) и показывается
// при следующем открытии карточки.
//
// Блок показывает примерный ценовой диапазон, найденные аналоги, дату расчёта
// и обязательное предупреждение: это предварительная рыночная оценка агентства,
// а не отчёт об оценке и не официальное заключение (см. MARKET_WARNING).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import { MARKET_WARNING, type MarketValuationReport } from '@/lib/market-valuation'
import { formatMoney } from '@/lib/valuation'

const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU')
}

const fmtSqm = (v: number): string => `${new Intl.NumberFormat('ru-RU').format(Math.round(v * 10) / 10)} м²`

export const MarketValuationBlock: FC<{
  objectId: number
  objectTitle?: string
  /** Последний сохранённый расчёт (valuation.marketRun из карточки объекта) */
  initial?: MarketValuationReport | null
  /**
   * Запустить расчёт сразу при открытии — блок открывают кнопкой карточки
   * «Провести оценку по рынку», то есть сотрудник уже попросил расчёт
   */
  autoRun?: boolean
  onClose: () => void
}> = ({ objectId, objectTitle, initial, autoRun, onClose }) => {
  const [report, setReport] = useState<MarketValuationReport | null>(initial || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Запуск расчёта: сервер собирает объект и объявления рынка, отчёт сохраняет */
  const run = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/objects/market-valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ objectId }),
      })
      const data = (await res.json()) as { ok?: boolean; report?: MarketValuationReport; error?: string }
      if (!res.ok || !data.ok || !data.report) throw new Error(data.error || 'Не удалось выполнить оценку')
      setReport(data.report)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, objectId])

  // Автозапуск ровно один раз на открытие блока
  const autoRan = useRef(false)
  useEffect(() => {
    if (!autoRun || autoRan.current) return
    autoRan.current = true
    void run()
  }, [autoRun, run])

  const goldBtn: React.CSSProperties = {
    border: 0,
    borderRadius: 7,
    background: busy ? '#c9b894' : '#a7814e',
    color: '#fff',
    padding: '11px 16px',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    cursor: busy ? 'default' : 'pointer',
  }
  const card: React.CSSProperties = { marginTop: 14, border: '1px solid #ded5c7', borderRadius: 10, background: '#fff', padding: 16 }
  const sectionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 12, marginBottom: 6 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 22 }}>
            Оценка по рынку
          </h2>
          <p style={{ margin: '4px 0 0', color: '#817b70', fontSize: 12 }}>
            {objectTitle ? `${objectTitle} · ` : ''}Объект №{objectId} · внутренний расчёт Н15
          </p>
        </div>
        <button type="button" onClick={onClose}
          style={{ border: '1px solid #e1d8ca', borderRadius: 7, background: '#fff', color: '#716b62', padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}>
          ✕
        </button>
      </div>

      {/* Обязательное предупреждение — в блоке и в сохранённом отчёте */}
      <div style={{ marginTop: 12, border: '1px solid #d9b98c', borderRadius: 8, background: '#fbf3e6', padding: '10px 14px', fontSize: 12, color: '#7a5a2e', lineHeight: 1.5 }}>
        {MARKET_WARNING}
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void run()} disabled={busy} style={goldBtn}>
          {busy ? 'Считаем…' : report ? 'Обновить расчёт' : 'Провести оценку по рынку'}
        </button>
        {report && (
          <span style={{ fontSize: 11, color: '#817b70' }}>
            Расчёт от {fmtDateTime(report.checkedAt)}{report.checkedBy ? ` · ${report.checkedBy}` : ''}
          </span>
        )}
        {error && <span style={{ color: '#9b4e43', fontSize: 11 }}>{error}</span>}
      </div>

      {!report ? (
        <p style={{ marginTop: 14, fontSize: 12, color: '#817b70', lineHeight: 1.55 }}>
          Расчёт берёт карточку объекта и фактические объявления из «Парсера рынка»: похожие по адресу,
          площади, комнатам и цене предложения, — и показывает примерный диапазон цены. Аналогов в базе
          нет — считаем по справочным ставкам Н15 и говорим об этом прямо.
        </p>
      ) : (
        <>
          {/* ---------- Примерный ценовой диапазон ---------- */}
          <div style={{ ...card, background: '#faf8f4' }}>
            <div style={{ fontSize: 10, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Примерный ценовой диапазон
            </div>
            <div style={{ marginTop: 2, fontFamily: "'New Standard', Georgia, serif", fontWeight: 400, fontSize: 30, color: '#25241f' }}>
              {formatMoney(report.estimate)}
            </div>
            {report.estimateMin != null && report.estimateMax != null && (
              <div style={{ marginTop: 2, fontSize: 13, color: '#716b62' }}>
                от {formatMoney(report.estimateMin)} до {formatMoney(report.estimateMax)}
                <span style={{ color: '#9b958a' }}> · ±{report.spreadPct}%</span>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#716b62', lineHeight: 1.6 }}>
              <div>
                {report.categoryLabel}, {report.dealLabel.toLowerCase()}
                {report.address ? ` · ${report.address}` : ' · адрес не заполнен'}
              </div>
              {report.perUnit != null && report.unitLabel && (
                <div>
                  Рыночная ставка с поправками: {formatMoney(report.perUnit)} за {report.unitLabel}
                  {report.referencePerUnit != null ? ` · справочная Н15: ${formatMoney(report.referencePerUnit)}` : ''}
                </div>
              )}
              {report.pricePerUnit != null && (
                <div>Цена объекта в карточке: {formatMoney(report.pricePerUnit)} за {report.unitLabel}</div>
              )}
              <div style={{ color: '#8d6b40' }}>
                Базовая ставка: {report.baseSource === 'listings'
                  ? `по ${report.analoguesCount} фактическим объявлениям рынка`
                  : 'справочные ставки Н15 (аналогов в базе рынка недостаточно)'}
              </div>
              <div>{report.method}</div>
            </div>
          </div>

          {/* ---------- Что учтено в расчёте ---------- */}
          <div style={card}>
            <div style={sectionTitle}>Что учтено в расчёте</div>
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {report.inputs.map((row) => (
                <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5 }}>
                  <span style={{ flex: 1, color: '#716b62' }}>{row.label}</span>
                  <span style={{ color: row.ok ? '#25241f' : '#9b958a', textAlign: 'right' }}>{row.value}</span>
                </div>
              ))}
            </div>
            {report.missing.length > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#a1661f', lineHeight: 1.5 }}>
                Для более точного расчёта заполните: {report.missing.join(', ')}.
              </p>
            )}
          </div>

          {/* ---------- Найденные аналоги ---------- */}
          <div style={card}>
            <div style={sectionTitle}>Найденные аналоги — фактические предложения рынка</div>
            {report.analogues.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: '#817b70', lineHeight: 1.55 }}>
                Аналогов в базе «Парсера рынка» нет. Добавьте ссылки на похожие объявления в разделе
                «Парсер рынка» — расчёт станет точнее и перестанет опираться на справочные ставки.
              </p>
            ) : (
              <div style={{ border: '1px solid #e5dfd3', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, padding: '7px 10px', background: '#f7f4ee', fontSize: 9.5, color: '#817b70', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <span style={{ flex: 1 }}>Объявление</span>
                  <span style={{ width: 110, textAlign: 'right' }}>Цена</span>
                  <span style={{ width: 92, textAlign: 'right' }}>Площадь</span>
                  <span style={{ width: 116, textAlign: 'right' }}>За {report.unitLabel || 'единицу'}</span>
                  <span style={{ width: 96, textAlign: 'right' }}>Отклонение</span>
                  <span style={{ width: 74, textAlign: 'right' }}>Похожесть</span>
                </div>
                {report.analogues.map((a, idx) => (
                  <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 10px', borderTop: idx ? '1px solid #f0ebe2' : 0, fontSize: 11.5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: '#f2eadf', color: '#8d6b40', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          {a.platformName}
                        </span>
                        {a.sameObject && (
                          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: '#e8e4dc', color: '#716b62' }}>
                            связан с этим объектом · в ставку не взят
                          </span>
                        )}
                        {/* Аналогов меньше трёх — движок не берёт их базовой
                            ставкой (см. valuation.ts), они показаны как ориентиры */}
                        {!a.sameObject && report.analoguesCount < 3 && (
                          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: '#e8e4dc', color: '#716b62' }}>
                            ориентир, не в базовой ставке
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#25241f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title || a.address || 'объявление без названия'}
                      </div>
                      <div style={{ color: '#9b958a', fontSize: 10 }}>
                        {a.address}{a.rooms ? ` · ${a.rooms} комн.` : ''}
                        {a.seenAt ? ` · в базе с ${fmtDate(a.seenAt)}` : ''}
                        {a.matchedLabels.length ? ` · совпало: ${a.matchedLabels.join(', ')}` : ''}
                      </div>
                    </div>
                    <span style={{ width: 110, textAlign: 'right', color: '#25241f', whiteSpace: 'nowrap' }}>{formatMoney(a.price)}</span>
                    <span style={{ width: 92, textAlign: 'right', color: '#716b62', whiteSpace: 'nowrap' }}>{fmtSqm(a.area)}</span>
                    <span style={{ width: 116, textAlign: 'right', color: '#716b62', whiteSpace: 'nowrap' }}>{formatMoney(a.perUnit)}</span>
                    <span style={{ width: 96, textAlign: 'right', whiteSpace: 'nowrap', color: a.diffPct == null ? '#9b958a' : a.diffPct > 0 ? '#9b4e43' : '#3f6b34' }}>
                      {a.diffPct == null ? '—' : `${a.diffPct > 0 ? '+' : ''}${a.diffPct}%`}
                    </span>
                    <span style={{ width: 74, textAlign: 'right', color: '#716b62', whiteSpace: 'nowrap' }}>{a.match}%</span>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener" style={{ border: '1px solid #e1d8ca', borderRadius: 6, background: '#fff', color: '#716b62', padding: '5px 8px', fontSize: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Открыть
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {report.sameObjectCount > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9b958a', lineHeight: 1.5 }}>
                Объявления, уже связанные с этим объектом ({report.sameObjectCount} шт.): это тот же лот,
                в базовую ставку они не берутся — иначе оценка считалась бы от собственной цены.
              </p>
            )}
          </div>

          {/* ---------- Как считали и чего не хватает ---------- */}
          {(report.takenIntoAccount.length > 0 || report.notes.length > 0) && (
            <div style={card}>
              {report.takenIntoAccount.length > 0 && (
                <>
                  <div style={sectionTitle}>Учтённые параметры объекта</div>
                  <div style={{ fontSize: 11.5, color: '#716b62', lineHeight: 1.6 }}>
                    {report.takenIntoAccount.join(' · ')}
                  </div>
                </>
              )}
              {report.notes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={sectionTitle}>Примечания расчёта</div>
                  {report.notes.map((n, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: '#716b62', padding: '1px 0', lineHeight: 1.5 }}>— {n}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p style={{ margin: '14px 0 0', fontSize: 10.5, color: '#9b958a', lineHeight: 1.5 }}>
            Расчёт выполнен {fmtDateTime(report.checkedAt)}{report.checkedBy ? `, сотрудник: ${report.checkedBy}` : ''}.
            Оценка предварительная и ориентировочная: она не заменяет осмотр объекта и заключение оценщика,
            в отчёте нет официальной методики и подписи оценщика.
          </p>
        </>
      )}
    </div>
  )
}
