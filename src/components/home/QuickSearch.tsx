'use client'

import { useState, type FC } from 'react'
import { Button } from '@/components/ui/Button'

const dealTypes = [
  { value: '', label: 'Тип сделки' },
  { value: 'sale', label: 'Продажа' },
  { value: 'rent', label: 'Аренда' },
]

const categories = [
  { value: '', label: 'Категория' },
  { value: 'apartment', label: 'Квартира' },
  { value: 'house', label: 'Дом' },
  { value: 'townhouse', label: 'Таунхаус' },
  { value: 'commercial', label: 'Коммерческая' },
  { value: 'land', label: 'Участок' },
]

const cities = [
  { value: '', label: 'Город' },
  { value: 'vladikavkaz', label: 'Владикавказ' },
  { value: 'beslan', label: 'Беслан' },
  { value: 'mozdok', label: 'Моздок' },
  { value: 'alagir', label: 'Алагир' },
  { value: 'ardon', label: 'Ардон' },
]

export const QuickSearch: FC = () => {
  const [dealType, setDealType] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (dealType) params.set('type', dealType)
    if (category) params.set('category', category)
    if (city) params.set('city', city)
    return `/catalog?${params.toString()}`
  }

  const selectClass = `
    bg-transparent border border-[var(--n15-gold)]/20 text-[var(--n15-silver)]
    px-4 py-3 text-sm focus:outline-none focus:border-[var(--n15-gold)]/50
    transition-colors duration-300
  `

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <select
        value={dealType}
        onChange={(e) => setDealType(e.target.value)}
        className={selectClass}
      >
        {dealTypes.map((t) => (
          <option key={t.value} value={t.value} className="bg-[var(--n15-charcoal)]">
            {t.label}
          </option>
        ))}
      </select>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className={selectClass}
      >
        {categories.map((c) => (
          <option key={c.value} value={c.value} className="bg-[var(--n15-charcoal)]">
            {c.label}
          </option>
        ))}
      </select>

      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className={selectClass}
      >
        {cities.map((c) => (
          <option key={c.value} value={c.value} className="bg-[var(--n15-charcoal)]">
            {c.label}
          </option>
        ))}
      </select>

      <Button variant="primary" href={buildUrl()}>
        Найти
      </Button>
    </div>
  )
}
