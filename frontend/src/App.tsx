import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import ShopLayout from '@/shop/ShopLayout'
import Boutique from '@/shop/pages/Boutique'
import CartPage from '@/shop/pages/CartPage'
import Checkout from '@/shop/pages/Checkout'
import Home from '@/shop/pages/Home'
import NotFound from '@/shop/pages/NotFound'
import Packs from '@/shop/pages/Packs'
import ProductPage from '@/shop/pages/ProductPage'
import ThankYou from '@/shop/pages/ThankYou'

const AdminHome = lazy(() => import('@/admin/AdminHome'))

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<Home />} />
        <Route path="boutique" element={<Boutique />} />
        <Route path="parfum/:slug" element={<ProductPage />} />
        <Route path="pack/:slug" element={<ProductPage />} />
        <Route path="packs" element={<Packs />} />
        <Route path="panier" element={<CartPage />} />
        <Route path="commande" element={<Checkout />} />
        <Route path="commande/merci/:reference" element={<ThankYou />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminHome />
          </Suspense>
        }
      />
    </Routes>
  )
}
