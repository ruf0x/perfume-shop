import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { GiftDialog, LoyaltyNote } from '../components/Loyalty'
import { Textarea } from '@/components/ui/textarea'
import { formatPhone, phoneHref } from '@/shop/format'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, inputClass } from '../components/common'
import { apiError, formatDate } from '../lib'
import { useCustomers, useUpdateCustomer } from '../queries'
import type { Customer } from '../types'
import { useDebounced } from '../useDebounced'

export default function Customers() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [blacklisted, setBlacklisted] = useState(false)
  const [sort, setSort] = useState<'created_at' | 'orders_count'>('created_at')
  const [page, setPage] = useState(1)
  const [noteFor, setNoteFor] = useState<Customer | null>(null)
  const [giftFor, setGiftFor] = useState<Customer | null>(null)
  const [note, setNote] = useState('')
  const update = useUpdateCustomer()
  useEffect(() => setPage(1), [q, blacklisted, sort])

  const query = useCustomers({ q: q || undefined, blacklisted, sort, page })
  const rows = query.data?.data ?? []

  const toggle = (c: Customer, value: boolean) =>
    update.mutate({ id: c.id, is_blacklisted: value }, { onSuccess: () => toast.success(value ? `${c.first_name} ne peut plus commander en ligne.` : `${c.first_name} peut de nouveau commander.`), onError: (e) => toast.error(apiError(e)) })

  return (
    <>
      <PageHeader title="Clients" description="Chaque client est identifié par son numéro de téléphone. Bloquez ceux qui passent de fausses commandes." />

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="col-span-2 space-y-1 text-sm"><span className="text-muted-foreground">Rechercher</span><input type="search" className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou téléphone" /></label>
        <label className="col-span-2 space-y-1 text-sm md:col-span-1"><span className="text-muted-foreground">Trier par</span><select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="created_at">Plus récents</option><option value="orders_count">Plus de commandes</option></select></label>
        <label className="col-span-2 flex items-center gap-2 text-sm md:col-span-1 md:self-end md:pb-2.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={blacklisted} onChange={(e) => setBlacklisted(e.target.checked)} />Clients bloqués seulement</label>
      </section>

      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.isPending ? <Loading /> : rows.length === 0 ? <EmptyState title="Aucun client" hint="Les clients apparaissent dès leur première commande." /> : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {rows.map((c) => (
              <li key={c.id} className="space-y-2 p-4 md:flex md:items-center md:gap-6 md:space-y-0">
                <div className="min-w-0 md:w-1/4">
                  <p className="truncate font-medium">{c.first_name} {c.last_name}</p>
                  <a href={phoneHref(c.phone)} className="tnum text-sm underline underline-offset-4">{formatPhone(c.phone)}</a>
                  <p className="truncate text-xs text-muted-foreground">{[c.wilaya, `client depuis ${formatDate(c.created_at)}`].filter(Boolean).join(', ')}</p>
                </div>
                <p className="tnum flex-1 text-sm">
                  <Link to={`/admin/commandes?customer_id=${c.id}`} className="font-medium underline underline-offset-4">{c.orders_count} commande{c.orders_count > 1 ? 's' : ''}</Link>
                  <span className="block text-muted-foreground">{c.delivered_count} livrée(s), {c.cancelled_count} annulée(s), {c.returned_count} retour(s)</span>
                </p>
                {c.loyalty && (
                  <div className="md:w-1/4">
                    <LoyaltyNote loyalty={c.loyalty} />
                    {c.loyalty.pending.length > 0 && <button type="button" className="mt-1 text-sm font-medium underline underline-offset-4" onClick={() => setGiftFor(c)}>Offrir le cadeau</button>}
                  </div>
                )}
                {c.note && <p className="max-w-[16rem] truncate text-sm text-muted-foreground" title={c.note}>{c.note}</p>}
                <div className="flex items-center gap-4">
                  <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setNoteFor(c); setNote(c.note ?? '') }}>Note</button>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={c.is_blacklisted} onCheckedChange={(v) => toggle(c, v)} aria-label={`Bloquer ${c.first_name} ${c.last_name}`} /><span className={c.is_blacklisted ? 'font-medium text-destructive' : 'text-muted-foreground'}>{c.is_blacklisted ? 'Bloqué' : 'Bloquer'}</span></label>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}

      {giftFor?.loyalty && <GiftDialog customerId={giftFor.id} name={`${giftFor.first_name} ${giftFor.last_name}`} loyalty={giftFor.loyalty} onClose={() => setGiftFor(null)} />}

      <Dialog open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Note sur {noteFor?.first_name} {noteFor?.last_name}</DialogTitle>
            <DialogDescription>Visible uniquement par l'équipe.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" placeholder="Ne répond jamais, préfère être appelé le soir…" />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setNoteFor(null)}>Annuler</Button>
            <Button className="h-10" disabled={update.isPending} onClick={() => noteFor && update.mutate({ id: noteFor.id, note: note || null }, { onSuccess: () => { toast.success('Note enregistrée.'); setNoteFor(null) }, onError: (e) => toast.error(apiError(e)) })}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
