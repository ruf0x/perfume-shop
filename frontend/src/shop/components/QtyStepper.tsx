import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface QtyStepperProps {
  value: number
  onChange: (qty: number) => void
  min?: number
  max?: number
  className?: string
}

export function QtyStepper({ value, onChange, min = 1, max = 50, className }: QtyStepperProps) {
  const { t } = useTranslation()
  const button = 'flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-ring'

  return (
    <div className={cn('inline-flex items-center rounded-md border border-input', className)} role="group" aria-label={t('common.quantity')}>
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={t('common.decrease')}>
        <Minus className="size-4" />
      </button>
      <span className="tnum w-8 text-center text-sm font-medium" aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t('common.increase')}>
        <Plus className="size-4" />
      </button>
    </div>
  )
}
