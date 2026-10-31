import { cn } from '@/lib/utils'
import { formatPrice } from '../format'

export interface PickerOption {
  id: number
  label: string
  price: number
  compareAt?: number | null
  available: boolean
}

interface OptionPickerProps {
  options: PickerOption[]
  value: number | null
  onChange: (id: number) => void
  legend: string
  soldOutLabel: string
  className?: string
}

/**
 * Options of a cosmetic: a size ("250 ml"), a shade ("Rose nude"), a pack size ("Boîte de 24")...
 * Plain radio buttons, so keyboard and screen readers work without extra code.
 */
export function OptionPicker({ options, value, onChange, legend, soldOutLabel, className }: OptionPickerProps) {
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.id === value

          return (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer flex-col justify-between gap-1 rounded-md border-2 px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                selected ? 'border-primary bg-accent/50' : 'border-border bg-card hover:border-input',
                !option.available && 'opacity-60',
              )}
            >
              <input type="radio" name="option" className="sr-only" checked={selected} onChange={() => onChange(option.id)} disabled={!option.available} />
              <span className={cn('font-medium', selected && 'text-primary')}>{option.label}</span>
              <span className="tnum text-sm text-muted-foreground">
                {!option.available ? (
                  soldOutLabel
                ) : (
                  <>
                    {option.compareAt ? <span className="mr-2 line-through">{formatPrice(option.compareAt)}</span> : null}
                    <span className="text-foreground">{formatPrice(option.price)}</span>
                  </>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
