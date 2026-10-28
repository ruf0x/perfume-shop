import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import ShopHome from '@/shop/ShopHome'

const AdminHome = lazy(() => import('@/admin/AdminHome'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ShopHome />} />
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
