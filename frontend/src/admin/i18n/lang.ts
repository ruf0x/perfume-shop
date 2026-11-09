import { useSyncExternalStore } from 'react'
import { isDemo } from '@/lib/api'

export type AdminLang = 'ar' | 'fr'

/** Language the admin opens in until someone picks another one (this shop's staff read Arabic). */
const DEFAULT_LANG: AdminLang = isDemo ? 'fr' : 'ar'
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

/** The shop is French only, except on the demo site where the visitor picks Arabic or French for everything. */
export const shopLang = (): AdminLang => (isDemo ? lang : 'fr')

export const subscribeLang = (cb: () => void) => {
  listeners.add(cb)

  return () => listeners.delete(cb)
}

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
