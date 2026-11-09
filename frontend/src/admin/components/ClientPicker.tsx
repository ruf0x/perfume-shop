import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatPhone } from '@/shop/format'
import { useCommunes, useSettings, useWilayas } from '@/shop/queries'
import { useCustomerSearch, type CustomerHit } from '../queries'
import { useDebounced } from '../useDebounced'
import { inputClass } from './common'

export interface ClientFields {
  first_name: string
  last_name: string
  phone: string
  wilaya_id: number
  commune_id: number
}

export const emptyClient: ClientFields = { first_name: '', last_name: '', phone: '', wilaya_id: 0, commune_id: 0 }

const label = 'space-y-1 text-sm'
const hint = 'text-muted-foreground'

/**
 * Choose the client of a sale: search the existing ones by name or phone (one click fills everything), or type a new
 * one. A new client needs the first name, last name and phone; wilaya and commune start as the shop's own (Oran, Oran)
 * and are changed for a client who lives elsewhere (or who is delivered).
 */
export function ClientPicker({ value, onChange }: { value: ClientFields; onChange: (v: ClientFields) => void }) {
  const [term, setTerm] = useState('')
  const [picked, setPicked] = useState<CustomerHit | null>(null)
  const hits = useCustomerSearch(useDebounced(term, 250))
  const wilayas = useWilayas()
  const communes = useCommunes(value.wilaya_id || null)
  const { data: settings } = useSettings()
  const fallback = settings?.default_location

  // Start in the shop's own wilaya and commune.
  useEffect(() => {
    if (value.wilaya_id === 0 && fallback?.wilaya_id) onChange({ ...value, wilaya_id: fallback.wilaya_id, commune_id: fallback.commune_id ?? 0 })
  }, [fallback?.wilaya_id, fallback?.commune_id, value, onChange])

  const choose = (c: CustomerHit) => {
    setPicked(c)
    setTerm('')
    onChange({ first_name: c.first_name, last_name: c.last_name, phone: c.phone, wilaya_id: c.wilaya_id ?? fallback?.wilaya_id ?? 0, commune_id: c.commune_id ?? (c.wilaya_id ? 0 : fallback?.commune_id ?? 0) })
  }
  const set = (patch: Partial<ClientFields>) => {
    setPicked(null)
    onChange({ ...value, ...patch })
  }

  const filled = value.first_name.trim() !== '' || value.last_name.trim() !== '' || value.phone.trim() !== ''
  const complete = value.first_name.trim() !== '' && value.last_name.trim() !== '' && value.phone.trim() !== ''

  return (
    <div className="space-y-3 text-sm">
      <div className="relative">
        <label className="relative block">
          <span className="sr-only">Rechercher un client</span>
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Rechercher un client (nom ou téléphone)" className={`${inputClass} ps-9`} />
        </label>
        {term.trim().length >= 2 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-card shadow-md" role="listbox">
            {hits.isPending ? (
              <li className="p-3 text-muted-foreground">Chargement…</li>
            ) : hits.data?.length === 0 ? (
              <li className="p-3 text-muted-foreground">Aucun client trouvé : remplissez les champs ci-dessous pour le créer.</li>
            ) : (
              hits.data?.map((c) => (
                <li key={c.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => choose(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
                    <span className="min-w-0 truncate font-medium">{c.first_name} {c.last_name}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{formatPhone(c.phone)}{c.wilaya ? ` · ${c.wilaya}` : ''}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {picked && <p className="rounded-md bg-secondary/60 px-3 py-2">{`Client existant : ${picked.first_name} ${picked.last_name}, ${picked.orders_count} commande${picked.orders_count > 1 ? 's' : ''}.`}</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className={label}><span className={hint}>Prénom</span><input className={inputClass} value={value.first_name} onChange={(e) => set({ first_name: e.target.value })} aria-invalid={filled && value.first_name.trim() === ''} /></label>
        <label className={label}><span className={hint}>Nom</span><input className={inputClass} value={value.last_name} onChange={(e) => set({ last_name: e.target.value })} aria-invalid={filled && value.last_name.trim() === ''} /></label>
        <label className={`${label} col-span-2`}><span className={hint}>Téléphone</span><input className={inputClass} inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} aria-invalid={filled && value.phone.trim() === ''} /></label>
        <label className={label}>
          <span className={hint}>Wilaya</span>
          <select className={inputClass} value={value.wilaya_id} onChange={(e) => set({ wilaya_id: Number(e.target.value), commune_id: 0 })}>
            <option value={0}>—</option>
            {wilayas.data?.map((w) => <option key={w.id} value={w.id}>{w.code} – {w.name}</option>)}
          </select>
        </label>
        <label className={label}>
          <span className={hint}>Commune</span>
          <select className={inputClass} value={value.commune_id} disabled={!value.wilaya_id} onChange={(e) => set({ commune_id: Number(e.target.value) })}>
            <option value={0}>—</option>
            {communes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {filled && !complete && <p role="alert" className="text-destructive">Pour enregistrer le client, indiquez son prénom, son nom et son téléphone.</p>}
      {complete && !picked && <p className="text-muted-foreground">Un nouveau client sera créé avec ces informations (s'il n'existe pas déjà avec ce numéro).</p>}
    </div>
  )
}
