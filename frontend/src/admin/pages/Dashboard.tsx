import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { ONLINE, POS, SalesChart } from '../components/SalesChart'
import { addDays, apiError, formatDateTime, isoDate } from '../lib'
import { useDashboard, useOrderAction, useOrders } from '../queries'
import type { Dashboard } from '../types'

const PRESETS = [
  ['today', "Aujourd'hui"],
  ['7d', '7 jours'],
  ['30d', '30 jours'],
  ['month', 'Ce mois'],
  ['custom', 'Période libre'],
] as const

type Preset = (typeof PRESETS)[number][0]

function rangeFor(preset: Preset, from?: string, to?: string) {
  const today = new Date()
  const t = isoDate(today)
  if (preset === 'today') return { from: t, to: t }
  if (preset === '30d') return { from: isoDate(addDays(today, -29)), to: t }
  if (preset === 'month') return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: t }
  if (preset === 'custom' && from && to) return { from, to }
  return { from: isoDate(addDays(today, -6)), to: t } // 7d
}

function Tile({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-sans text-3xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </>
  )
  const cls = 'rounded-lg border border-border bg-card p-4'
  return to ? <Link to={to} className={cn(cls, 'block transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring')}>{body}</Link> : <div className={cls}>{body}</div>
}

function Card({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <h2 className="font-display text-xl">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

/** Best-selling sizes. One series, one colour; the value sits at the end of each bar. */
function TopProducts({ rows }: { rows: Dashboard['top_products'] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-muted-foreground">Aucune vente sur cette période.</p>
  const max = Math.max(...rows.map((r) => r.quantity))

  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={`${r.product}-${r.variant}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="min-w-0 truncate"><span className="font-medium">{r.product}</span> <span className="text-muted-foreground">{r.variant}</span></p>
            <p className="tnum shrink-0 text-muted-foreground">{formatPrice(r.revenue)}</p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 rounded-full bg-secondary">
              <div className="h-2 rounded-r-[4px] rounded-l-none" style={{ width: `${Math.max(4, (r.quantity / max) * 100)}%`, background: ONLINE }} />
            </div>
            <span className="tnum w-10 shrink-0 text-right text-sm font-medium">× {r.quantity}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function PendingOrders() {
  const q = useOrders({ status: 'en_attente' })
  const act = useOrderAction()
  const rows = (q.data?.data ?? []).slice(0, 5)
  const total = q.data?.counts.en_attente ?? 0

  if (q.isPending) return <Loading />
  if (rows.length === 0) return <p className="py-6 text-center text-muted-foreground">Aucune commande à appeler. Bravo !</p>

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className="font-medium"><span className="tnum">{o.reference}</span>, {[o.customer.first_name, o.customer.last_name].filter(Boolean).join(' ')}</p>
              <p className="tnum text-sm text-muted-foreground">{formatDateTime(o.created_at)}, {o.wilaya?.name ?? 'Retrait en boutique'}, {formatPrice(o.total)}</p>
            </div>
            <div className="flex gap-2">
              <Link to={`/admin/commandes?order=${o.id}`} className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">Ouvrir</Link>
              <Button className="h-9" disabled={act.isPending} onClick={() => act.mutate({ id: o.id, action: 'confirm' }, { onSuccess: () => toast.success(`${o.reference} confirmée.`), onError: (e) => toast.error(apiError(e)) })}>Confirmer</Button>
            </div>
          </li>
        ))}
      </ul>
      {total > rows.length && <Link to="/admin/commandes?status=en_attente" className="mt-3 inline-block text-sm underline underline-offset-4">Voir les {total} commandes en attente</Link>}
    </>
  )
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const preset = (PRESETS.find(([k]) => k === params.get('range'))?.[0] ?? '7d') as Preset
  const range = useMemo(() => rangeFor(preset, params.get('from') ?? undefined, params.get('to') ?? undefined), [preset, params])
  const query = useDashboard(range.from, range.to)
  const d = query.data

  const setRange = (next: Preset) =>
    setParams(next === '7d' ? {} : next === 'custom' ? { range: 'custom', from: range.from, to: range.to } : { range: next }, { replace: true })

  const sold = d?.sales_by_day.reduce((n, day) => n + day.orders, 0) ?? 0
  const avgBasket = d && sold > 0 ? Math.round(d.revenue / sold) : 0

  return (
    <>
      <PageHeader title="Tableau de bord" description="Les ventes terminées (livrées ou vendues en boutique), en ligne et en caisse." />

      <section aria-label="Période" className="mb-6 space-y-3">
        <div role="radiogroup" aria-label="Période" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {PRESETS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={preset === k} onClick={() => setRange(k)} className={cn('shrink-0 rounded-md px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring', preset === k ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/70')}>{label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">Du</span><input type="date" className={cn(inputClass, 'w-44')} value={range.from} max={range.to} onChange={(e) => e.target.value && setParams({ range: 'custom', from: e.target.value, to: range.to }, { replace: true })} /></label>
            <label className="space-y-1 text-sm"><span className="text-muted-foreground">Au</span><input type="date" className={cn(inputClass, 'w-44')} value={range.to} min={range.from} max={isoDate(new Date())} onChange={(e) => e.target.value && setParams({ range: 'custom', from: range.from, to: e.target.value }, { replace: true })} /></label>
          </div>
        )}
      </section>

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} message={apiError(query.error, 'Impossible de charger le tableau de bord.')} />
      ) : !d ? (
        <Loading />
      ) : (
        <div className={cn('space-y-6 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_2fr]">
            <section className="rounded-lg border border-border bg-card p-5" aria-label="Chiffre d'affaires">
              <p className="text-sm text-muted-foreground">Chiffre d'affaires</p>
              <p className="mt-1 font-sans text-5xl font-semibold">{formatPrice(d.revenue)}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: ONLINE }} aria-hidden />Boutique en ligne</span><span className="tnum font-medium">{formatPrice(d.revenue_online)}</span></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: POS }} aria-hidden />Caisse</span><span className="tnum font-medium">{formatPrice(d.revenue_pos)}</span></li>
              </ul>
            </section>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Tile label="Commandes reçues" value={String(d.orders_count)} sub={`${d.online_orders_count} en ligne, ${d.pos_orders_count} en caisse`} />
              <Tile label="À appeler" value={String(d.pending_count)} sub="en attente de confirmation" to="/admin/commandes?status=en_attente" />
              <Tile label="En livraison" value={String(d.in_delivery_count)} sub="colis en route" to="/admin/commandes?status=en_livraison" />
              <Tile label="Taux d'annulation" value={`${String(d.cancel_rate).replace('.', ',')} %`} sub="commandes en ligne" />
              <Tile label="Panier moyen" value={sold > 0 ? formatPrice(avgBasket) : '—'} sub={`${sold} vente${sold > 1 ? 's' : ''} terminée${sold > 1 ? 's' : ''}`} />
            </div>
          </div>

          <Card title="Ventes par jour" hint="Chiffre d'affaires des ventes terminées, jour par jour.">
            {d.sales_by_day.length <= 1 ? (
              <p className="py-8 text-center text-muted-foreground">Une seule journée sélectionnée : les chiffres sont ci-dessus. Choisissez « 7 jours » ou plus pour voir l'évolution.</p>
            ) : d.revenue === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucune vente terminée sur cette période.</p>
            ) : (
              <SalesChart days={d.sales_by_day} stale={query.isPlaceholderData} />
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Les plus vendus" hint="Quantités vendues par taille, sur la période."><TopProducts rows={d.top_products} /></Card>
            <Card title="Stock faible" hint="Parfums presque épuisés, sans flacon scellé de réserve.">
              {d.low_stock.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">Rien à réapprovisionner pour le moment.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.low_stock.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="tnum shrink-0 text-muted-foreground">{p.stock_ml === 0 ? 'épuisé' : `${p.stock_ml} ml`}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/stock" className="mt-3 inline-block text-sm underline underline-offset-4">Gérer le stock</Link>
            </Card>
          </div>

          <Card title="À appeler" hint="Les dernières commandes en attente. Confirmez-les ici une fois le client joint.">
            <PendingOrders />
          </Card>
        </div>
      )}
    </>
  )
}
