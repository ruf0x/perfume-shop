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
import { useCommunes, useWilayas } from '@/shop/queries'
import { useCustomers, useDeleteCustomer, useUpdateCustomer } from '../queries'
import { ConfirmDialog } from '../components/common'
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
  const [editFor, setEditFor] = useState<Customer | null>(null)
  const [deleteFor, setDeleteFor] = useState<Customer | null>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', wilaya_id: 0, commune_id: 0, address: '' })
  const wilayas = useWilayas()
  const communes = useCommunes(form.wilaya_id || null)
  const remove = useDeleteCustomer()
  const openEdit = (c: Customer) => {
    setEditFor(c)
    setForm({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, wilaya_id: c.wilaya_id ?? 0, commune_id: c.commune_id ?? 0, address: c.address ?? '' })
  }
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
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
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
                    <LoyaltyNote loyalty={c.loyalty} customerId={c.id} />
                    {c.loyalty.pending.length > 0 && <button type="button" className="mt-1 text-sm font-medium underline underline-offset-4" onClick={() => setGiftFor(c)}>Offrir le cadeau</button>}
                  </div>
                )}
                {c.note && <p className="max-w-[16rem] truncate text-sm text-muted-foreground" title={c.note}>{c.note}</p>}
                <div className="flex items-center gap-4">
                  <button type="button" className="text-sm underline underline-offset-4" onClick={() => openEdit(c)}>Modifier</button>
                  <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setNoteFor(c); setNote(c.note ?? '') }}>Note</button>
                  <button type="button" className="text-sm text-destructive underline underline-offset-4" onClick={() => setDeleteFor(c)} aria-label={`Supprimer ${c.first_name} ${c.last_name}`}>Supprimer</button>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={c.is_blacklisted} onCheckedChange={(v) => toggle(c, v)} aria-label={`Bloquer ${c.first_name} ${c.last_name}`} /><span className={c.is_blacklisted ? 'font-medium text-destructive' : 'text-muted-foreground'}>{c.is_blacklisted ? 'Bloqué' : 'Bloquer'}</span></label>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={query.data?.meta} onPage={setPage} />
        </>
      )}

      {giftFor?.loyalty && <GiftDialog customerId={giftFor.id} name={`${giftFor.first_name} ${giftFor.last_name}`} loyalty={giftFor.loyalty} onClose={() => setGiftFor(null)} />}

      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Modifier {editFor?.first_name} {editFor?.last_name}</DialogTitle>
            <DialogDescription>Les commandes déjà passées gardent les informations avec lesquelles elles ont été faites.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1"><span className="text-muted-foreground">Prénom</span><input className={inputClass} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-muted-foreground">Nom</span><input className={inputClass} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
            <label className="col-span-2 space-y-1"><span className="text-muted-foreground">Téléphone</span><input className={inputClass} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-muted-foreground">Wilaya</span>
              <select className={inputClass} value={form.wilaya_id} onChange={(e) => setForm({ ...form, wilaya_id: Number(e.target.value), commune_id: 0 })}>
                <option value={0}>—</option>
                {wilayas.data?.map((w) => <option key={w.id} value={w.id}>{w.code} – {w.name}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="text-muted-foreground">Commune</span>
              <select className={inputClass} value={form.commune_id} disabled={!form.wilaya_id} onChange={(e) => setForm({ ...form, commune_id: Number(e.target.value) })}>
                <option value={0}>—</option>
                {communes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 space-y-1"><span className="text-muted-foreground">Adresse</span><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEditFor(null)}>Annuler</Button>
            <Button className="h-10" disabled={update.isPending || !form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()} onClick={() => editFor && update.mutate({ id: editFor.id, first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim(), wilaya_id: form.wilaya_id || null, commune_id: form.commune_id || null, address: form.address.trim() || null }, { onSuccess: () => { toast.success('Modifications enregistrées.'); setEditFor(null) }, onError: (e) => toast.error(apiError(e)) })}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteFor}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title={`Supprimer ${deleteFor?.first_name ?? ''} ${deleteFor?.last_name ?? ''} ?`}
        description="Ses commandes restent, mais ne sont plus rattachées à un client. Son suivi de fidélité et ses cadeaux sont supprimés."
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleteFor && remove.mutate(deleteFor.id, { onSuccess: () => { toast.success('Client supprimé.'); setDeleteFor(null) }, onError: (e) => toast.error(apiError(e)) })}
      />

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
