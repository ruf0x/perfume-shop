import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Product photos are shown as 4:5 portrait cards: the admin crops the photo to that frame before sending it. */
export const PHOTO_ASPECT = 4 / 5

/** Cuts the chosen zone out of the photo and returns a WebP file (max 1200 px wide). */
async function cropToFile(src: string, area: Area, name: string): Promise<File> {
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, 1200 / area.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(area.width * scale)
  canvas.height = Math.round(area.height * scale)
  canvas.getContext('2d')!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
  if (!blob) throw new Error('La photo recadrée n\'a pas pu être créée.')
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}

interface PhotoCropProps {
  file: File
  onDone: (cropped: File) => void
  onCancel: () => void
}

export function PhotoCrop({ file, onDone, onCancel }: PhotoCropProps) {
  const src = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(src), [src])
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!area) return
    setBusy(true)
    try {
      onDone(await cropToFile(src, area, file.name))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Cadrer la photo</DialogTitle>
          <DialogDescription>Le cadre est en format portrait 4/5, comme sur la boutique. Glissez la photo et zoomez pour que le flacon entier soit dedans.</DialogDescription>
        </DialogHeader>

        <div className="relative h-96 overflow-hidden rounded-md bg-secondary">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={PHOTO_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>

        <label className="flex items-center gap-3 text-sm">
          <span className="w-12 shrink-0 text-muted-foreground">Zoom</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label="Zoom" />
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button className="h-10" onClick={confirm} disabled={!area || busy}>{busy ? 'Un instant…' : 'Valider le cadrage'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
