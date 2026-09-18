import Script from 'next/script'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Счётчик Яндекс.Метрики — подключается на всех страницах публичного сайта
 * и в CRM (оба корневых layout'а).
 *
 * Номер счётчика берётся из настроек сайта (CRM → Настройки сайта →
 * «Аналитика: номер счётчика Яндекс.Метрики»). Пустое поле — счётчик не
 * подключён, в HTML не добавляется ничего; номер меняется без правки кода.
 *
 * Вебвизор выключен намеренно: он записывает содержимое форм, а имена,
 * телефоны и тексты сообщений в Метрику попадать не должны. Уходят только
 * адрес страницы, обезличенные данные о посетителе и имена целей
 * (src/lib/metrika.ts).
 */
export async function YandexMetrika() {
  const counterId = await metrikaCounterId()
  if (!counterId) return null

  // Стандартный сниппет Метрики: загружает tag.js и инициализирует счётчик.
  // Строка с __n15MetrikaId нужна helper'у целей — по ней он находит номер
  // счётчика и не отправляет цели, пока счётчика на странице нет.
  const snippet = `
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
window.__n15MetrikaId = ${counterId};
ym(${counterId}, "init", {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false});
`

  return (
    <>
      {/* beforeInteractive: сниппет попадает прямо в HTML страницы (виден в
          исходном коде) и выполняется до гидратации — визит не теряется,
          если посетитель ушёл раньше загрузки React */}
      <Script id="n15-yandex-metrika" strategy="beforeInteractive">
        {snippet}
      </Script>
      {/* Посетители без JavaScript: счётчик учитывает визит картинкой-пикселем */}
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${counterId}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}

/** Номер счётчика из настроек сайта: только цифры, пусто — аналитика выключена */
async function metrikaCounterId(): Promise<number | null> {
  try {
    const payload = await getPayload({ config })
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    const raw = (settings as unknown as { metrikaId?: string | null }).metrikaId
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return null
    const id = Number(digits)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    // База недоступна — страница важнее счётчика, аналитика просто не подключится
    return null
  }
}
