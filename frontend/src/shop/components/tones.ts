/** Colours by perfume family or cosmetic category: the ground behind a product without photo, and the liquid / cream. */
export interface Tone {
  ground: string
  liquid: string
  shape: 'rect' | 'round' | 'attar' | 'jar'
}

const TONES: Record<string, Tone> = {
  designer: { ground: '#e6ebee', liquid: '#6f9bb5', shape: 'rect' },
  niche: { ground: '#efe3df', liquid: '#a24d3d', shape: 'round' },
  arabe: { ground: '#e3eee7', liquid: '#cf9327', shape: 'attar' },
  dupe: { ground: '#ebe7f1', liquid: '#8574b3', shape: 'rect' },
  'creation-maison': { ground: '#efe9d8', liquid: '#6a4727', shape: 'round' },
  // Cosmetic categories are drawn as a pot.
  maquillage: { ground: '#f6e3e4', liquid: '#c2566b', shape: 'jar' },
  ongles: { ground: '#efe3ee', liquid: '#a0559a', shape: 'jar' },
  'soin-du-corps': { ground: '#f2e9dc', liquid: '#c9a468', shape: 'jar' },
  'douche-et-bain': { ground: '#e0eef0', liquid: '#4f9fae', shape: 'jar' },
  cheveux: { ground: '#f0e6da', liquid: '#ad7a3e', shape: 'jar' },
  deodorants: { ground: '#e4ebf1', liquid: '#6f93b4', shape: 'jar' },
  'soin-du-visage': { ground: '#f5e8e3', liquid: '#d6957f', shape: 'jar' },
  accessoires: { ground: '#ece8f1', liquid: '#8c7cab', shape: 'jar' },
}

const FALLBACK: Tone = { ground: '#ecebe5', liquid: '#b38b3d', shape: 'rect' }

export const toneFor = (typeSlug?: string | null): Tone => (typeSlug && TONES[typeSlug]) || FALLBACK
