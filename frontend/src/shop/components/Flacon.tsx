import { useId } from 'react'
import { cn } from '@/lib/utils'
import { toneFor } from './tones'

interface FlaconProps {
  /** Family or category slug: picks the silhouette (flacon, or pot for cosmetics) and the colour. */
  type?: string | null
  /** Product type slug: picks the drawing (flacon, pot, watch, glasses) when the category has none. */
  rayon?: string | null
  /** How full the flacon is, 0 to 1. */
  level?: number
  className?: string
}

// Each silhouette: where the liquid sits (top, bottom of the fill area) and its outline.
const SHAPES = {
  rect: { top: 60, bottom: 144 },
  round: { top: 58, bottom: 148 },
  attar: { top: 62, bottom: 150 },
  jar: { top: 76, bottom: 144 },
} as const

/** A drawn flacon, used while a product has no photo. Decorative: the name is next to it. */
export function Flacon({ type, rayon, level = 0.7, className }: FlaconProps) {
  const tone = toneFor(type, rayon)
  const clip = useId()

  if (tone.shape === 'watch' || tone.shape === 'glasses') {
    return <Accessory shape={tone.shape} color={tone.liquid} className={className} />
  }

  const { top, bottom } = SHAPES[tone.shape]

  return (
    <svg viewBox="0 0 120 160" role="presentation" aria-hidden className={cn('text-oud', className)}>
      <defs>
        <clipPath id={clip}>
          {tone.shape === 'rect' && <rect x="27" y="59" width="66" height="86" rx="7" />}
          {tone.shape === 'round' && <circle cx="60" cy="102" r="43" />}
          {tone.shape === 'attar' && <path d="M60 62C60 62 26 102 26 124C26 139 40 148 60 148C80 148 94 139 94 124C94 102 60 62 60 62Z" />}
          {tone.shape === 'jar' && <rect x="29" y="75" width="62" height="69" rx="9" />}
        </clipPath>
      </defs>

      {/* glass */}
      {tone.shape === 'rect' && <rect x="22" y="54" width="76" height="96" rx="10" fill="#fff" fillOpacity=".55" />}
      {tone.shape === 'round' && <circle cx="60" cy="102" r="48" fill="#fff" fillOpacity=".55" />}
      {tone.shape === 'attar' && <path d="M60 56C60 56 20 100 20 124C20 142 38 152 60 152C82 152 100 142 100 124C100 100 60 56 60 56Z" fill="#fff" fillOpacity=".55" />}
      {tone.shape === 'jar' && <rect x="24" y="70" width="72" height="80" rx="13" fill="#fff" fillOpacity=".55" />}

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
        {tone.shape === 'jar' && <rect x="24" y="70" width="72" height="80" rx="13" />}
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
        {tone.shape === 'jar' && <rect x="19" y="42" width="82" height="30" rx="6" />}
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

/** A drawn watch or pair of glasses (no liquid): the same visual language as the flacon. Decorative. */
function Accessory({ shape, color, className }: { shape: 'watch' | 'glasses'; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 160" role="presentation" aria-hidden className={cn('text-oud', className)}>
      {shape === 'watch' ? (
        <>
          {/* strap */}
          <path d="M44 10h32l4 40H40zM40 110h40l-4 40H44z" fill="currentColor" fillOpacity=".85" />
          {/* case and face */}
          <circle cx="60" cy="80" r="36" fill="#fff" fillOpacity=".6" stroke="currentColor" strokeWidth="2" strokeOpacity=".85" />
          <circle cx="60" cy="80" r="29" fill={color} fillOpacity=".25" />
          <path d="M60 80V60M60 80l14 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <circle cx="60" cy="80" r="2.6" fill="currentColor" />
          {[0, 90, 180, 270].map((a) => (
            <rect key={a} x="58.8" y="49" width="2.4" height="5" fill="currentColor" transform={`rotate(${a} 60 80)`} />
          ))}
          <rect x="95" y="76" width="5" height="8" rx="1.5" fill="currentColor" />
        </>
      ) : (
        <>
          {/* two lenses, bridge and temples */}
          <circle cx="36" cy="86" r="24" fill={color} fillOpacity=".3" stroke="currentColor" strokeWidth="3" strokeOpacity=".9" />
          <circle cx="84" cy="86" r="24" fill={color} fillOpacity=".3" stroke="currentColor" strokeWidth="3" strokeOpacity=".9" />
          <path d="M59 82c1.5-3 2.5-3.5 3-3.5s1.5.5 3 3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M12 80L4 66M108 80l8-14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M26 76c4-5 11-6 16-3" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M74 76c4-5 11-6 16-3" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
