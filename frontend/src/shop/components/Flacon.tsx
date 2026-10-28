import { useId } from 'react'
import { cn } from '@/lib/utils'
import { toneFor } from './tones'

interface FlaconProps {
  /** Perfume type slug: picks the silhouette and the colour of the liquid. */
  type?: string | null
  /** How full the flacon is, 0 to 1. */
  level?: number
  className?: string
}

// Each silhouette: where the liquid sits (top, bottom of the fill area) and its outline.
const SHAPES = {
  rect: { top: 60, bottom: 144 },
  round: { top: 58, bottom: 148 },
  attar: { top: 62, bottom: 150 },
} as const

/** A drawn flacon, used while a product has no photo. Decorative: the name is next to it. */
export function Flacon({ type, level = 0.7, className }: FlaconProps) {
  const tone = toneFor(type)
  const { top, bottom } = SHAPES[tone.shape]
  const clip = useId()

  return (
    <svg viewBox="0 0 120 160" role="presentation" aria-hidden className={cn('text-oud', className)}>
      <defs>
        <clipPath id={clip}>
          {tone.shape === 'rect' && <rect x="27" y="59" width="66" height="86" rx="7" />}
          {tone.shape === 'round' && <circle cx="60" cy="102" r="43" />}
          {tone.shape === 'attar' && <path d="M60 62C60 62 26 102 26 124C26 139 40 148 60 148C80 148 94 139 94 124C94 102 60 62 60 62Z" />}
        </clipPath>
      </defs>

      {/* glass */}
      {tone.shape === 'rect' && <rect x="22" y="54" width="76" height="96" rx="10" fill="#fff" fillOpacity=".55" />}
      {tone.shape === 'round' && <circle cx="60" cy="102" r="48" fill="#fff" fillOpacity=".55" />}
      {tone.shape === 'attar' && <path d="M60 56C60 56 20 100 20 124C20 142 38 152 60 152C82 152 100 142 100 124C100 100 60 56 60 56Z" fill="#fff" fillOpacity=".55" />}

      {/* liquid: scales from the bottom of the flacon */}
      <g clipPath={`url(#${clip})`}>
        <rect
          x="0"
          y={top}
          width="120"
          height={bottom - top}
          fill={tone.liquid}
          fillOpacity=".88"
          style={{ transformOrigin: `60px ${bottom}px`, transform: `scaleY(${Math.max(0, Math.min(1, level))})`, transition: 'transform 600ms cubic-bezier(.3,.7,.2,1)' }}
        />
      </g>

      {/* outline */}
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeOpacity=".8">
        {tone.shape === 'rect' && <rect x="22" y="54" width="76" height="96" rx="10" />}
        {tone.shape === 'round' && <circle cx="60" cy="102" r="48" />}
        {tone.shape === 'attar' && <path d="M60 56C60 56 20 100 20 124C20 142 38 152 60 152C82 152 100 142 100 124C100 100 60 56 60 56Z" />}
      </g>

      {/* neck and cap */}
      <g fill="currentColor">
        {tone.shape === 'rect' && (
          <>
            <rect x="53" y="44" width="14" height="11" />
            <rect x="42" y="14" width="36" height="31" rx="3" />
          </>
        )}
        {tone.shape === 'round' && (
          <>
            <rect x="53" y="38" width="14" height="14" />
            <rect x="46" y="12" width="28" height="27" rx="13" />
          </>
        )}
        {tone.shape === 'attar' && (
          <>
            <rect x="55" y="30" width="10" height="28" />
            <circle cx="60" cy="22" r="10" />
            <rect x="58.5" y="4" width="3" height="8" />
          </>
        )}
      </g>
    </svg>
  )
}
