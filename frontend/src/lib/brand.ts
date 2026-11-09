import { isDemo } from './api'

/** The shop's logo: generic bottle mark in public/brand (replace the files to brand a shop). The demo uses its own copy. */
export const brand = (name: 'logo-mark' | 'logo-light') => (isDemo ? `${import.meta.env.BASE_URL}brand-demo/${name}.svg` : `/brand/${name}.svg`)
