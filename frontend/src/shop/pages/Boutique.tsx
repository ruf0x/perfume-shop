import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FilterPanel } from '../components/FilterPanel'
import { Pager } from '../components/Pager'
import { ProductGrid } from '../components/ProductGrid'
import { bigButton } from '../components/ui'
import { useBrands, usePagedProducts, useProductTypes } from '../queries'

import type { Gender, ProductFilters } from '../types'
import { useDocumentTitle } from '../useDocumentTitle'

const SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const

const toInt = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined)

/** The catalogue. Every filter lives in the URL, so a filtered view can be shared and the back button works. */
export default function Boutique() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState(false)
  const productTypes = useProductTypes()
  const brands = useBrands(params.get('rayon') || undefined)

  const filters: ProductFilters = useMemo(
    () => ({
      q: params.get('q') || undefined,
      type: params.get('type') || undefined,
      brand: params.get('brand') || undefined,
      gender: (['homme', 'femme', 'mixte'] as const).find((g) => g === params.get('gender')),
      min_price: toInt(params.get('min_price')),
      max_price: toInt(params.get('max_price')),
      sort: SORTS.find((s) => s === params.get('sort')),
      rayon: params.get('rayon') || undefined,
    }),
    [params],
  )

  const setFilters = (patch: Partial<ProductFilters>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('page') // a new search starts again on page 1
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined || value === '') next.delete(key)
          else next.set(key, String(value))
        }
        return next
      },
      { replace: true },
    )

  const page = toInt(params.get('page')) ?? 1
  const query = usePagedProducts({ ...filters, kind: 'perfume,standard' }, page)
  const items = query.data?.data ?? []
  const total = query.data?.meta.total ?? 0
  const goToPage = (n: number) => setParams((prev) => { const next = new URLSearchParams(prev); n > 1 ? next.set('page', String(n)) : next.delete('page'); return next }, { replace: true })

  const [term, setTerm] = useState(filters.q ?? '')
  useEffect(() => setTerm(filters.q ?? ''), [filters.q])
  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    setFilters({ q: term.trim() || undefined })
  }

  const selectedType = productTypes.data?.find((x) => x.slug === filters.rayon)
  const categories = selectedType ? selectedType.categories : (productTypes.data ?? []).flatMap((pt) => pt.categories)
  const typeName = categories.find((c) => c.slug === filters.type)?.name
  const kindTitle = selectedType?.name ?? null
  useDocumentTitle(typeName ?? kindTitle ?? t('meta.shop'), t('meta.shopDescription'))

  // Switching product type drops what belonged to the previous one (its category and brand, and the gender if the new type has none).
  const pickRayon = (slug: string | undefined) => {
    const next = productTypes.data?.find((x) => x.slug === slug)
    setFilters({ rayon: slug, type: undefined, brand: undefined, gender: !next || next.uses_gender ? filters.gender : undefined })
  }

  const chips: { key: keyof ProductFilters; label: string }[] = [
    filters.q ? { key: 'q', label: `« ${filters.q} »` } : null,
    typeName ? { key: 'type', label: typeName } : null,
    filters.gender ? { key: 'gender', label: t(`shopPage.genders.${filters.gender as Gender}`) } : null,
    filters.brand ? { key: 'brand', label: brands.data?.find((b) => b.slug === filters.brand)?.name ?? filters.brand } : null,
    filters.min_price !== undefined || filters.max_price !== undefined
      ? { key: 'min_price', label: t('shopPage.priceChip', { min: filters.min_price ?? 0, max: filters.max_price ?? '∞' }) }
      : null,
  ].filter((c): c is { key: keyof ProductFilters; label: string } => c !== null)

  const clearChip = (key: keyof ProductFilters) => setFilters(key === 'min_price' ? { min_price: undefined, max_price: undefined } : { [key]: undefined })
  const reset = () => setParams({}, { replace: true })

  const panel = (id: string) => <FilterPanel hideSearch={id === 'sheet'} idPrefix={id} filters={filters} productTypes={productTypes.data ?? []} brands={brands.data ?? []} onChange={setFilters} />

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:grid md:grid-cols-[230px_1fr] md:gap-x-12 md:py-14">
      {/* Starts at the very top and is never taller than the screen, so "Prix" is always in reach without scrolling the page. */}
      <aside className="hidden md:block" aria-label={t('shopPage.filters')}>
        <div className="sticky top-24 max-h-[calc(100svh-8.5rem)] overflow-y-auto overscroll-contain pr-1">{panel('side')}</div>
      </aside>

      <div className="min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl">{typeName ?? kindTitle ?? t('shopPage.title')}</h1>
          <p className="mt-2 text-muted-foreground" aria-live="polite">
            {query.isPending ? t('common.loading') : t('shopPage.count', { count: total })}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <form onSubmit={submitSearch} role="search" className="w-full md:hidden">
            <label className="relative block">
              <span className="sr-only">{t('nav.search')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('nav.searchPlaceholder')} className="h-11 w-full rounded-md border border-input bg-card pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
            </label>
          </form>
          <Button variant="outline" className={`${bigButton} md:hidden`} onClick={() => setSheet(true)}>
            <SlidersHorizontal className="size-4" aria-hidden />
            {t('shopPage.filters')}
            {chips.length > 0 && <span className="tnum ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{chips.length}</span>}
          </Button>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
            <span className="shrink-0 text-muted-foreground">{t('shopPage.sort')}</span>
            <select
              value={filters.sort ?? 'newest'}
              onChange={(e) => setFilters({ sort: e.target.value === 'newest' ? undefined : (e.target.value as ProductFilters['sort']) })}
              className="h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-[0.95rem] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`shopPage.sorts.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {(productTypes.data?.length ?? 0) > 1 && (
        <div role="group" aria-label={t('shopPage.kindLabel')} className="-mx-4 mt-6 flex overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="inline-flex rounded-md border border-input bg-card p-1">
            {[{ slug: undefined, name: t('shopPage.kinds.all') }, ...(productTypes.data ?? [])].map((pt) => (
              <button
                key={pt.slug ?? 'all'}
                type="button"
                onClick={() => pickRayon(pt.slug)}
                aria-pressed={filters.rayon === pt.slug}
                className={`h-10 shrink-0 rounded px-4 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring ${filters.rayon === pt.slug ? 'bg-primary font-medium text-primary-foreground' : 'text-foreground/80 hover:bg-secondary'}`}
              >
                {pt.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <ul className="mt-6 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <li key={c.key}>
              <button type="button" onClick={() => clearChip(c.key)} className="flex items-center gap-1.5 rounded-full bg-accent py-1.5 pr-2 pl-3.5 text-sm text-accent-foreground hover:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('shopPage.removeFilter', { label: c.label })}>
                {c.label}
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={reset} className="px-2 py-1.5 text-sm underline underline-offset-4 hover:no-underline">
              {t('shopPage.reset')}
            </button>
          </li>
        </ul>
      )}

      <div className="mt-10">
        <div>
          {query.isError ? (
            <div className="py-16">
              <p className="font-display text-2xl">{t('shopPage.error')}</p>
              <Button className={`${bigButton} mt-5`} onClick={() => query.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : !query.isPending && items.length === 0 ? (
            <div className="py-16">
              <p className="font-display text-2xl">{t('shopPage.empty')}</p>
              <p className="mt-2 text-muted-foreground">{t('shopPage.emptyHint')}</p>
              {chips.length > 0 && (
                <Button variant="outline" className={`${bigButton} mt-5`} onClick={reset}>
                  {t('shopPage.reset')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <ProductGrid products={items} loading={query.isPending} skeletons={9} className="md:grid-cols-2 lg:grid-cols-3" />
              <Pager page={query.data?.meta.current_page ?? page} lastPage={query.data?.meta.last_page ?? 1} total={total} onPage={goToPage} />
            </>
          )}
        </div>
      </div>

      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[88svh] gap-0 p-0">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle className="font-display text-xl">{t('shopPage.filters')}</SheetTitle>
            <SheetDescription className="sr-only">{t('shopPage.filters')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">{panel('sheet')}</div>
          <SheetFooter className="border-t border-border p-5">
            <Button className={`${bigButton} w-full`} onClick={() => setSheet(false)}>
              {t('shopPage.apply', { count: total })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
