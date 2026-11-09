import { isDemo } from './api'

/** The shop's logo files. The demo site shows a neutral logo instead of a client's. */
export const brand = (name: 'logo-mark' | 'logo-light') => (isDemo ? `${import.meta.env.BASE_URL}brand-demo/${name}.svg` : `/brand/${name}.webp`)
