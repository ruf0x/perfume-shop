import { Award, ClipboardList, FlaskConical, Gift, Layers, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings as SettingsIcon, Store, Tags, Upload, Users, Warehouse, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/api'
import { useSettings } from '@/shop/queries'
import { useLogout, useUser } from './auth'
import { LangSwitch } from './i18n/LangSwitch'
import { useLang } from './i18n/lang'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  ownerOnly?: boolean
  /** Match the exact path only (the dashboard lives at /admin itself). */
  end?: boolean
}

/** The menu in the order the shop is run: what happens today first, then the catalogue, then the setup. */
const GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, ownerOnly: true, end: true }] },
  {
    title: 'Ventes',
    items: [
      { to: '/admin/commandes', label: 'Commandes', icon: ClipboardList },
      { to: '/admin/caisse', label: 'Caisse', icon: Receipt },
      { to: '/admin/clients', label: 'Clients', icon: Users, ownerOnly: true },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/produits', label: 'Produits', icon: Package },
      { to: '/admin/packs', label: 'Packs', icon: Gift },
      { to: '/admin/stock', label: 'Stock', icon: Warehouse },
      { to: '/admin/bouteilles', label: 'Bouteilles', icon: FlaskConical, ownerOnly: true },
      { to: '/admin/importer', label: 'Importer', icon: Upload, ownerOnly: true },
    ],
  },
  {
    title: 'Boutique',
    items: [
      { to: '/admin/types-de-produits', label: 'Types de produits', icon: Layers, ownerOnly: true },
      { to: '/admin/types', label: 'Familles et catégories', icon: Tags, ownerOnly: true },
      { to: '/admin/marques', label: 'Marques', icon: Award, ownerOnly: true },
      { to: '/admin/parametres', label: 'Paramètres', icon: SettingsIcon, ownerOnly: true },
    ],
  },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser()

  return (
    <nav className="flex flex-col gap-5" aria-label="Administration">
      {GROUPS.map((group) => {
        const items = group.items.filter((n) => !n.ownerOnly || user.role === 'owner')
        if (items.length === 0) return null

        return (
          <div key={group.title ?? 'main'} className="flex flex-col gap-0.5">
            {group.title && <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{group.title}</p>}
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-[0.92rem] transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                    isActive ? 'bg-primary font-medium text-primary-foreground' : 'text-foreground/75 hover:bg-secondary hover:text-foreground',
                  )
                }
              >
                <Icon className="size-[1.05rem] shrink-0" aria-hidden />
                {label}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

/** The shop's emblem and name: the menu says whose admin this is. */
function Brand() {
  const { data: settings } = useSettings()

  return (
    <Link to="/admin" className="flex items-center gap-3 px-3 focus-visible:outline-2 focus-visible:outline-ring">
      <img src="/brand/logo-mark.webp" alt="" width={221} height={256} className="h-9 w-auto" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold leading-tight">{settings?.shop_name ?? 'Administration'}</span>
        <span className="block text-xs text-muted-foreground">Administration</span>
      </span>
    </Link>
  )
}

function SidebarFooter() {
  const user = useUser()
  const logout = useLogout()

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="px-3">
        <LangSwitch />
      </div>
      <div className="px-3 py-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.role === 'owner' ? 'Propriétaire' : 'Équipe'}</p>
      </div>
      {!isDesktop && (
        <Link to="/" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[0.92rem] text-foreground/75 hover:bg-secondary hover:text-foreground">
          <Store className="size-[1.05rem]" aria-hidden />
          Voir la boutique
        </Link>
      )}
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onError: () => toast.error('Déconnexion impossible.') })}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-[0.92rem] text-foreground/75 hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <LogOut className="size-[1.05rem]" aria-hidden />
        Se déconnecter
      </button>
    </div>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const rtl = useLang() === 'ar'

  return (
    <div className="min-h-svh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col justify-between gap-6 overflow-y-auto border-e border-border bg-card px-3 py-5 md:flex">
        <div className="space-y-7">
          <Brand />
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
          <button type="button" className="-ms-2 flex size-10 items-center justify-center rounded-lg hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="size-5" />
          </button>
          <img src="/brand/logo-mark.webp" alt="" width={221} height={256} className="h-7 w-auto" />
          <span className="font-semibold">Administration</span>
        </header>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side={rtl ? 'right' : 'left'} className="w-72 gap-0 p-0">
            <SheetHeader className="border-b border-border p-5">
              <SheetTitle className="sr-only">Administration</SheetTitle>
              <SheetDescription className="sr-only">Menu de l'administration</SheetDescription>
              <Brand />
            </SheetHeader>
            <div className="flex flex-1 flex-col justify-between gap-6 overflow-y-auto p-3">
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter />
            </div>
          </SheetContent>
        </Sheet>

        <main className="mx-auto max-w-[76rem] px-4 py-6 pb-16 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
