import { cn } from '@/lib/utils'
import { setLang, useLang, type AdminLang } from './lang'

const OPTIONS: Array<{ id: AdminLang; label: string }> = [
  { id: 'ar', label: 'العربية' },
  { id: 'fr', label: 'Français' },
]

/** Two buttons: the admin in Arabic or in French. */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang()

  return (
    <div data-no-translate className={cn('inline-flex rounded-md border border-border bg-card p-0.5 text-sm', className)} role="group" aria-label="Langue / اللغة" dir="ltr">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          lang={o.id}
          className={cn('rounded px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-ring', lang === o.id ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-secondary')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
