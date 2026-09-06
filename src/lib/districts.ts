// Районы Северной Осетии — единый справочник: лендинг, фильтр каталога,
// схема объектов (address.district) и форма CRM. Значения — как в базе.

// Владикавказский городской округ — единственное место садовых товариществ:
// СНТ/СНО/ДНТ не относятся к районам республики и живут только внутри округа
export const VLAV_OKRUG = 'Владикавказский городской округ'

export const DISTRICT_OPTIONS = [
  VLAV_OKRUG,
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
// и выбора в форме объекта); садовые товарищества — для их категорий
// СНТ/СНО/ДНТ (см. GARDENING_AREAS ниже)
import { COUNTRY_AREAS, SNT_AREAS } from '@/components/home/landing-data'

// Район → его населённые пункты (каскадный фильтр: пункты зависят от района)
export const LOCALITIES_BY_DISTRICT: Record<string, string[]> = Object.fromEntries(
  COUNTRY_AREAS.map((a) => [a.district, a.places.split(' · ').map((p) => p.trim())]),
)

export const LOCALITY_OPTIONS = Array.from(
  new Set(COUNTRY_AREAS.flatMap((a) => a.places.split(' · ').map((p) => p.trim()))),
).sort()

// Садоводческие товарищества Владикавказа — категории для навигации
// (подраздел лендинга, фильтр каталога, выбор в форме CRM). Категорию
// товарищества определяем по организационно-правовой форме из названия
// (первые буквы до пробела): «СТ …» — прежнее наименование садоводческого
// товарищества, сейчас это форма СНТ, поэтому относим её к «СНТ». ДНТ в
// общем справочнике SNT_AREAS пока нет — категория наполнится сама, как
// только появится товарищество с формой «ДНТ».
const SNT_FORM_TO_CATEGORY: Record<string, string> = {
  СТ: 'СНТ',
  СНТ: 'СНТ',
  СНО: 'СНО',
  ДНТ: 'ДНТ',
}

// Порядок категорий в подразделе и фильтрах
export const GARDENING_CATEGORY_ORDER = ['СНТ', 'СНО', 'ДНТ'] as const
export type GardeningCategory = (typeof GARDENING_CATEGORY_ORDER)[number]

// Категория → её товарищества (в порядке общего справочника SNT_AREAS)
export const GARDENING_AREAS = Object.fromEntries(
  GARDENING_CATEGORY_ORDER.map((c) => [c, [] as string[]]),
) as Record<GardeningCategory, string[]>

for (const snt of SNT_AREAS) {
  const category = SNT_FORM_TO_CATEGORY[snt.split(' ')[0]]
  if (category) GARDENING_AREAS[category as GardeningCategory].push(snt)
}
