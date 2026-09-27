// Загрузка JS API Яндекс.Карт — общий модуль для всех карт приложения:
// карта объекта на витрине (ObjectMap) и карта с меткой в форме CRM.
// Типов Яндекса не установлено; достаточно `any` для изолированного модуля.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ymaps = any

const LOAD_TIMEOUT_MS = 15_000

let ymapsPromise: Promise<Ymaps> | null = null

export function loadYmaps(apiKey: string): Promise<Ymaps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  const win = window as unknown as { ymaps?: Ymaps }

  // Уже загружен в этой сессии — возвращаем сразу.
  if (win.ymaps?.ready) {
    ymapsPromise = Promise.resolve(win.ymaps)
    return ymapsPromise
  }

  if (!ymapsPromise) {
    ymapsPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ymapsPromise = null
        reject(new Error('ymaps ready timeout'))
      }, LOAD_TIMEOUT_MS)

      const script = document.createElement('script')
      // Placemark — метка карты в форме объекта CRM (точку ставит агент).
      // Circle — примерная область объекта на публичных картах: вместо метки
      // показывается круг, в котором объект находится (см.
      // src/lib/object-approx-point.ts). Модуль перечислен здесь один раз на
      // всё приложение: список загрузки фиксируется первым вызовом loadYmaps.
      // geoObject.addon.balloon — облачко области: в список модулей по
      // умолчанию он не входит, и без него у круга нет свойства balloon —
      // нажатие на область ничего не открывает. Список объектов области в
      // облачке собирает и открывает CatalogMap
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU&load=Map,Placemark,Circle,geocode,control.ZoomControl,geoObject.addon.balloon`
      script.async = true
      script.onload = () => {
        if (win.ymaps?.ready) {
          win.ymaps.ready(() => {
            clearTimeout(timer)
            resolve(win.ymaps)
          })
        } else {
          clearTimeout(timer)
          resolve(win.ymaps)
        }
      }
      script.onerror = () => {
        clearTimeout(timer)
        ymapsPromise = null
        reject(new Error('ymaps script failed'))
      }
      document.head.appendChild(script)
    })
  }
  return ymapsPromise
}
