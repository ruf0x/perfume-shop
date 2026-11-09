import { useEffect, useMemo, useRef, useState } from 'react'
import { langFormat } from '../i18n/lang'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { parseDay } from '../lib'
import type { DashboardDay } from '../types'

/*
 * Daily sales, online vs caisse, as stacked columns.
 * Colours validated with the dataviz palette checker (adjacent CVD ΔE 10.8, normal-vision ΔE 21.8,
 * contrast ≥ 3:1 on the card surface). Marks follow the spec: ≤ 24 px thick, 4 px rounded data end,
 * square at the baseline, a 2 px surface gap between stacked segments, hairline solid grid.
 */
export const ONLINE = '#33363a'
export const POS = '#9aa0a8'

interface Bucket {
  key: string
  label: string
  title: string
  online: number
  pos: number
  total: number
  orders: number
}

const dayFmt = langFormat({ weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = langFormat({ day: 'numeric', month: 'short' })
const weekdayFmt = langFormat({ weekday: 'short', day: 'numeric' })

/** Up to ~6 weeks: one column per day. Longer: one per week (Monday to Sunday), so columns stay readable. */
function bucketize(days: DashboardDay[]): Bucket[] {
  if (days.length <= 45) {
    return days.map((d) => ({
      key: d.date,
      label: days.length <= 10 ? weekdayFmt.format(parseDay(d.date)) : shortFmt.format(parseDay(d.date)),
      title: dayFmt.format(parseDay(d.date)),
      online: d.revenue_online,
      pos: d.revenue_pos,
      total: d.revenue,
      orders: d.orders,
    }))
  }

  const weeks = new Map<string, Bucket>()
  for (const d of days) {
    const date = parseDay(d.date)
    const monday = new Date(date)
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const w = weeks.get(key) ?? { key, label: shortFmt.format(monday), title: `Semaine du ${shortFmt.format(monday)} au ${shortFmt.format(sunday)}`, online: 0, pos: 0, total: 0, orders: 0 }
    w.online += d.revenue_online
    w.pos += d.revenue_pos
    w.total += d.revenue
    w.orders += d.orders
    weeks.set(key, w)
  }
  return [...weeks.values()]
}

/** Smallest "nice" step (1, 2, 2.5, 5 × 10^k) so that 4 steps cover the max. */
function niceStep(max: number) {
  if (max <= 0) return 250
  const power = Math.pow(10, Math.floor(Math.log10(max / 4)))
  return ([1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s * 4 >= max)) ?? 10 * power
}

const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `${+(n / 1000).toFixed(1)} k` : String(n)).replace('.', ',')

/** Column with a 4 px rounded top and a square bottom (the baseline side). */
function columnPath(x: number, y: number, w: number, h: number, roundTop: boolean) {
  const r = roundTop ? Math.min(4, h / 2, w / 2) : 0
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

function useWidth(view: string) {
  const ref = useRef<HTMLDivElement>(null)
  // 0 until measured: the chart must not guess a width and push the page wider than the screen.
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.max(200, Math.floor(el.clientWidth)))
    measure() // right away, without waiting for the observer's first callback
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])
  return [ref, width] as const
}

const HEIGHT = 260
const M = { top: 22, right: 8, bottom: 30, left: 44 }

export function SalesChart({ days, stale }: { days: DashboardDay[]; stale?: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [ref, width] = useWidth(view)
  const [hover, setHover] = useState<number | null>(null)
  const buckets = useMemo(() => bucketize(days), [days])

  const totalRevenue = buckets.reduce((s, b) => s + b.total, 0)
  const max = Math.max(...buckets.map((b) => b.total), 0)
  const step = niceStep(max)
  const top = step * 4
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)

  const innerW = width - M.left - M.right
  const innerH = HEIGHT - M.top - M.bottom
  const band = innerW / Math.max(buckets.length, 1)
  const barW = Math.min(24, Math.max(3, band * 0.62))
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(innerW / 70))))
  const peak = buckets.findIndex((b) => b.total === max && max > 0)
  const hovered = hover !== null ? buckets[hover] : null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label="Légende">
          <li className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: ONLINE }} aria-hidden />Boutique en ligne</li>
          <li className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: POS }} aria-hidden />Caisse</li>
        </ul>
        <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className="rounded-md px-2 py-1.5 text-sm underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-ring">
          {view === 'chart' ? 'Voir en tableau' : 'Voir le graphique'}
        </button>
      </div>

      {view === 'table' ? (
        <div className={cn('max-h-80 overflow-auto rounded-md border border-border', stale && 'opacity-60')}>
          <table className="w-full text-sm">
            <caption className="sr-only">Ventes par période, en ligne et en caisse</caption>
            <thead className="sticky top-0 bg-secondary text-start text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Période</th><th className="px-3 py-2 text-end font-medium">En ligne</th><th className="px-3 py-2 text-end font-medium">Caisse</th><th className="px-3 py-2 text-end font-medium">Total</th><th className="px-3 py-2 text-end font-medium">Ventes</th></tr></thead>
            <tbody className="tnum divide-y divide-border">
              {buckets.map((b) => (
                <tr key={b.key}><td className="px-3 py-2">{b.title}</td><td className="px-3 py-2 text-end">{formatPrice(b.online)}</td><td className="px-3 py-2 text-end">{formatPrice(b.pos)}</td><td className="px-3 py-2 text-end font-medium">{formatPrice(b.total)}</td><td className="px-3 py-2 text-end">{b.orders}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className={cn('relative w-full min-w-0 overflow-hidden transition-opacity', stale && 'opacity-60')} style={{ minHeight: HEIGHT }}>
          {width > 0 && <svg width={width} height={HEIGHT} role="img" aria-label={`Ventes par période : ${formatPrice(totalRevenue)} au total. Utilisez « Voir en tableau » pour le détail.`} onPointerLeave={() => setHover(null)}>
            {/* hairline solid grid, recessive */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{compact(t)}</text>
              </g>
            ))}

            {buckets.map((b, i) => {
              const cx = M.left + band * i + band / 2
              const x = cx - barW / 2
              const gap = b.online > 0 && b.pos > 0 ? 2 : 0
              const hOnline = (b.online / top) * innerH
              const hPos = (b.pos / top) * innerH
              const baseY = y(0)
              return (
                <g key={b.key}>
                  {hover === i && <rect x={M.left + band * i} y={M.top} width={band} height={innerH} fill="var(--secondary)" opacity={0.7} />}
                  {b.online > 0 && <path d={columnPath(x, baseY - hOnline, barW, hOnline, b.pos === 0)} fill={ONLINE} />}
                  {b.pos > 0 && <path d={columnPath(x, baseY - hOnline - gap - hPos, barW, hPos, true)} fill={POS} />}
                  {i === peak && <text x={cx} y={y(b.total) - 6} textAnchor="middle" fontSize={11} fontWeight={500} fill="var(--foreground)">{compact(b.total)}</text>}
                  {i % labelEvery === 0 && <text x={cx} y={HEIGHT - 10} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">{b.label}</text>}
                  {/* hit area: the whole column band, much bigger than the mark */}
                  <rect x={M.left + band * i} y={M.top} width={band} height={innerH + 8} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)} onClick={() => setHover(i)} />
                </g>
              )
            })}
          </svg>}

          {width > 0 && hovered && (
            <div className="pointer-events-none absolute z-10 min-w-44 rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md" style={{ top: 4, left: Math.min(Math.max(M.left + band * (hover ?? 0) + band / 2 - 88, 0), width - 184) }} role="status">
              <p className="mb-1 font-medium">{hovered.title}</p>
              <p className="tnum flex items-center justify-between gap-4"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: ONLINE }} aria-hidden />En ligne</span>{formatPrice(hovered.online)}</p>
              <p className="tnum flex items-center justify-between gap-4"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: POS }} aria-hidden />Caisse</span>{formatPrice(hovered.pos)}</p>
              <p className="tnum mt-1 flex justify-between gap-4 border-t border-border pt-1 font-medium"><span>Total ({hovered.orders})</span>{formatPrice(hovered.total)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
