'use client'

import { useState, type FormEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { SectionWrapper } from '@/components/ui/SectionWrapper'
import { Button } from '@/components/ui/Button'
import { OrnamentBorder } from '@/components/ui/OrnamentBorder'

export default function AdminAddPage() {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'sale' | 'rent'>('sale')
  const [category, setCategory] = useState('apartment')
  const [price, setPrice] = useState('')
  const [area, setArea] = useState('')
  const [rooms, setRooms] = useState('')
  const [street, setStreet] = useState('')
  const [house, setHouse] = useState('')
  const [features, setFeatures] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      let primaryImageId: number | null = null

      // 1. Upload photo if selected
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('alt', title)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()
        if (uploadData?.doc?.id) {
          primaryImageId = uploadData.doc.id
        }
      }

      // 2. Create object
      const objectData: Record<string, unknown> = {
        title,
        type,
        category,
        price: parseInt(price),
        area: area ? parseFloat(area) : undefined,
        rooms: rooms ? parseInt(rooms) : undefined,
        status: 'published',
        isPremium,
        address: {
          city: 'Владикавказ',
          street,
          house,
        },
        features: features.split('\n').filter(Boolean).map((f) => ({ feature: f.trim() })),
      }
      if (primaryImageId) objectData.primaryImage = primaryImageId

      const res = await fetch('/api/create-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectData),
      })
      const data = await res.json()
      if (data?.doc?.id) {
        setResult(`Объект создан! ID: ${data.doc.id}${primaryImageId ? ', фото загружено' : ''}`)
        setTitle(''); setPrice(''); setArea(''); setRooms(''); setStreet(''); setHouse(''); setFeatures(''); setFile(null)
      } else {
        setResult('Ошибка: ' + JSON.stringify(data))
      }
    } catch (err) {
      setResult('Ошибка: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-[var(--n15-black)] border border-[var(--n15-gold)]/20 px-4 py-2.5 text-sm text-[var(--n15-silver)] focus:outline-none focus:border-[var(--n15-gold)]/50'

  return (
    <>
      <Header />
      <main className="pt-20 min-h-screen">
        <SectionWrapper variant="dark">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-[family-name:var(--font-display)] text-[var(--n15-white)] mb-2">Быстрое добавление объекта</h1>
            <p className="text-[var(--n15-muted)] text-sm mb-8">Заполни форму — объект появится на сайте сразу с фото</p>

            <OrnamentBorder>
              <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                {result && <p className={`text-sm ${result.includes('Ошибка') ? 'text-red-400' : 'text-green-400'}`}>{result}</p>}

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Название *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} required className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Тип</label>
                    <select value={type} onChange={e => setType(e.target.value as 'sale' | 'rent')} className={inputClass}>
                      <option value="sale">Продажа</option>
                      <option value="rent">Аренда</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Категория</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                      <option value="apartment">Квартира</option>
                      <option value="house">Дом</option>
                      <option value="townhouse">Таунхаус</option>
                      <option value="commercial">Коммерческая</option>
                      <option value="land">Участок</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Цена (₽) *</label>
                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} required className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Площадь м²</label>
                    <input type="number" value={area} onChange={e => setArea(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Комнат</label>
                    <input type="number" value={rooms} onChange={e => setRooms(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Улица</label>
                    <input value={street} onChange={e => setStreet(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Дом</label>
                    <input value={house} onChange={e => setHouse(e.target.value)} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Особенности (по одной на строку)</label>
                  <textarea value={features} onChange={e => setFeatures(e.target.value)} rows={3} className={inputClass + ' resize-none'} />
                </div>

                <div>
                  <label className="text-xs tracking-wider uppercase text-[var(--n15-muted)] block mb-1">Фото</label>
                  <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} className={inputClass} />
                </div>

                <label className="flex items-center gap-2 text-sm text-[var(--n15-silver)] cursor-pointer">
                  <input type="checkbox" checked={isPremium} onChange={e => setIsPremium(e.target.checked)} />
                  Премиум-объект
                </label>

                <Button variant="primary" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'Создание...' : 'Создать объект'}
                </Button>
              </form>
            </OrnamentBorder>
          </div>
        </SectionWrapper>
      </main>
      <Footer />
    </>
  )
}
