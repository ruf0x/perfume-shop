import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const fieldClass =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20'

/** A label, a control and its error message, wired together for screen readers. */
export function Field({ id, label, error, hint, optional, optionalLabel, children, className }: { id: string; label: string; error?: string; hint?: string; optional?: boolean; optionalLabel?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {optional && <span className="ms-1.5 font-normal text-muted-foreground">{optionalLabel}</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Native select: the best picker on a phone. */
export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(fieldClass, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b625a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:1rem] bg-[right_0.75rem_center] rtl:bg-[left_0.75rem_center] bg-no-repeat pe-9', className)}>
      {children}
    </select>
  )
}
