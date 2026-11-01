import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { api, isDesktop, WEB_ADMIN_DISABLED } from '@/lib/api'
import { OwnerOnly, RequireAuth, useIsOwner } from './auth'
import AdminLayout from './AdminLayout'
import { Loading } from './components/common'
import Login from './pages/Login'
import { useLang } from './i18n/lang'
import { startTranslator } from './i18n/translate'

// Each section is its own chunk: the owner downloads a page only when opening it.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Caisse = lazy(() => import('./pages/Caisse'))
const Orders = lazy(() => import('./pages/Orders'))
const Products = lazy(() => import('./pages/Products'))
const ProductForm = lazy(() => import('./pages/ProductForm'))
const Stock = lazy(() => import('./pages/Stock'))
const Bottles = lazy(() => import('./pages/Bottles'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const ProductTypes = lazy(() => import('./pages/ProductTypes'))
const Customers = lazy(() => import('./pages/Customers'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const WebAdminDisabled = lazy(() => import('./pages/WebAdminDisabled'))

const owner = (el: React.ReactNode) => <OwnerOnly>{el}</OwnerOnly>

function Home() {
  return useIsOwner() ? <Dashboard /> : <Navigate to="commandes" replace />
}

/**
 * Whether the website's admin is switched off by the owner. Only the website cares: the desktop app always works.
 * `checking` is true until the server has answered; the server also refuses the calls, this just shows a clear page.
 */
function useWebAdminOff() {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const on = () => setBlocked(true)
    window.addEventListener(WEB_ADMIN_DISABLED, on)

    return () => window.removeEventListener(WEB_ADMIN_DISABLED, on)
  }, [])

  const query = useQuery({
    queryKey: ['web-admin-enabled'],
    enabled: !isDesktop,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: () => api.get<{ data: { web_admin_enabled?: boolean } }>('/settings/public').then((r) => r.data.data.web_admin_enabled !== false),
  })

  if (isDesktop) return { off: false, checking: false }

  return { off: blocked || query.data === false, checking: query.isPending && !blocked }
}

/** Everything under /admin. */
export default function AdminApp() {
  const { off, checking } = useWebAdminOff()
  const lang = useLang()

  // Arabic: the texts are translated after React draws them, and the page switches to right-to-left.
  useEffect(() => startTranslator(), [lang])

  if (checking) return <Loading />
  if (off) return <Suspense fallback={<Loading />}><WebAdminDisabled /></Suspense>

  return (
    <Suspense key={lang} fallback={<Loading />}>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          {/* The owner lands on the dashboard; staff on the orders. */}
          <Route index element={<Home />} />
          <Route path="caisse" element={<Caisse />} />
          <Route path="commandes" element={<Orders />} />
          <Route path="produits" element={<Products kind="goods" />} />
          <Route path="produits/nouveau" element={owner(<ProductForm />)} />
          <Route path="produits/:id" element={<ProductForm />} />
          <Route path="packs" element={<Products kind="pack" />} />
          <Route path="packs/nouveau" element={owner(<ProductForm kind="pack" />)} />
          <Route path="packs/:id" element={<ProductForm kind="pack" />} />
          <Route path="stock" element={<Stock />} />
          <Route path="bouteilles" element={owner(<Bottles />)} />
          <Route path="types-de-produits" element={owner(<ProductTypes />)} />
          <Route path="types" element={owner(<Taxonomy kind="types" />)} />
          <Route path="marques" element={owner(<Taxonomy kind="brands" />)} />
          <Route path="clients" element={owner(<Customers />)} />
          <Route path="parametres" element={owner(<SettingsPage />)} />
          <Route path="*" element={<Navigate to="commandes" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
