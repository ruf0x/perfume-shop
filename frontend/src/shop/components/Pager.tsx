import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface PagerProps {
  page: number
  lastPage: number
  total: number
  onPage: (page: number) => void
}

/** Numbered pages: 1 … 4 5 6 … 12. Moves the page to the top of the list. */
export function Pager({ page, lastPage, total, onPage }: PagerProps) {
  const { t } = useTranslation()
  if (lastPage <= 1) return null

  const pages = [...new Set([1, lastPage, page - 1, page, page + 1].filter((n) => n >= 1 && n <= lastPage))].sort((a, b) => a - b)
  const go = (n: number) => {
    onPage(n)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const btn = 'tnum flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-35'

  return (
    <nav aria-label={t('pager.label')} className="mt-12 flex flex-col items-center gap-3">
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        <li>
          <button type="button" className={cn(btn, 'border border-input hover:bg-secondary')} disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t('pager.previous')}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </li>
        {pages.map((n, i) => (
          <li key={n} className="flex items-center gap-1.5">
            {i > 0 && n - pages[i - 1] > 1 && <span className="px-1 text-muted-foreground" aria-hidden>…</span>}
            <button type="button" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} className={cn(btn, n === page ? 'bg-primary font-medium text-primary-foreground' : 'hover:bg-secondary')}>
              {n}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={cn(btn, 'border border-input hover:bg-secondary')} disabled={page >= lastPage} onClick={() => go(page + 1)} aria-label={t('pager.next')}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </li>
      </ul>
      <p className="text-sm text-muted-foreground">{t('pager.summary', { page, lastPage, count: total })}</p>
    </nav>
  )
}
