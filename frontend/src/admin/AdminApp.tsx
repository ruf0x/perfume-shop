import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { OwnerOnly, RequireAuth, useIsOwner } from './auth'
import AdminLayout from './AdminLayout'
import { Loading } from './components/common'
import Login from './pages/Login'

// Each section is its own chunk: the owner downloads a page only when opening it.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Caisse = lazy(() => import('./pages/Caisse'))
const Orders = lazy(() => import('./pages/Orders'))
const Products = lazy(() => import('./pages/Products'))
const ProductForm = lazy(() => import('./pages/ProductForm'))
const Stock = lazy(() => import('./pages/Stock'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const ProductTypes = lazy(() => import('./pages/ProductTypes'))
const Customers = lazy(() => import('./pages/Customers'))
const SettingsPage = lazy(() => import('./pages/Settings'))

const owner = (el: React.ReactNode) => <OwnerOnly>{el}</OwnerOnly>

function Home() {
  return useIsOwner() ? <Dashboard /> : <Navigate to="commandes" replace />
}

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
