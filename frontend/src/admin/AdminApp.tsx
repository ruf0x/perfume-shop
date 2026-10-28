import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { OwnerOnly, RequireAuth } from './auth'
import AdminLayout from './AdminLayout'
import { Loading } from './components/common'
import Login from './pages/Login'

// Each section is its own chunk: the owner downloads a page only when opening it.
const Orders = lazy(() => import('./pages/Orders'))
const Products = lazy(() => import('./pages/Products'))
const ProductForm = lazy(() => import('./pages/ProductForm'))
const Stock = lazy(() => import('./pages/Stock'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const Customers = lazy(() => import('./pages/Customers'))
const SettingsPage = lazy(() => import('./pages/Settings'))

const owner = (el: React.ReactNode) => <OwnerOnly>{el}</OwnerOnly>

/** Everything under /admin. */
export default function AdminApp() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="commandes" replace />} />
          <Route path="commandes" element={<Orders />} />
          <Route path="produits" element={<Products kind="perfume" />} />
          <Route path="produits/nouveau" element={owner(<ProductForm kind="perfume" />)} />
          <Route path="produits/:id" element={<ProductForm kind="perfume" />} />
          <Route path="packs" element={<Products kind="pack" />} />
          <Route path="packs/nouveau" element={owner(<ProductForm kind="pack" />)} />
          <Route path="packs/:id" element={<ProductForm kind="pack" />} />
          <Route path="stock" element={<Stock />} />
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
