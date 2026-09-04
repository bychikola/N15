// Сортировка агентов по фамилии.
//
// В БД имя агента хранится одной строкой в формате «Имя Фамилия» (иногда
// только имя). Фамилией считаем последнее слово: именно по ней ведётся
// алфавитный порядок во всех разделах — на сайте (страница агентов, блок
// команды на «Об агентстве») и в CRM (фильтры, отчёты, чаты).
// Пустые и сортировка без имени уходят в конец.

export function agentSurname(name?: string | null): string {
  const trimmed = (name || '').trim()
  const words = trimmed.split(/\s+/)
  return words.length > 1 ? words[words.length - 1] : trimmed
}

export function compareAgents(a: { name?: string | null }, b: { name?: string | null }): number {
  const ka = agentSurname(a.name)
  const kb = agentSurname(b.name)
  // localeCompare('ru'): кириллица, «е»/«ё» считаются равными
  const bySurname = ka.localeCompare(kb, 'ru')
  if (bySurname !== 0) return bySurname
  // Одинаковые фамилии — по полному имени
  return (a.name || '').trim().localeCompare((b.name || '').trim(), 'ru')
}

export function sortAgents<T extends { name?: string | null }>(list: T[]): T[] {
  return [...list].sort(compareAgents)
}
