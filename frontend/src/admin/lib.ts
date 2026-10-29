import { isAxiosError } from 'axios'
import type { ApiError } from '@/shop/types'

/** The most useful sentence from a failed API call, in French. */
export function apiError(err: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  if (err instanceof Error && !isAxiosError(err)) return err.message // e.g. a photo the browser cannot read
  if (!isAxiosError<ApiError>(err)) return fallback
  if (!err.response) return 'Connexion impossible. Vérifiez votre réseau.'
  const { message, errors } = err.response.data ?? {}
  const first = errors ? Object.values(errors)[0]?.[0] : undefined
  if (err.response.status === 429) return 'Trop de tentatives. Patientez une minute.'
  if (err.response.status === 403) return message ?? "Vous n'avez pas accès à cette action."
  return first ?? message ?? fallback
}

/** Field errors keyed by field name (Laravel's `errors`), for setError(). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!isAxiosError<ApiError>(err)) return {}
  return Object.fromEntries(Object.entries(err.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]]))
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => `${dateFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}`

/** Drops empty values so they do not end up in the URL or the API query. */
export const clean = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>

/** Saves a Blob the browser received from an authenticated request. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Local calendar date as YYYY-MM-DD (not UTC: the shop's day is the local day). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date, n: number) => {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

/** "2026-10-28" -> a Date at local midnight. */
export const parseDay = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}
