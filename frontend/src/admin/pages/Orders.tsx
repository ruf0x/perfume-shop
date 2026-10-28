import { Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPhone, formatPrice, phoneHref } from '@/shop/format'
import { useWilayas } from '@/shop/queries'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, STATUS_LABEL, StatusBadge, inputClass } from '../components/common'
import { OrderDrawer } from '../components/OrderDrawer'
import { apiError, downloadBlob, formatDateTime } from '../lib'
import { exportOrders, useOrders } from '../queries'
import { ORDER_STATUSES, type Order, type OrderFilters, type OrderStatus } from '../types'
import { useDebounced } from '../useDebounced'

const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined)

function parse(p: URLSearchParams): OrderFilters {
  const status = p.get('status') as OrderStatus | null
  return {
    status: status && ORDER_STATUSES.includes(status) ? status : undefined,
    channel: p.get('channel') === 'pos' ? 'pos' : p.get('channel') === 'online' ? 'online' : undefined,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
    wilaya_id: int(p.get('wilaya_id')),
    customer_id: int(p.get('customer_id')),
    min_total: int(p.get('min_total')),
    max_total: int(p.get('max_total')),
    q: p.get('q') || undefined,
    sort: p.get('sort') === 'total' ? 'total' : undefined,
    dir: p.get('dir') === 'asc' ? 'asc' : undefined,
    page: int(p.get('page')),
  }
}

const TABS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  ...ORDER_STATUSES.map((s) => ({ key: s, label: s === 'vendue_boutique' ? 'Vendues en boutique' : STATUS_LABEL[s] })),
]

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parse(params), [params])
  const orderId = int(params.get('order'))
  const wilayas = useWilayas()
  const query = useOrders(filters)
  const [exporting, setExporting] = useState(false)

  const update = (patch: Record<string, string | number | undefined>, keepPage = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) v === undefined || v === '' ? next.delete(k) : next.set(k, String(v))
        if (!keepPage && !('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )

  // Search box: type freely, update the URL once typing pauses.
  const [search, setSearch] = useState(filters.q ?? '')
  const debounced = useDebounced(search)
  useEffect(() => setSearch(filters.q ?? ''), [filters.q])
  useEffect(() => {
    if ((debounced.trim() || undefined) !== filters.q) update({ q: debounced.trim() || undefined })
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const openOrder = (o: Order) => update({ order: o.id }, true)
  const closeOrder = () => update({ order: undefined }, true)
  const toggleSort = (column: 'created_at' | 'total') => {
    const current = filters.sort ?? 'created_at'
    const dir = filters.dir ?? 'desc'
    update({ sort: column === 'created_at' ? undefined : column, dir: current === column ? (dir === 'desc' ? 'asc' : undefined) : undefined })
  }

  const download = async () => {
    setExporting(true)
    try {
      downloadBlob(await exportOrders(filters), `commandes-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      toast.error(apiError(e))
    } finally {
      setExporting(false)
    }
  }

  const counts = query.data?.counts
  const orders = query.data?.data ?? []
  const activeTab = filters.status ?? 'all'
  const sortMark = (c: 'created_at' | 'total') => ((filters.sort ?? 'created_at') === c ? ((filters.dir ?? 'desc') === 'desc' ? ' ↓' : ' ↑') : '')
  const hasFilters = !!(filters.q || filters.channel || filters.from || filters.to || filters.wilaya_id || filters.customer_id || filters.min_total !== undefined || filters.max_total !== undefined)

  return (
    <>
      <PageHeader
        title="Commandes"
        description="Appelez les clients, confirmez, puis suivez la livraison."
        actions={
          <Button variant="outline" className="h-10" onClick={download} disabled={exporting}>
            <Download className="size-4" aria-hidden />
            {exporting ? 'Export…' : 'Exporter en CSV'}
          </Button>
        }
      />

      <div role="tablist" aria-label="Statut des commandes" className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TABS.map((tab) => {
          const selected = activeTab === tab.key
          const count = counts?.[tab.key]
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={selected}
              onClick={() => update({ status: tab.key === 'all' ? undefined : tab.key })}
              className={cn('flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground/80 hover:bg-secondary/70')}
            >
              {tab.label}
              {count !== undefined && <span className={cn('tnum rounded-full px-1.5 text-xs', selected ? 'bg-primary-foreground/20' : 'bg-background', tab.key === 'en_attente' && count > 0 && !selected && 'bg-amber-200 text-amber-900')}>{count}</span>}
            </button>
          )
        })}
      </div>

      <section aria-label="Filtres" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <label className="col-span-2 space-y-1 text-sm md:col-span-2">
          <span className="text-muted-foreground">Rechercher</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, nom, téléphone" className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Du</span>
          <input type="date" value={filters.from ?? ''} max={filters.to} onChange={(e) => update({ from: e.target.value })} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Au</span>
          <input type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => update({ to: e.target.value })} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Wilaya</span>
          <select value={filters.wilaya_id ?? ''} onChange={(e) => update({ wilaya_id: e.target.value })} className={inputClass}>
            <option value="">Toutes</option>
            {wilayas.data?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} – {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Canal</span>
          <select value={filters.channel ?? ''} onChange={(e) => update({ channel: e.target.value })} className={inputClass}>
            <option value="">Tous</option>
            <option value="online">En ligne</option>
            <option value="pos">Caisse</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Total min (DA)</span>
          <input type="number" min={0} inputMode="numeric" value={filters.min_total ?? ''} onChange={(e) => update({ min_total: e.target.value })} className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Total max (DA)</span>
          <input type="number" min={0} inputMode="numeric" value={filters.max_total ?? ''} onChange={(e) => update({ max_total: e.target.value })} className={inputClass} />
        </label>
        {(hasFilters || filters.status) && (
          <div className="col-span-2 flex items-end md:col-span-1">
            <Button variant="ghost" className="h-10" onClick={() => setParams({}, { replace: true })}>
              <X className="size-4" aria-hidden />
              Effacer les filtres
            </Button>
          </div>
        )}
      </section>

      {filters.customer_id && (
        <p className="mb-4 flex items-center gap-2 text-sm">
          Commandes du client n°{filters.customer_id}
          <button className="underline underline-offset-4" onClick={() => update({ customer_id: undefined })}>
            Voir toutes
          </button>
        </p>
      )}

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : orders.length === 0 ? (
        <EmptyState title="Aucune commande" hint={hasFilters || filters.status ? 'Aucune commande ne correspond à ces filtres.' : 'Les commandes passées sur la boutique apparaîtront ici.'} />
      ) : (
        <div className={cn(query.isPlaceholderData && 'opacity-60 transition-opacity')}>
          {/* phones: cards */}
          <ul className="space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <div className="rounded-lg border border-border bg-card p-4">
                  <button type="button" onClick={() => openOrder(o)} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-ring">
                    <div className="flex items-start justify-between gap-3">
                      <span className="tnum font-medium">{o.reference}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-2 font-medium">{[o.customer.first_name, o.customer.last_name].filter(Boolean).join(' ') || 'Client de passage'}</p>
                    <p className="text-sm text-muted-foreground">
                      {o.wilaya?.name ?? (o.channel === 'pos' ? 'Caisse' : 'Retrait en boutique')}
                    </p>
                    <p className="tnum text-sm text-muted-foreground">
                      {formatDateTime(o.created_at)}
                    </p>
                    <p className="tnum mt-2 font-display text-xl">{formatPrice(o.total)}</p>
                  </button>
                  {o.customer.phone && (
                    <a href={phoneHref(o.customer.phone)} className="mt-2 inline-block rounded-md py-1 text-sm underline underline-offset-4">
                      {formatPhone(o.customer.phone)}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* larger screens: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Référence</th>
                  <th className="px-4 py-3 font-medium">
                    <button onClick={() => toggleSort('created_at')} className="hover:text-foreground">
                      Date{sortMark('created_at')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium">Wilaya</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <button onClick={() => toggleSort('total')} className="hover:text-foreground">
                      Total{sortMark('total')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => openOrder(o)} className={cn('cursor-pointer hover:bg-secondary/40', orderId === o.id && 'bg-accent/50')}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={(e) => { e.stopPropagation(); openOrder(o) }} className="tnum font-medium whitespace-nowrap underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {o.reference}
                      </button>
                      {o.channel === 'pos' && <span className="ml-2 text-xs text-muted-foreground">caisse</span>}
                    </td>
                    <td className="tnum px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3">{[o.customer.first_name, o.customer.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {o.customer.phone ? (
                        <a href={phoneHref(o.customer.phone)} onClick={(e) => e.stopPropagation()} className="tnum underline-offset-4 hover:underline">
                          {formatPhone(o.customer.phone)}
                        </a>
                      ) : (
                        '—'
                      )}
                      {o.call_attempts > 0 && <span className="ml-2 text-xs text-amber-800" title="Tentatives d'appel sans réponse">{o.call_attempts}×</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{o.wilaya?.name ?? '—'}</td>
                    <td className="tnum px-4 py-3 text-right font-medium whitespace-nowrap">{formatPrice(o.total)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={query.data?.meta} onPage={(page) => update({ page: page === 1 ? undefined : page }, true)} />
        </div>
      )}

      <OrderDrawer id={orderId ?? null} onClose={closeOrder} />
    </>
  )
}
