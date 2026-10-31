import { MonitorSmartphone } from 'lucide-react'
import { Link } from 'react-router'
import { linkButton } from '@/shop/components/ui'

/** Shown instead of the admin when the owner turned "Administration sur le site web" off. Says nothing else: no login form. */
export default function WebAdminDisabled() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <MonitorSmartphone className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="font-display text-3xl">L'administration n'est pas disponible ici</h1>
      <p className="max-w-md text-muted-foreground">La gestion de la boutique se fait avec l'application de bureau. Ouvrez-la sur l'ordinateur de la boutique.</p>
      <Link to="/" className={linkButton('outline', 'mt-2')}>
        Retour à la boutique
      </Link>
    </main>
  )
}
