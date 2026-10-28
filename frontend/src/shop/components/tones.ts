/** Colours by perfume type: the ground behind a product without photo, and the liquid in the flacon. */
export interface Tone {
  ground: string
  liquid: string
  shape: 'rect' | 'round' | 'attar'
}

const TONES: Record<string, Tone> = {
  designer: { ground: '#e6ebee', liquid: '#6f9bb5', shape: 'rect' },
  niche: { ground: '#efe3df', liquid: '#a24d3d', shape: 'round' },
  arabe: { ground: '#e3eee7', liquid: '#cf9327', shape: 'attar' },
  dupe: { ground: '#ebe7f1', liquid: '#8574b3', shape: 'rect' },
  'creation-maison': { ground: '#efe9d8', liquid: '#6a4727', shape: 'round' },
}

const FALLBACK: Tone = { ground: '#ecebe5', liquid: '#b38b3d', shape: 'rect' }

export const toneFor = (typeSlug?: string | null): Tone => (typeSlug && TONES[typeSlug]) || FALLBACK
