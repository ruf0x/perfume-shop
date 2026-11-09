import { useId } from 'react'
import { cn } from '@/lib/utils'
import { formatPrice } from '../format'
import { toneFor } from './tones'

export interface GaugeOption {
  id: number
  label: string
  price?: number
  compareAt?: number | null
  available?: boolean
}

interface VolumeGaugeProps {
  /** Ascending by volume: the biggest ends up at the top, like a graduated cylinder. */
  options: GaugeOption[]
  value: number | null
  onChange: (id: number) => void
  /** Perfume type slug: colours the liquid. */
  type?: string | null
  /** Legend read by screen readers. */
  legend: string
  soldOutLabel?: string
  /** Row height in px. */
  row?: number
  /** Play the fill-up animation once on mount (hero). */
  animateIn?: boolean
  className?: string
}

/**
 * The size picker. A vial fills up to the chosen volume while the row of that volume sits at the
 * liquid surface: 10 ml at the bottom, the full bottle at the top.
 */
export function VolumeGauge({ options, value, onChange, type, legend, soldOutLabel = 'Épuisé', row = 58, animateIn, className }: VolumeGaugeProps) {
  const name = useId()
  const n = options.length
  const selected = Math.max(0, options.findIndex((o) => o.id === value))
  const level = n === 0 ? 0 : (selected + 1) / n
  const tone = toneFor(type)

  return (
    <fieldset className={cn('grid grid-cols-[72px_1fr] gap-x-4', className)} style={{ height: n * row + 20 }}>
      <legend className="sr-only">{legend}</legend>

      {/* the vial */}
      <div className="relative pt-5" aria-hidden>
        <div className="absolute top-0 left-1/2 h-4 w-8 -translate-x-1/2 rounded-t-sm bg-oud" />
        <div className="relative h-full overflow-hidden rounded-t-md rounded-b-[2rem] border-2 border-oud/80 bg-white/60">
          <div
            className="absolute inset-x-0 bottom-0 origin-bottom border-t-2 border-white/50"
            style={{
              height: `${level * 100}%`,
              background: `linear-gradient(to top, ${tone.liquid}, color-mix(in srgb, ${tone.liquid} 70%, white))`,
              transition: 'height 600ms cubic-bezier(.3,.7,.2,1)',
              animation: animateIn ? 'vial-fill 1400ms cubic-bezier(.3,.7,.2,1) 250ms backwards' : undefined,
            }}
          />
          {/* graduations at every row boundary */}
          {options.slice(0, -1).map((_, k) => (
            <span key={k} className="absolute end-0 h-px w-3 bg-oud/60" style={{ bottom: `${((k + 1) / n) * 100}%` }} />
          ))}
        </div>
      </div>

      {/* the volumes, biggest first */}
      <div className="grid pt-5" style={{ gridTemplateRows: `repeat(${n}, 1fr)` }}>
        {[...options].reverse().map((o) => {
          const disabled = o.available === false
          const checked = o.id === value
          return (
            <label
              key={o.id}
              className={cn(
                'relative flex cursor-pointer items-center justify-between gap-3 border-t border-border px-3 text-sm transition-colors first:border-t-0',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1',
                checked ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-secondary/70',
                disabled && 'cursor-not-allowed text-muted-foreground',
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(o.id)}
              />
              <span className={cn('text-base', disabled && 'line-through')}>{o.label}</span>
              <span className="tnum text-end">
                {disabled ? (
                  <span className="text-xs">{soldOutLabel}</span>
                ) : o.price !== undefined ? (
                  <>
                    {o.compareAt ? <span className="me-2 text-xs text-muted-foreground line-through">{formatPrice(o.compareAt)}</span> : null}
                    {formatPrice(o.price)}
                  </>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
