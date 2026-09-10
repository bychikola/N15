/**
 * Серверный таймер автоматической проверки площадок (модуль «Где размещён
 * объект»). Запускается один раз при старте Node-сервера (next start) и
 * каждый SWEEP_INTERVAL_MINUTES прогоняет объекты с наступившим сроком
 * проверки (runPlacementsSweep — идемпотентен и ограничен по числу объектов
 * за проход).
 *
 * Файл импортирует только серверные маршруты — в клиентский бандл не попадает.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // В dev-режиме проверки запускает открытая страница CRM (см. CrmObjects);
  // фоновый таймер — только в production-сервере, чтобы не мешать разработке
  if (process.env.NODE_ENV !== 'production') return

  const { SWEEP_INTERVAL_MINUTES } = await import('@/lib/listing-check')
  const intervalMs = SWEEP_INTERVAL_MINUTES * 60_000

  const run = async () => {
    try {
      const { getPayload } = await import('payload')
      const config = (await import('@payload-config')).default
      const { runPlacementsSweep } = await import('@/lib/placements-service')
      const payload = await getPayload({ config })
      const { checked } = await runPlacementsSweep(payload, 10)
      if (checked > 0) {
        console.log(`[placements] фоновая проверка: обработано объектов — ${checked}`)
      }
    } catch (e) {
      console.error('[placements] фоновая проверка не удалась:', e)
    }
  }

  // Первый проход — вскоре после старта (сервер мог быть перезапущен давно)
  setTimeout(() => void run(), 60_000)
  setInterval(() => void run(), intervalMs)

  // --- «Новости на проверку» (см. src/lib/news.ts) ---------------------------
  // Тот же принцип: таймер читает открытые RSS-каналы официальных источников
  // и складывает новости в очередь CRM. Публикации здесь нет — в блог новость
  // попадает только после подтверждения сотрудника.
  const { NEWS_CHECK_INTERVAL_MINUTES } = await import('@/lib/news')
  const newsRun = async () => {
    try {
      const { getPayload } = await import('payload')
      const config = (await import('@payload-config')).default
      const { runNewsSweep } = await import('@/lib/news-service')
      const payload = await getPayload({ config })
      const result = await runNewsSweep(payload)
      if (result.ok && !result.disabled && !result.busy) {
        console.log(
          `[news] проверка источников: добавлено ${result.added}, пропущено ${result.skipped}, удалено ${result.removed + result.duplicates}`,
        )
      }
    } catch (e) {
      console.error('[news] проверка источников не удалась:', e)
    }
  }

  // Первый проход — через минуту после старта, дальше по расписанию
  setTimeout(() => void newsRun(), 90_000)
  setInterval(() => void newsRun(), NEWS_CHECK_INTERVAL_MINUTES * 60_000)
}
