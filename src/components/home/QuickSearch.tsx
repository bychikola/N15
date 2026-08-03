'use client'

import { useState, type FC } from 'react'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/i18n/i18n-provider'

export const QuickSearch: FC = () => {
  const { lang, t } = useI18n()
  const [dealType, setDealType] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')

  const dealTypes = [
    { value: '', label: t.search.dealType },
    { value: 'sale', label: t.search.sale },
    { value: 'rent', label: t.search.rent },
  ]

  const categories = [
    { value: '', label: t.search.category },
    { value: 'apartment', label: t.search.apartment },
    { value: 'house', label: t.search.house },
    { value: 'townhouse', label: t.search.townhouse },
    { value: 'commercial', label: t.search.commercial },
    { value: 'land', label: t.search.land },
  ]

  const cities = [
    { value: '', label: t.search.city },
    { value: 'vladikavkaz', label: t.search.vladikavkaz },
    { value: 'beslan', label: t.search.beslan },
    { value: 'mozdok', label: t.search.mozdok },
    { value: 'alagir', label: t.search.alagir },
    { value: 'ardon', label: t.search.ardon },
  ]

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (dealType) params.set('type', dealType)
    if (category) params.set('category', category)
    if (city) params.set('city', city)
    return `/${lang}/catalog?${params.toString()}`
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
        {t.search.find}
      </Button>
    </div>
  )
}
