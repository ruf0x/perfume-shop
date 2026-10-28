import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, ensureCsrfCookie } from '@/lib/api'
import type { AdminUser } from './types'

const ME = ['admin', 'me'] as const

/** The signed-in admin, or null. A 401 means "not signed in", not an error. */
export function useMe() {
  return useQuery({
    queryKey: ME,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () =>
      api
        .get<{ data: AdminUser }>('/admin/me')
        .then((r) => r.data.data)
        .catch((e) => {
          if (isAxiosError(e) && e.response?.status === 401) return null
          throw e
        }),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { username: string; password: string }) => {
      await ensureCsrfCookie()
      return api.post<{ data: AdminUser }>('/admin/login', v).then((r) => r.data.data)
    },
    onSuccess: (user) => {
      dropAdminData(qc)
      qc.setQueryData(ME, user)
    },
  })
}

/** Forget everything the previous person saw, but keep the live "who am I" query attached. */
const dropAdminData = (qc: ReturnType<typeof useQueryClient>) => qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'admin' && q.queryKey[1] !== 'me' })

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/admin/logout'),
    onSettled: () => {
      dropAdminData(qc)
      qc.setQueryData(ME, null)
    },
  })
}

const UserContext = createContext<AdminUser | null>(null)

/** The current admin; only call inside <RequireAuth>. */
export const useUser = () => {
  const user = useContext(UserContext)
  if (!user) throw new Error('useUser outside RequireAuth')
  return user
}

export const useIsOwner = () => useUser().role === 'owner'

/** Sends visitors who are not signed in to the login page and remembers where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useMe()
  const location = useLocation()

  if (isPending) return <div className="flex min-h-svh items-center justify-center text-muted-foreground" role="status">Chargement…</div>
  if (isError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-2xl">Serveur injoignable</p>
        <p className="text-muted-foreground">Vérifiez que l'API tourne et que votre connexion fonctionne.</p>
        <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => refetch()}>
          Réessayer
        </button>
      </div>
    )
  }
  if (!user) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

/** Pages only the owner may see (staff are sent back to the orders). */
export function OwnerOnly({ children }: { children: ReactNode }) {
  return useIsOwner() ? children : <Navigate to="/admin/commandes" replace />
}
