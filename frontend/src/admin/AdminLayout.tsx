import { Boxes, ClipboardList, Gift, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings as SettingsIcon, Store, Tags, Users, Warehouse, Award, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useLogout, useUser } from './auth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  ownerOnly?: boolean
  /** Match the exact path only (the dashboard lives at /admin itself). */
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, ownerOnly: true, end: true },
  { to: '/admin/commandes', label: 'Commandes', icon: ClipboardList },
  { to: '/admin/caisse', label: 'Caisse', icon: Receipt },
  { to: '/admin/produits', label: 'Produits', icon: Package },
  { to: '/admin/packs', label: 'Packs', icon: Gift },
  { to: '/admin/stock', label: 'Stock', icon: Warehouse },
  { to: '/admin/types', label: 'Familles et catégories', icon: Tags, ownerOnly: true },
  { to: '/admin/marques', label: 'Marques', icon: Award, ownerOnly: true },
  { to: '/admin/clients', label: 'Clients', icon: Users, ownerOnly: true },
  { to: '/admin/parametres', label: 'Paramètres', icon: SettingsIcon, ownerOnly: true },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser()
  return (
    <nav className="flex flex-col gap-1" aria-label="Administration">
      {NAV.filter((n) => !n.ownerOnly || user.role === 'owner').map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.95rem] transition-colors focus-visible:outline-2 focus-visible:outline-ring', isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-secondary')
          }
        >
          <Icon className="size-[1.15rem]" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter() {
  const user = useUser()
  const logout = useLogout()

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="px-3">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.role === 'owner' ? 'Propriétaire' : 'Équipe'}</p>
      </div>
      <Link to="/" target="_blank" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.95rem] text-foreground/80 hover:bg-secondary">
        <Store className="size-[1.15rem]" aria-hidden />
        Voir la boutique
      </Link>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onError: () => toast.error('Déconnexion impossible.') })}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[0.95rem] text-foreground/80 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <LogOut className="size-[1.15rem]" aria-hidden />
        Se déconnecter
      </button>
    </div>
  )
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col justify-between gap-6 border-r border-border bg-card p-4 md:flex">
        <div className="space-y-6">
          <Link to="/admin" className="flex items-center gap-2 px-3 pt-1 font-display text-xl">
            <Boxes className="size-5 text-primary" aria-hidden />
            Administration
          </Link>
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
          <button type="button" className="-ml-2 flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg">Administration</span>
        </header>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 gap-0 p-0">
            <SheetHeader className="border-b border-border p-5">
              <SheetTitle className="font-display text-xl">Administration</SheetTitle>
              <SheetDescription className="sr-only">Menu de l'administration</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col justify-between gap-6 p-4">
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter />
            </div>
          </SheetContent>
        </Sheet>

        <main className="mx-auto max-w-[78rem] p-4 pb-16 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
