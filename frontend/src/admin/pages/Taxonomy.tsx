import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError } from '../lib'
import { useDeleteTaxon, useSaveTaxon, useTaxa, type TaxonKind } from '../queries'
import type { Taxon } from '../types'

const TEXT = {
  types: { title: 'Familles', description: 'Designer, niche, arabe, dupe, création maison… Ajoutez les vôtres.', one: 'famille', add: 'Nouvelle famille', placeholder: 'Oud prestige' },
  brands: { title: 'Marques', description: 'Les marques affichées sur les fiches parfum.', one: 'marque', add: 'Nouvelle marque', placeholder: 'Rasasi' },
}

/** One screen for both lists: they only differ by wording (and families can be hidden). */
export default function Taxonomy({ kind }: { kind: TaxonKind }) {
  const t = TEXT[kind]
  const query = useTaxa(kind)
  const save = useSaveTaxon(kind)
  const remove = useDeleteTaxon(kind)
  const [editing, setEditing] = useState<Taxon | 'new' | null>(null)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Taxon | null>(null)

  const open = (item: Taxon | 'new') => {
    setEditing(item)
    setName(item === 'new' ? '' : item.name)
  }

  const submit = () => {
    if (!name.trim()) return toast.error('Donnez un nom.')
    save.mutate(
      { id: editing !== 'new' && editing ? editing.id : undefined, name: name.trim() },
      { onSuccess: () => { toast.success('Enregistré.'); setEditing(null) }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  const items = query.data ?? []

  return (
    <>
      <PageHeader title={t.title} description={t.description} actions={<Button className="h-10" onClick={() => open('new')}><Plus className="size-4" aria-hidden />{t.add}</Button>} />

      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.isPending ? <Loading /> : items.length === 0 ? <EmptyState title={`Aucune ${t.one}`} /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.name}</p>
                <p className="tnum text-sm text-muted-foreground">{it.products_count} parfum{it.products_count > 1 ? 's' : ''}</p>
              </div>
              {kind === 'types' && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={it.is_active !== false} onCheckedChange={(v) => save.mutate({ id: it.id, is_active: v }, { onError: (e) => toast.error(apiError(e)) })} aria-label={`${it.name} visible`} />
                  <span className="hidden sm:inline">{it.is_active !== false ? 'Visible' : 'Masquée'}</span>
                </label>
              )}
              <button type="button" onClick={() => open(it)} className="flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Renommer ${it.name}`}><Pencil className="size-4" /></button>
              <button type="button" onClick={() => setDeleting(it)} className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Supprimer ${it.name}`}><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editing === 'new' ? t.add : `Renommer « ${editing?.name} »`}</DialogTitle>
            <DialogDescription className="sr-only">Nom de la {t.one}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Nom</span>
            <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t.placeholder} />
          </label>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEditing(null)}>Annuler</Button>
            <Button className="h-10" onClick={submit} disabled={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer « ${deleting?.name} » ?`}
        description={deleting && deleting.products_count > 0 ? `${deleting.products_count} parfum(s) l'utilisent : la suppression sera refusée.${kind === 'types' ? ' Masquez-la plutôt.' : ''}` : undefined}
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success('Supprimé.'); setDeleting(null) }, onError: (e) => { toast.error(apiError(e)); setDeleting(null) } })}
      />
    </>
  )
}
