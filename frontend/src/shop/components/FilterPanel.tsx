import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Brand, Gender, ProductFilters, TypeRef } from '../types'

interface FilterPanelProps {
  filters: ProductFilters
  types: TypeRef[]
  brands: Brand[]
  onChange: (patch: Partial<ProductFilters>) => void
  idPrefix: string
  hideSearch?: boolean
}

function Choice({ name, checked, label, onSelect }: { name: string; checked: boolean; label: string; onSelect: () => void }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[0.95rem] hover:bg-secondary/70 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', checked && 'font-medium text-primary')}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  )
}

/** Filters shared by the desktop sidebar and the mobile sheet. Every change is written to the URL by the parent. */
export function FilterPanel({ filters, types, brands, onChange, idPrefix, hideSearch }: FilterPanelProps) {
  const { t } = useTranslation()
  const [q, setQ] = useState(filters.q ?? '')
  const [min, setMin] = useState(filters.min_price?.toString() ?? '')
  const [max, setMax] = useState(filters.max_price?.toString() ?? '')

  // Keep the fields in step when the URL changes elsewhere (chips, reset, back button).
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  useEffect(() => setMin(filters.min_price?.toString() ?? ''), [filters.min_price])
  useEffect(() => setMax(filters.max_price?.toString() ?? ''), [filters.max_price])

  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.max(0, Math.round(Number(v))))
  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    onChange({ q: q.trim() || undefined })
  }
  const commitPrice = () => onChange({ min_price: num(min), max_price: num(max) })

  const genders: (Gender | undefined)[] = [undefined, 'homme', 'femme', 'mixte']

  return (
    <div className="space-y-8">
      <form onSubmit={submitSearch} role="search" className={hideSearch ? 'hidden' : undefined}>
        <label htmlFor={`${idPrefix}-q`} className="mb-2 block font-display text-lg">
          {t('shopPage.search')}
        </label>
        <Input id={`${idPrefix}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (filters.q ?? '') && onChange({ q: q.trim() || undefined })} placeholder={t('nav.searchPlaceholder')} className="h-10 text-base" />
      </form>

      <fieldset>
        <legend className="mb-2 font-display text-lg">{t('shopPage.type')}</legend>
        <Choice name={`${idPrefix}-type`} checked={!filters.type} label={t('shopPage.allTypes')} onSelect={() => onChange({ type: undefined })} />
        {types.map((type) => (
          <Choice key={type.id} name={`${idPrefix}-type`} checked={filters.type === type.slug} label={type.name} onSelect={() => onChange({ type: type.slug })} />
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-display text-lg">{t('shopPage.gender')}</legend>
        {genders.map((g) => (
          <Choice key={g ?? 'all'} name={`${idPrefix}-gender`} checked={filters.gender === g} label={g ? t(`shopPage.genders.${g}`) : t('shopPage.anyGender')} onSelect={() => onChange({ gender: g })} />
        ))}
      </fieldset>

      {brands.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-brand`} className="mb-2 block font-display text-lg">
            {t('shopPage.brand')}
          </label>
          <select
            id={`${idPrefix}-brand`}
            value={filters.brand ?? ''}
            onChange={(e) => onChange({ brand: e.target.value || undefined })}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-[0.95rem] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            <option value="">{t('shopPage.allBrands')}</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend className="mb-2 font-display text-lg">{t('shopPage.price')}</legend>
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="numeric" min={0} value={min} onChange={(e) => setMin(e.target.value)} onBlur={commitPrice} onKeyDown={(e) => e.key === 'Enter' && commitPrice()} placeholder={t('shopPage.min')} aria-label={t('shopPage.min')} className="h-10 text-base" />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <Input type="number" inputMode="numeric" min={0} value={max} onChange={(e) => setMax(e.target.value)} onBlur={commitPrice} onKeyDown={(e) => e.key === 'Enter' && commitPrice()} placeholder={t('shopPage.max')} aria-label={t('shopPage.max')} className="h-10 text-base" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t('shopPage.priceHint')}</p>
      </fieldset>
    </div>
  )
}
