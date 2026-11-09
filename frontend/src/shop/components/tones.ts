/** Colours by perfume family or cosmetic category: the ground behind a product without photo, and the liquid / cream. */
export interface Tone {
  ground: string
  liquid: string
  shape: 'rect' | 'round' | 'attar' | 'jar' | 'watch' | 'glasses'
}

const TONES: Record<string, Tone> = {
  designer: { ground: '#eaeaea', liquid: '#919191', shape: 'rect' },
  niche: { ground: '#e6e6e6', liquid: '#656565', shape: 'round' },
  arabe: { ground: '#eaeaea', liquid: '#999999', shape: 'attar' },
  dupe: { ground: '#e9e9e9', liquid: '#808080', shape: 'rect' },
  'creation-maison': { ground: '#e9e9e9', liquid: '#4e4e4e', shape: 'round' },
  // Cosmetic categories are drawn as a pot.
  maquillage: { ground: '#e9e9e9', liquid: '#797979', shape: 'jar' },
  ongles: { ground: '#e8e8e8', liquid: '#737373', shape: 'jar' },
  'soin-du-corps': { ground: '#eaeaea', liquid: '#a8a8a8', shape: 'jar' },
  'douche-et-bain': { ground: '#eaeaea', liquid: '#898989', shape: 'jar' },
  cheveux: { ground: '#e8e8e8', liquid: '#828282', shape: 'jar' },
  deodorants: { ground: '#eaeaea', liquid: '#8c8c8c', shape: 'jar' },
  'soin-du-visage': { ground: '#ebebeb', liquid: '#a6a6a6', shape: 'jar' },
  accessoires: { ground: '#eaeaea', liquid: '#868686', shape: 'jar' },
}

/** What to draw for a product type when its category has no colours of its own (the owner can create any type). */
const RAYON_TONES: Record<string, Tone> = {
  parfums: { ground: '#ebebeb', liquid: '#8e8e8e', shape: 'rect' },
  cosmetiques: { ground: '#eaeaea', liquid: '#9e9e9e', shape: 'jar' },
  montres: { ground: '#e9e9e9', liquid: '#828282', shape: 'watch' },
  lunettes: { ground: '#e9e9e9', liquid: '#6f6f6f', shape: 'glasses' },
}

const FALLBACK: Tone = { ground: '#ebebeb', liquid: '#8e8e8e', shape: 'rect' }

/** Tone of a category, else of its product type, else a neutral flacon. */
export const toneFor = (typeSlug?: string | null, rayonSlug?: string | null): Tone => (typeSlug && TONES[typeSlug]) || (rayonSlug && RAYON_TONES[rayonSlug]) || FALLBACK
