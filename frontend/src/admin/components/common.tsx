import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { Meta, OrderStatus } from '../types'

const STATUS_STYLE: Record<OrderStatus, string> = {
  en_attente: 'bg-amber-100 text-amber-900',
  confirmee: 'bg-sky-100 text-sky-900',
  en_livraison: 'bg-indigo-100 text-indigo-900',
  livree: 'bg-emerald-100 text-emerald-900',
  vendue_boutique: 'bg-teal-100 text-teal-900',
  annulee: 'bg-red-100 text-red-900',
  retournee: 'bg-stone-200 text-stone-800',
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  vendue_boutique: 'Vendue en boutique',
  annulee: 'Annulée',
  retournee: 'Retournée',
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap', STATUS_STYLE[status], className)}>{STATUS_LABEL[status]}</span>
}

/** Next to the status of a pending order that the owner put aside until stock arrives. */
export function AwaitingBadge({ order }: { order: { status: OrderStatus; awaiting_stock?: boolean } }) {
  if (order.status !== 'en_attente' || !order.awaiting_stock) return null

  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-amber-900">En attente d'arrivage</span>
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Pagination({ meta, onPage }: { meta?: Meta; onPage: (page: number) => void }) {
  if (!meta || meta.last_page <= 1) return null
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="tnum text-sm text-muted-foreground">
        Page {meta.current_page} sur {meta.last_page} ({meta.total} résultats)
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="h-10 px-3" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          Précédent
        </Button>
        <Button variant="outline" className="h-10 px-3" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>
          Suivant
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-10 text-center">
      <p className="font-display text-xl">{title}</p>
      {hint && <p className="mt-1 text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Loading({ label = 'Chargement' }: { label?: string }) {
  return (
    <div className="py-16 text-center text-muted-foreground" role="status">
      {label}…
    </div>
  )
}

export function ErrorState({ onRetry, message = 'Impossible de charger les données.' }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-8 text-center" role="alert">
      <p className="font-display text-xl">{message}</p>
      {onRetry && (
        <Button className="mt-4 h-10" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}

interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  children?: ReactNode
}

/** A small "are you sure?" dialog. Extra fields (a reason, a tracking number) go in children. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, loading, onConfirm, children }: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} className="h-10" onClick={onConfirm} disabled={loading}>
            {loading ? 'Un instant…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Same sizing as the shop's inputs, for admin forms. */
export const inputClass = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-destructive'
