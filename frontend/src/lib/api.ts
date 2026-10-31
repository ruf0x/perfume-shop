import axios, { isAxiosError } from 'axios'

/**
 * The desktop app (Electron) puts a `desktop` bridge on the window: the admin then talks to the server it was
 * set up with, and signs in with a Bearer token instead of a cookie session. On the website there is no bridge.
 */
export const desktop = typeof window === 'undefined' ? undefined : window.desktop
export const isDesktop = desktop !== undefined

const origin = desktop?.apiUrl ?? import.meta.env.VITE_API_URL

export const api = axios.create({
  baseURL: `${origin}/api`,
  withCredentials: !isDesktop,
  withXSRFToken: !isDesktop,
  headers: { Accept: 'application/json' },
})

// Desktop: the token the app keeps (encrypted by the operating system) goes on every call.
if (desktop) {
  api.interceptors.request.use(async (config) => {
    const token = await desktop.getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })
}

/** Fired when the server says the website's admin is switched off, so the page can show "use the desktop app". */
export const WEB_ADMIN_DISABLED = 'web-admin-disabled'

api.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && error.response?.status === 403 && error.response.data?.code === 'web_admin_disabled') {
    window.dispatchEvent(new Event(WEB_ADMIN_DISABLED))
  }

  return Promise.reject(error)
})

/** Must be called before the first state-changing admin request (login). Not needed in the desktop app (no cookie). */
export const ensureCsrfCookie = () => (isDesktop ? Promise.resolve() : axios.get(`${origin}/sanctum/csrf-cookie`, { withCredentials: true }))
