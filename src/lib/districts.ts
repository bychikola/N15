// Районы Северной Осетии — единый справочник: лендинг, фильтр каталога,
// схема объектов (address.district) и форма CRM. Значения — как в базе.
export const DISTRICT_OPTIONS = [
  'Владикавказский городской округ',
  'Алагирский район',
  'Ардонский район',
  'Дигорский район',
  'Ирафский район',
  'Кировский район',
  'Моздокский район',
  'Правобережный район',
  'Пригородный район',
]

// Районы Владикавказа (внутригородские) — отдельный справочник от районов
// республики (address.district): поле address.cityDistrict в схеме объектов,
// форме CRM и фильтре каталога. Значения — как в базе.
export const CITY_DISTRICT_OPTIONS = [
  'Северо-Западный',
  'Иристонский',
  'Промышленный',
  'Затеречный',
]

// Все населённые пункты республики (для фильтра «Населённый пункт»
// и выбора в форме объекта)
import { COUNTRY_AREAS } from '@/components/home/landing-data'

// Район → его населённые пункты (каскадный фильтр: пункты зависят от района)
export const LOCALITIES_BY_DISTRICT: Record<string, string[]> = Object.fromEntries(
  COUNTRY_AREAS.map((a) => [a.district, a.places.split(' · ').map((p) => p.trim())]),
)

export const LOCALITY_OPTIONS = Array.from(
  new Set(COUNTRY_AREAS.flatMap((a) => a.places.split(' · ').map((p) => p.trim()))),
).sort()
