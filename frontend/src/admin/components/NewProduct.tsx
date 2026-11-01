import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { linkButton } from '@/shop/components/ui'
import { useProductTypes } from '../queries'

/**
 * "Nouveau produit": with one product type it goes straight to the form; with several, the owner
 * first chooses which type (Parfums, Montres...) the new product belongs to.
 */
export function NewProductButton({ className, label = 'Nouveau produit' }: { className?: string; label?: string }) {
  const types = (useProductTypes().data ?? []).filter((t) => t.is_active)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (types.length === 0) {
    return (
      <Link to="/admin/types-de-produits" className={linkButton('default', className)}>
        Créer d'abord un type de produit
      </Link>
    )
  }

  if (types.length === 1) {
    return (
      <Link to={`/admin/produits/nouveau?type=${types[0].id}`} className={linkButton('default', className)}>
        <Plus className="size-4" aria-hidden />
        {label}
      </Link>
    )
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Quel type de produit ?</DialogTitle>
            <DialogDescription>Le formulaire s'adapte au type choisi.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {types.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/produits/nouveau?type=${t.id}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-4 py-3 text-start hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-sm text-muted-foreground">{t.profile === 'perfume' ? 'Parfum' : 'Standard'}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
