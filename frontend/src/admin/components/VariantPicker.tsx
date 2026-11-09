import { Search } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatPrice } from '@/shop/format'
import { useAdminProducts } from '../queries'
import type { AdminProduct, AdminVariant } from '../types'
import { useDebounced } from '../useDebounced'
import { Loading, inputClass } from './common'

interface VariantPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (variant: AdminVariant, product: AdminProduct) => void
  /** Packs can be sold at the caisse, but a pack cannot contain a pack. */
  includePacks?: boolean
  /** Only these products / sizes are offered (e.g. sealed perfume flacons for a gift). */
  kind?: string
  variantFilter?: (variant: AdminVariant, product: AdminProduct) => boolean
  title?: string
}

/** Search a perfume or a cosmetic and choose one of its sizes / options. */
export function VariantPicker({ open, onOpenChange, onPick, includePacks, kind, variantFilter, title = 'Ajouter un article' }: VariantPickerProps) {
  const [term, setTerm] = useState('')
  const q = useDebounced(term)
  const { data, isPending } = useAdminProducts({ q: q || undefined, kind: kind ?? (includePacks ? undefined : 'perfume,standard'), active: true }, 8)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>Cherchez un produit, puis choisissez sa taille ou son option.</DialogDescription>
        </DialogHeader>

        <label className="relative block">
          <span className="sr-only">Rechercher un produit</span>
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input autoFocus type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nom ou marque" className={`${inputClass} ps-9`} />
        </label>

        {isPending ? (
          <Loading />
        ) : data?.data.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Aucun résultat.</p>
        ) : (
          <ul className="space-y-4">
            {data?.data.map((p) => (
              <li key={p.id}>
                <p className="font-display text-lg">
                  {p.name} {p.brand?.name && <span className="font-sans text-sm text-muted-foreground">{p.brand.name}</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.variants
                    ?.filter((v) => v.is_active && (!variantFilter || variantFilter(v, p)))
                    .map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          onPick(v, p)
                          onOpenChange(false)
                        }}
                        className="rounded-md border border-input bg-card px-3 py-2 text-start text-sm hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="block font-medium">{v.label}</span>
                        <span className="tnum block text-muted-foreground">{formatPrice(v.price)}</span>
                        {v.stock_mode === 'unit' && <span className="tnum block text-xs text-muted-foreground">{v.stock_qty} en stock</span>}
                        {v.stock_mode === 'pool' && <span className="tnum block text-xs text-muted-foreground">{p.stock_ml} ml dispo</span>}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
