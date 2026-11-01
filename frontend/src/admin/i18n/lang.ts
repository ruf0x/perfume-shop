import { useSyncExternalStore } from 'react'

export type AdminLang = 'ar' | 'fr'

/** Language the admin opens in until someone picks another one (this shop's staff read Arabic). */
const DEFAULT_LANG: AdminLang = 'ar'
const KEY = 'admin-lang'

const read = (): AdminLang => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ar' || v === 'fr') return v
  } catch {
    // storage blocked: use the default
  }

  return DEFAULT_LANG
}

let lang = read()
const listeners = new Set<() => void>()

export const getLang = () => lang
export const isRtl = () => lang === 'ar'

export function setLang(next: AdminLang) {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // not remembered, still applied
  }
  listeners.forEach((l) => l())
}

export const useLang = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => lang,
  )

/** Intl locale for the current admin language (Latin digits in Arabic, as used in Algeria). */
export const dateLocale = () => (lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-FR')

/** A date formatter that follows the admin language each time it is used. */
export function langFormat(options: Intl.DateTimeFormatOptions) {
  const cache = new Map<string, Intl.DateTimeFormat>()

  return {
    format(date: Date) {
      const locale = dateLocale()
      let f = cache.get(locale)
      if (!f) cache.set(locale, (f = new Intl.DateTimeFormat(locale, options)))

      return f.format(date)
    },
  }
}
