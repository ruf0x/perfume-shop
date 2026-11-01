import { Menu, Search, ShoppingBag } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { cartCount, useCart, useCartUi } from '@/stores/cart'
import { useSettings } from '../queries'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-sm px-1 py-2 text-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring', isActive ? 'font-medium text-primary' : 'text-foreground/80')

/** A menu link, highlighted on its own page ("Boutique" stays highlighted whichever product type is chosen inside it). */
function NavItem({ to, children }: { to: string; children: string }) {
  const { pathname } = useLocation()
  const active = pathname === to

  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={navClass({ isActive: active })}>
      {children}
    </Link>
  )
}

function SearchForm({ className }: { className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [term, setTerm] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(term.trim() ? `/boutique?q=${encodeURIComponent(term.trim())}` : '/boutique')
    setTerm('')
  }

  return (
    <form onSubmit={submit} role="search" className={className}>
      <label className="relative block">
        <span className="sr-only">{t('nav.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('nav.searchPlaceholder')}
          className="h-10 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </label>
    </form>
  )
}

export function Header() {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  const count = useCart((s) => cartCount(s.lines))
  const setCartOpen = useCartUi((s) => s.setOpen)
  const [menu, setMenu] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <button
          type="button"
          className="-ml-2 flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring md:hidden"
          onClick={() => setMenu(true)}
          aria-label={t('nav.menu')}
        >
          <Menu className="size-5" />
        </button>

        <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-medium tracking-tight focus-visible:outline-2 focus-visible:outline-ring sm:text-xl">
          <img src="/brand/logo-mark.webp" alt="" width={221} height={256} className="h-10 w-auto" />
          <span className="leading-tight">{settings?.shop_name ?? t('brand.name')}</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-5 md:flex" aria-label={t('nav.main')}>
          <NavItem to="/boutique">{t('nav.shop')}</NavItem>
          <NavItem to="/packs">{t('nav.packs')}</NavItem>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SearchForm className="hidden w-64 lg:block" />
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={t('nav.openCart', { count })}
          >
            <ShoppingBag className="size-5" />
            {count > 0 && (
              <span className="tnum absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-5 font-medium text-primary-foreground">{count}</span>
            )}
          </button>
        </div>
      </div>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle className="font-display text-xl">{settings?.shop_name ?? t('brand.name')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.menu')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 p-5">
            <nav className="flex flex-col" aria-label={t('nav.main')}>
              {[
                ['/', t('nav.home')],
                ['/boutique', t('nav.shop')],
                ['/packs', t('nav.packs')],
              ].map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMenu(false)} className="border-b border-border py-3 font-display text-lg focus-visible:outline-2 focus-visible:outline-ring">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
