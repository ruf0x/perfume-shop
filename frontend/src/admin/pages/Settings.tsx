import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useUser } from '../auth'
import { ConfirmDialog, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError, fieldErrors, formatDateTime } from '../lib'
import { useAdminSettings, useAdminWilayas, useChangePassword, useDeleteUser, useSaveSettings, useSaveUser, useUpdateWilaya, useUsers } from '../queries'
import type { AdminUser, AdminWilaya, ShopSettings } from '../types'

const SOCIALS = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
] as const

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div><h2 className="font-display text-xl">{title}</h2>{hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}</div>
      {children}
    </section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span><span className="block font-medium">{label}</span><span className="text-muted-foreground">{hint}</span></span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-1" />
    </label>
  )
}

function ShopTab() {
  const q = useAdminSettings()
  const save = useSaveSettings()
  const [f, setF] = useState<ShopSettings | null>(null)
  useEffect(() => { if (q.data && !f) setF(q.data) }, [q.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  if (!f) return <Loading />
  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => setF({ ...f, [k]: v })

  const submit = () =>
    save.mutate(
      {
        shop_name: f.shop_name,
        shop_phone: f.shop_phone || null,
        shop_address: f.shop_address || null,
        socials: Object.fromEntries(Object.entries(f.socials).filter(([, v]) => v)),
        show_unavailable: f.show_unavailable,
        low_stock_threshold_ml: f.low_stock_threshold_ml,
        low_stock_threshold_qty: f.low_stock_threshold_qty,
        store_pickup_enabled: f.store_pickup_enabled,
        free_delivery_over: f.free_delivery_over,
        ...(f.loyalty_available ? { loyalty_enabled: f.loyalty_enabled } : {}),
      },
      { onSuccess: () => toast.success('Paramètres enregistrés.'), onError: (e) => toast.error(apiError(e)) },
    )

  return (
    <div className="grid max-w-3xl gap-6">
      <Card title="Votre boutique" hint="Affiché en haut et en bas de la boutique.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2"><span className="text-muted-foreground">Nom</span><input className={inputClass} value={f.shop_name} onChange={(e) => set('shop_name', e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Téléphone</span><input className={inputClass} inputMode="tel" value={f.shop_phone ?? ''} onChange={(e) => set('shop_phone', e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Adresse</span><input className={inputClass} value={f.shop_address ?? ''} onChange={(e) => set('shop_address', e.target.value)} /></label>
          {SOCIALS.map(([key, label]) => (
            <label key={key} className="space-y-1 text-sm"><span className="text-muted-foreground">{label} (lien)</span><input className={inputClass} type="url" placeholder="https://…" value={f.socials[key] ?? ''} onChange={(e) => set('socials', { ...f.socials, [key]: e.target.value })} /></label>
          ))}
        </div>
      </Card>

      <Card title="Ce que voient les clients">
        <Toggle label="Montrer les parfums épuisés" hint="Activé : ils restent visibles, grisés, avec « Épuisé ». Désactivé : ils disparaissent de la boutique." checked={f.show_unavailable} onChange={(v) => set('show_unavailable', v)} />
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Seuil de stock faible (ml)</span>
          <span className="block text-muted-foreground">En dessous, un parfum compte comme indisponible (sauf s'il reste un flacon scellé).</span>
          <input type="number" min={0} className={`${inputClass} max-w-40`} value={f.low_stock_threshold_ml} onChange={(e) => set('low_stock_threshold_ml', Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Seuil de stock faible des produits à la pièce (articles)</span>
          <span className="block text-muted-foreground">À ce nombre d'articles ou moins, un produit à la pièce (cosmétique, montre, lunettes…) est signalé « stock faible » dans le stock et sur le tableau de bord.</span>
          <input type="number" min={0} className={`${inputClass} max-w-40`} value={f.low_stock_threshold_qty} onChange={(e) => set('low_stock_threshold_qty', Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </Card>

      <Card title="Livraison">
        <Toggle label="Retrait en boutique" hint="Propose « Retrait en boutique » (gratuit) au moment de commander." checked={f.store_pickup_enabled} onChange={(v) => set('store_pickup_enabled', v)} />
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Livraison offerte dès (DA)</span>
          <span className="block text-muted-foreground">Laissez vide pour ne jamais offrir la livraison. Les tarifs par wilaya sont dans l'onglet « Tarifs de livraison ».</span>
          <input type="number" min={0} className={`${inputClass} max-w-40`} value={f.free_delivery_over ?? ''} onChange={(e) => set('free_delivery_over', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </Card>

      {f.loyalty_available && (
        <Card title="Fidélité">
          <Toggle label="Parfum offert après plusieurs achats" hint={`Activé : au bout de ${f.loyalty_every} parfums achetés, le suivant est offert (les achats sont suivis par numéro de téléphone). Désactivé : plus de compteur ni de cadeau ; les parfums achetés pendant ce temps ne sont pas comptés.`} checked={f.loyalty_enabled !== false} onChange={(v) => set('loyalty_enabled', v)} />
        </Card>
      )}

      <div><Button className="h-11 px-8" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
    </div>
  )
}

function FeeInput({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => { const n = Math.max(0, Math.round(Number(v) || 0)); setV(String(n)); if (n !== value) onCommit(n) }
  return <input type="number" min={0} inputMode="numeric" aria-label={label} className={cn(inputClass, 'w-24 text-end')} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
}

function DeliveryTab() {
  const q = useAdminWilayas()
  const update = useUpdateWilaya()
  const [search, setSearch] = useState('')
  const rows = (q.data ?? []).filter((w) => `${w.code} ${w.name}`.toLowerCase().includes(search.toLowerCase()))
  const patch = (w: AdminWilaya, body: Partial<Pick<AdminWilaya, 'home_fee' | 'desk_fee' | 'is_active'>>) => update.mutate({ id: w.id, ...body }, { onSuccess: () => toast.success(`${w.name} mis à jour.`), onError: (e) => toast.error(apiError(e)) })

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  if (q.isPending) return <Loading />

  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-muted-foreground">Tarifs en dinars. Un tarif s'enregistre quand vous quittez la case. Désactivez une wilaya pour ne plus y livrer.</p>
      <label className="mb-4 block space-y-1 text-sm"><span className="text-muted-foreground">Rechercher une wilaya</span><input type="search" className={`${inputClass} max-w-sm`} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50 text-start text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Wilaya</th><th className="px-4 py-3 text-end font-medium">À domicile</th><th className="px-4 py-3 text-end font-medium">Point relais</th><th className="px-4 py-3 text-center font-medium">Livrée</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.map((w) => (
              <tr key={w.id} className={cn(!w.is_active && 'text-muted-foreground')}>
                <td className="px-4 py-2"><span className="tnum me-2 text-muted-foreground">{w.code}</span>{w.name}</td>
                <td className="px-4 py-2 text-end"><FeeInput value={w.home_fee} label={`Tarif à domicile ${w.name}`} onCommit={(n) => patch(w, { home_fee: n })} /></td>
                <td className="px-4 py-2 text-end"><FeeInput value={w.desk_fee} label={`Tarif point relais ${w.name}`} onCommit={(n) => patch(w, { desk_fee: n })} /></td>
                <td className="px-4 py-2 text-center"><Switch checked={w.is_active} onCheckedChange={(v) => patch(w, { is_active: v })} aria-label={`Livrer à ${w.name}`} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Aucune wilaya.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UserDialog({ user, onClose }: { user: AdminUser | 'new'; onClose: () => void }) {
  const save = useSaveUser()
  const existing = user === 'new' ? null : user
  const [f, setF] = useState({ name: existing?.name ?? '', username: existing?.username ?? '', password: '', role: existing?.role ?? 'staff', is_active: existing?.is_active ?? true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = () =>
    save.mutate(
      { id: existing?.id, name: f.name, username: f.username, role: f.role, is_active: f.is_active, ...(f.password ? { password: f.password } : {}) },
      { onSuccess: () => { toast.success('Compte enregistré.'); onClose() }, onError: (e) => { setErrors(fieldErrors(e)); toast.error(apiError(e)) } },
    )
  const err = (k: string) => errors[k] && <span role="alert" className="block text-destructive">{errors[k]}</span>

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{existing ? `Modifier ${existing.name}` : 'Nouveau compte'}</DialogTitle>
          <DialogDescription>Le propriétaire gère tout. L'équipe suit les commandes, utilise la caisse et consulte le catalogue et le stock.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="text-muted-foreground">Nom</span><input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{err('name')}</label>
          <label className="block space-y-1"><span className="text-muted-foreground">Identifiant</span><input className={inputClass} autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />{err('username')}</label>
          <label className="block space-y-1"><span className="text-muted-foreground">{existing ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe (8 caractères minimum)'}</span><input type="password" autoComplete="new-password" className={inputClass} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{err('password')}</label>
          <label className="block space-y-1"><span className="text-muted-foreground">Rôle</span><select className={inputClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AdminUser['role'] })}><option value="staff">Équipe</option><option value="owner">Propriétaire</option></select>{err('role')}</label>
          <label className="flex items-center justify-between gap-3"><span>Compte actif</span><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /></label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>Annuler</Button>
          <Button className="h-10" onClick={submit} disabled={save.isPending || !f.name || !f.username || (!existing && !f.password)}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TeamTab() {
  const me = useUser()
  const q = useUsers()
  const remove = useDeleteUser()
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  if (q.isPending) return <Loading />

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex justify-end"><Button className="h-10" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />Nouveau compte</Button></div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {q.data.map((u) => (
          <li key={u.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.name}{u.id === me.id && <span className="ms-2 text-xs text-muted-foreground">(vous)</span>}</p>
              <p className="truncate text-sm text-muted-foreground">{u.username}, {u.role === 'owner' ? 'propriétaire' : 'équipe'}{!u.is_active && ', désactivé'}{u.last_login_at ? `, vu ${formatDateTime(u.last_login_at)}` : ''}</p>
            </div>
            <button className="flex size-10 items-center justify-center rounded-md hover:bg-secondary" onClick={() => setEditing(u)} aria-label={`Modifier ${u.name}`}><Pencil className="size-4" /></button>
            {u.id !== me.id && <button className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-destructive" onClick={() => setDeleting(u)} aria-label={`Supprimer ${u.name}`}><Trash2 className="size-4" /></button>}
          </li>
        ))}
      </ul>
      {editing && <UserDialog user={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Supprimer le compte de ${deleting?.name} ?`} description="Cette personne ne pourra plus se connecter." confirmLabel="Supprimer" destructive loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success('Compte supprimé.'); setDeleting(null) }, onError: (e) => { toast.error(apiError(e)); setDeleting(null) } })} />
    </div>
  )
}

function AccountTab() {
  const change = useChangePassword()
  const [f, setF] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const err = (k: string) => errors[k] && <span role="alert" className="block text-destructive">{errors[k]}</span>

  const submit = () => {
    setErrors({})
    change.mutate(f, { onSuccess: () => { toast.success('Mot de passe modifié.'); setF({ current_password: '', password: '', password_confirmation: '' }) }, onError: (e) => { setErrors(fieldErrors(e)); toast.error(apiError(e)) } })
  }

  return (
    <div className="max-w-md">
      <Card title="Changer mon mot de passe">
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="text-muted-foreground">Mot de passe actuel</span><input type="password" autoComplete="current-password" className={inputClass} value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} />{err('current_password')}</label>
          <label className="block space-y-1"><span className="text-muted-foreground">Nouveau mot de passe (8 caractères minimum)</span><input type="password" autoComplete="new-password" className={inputClass} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{err('password')}</label>
          <label className="block space-y-1"><span className="text-muted-foreground">Confirmer le nouveau mot de passe</span><input type="password" autoComplete="new-password" className={inputClass} value={f.password_confirmation} onChange={(e) => setF({ ...f, password_confirmation: e.target.value })} /></label>
          <Button className="h-11" onClick={submit} disabled={change.isPending || !f.current_password || !f.password}>{change.isPending ? 'Enregistrement…' : 'Changer le mot de passe'}</Button>
        </div>
      </Card>
    </div>
  )
}

const TABS = [
  ['shop', 'Boutique'],
  ['delivery', 'Tarifs de livraison'],
  ['team', 'Équipe'],
  ['account', 'Mon compte'],
] as const

export default function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('shop')

  return (
    <>
      <PageHeader title="Paramètres" />
      <div role="tablist" aria-label="Paramètres" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('shrink-0 rounded-md px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring', tab === k ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/70')}>{l}</button>
        ))}
      </div>
      {tab === 'shop' && <ShopTab />}
      {tab === 'delivery' && <DeliveryTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'account' && <AccountTab />}
    </>
  )
}
