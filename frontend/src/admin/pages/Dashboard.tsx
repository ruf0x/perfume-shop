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
  ['week', 'Cette semaine'],
  ['month', 'Ce mois'],
  ['year', 'Cette année'],
  ['custom', 'Période libre'],
] as const

type Preset = (typeof PRESETS)[number][0]

function rangeFor(preset: Preset, from?: string, to?: string) {
  const today = new Date()
  const t = isoDate(today)
  if (preset === 'today') return { from: t, to: t }
  if (preset === 'month') return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: t }
  if (preset === 'year') return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to: t }
  if (preset === 'custom' && from && to) return { from, to }
  // The week starts on Monday, like the weekly grouping of the chart.
  return { from: isoDate(addDays(today, -((today.getDay() + 6) % 7))), to: t }
}

/** One figure of the strip: a label, the number, and one line of context. A link when it leads somewhere. */
function Stat({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</p>}
    </>
  )
  const cls = 'block p-5 [&:nth-child(n+3)]:border-t [&:nth-child(n+3)]:border-border sm:[&:nth-child(n+3)]:border-t-0 [&:nth-child(even)]:border-s [&:nth-child(even)]:border-border sm:[&:nth-child(even)]:border-s-0'

  return to ? <Link to={to} className={cn(cls, 'transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-ring')}>{body}</Link> : <div className={cls}>{body}</div>
}

function profitNote(p: Dashboard['profit']) {
  const parts: string[] = []
  if (p.percent !== null) parts.push(`${p.percent > 0 ? '+' : ''}${String(p.percent).replace('.', ',')} % du prix d'achat`)
  if (p.orders_without_cost > 0) parts.push(`${p.orders_without_cost} vente${p.orders_without_cost > 1 ? 's' : ''} sans prix d'achat non comptée${p.orders_without_cost > 1 ? 's' : ''}`)
  if (parts.length === 0) parts.push("Renseignez les prix d'achat dans les produits")

  return parts.join(' · ')
}

function Card({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-border bg-card p-6', className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
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
    <ol className="max-h-[26rem] space-y-3 overflow-y-auto pe-2">
      {rows.map((r) => (
        <li key={`${r.product}-${r.variant}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <p className="min-w-0 truncate"><span className="font-medium">{r.product}</span> <span className="text-muted-foreground">{r.variant}</span></p>
            <p className="tnum shrink-0 text-muted-foreground">{formatPrice(r.revenue)}</p>
          </div>
          <p className="tnum text-xs text-muted-foreground">{r.profit === null ? "Bénéfice : prix d'achat manquant" : `Bénéfice : ${formatPrice(r.profit)}`}</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 rounded-full bg-secondary">
              <div className="h-2 rounded-e-[4px] rounded-s-none" style={{ width: `${Math.max(4, (r.quantity / max) * 100)}%`, background: ONLINE }} />
            </div>
            <span className="tnum w-10 shrink-0 text-end text-sm font-medium">× {r.quantity}</span>
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
  const preset = (PRESETS.find(([k]) => k === params.get('range'))?.[0] ?? 'week') as Preset
  const range = useMemo(() => rangeFor(preset, params.get('from') ?? undefined, params.get('to') ?? undefined), [preset, params])
  const query = useDashboard(range.from, range.to)
  const d = query.data

  const setRange = (next: Preset) =>
    setParams(next === 'week' ? {} : next === 'custom' ? { range: 'custom', from: range.from, to: range.to } : { range: next }, { replace: true })

  const sold = d?.sales_by_day.reduce((n, day) => n + day.orders, 0) ?? 0
  const avgBasket = d && sold > 0 ? Math.round(d.revenue / sold) : 0

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Les ventes terminées (livrées ou vendues en boutique), en ligne et en caisse."
        actions={
          <div role="radiogroup" aria-label="Période" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-secondary p-1">
            {PRESETS.map(([k, label]) => (
              <button key={k} role="radio" aria-checked={preset === k} onClick={() => setRange(k)} className={cn('shrink-0 rounded-lg px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', preset === k ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
            ))}
          </div>
        }
      />

      {preset === 'custom' && (
        <div className="-mt-3 mb-6 flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Du</span><input type="date" className={cn(inputClass, 'w-44')} value={range.from} max={range.to} onChange={(e) => e.target.value && setParams({ range: 'custom', from: e.target.value, to: range.to }, { replace: true })} /></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Au</span><input type="date" className={cn(inputClass, 'w-44')} value={range.to} min={range.from} max={isoDate(new Date())} onChange={(e) => e.target.value && setParams({ range: 'custom', from: range.from, to: e.target.value }, { replace: true })} /></label>
        </div>
      )}

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} message={apiError(query.error, 'Impossible de charger le tableau de bord.')} />
      ) : !d ? (
        <Loading />
      ) : (
        <div className={cn('space-y-6 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <section className="grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" aria-label="Chiffre d'affaires">
            <div className="min-w-0 p-6">
              <p className="text-sm text-muted-foreground">Chiffre d'affaires</p>
              <p className="tnum mt-1 text-4xl font-semibold sm:text-5xl">{formatPrice(d.revenue)}</p>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: ONLINE }} aria-hidden />Boutique en ligne</span><span className="tnum font-medium">{formatPrice(d.revenue_online)}</span></li>
                <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: POS }} aria-hidden />Caisse</span><span className="tnum font-medium">{formatPrice(d.revenue_pos)}</span></li>
              </ul>
            </div>
            <div className="border-t border-border bg-secondary/50 p-6 md:border-s md:border-t-0">
              <p className="text-sm text-muted-foreground">Bénéfice</p>
              {d.profit.orders_counted > 0 ? (
                <>
                  <p className="tnum mt-1 text-3xl font-semibold sm:text-4xl">{formatPrice(d.profit.amount)}</p>
                  {d.profit.percent !== null && <p className="tnum mt-1 text-sm text-muted-foreground">{`${d.profit.percent > 0 ? '+' : ''}${String(d.profit.percent).replace('.', ',')} % du prix d'achat`}</p>}
                  {d.profit.orders_without_cost > 0 && <p className="mt-3 text-sm text-muted-foreground">{`${d.profit.orders_without_cost} vente${d.profit.orders_without_cost > 1 ? 's' : ''} sans prix d'achat non comptée${d.profit.orders_without_cost > 1 ? 's' : ''}`}</p>}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{profitNote(d.profit)}</p>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-4 sm:divide-x sm:rtl:divide-x-reverse" aria-label="En un coup d'œil">
            <Stat label="Commandes reçues" value={String(d.orders_count)} sub={`${d.online_orders_count} en ligne, ${d.pos_orders_count} en caisse`} />
            <Stat label="À appeler" value={String(d.pending_count)} sub="en attente de confirmation" to="/admin/commandes?status=en_attente" />
            <Stat label="En livraison" value={String(d.in_delivery_count)} sub="colis en route" to="/admin/commandes?status=en_livraison" />
            <Stat label="Panier moyen" value={sold > 0 ? formatPrice(avgBasket) : '—'} sub={`${sold} vente${sold > 1 ? 's' : ''} terminée${sold > 1 ? 's' : ''}`} />
          </section>

          <Card title="Ventes par jour" hint="Chiffre d'affaires des ventes terminées, jour par jour.">
            {d.sales_by_day.length <= 1 ? (
              <p className="py-8 text-center text-muted-foreground">Une seule journée sélectionnée : les chiffres sont ci-dessus. Choisissez « Cette semaine » ou plus pour voir l'évolution.</p>
            ) : d.revenue === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Aucune vente terminée sur cette période.</p>
            ) : (
              <SalesChart days={d.sales_by_day} stale={query.isPlaceholderData} />
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Les plus vendus" hint="Tous les produits vendus sur la période, par taille, avec leur bénéfice."><TopProducts rows={d.top_products} /></Card>
            <Card title="Stock faible" hint="Parfums et cosmétiques presque épuisés.">
              {d.low_stock.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground">Rien à réapprovisionner pour le moment.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.low_stock.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="tnum shrink-0 text-muted-foreground">{p.kind === 'standard' ? (p.units === 0 && p.stock_ml === 0 ? 'épuisé' : p.units > 0 ? `${p.units} restant${p.units > 1 ? 's' : ''}` : `${p.stock_ml} ml`) : p.stock_ml === 0 ? 'épuisé' : `${p.stock_ml} ml`}</span>
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
