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
}
