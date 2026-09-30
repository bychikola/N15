'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { CONSENT_EVENT, readConsent } from '@/lib/consent'

/**
 * Сниппет Яндекс.Метрики: появляется в DOM только при согласии посетителя
 * (см. YandexMetrika — серверный компонент читает cookie n15_consent и
 * передаёт готовый ответ сюда).
 *
 * Баннер может разрешить аналитику уже после загрузки страницы — тогда
 * слушаем CONSENT_EVENT и подключаем счётчик без перезагрузки. Обратно
 * скрипт не выгружается: если посетитель отозвал согласие в «Настройках
 * cookie», подвал перезагружает страницу (см. CookieSettingsButton).
 *
 * Пиксель для посетителей без JavaScript не выводим: без JavaScript
 * согласие получить негде, а до согласия счётчика быть не должно.
 */
export function MetrikaCounter({ counterId, initialAnalytics }: { counterId: number; initialAnalytics: boolean }) {
  const [allowed, setAllowed] = useState(initialAnalytics)

  useEffect(() => {
    const sync = () => setAllowed(readConsent()?.analytics === true)
    // Баннер мог изменить выбор до гидратации — сверяемся с cookie ещё раз
    sync()
    window.addEventListener(CONSENT_EVENT, sync)
    return () => window.removeEventListener(CONSENT_EVENT, sync)
  }, [])

  if (!allowed) return null

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

  // afterInteractive: страница и формы не ждут внешний скрипт. До согласия
  // счётчика нет вовсе, а после согласия визит не теряется — сниппет
  // выполняется сразу, как только его добавляет React
  return (
    <Script id="n15-yandex-metrika" strategy="afterInteractive">
      {snippet}
    </Script>
  )
}
