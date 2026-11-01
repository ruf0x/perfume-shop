import { FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { PageHeader } from '../components/common'
import { apiError, downloadBlob } from '../lib'
import { downloadImportTemplate, useImportProducts, type ImportFormat } from '../queries'

const FORMATS: { id: ImportFormat; title: string; text: string; columns: string; header: string; example: string }[] = [
  {
    id: 'perfumes',
    title: 'Parfums',
    text: 'Une ligne par parfum. Les tailles sont des colonnes : prix_10ml, prix_20ml, prix_flacon_100ml…',
    columns: 'nom, marque, famille, genre, description, notes_tete, notes_coeur, notes_fond, inspire_de, prix_10ml, prix_20ml, prix_30ml, prix_flacon_100ml, achat_10ml…, stock_ml, stock_flacon_100ml, actif',
    header: 'nom;marque;famille;genre;description;notes_tete;notes_coeur;notes_fond;inspire_de;prix_10ml;prix_20ml;prix_30ml;prix_flacon_100ml;achat_10ml;achat_20ml;achat_30ml;achat_flacon_100ml;stock_ml;stock_flacon_100ml;actif',
    example: 'Sauvage;Dior;Designer;homme;Frais et épicé;Bergamote;Poivre;Ambroxan;;1500;2800;4000;14000;1250;2333;3333;11667;400;3;oui',
  },
  {
    id: 'options',
    title: 'Autres produits',
    text: 'Cosmétiques, montres, lunettes… Une ligne par option (taille, teinte, couleur) : les lignes du même produit se regroupent.',
    columns: 'type, categorie, marque, nom, description, genre, option, prix, ancien_prix, achat, stock, actif',
    header: 'type;categorie;marque;nom;description;genre;option;prix;ancien_prix;achat;stock;actif',
    example: 'Cosmétiques;Maquillage;Maybelline;Rouge à lèvres mat;Tenue longue durée;;Rose nude;1400;1600;1167;10;oui',
  },
]

export default function ImportProducts() {
  const [format, setFormat] = useState<ImportFormat>('perfumes')
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const run = useImportProducts()
  const report = run.data
  const chosen = FORMATS.find((f) => f.id === format)!

  const check = () => file && run.mutate({ file, format, commit: false }, { onError: (e) => toast.error(apiError(e)) })
  const importNow = () =>
    file &&
    run.mutate({ file, format, commit: true }, { onSuccess: (r) => toast.success(`${r.created.length} produit${r.created.length > 1 ? 's' : ''} importé${r.created.length > 1 ? 's' : ''}.`), onError: (e) => toast.error(apiError(e)) })
  const reset = () => {
    setFile(null)
    run.reset()
    if (input.current) input.current.value = ''
  }
  const download = (f: ImportFormat) => downloadImportTemplate(f).then((blob) => downloadBlob(blob, f === 'perfumes' ? 'modele-parfums.csv' : 'modele-autres-produits.csv')).catch((e) => toast.error(apiError(e)))

  return (
    <>
      <PageHeader title="Importer des produits" description="Ajoutez plusieurs produits d'un coup à partir d'un fichier CSV (Excel). Le fichier est vérifié avant d'importer : rien n'est enregistré tant que vous ne confirmez pas." />

      <section aria-label="Modèle" className="mb-6 grid gap-3 md:grid-cols-2">
        {FORMATS.map((f) => (
          <div key={f.id} className={cn('rounded-2xl border bg-card p-5 transition-colors', format === f.id ? 'border-primary ring-1 ring-primary' : 'border-border')}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="radio" name="format" className="mt-1 size-4 accent-primary" checked={format === f.id} onChange={() => { setFormat(f.id); reset() }} />
              <span>
                <span className="block font-semibold">{f.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{f.text}</span>
              </span>
            </label>
            <Button variant="outline" className="mt-4 h-9 gap-2" onClick={() => download(f.id)}>
              <FileSpreadsheet className="size-4" aria-hidden />
              Télécharger le modèle
            </Button>
          </div>
        ))}
      </section>

      <details className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm">
        <summary className="cursor-pointer font-medium">Comment remplir le fichier</summary>
        <p className="mt-3 text-muted-foreground">Exemple d'une ligne, sous la ligne des titres :</p>
        <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-secondary p-3 text-xs leading-relaxed" data-no-translate>{`${chosen.header}
${chosen.example}`}</pre>
        <ul className="mt-3 list-disc space-y-1.5 ps-5 text-muted-foreground">
          <li>Gardez la première ligne (les titres) telle quelle ; ajoutez un produit par ligne en dessous.</li>
          <li className="tnum">{`Colonnes : ${chosen.columns}.`}</li>
          <li>Les prix sont des nombres entiers en DA (1500, ou 1 500). Les colonnes inutiles peuvent rester vides ou être supprimées.</li>
          <li>La marque et la famille sont créées si elles n'existent pas encore. Le type doit déjà exister.</li>
          <li>Un produit qui existe déjà (même type, même nom, même marque) est ignoré : il n'est jamais modifié.</li>
          <li>Les stocks de départ (stock_ml, stock_flacon_100ml, stock) sont ajoutés au stock avec la note « Import CSV ».</li>
        </ul>
      </details>

      <section aria-label="Fichier" className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            id="import-file"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); run.reset() }}
          />
          <Button variant="outline" className="h-10 gap-2" onClick={() => input.current?.click()}>
            <Upload className="size-4" aria-hidden />
            Choisir un fichier CSV
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : 'Aucun fichier choisi'}</span>
          <Button className="ms-auto h-10" disabled={!file || run.isPending} onClick={check}>
            {run.isPending && !report?.committed ? 'Vérification…' : 'Vérifier le fichier'}
          </Button>
        </div>
      </section>

      {report && (
        <section aria-label="Résultat" className="mt-6 space-y-5">
          <div className={cn('rounded-2xl border p-5', report.committed ? 'border-emerald-300 bg-emerald-50' : 'border-border bg-card')}>
            <p className="text-lg font-semibold">
              {report.committed
                ? `${report.created.length} produit${report.created.length > 1 ? 's' : ''} importé${report.created.length > 1 ? 's' : ''}`
                : `${report.created.length} produit${report.created.length > 1 ? 's' : ''} prêt${report.created.length > 1 ? 's' : ''} à importer`}
            </p>
            <p className="tnum mt-1 text-sm text-muted-foreground">{`${report.rows} ligne${report.rows > 1 ? 's' : ''} lue${report.rows > 1 ? 's' : ''}, ${report.skipped.length} déjà existant${report.skipped.length > 1 ? 's' : ''}, ${report.errors.length} avec un problème.`}</p>
            {report.committed ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/admin/produits" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Voir les produits</Link>
                <Button variant="outline" className="h-10" onClick={reset}>Importer un autre fichier</Button>
              </div>
            ) : (
              report.created.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="h-10" disabled={run.isPending} onClick={importNow}>{run.isPending ? 'Import…' : `Importer ${report.created.length} produit${report.created.length > 1 ? 's' : ''}`}</Button>
                  <Button variant="outline" className="h-10" onClick={reset}>Annuler</Button>
                </div>
              )
            )}
          </div>

          {report.errors.length > 0 && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
              <h2 className="font-semibold text-destructive">À corriger dans le fichier</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {report.errors.map((e, i) => (
                  <li key={i}>{`Ligne ${e.line}${e.name ? ` (${e.name})` : ''} : ${e.message}`}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">Ces produits ne sont pas importés. Corrigez le fichier puis vérifiez-le de nouveau, ou importez les autres.</p>
            </div>
          )}

          {report.skipped.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">Déjà dans le catalogue</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {report.skipped.map((s, i) => (
                  <li key={i}>{`Ligne ${s.line} (${s.name}) : ${s.message}`}</li>
                ))}
              </ul>
            </div>
          )}

          {report.created.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">Produit</th>
                    <th className="px-4 py-3 text-start font-medium">Type</th>
                    <th className="px-4 py-3 text-start font-medium">Tailles et prix</th>
                    <th className="px-4 py-3 text-end font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.created.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><span className="block font-medium">{p.name}</span><span className="text-xs text-muted-foreground">{[p.brand, p.family].filter(Boolean).join(', ')}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{p.type}</td>
                      <td className="tnum px-4 py-3 text-muted-foreground">{p.variants.map((v) => `${v.label} ${formatPrice(v.price)}`).join(', ')}</td>
                      <td className="tnum px-4 py-3 text-end whitespace-nowrap">{p.stock_ml > 0 ? `${p.stock_ml} ml` : ''}{p.stock_ml > 0 && p.stock_units > 0 ? ', ' : ''}{p.stock_units > 0 ? `${p.stock_units} en stock` : p.stock_ml > 0 ? '' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
