import { cn } from '@/lib/utils'
import { Flacon } from './Flacon'
import { toneFor } from './tones'

interface ProductVisualProps {
  image: string | null
  name: string
  /** Perfume type slug (draws the flacon and tints the ground when there is no photo). */
  type?: string | null
  level?: number
  className?: string
  priority?: boolean
}

/** The product photo, or a drawn flacon on a tinted ground when there is none yet. */
export function ProductVisual({ image, name, type, level = 0.72, className, priority }: ProductVisualProps) {
  if (image) {
    return <img src={image} alt={name} loading={priority ? 'eager' : 'lazy'} decoding="async" className={cn('size-full object-cover', className)} />
  }

  return (
    <div className={cn('flex size-full items-center justify-center', className)} style={{ background: toneFor(type).ground }}>
      <Flacon type={type} level={level} className="h-[62%] w-auto" />
    </div>
  )
}
