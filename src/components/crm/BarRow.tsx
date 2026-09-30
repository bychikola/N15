// Строка рейтинга в отчётах CRM: подпись, число, доля и полоска.
// Тот же вид, что в «Статистике сайта» (src/app/crm/site-stats): отчёты про
// посетителей должны читаться так же, как привычная статистика.
export function BarRow({
  value,
  share,
  note,
  children,
}: {
  value: string
  share: number
  note?: string
  children?: React.ReactNode
}) {
  return (
    <tr>
      <td>{children}</td>
      <td>
        {/* Полоска тянется по свободному месту и ужимается до 40px — на телефоне
            строка не выдавливает таблицу за край карточки */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ minWidth: 30, textAlign: 'right' }}>{value}</strong>
          <div style={{ flex: 1, minWidth: 40, maxWidth: 190, height: 8, borderRadius: 4, background: '#f2eadf', overflow: 'hidden' }}>
            {/* Совсем маленькие доли оставляем видимой полоской */}
            <div style={{ width: `${Math.min(100, share > 0 ? Math.max(share, 2) : 0)}%`, height: '100%', background: '#a7814e' }} />
          </div>
          <span style={{ fontSize: 10, color: '#817b70', minWidth: 30 }}>{share}%</span>
        </div>
        {note ? <div style={{ fontSize: 10, color: '#a09a8f', marginTop: 4 }}>{note}</div> : null}
      </td>
    </tr>
  )
}
