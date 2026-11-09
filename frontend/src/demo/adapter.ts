import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { getDb } from './db'
import { dispatch } from './routes'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const data = config.data as unknown
  if (typeof data === 'string' && data) return JSON.parse(data)
  if (typeof FormData !== 'undefined' && data instanceof FormData) return Object.fromEntries(data.entries())

  return {}
}

/** Stands in for the network: the app's requests are answered here, from the demo data kept in the browser. */
export const demoAdapter: AxiosAdapter = async (config) => {
  await wait(40 + Math.random() * 90)

  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries((config.params ?? {}) as Record<string, unknown>)) if (v !== undefined && v !== null && v !== '') query[k] = String(v === true ? 1 : v === false ? 0 : v)

  const path = (config.url ?? '').split('?')[0]
  const { status, body } = await dispatch((config.method ?? 'get').toUpperCase(), path, query, bodyOf(config), getDb())

  const response: AxiosResponse = { data: body, status, statusText: String(status), headers: {}, config, request: {} }
  if (status >= 400) throw new AxiosError((body as { message?: string })?.message ?? 'Request failed', status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response)

  return response
}
