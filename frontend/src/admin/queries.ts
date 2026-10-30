import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { clean } from './lib'
import { prepareImage } from './imagePrep'
import type { AdminProduct, AdminUser, AdminWilaya, Customer, Dashboard, Meta, Movement, Order, OrderAction, OrderFilters, OrdersPage, ShopSettings, StockRow, Taxon } from './types'

/** Everything the admin shows may have changed after a write; "me" is left alone. */
const refresh = (qc: QueryClient) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'admin' && q.queryKey[1] !== 'me' })

const PAGE = 20

// ── orders ───────────────────────────────────────────────────────────────
export const useOrders = (filters: OrderFilters) =>
  useQuery({
    queryKey: ['admin', 'orders', filters],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<OrdersPage>('/admin/orders', { params: { ...clean(filters), per_page: PAGE } }).then((r) => r.data),
  })

export const useOrder = (id: number | null) =>
  useQuery({
    queryKey: ['admin', 'order', id],
    enabled: id !== null,
    queryFn: () => api.get<{ data: Order }>(`/admin/orders/${id}`).then((r) => r.data.data),
  })

export interface TransitionPayload {
  action: OrderAction
  note?: string
  reason?: string
  restock?: boolean
  delivery_company?: string
  tracking_number?: string
}

export function useOrderAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: TransitionPayload & { id: number }) => api.post<{ data: Order }>(`/admin/orders/${id}/transition`, body).then((r) => r.data.data),
    onSuccess: () => refresh(qc),
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) => api.put<{ data: Order }>(`/admin/orders/${id}`, body).then((r) => r.data.data),
    onSuccess: () => refresh(qc),
  })
}

export async function exportOrders(filters: OrderFilters): Promise<Blob> {
  const { page: _page, ...rest } = filters
  return api.get('/admin/orders/export', { params: clean(rest), responseType: 'blob' }).then((r) => r.data)
}

// ── products & packs ────────────────────────────────────────────────────
export interface ProductParams {
  q?: string
  /** One or several kinds, comma-separated: `perfume,cosmetic`. */
  kind?: string
  type_id?: number
  active?: boolean
  low_stock?: boolean
  page?: number
}

export const useAdminProducts = (params: ProductParams, perPage = 30) =>
  useQuery({
    queryKey: ['admin', 'products', params, perPage],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api
        .get<{ data: AdminProduct[]; meta: Meta }>('/admin/products', { params: { ...clean(params), active: params.active === undefined ? undefined : params.active ? 1 : 0, low_stock: params.low_stock ? 1 : undefined, per_page: perPage } })
        .then((r) => r.data),
  })

export const useAdminProduct = (id: number | null) =>
  useQuery({
    queryKey: ['admin', 'product', id],
    enabled: id !== null,
    queryFn: () => api.get<{ data: AdminProduct }>(`/admin/products/${id}`).then((r) => r.data.data),
  })

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: number } & Record<string, unknown>) =>
      (id ? api.put<{ data: AdminProduct }>(`/admin/products/${id}`, body) : api.post<{ data: AdminProduct }>('/admin/products', body)).then((r) => r.data.data),
    onSuccess: () => refresh(qc),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: number) => api.delete(`/admin/products/${id}`), onSuccess: () => refresh(qc) })
}

export function useProductImages(productId: number) {
  const qc = useQueryClient()
  const done = () => refresh(qc)
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const form = new FormData()
        form.append('image', await prepareImage(file))
        return api.post(`/admin/products/${productId}/images`, form)
      },
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (imageId: number) => api.delete(`/admin/images/${imageId}`), onSuccess: done }),
    reorder: useMutation({ mutationFn: (ids: number[]) => api.put(`/admin/products/${productId}/images/order`, { ids }), onSuccess: done }),
  }
}

// ── types & brands ──────────────────────────────────────────────────────
export type TaxonKind = 'types' | 'brands'

export const useTaxa = (kind: TaxonKind) =>
  useQuery({ queryKey: ['admin', kind], queryFn: () => api.get<{ data: Taxon[] }>(`/admin/${kind}`).then((r) => r.data.data) })

export function useSaveTaxon(kind: TaxonKind) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: number } & Record<string, unknown>) => (id ? api.put(`/admin/${kind}/${id}`, body) : api.post(`/admin/${kind}`, body)),
    onSuccess: () => refresh(qc),
  })
}

export function useDeleteTaxon(kind: TaxonKind) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: number) => api.delete(`/admin/${kind}/${id}`), onSuccess: () => refresh(qc) })
}

// ── stock ───────────────────────────────────────────────────────────────
export const useStock = (params: { q?: string; status?: 'ok' | 'low' | 'out'; kind?: 'perfume' | 'cosmetic'; type_id?: number }) =>
  useQuery({
    queryKey: ['admin', 'stock', params],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<{ data: StockRow[]; low_stock_threshold_ml: number; low_stock_threshold_qty: number }>('/admin/stock', { params: clean(params) }).then((r) => r.data),
  })

export interface MovementParams {
  product_id?: number
  type?: string
  from?: string
  to?: string
  page?: number
}

export const useMovements = (params: MovementParams) =>
  useQuery({
    queryKey: ['admin', 'movements', params],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<{ data: Movement[]; meta: Meta }>('/admin/stock/movements', { params: { ...clean(params), per_page: 30 } }).then((r) => r.data),
  })

export function useStockWrite() {
  const qc = useQueryClient()
  const done = () => refresh(qc)
  return {
    entry: useMutation({ mutationFn: (body: { product_id: number; variant_id?: number; ml?: number; qty?: number; unit_cost?: number; note?: string }) => api.post('/admin/stock/entries', body), onSuccess: done }),
    adjust: useMutation({ mutationFn: (body: { product_id: number; variant_id?: number; type: 'ajustement' | 'perte'; ml_change?: number; qty_change?: number; note: string }) => api.post('/admin/stock/adjustments', body), onSuccess: done }),
    openBottle: useMutation({ mutationFn: (variantId: number) => api.post('/admin/stock/open-bottle', { variant_id: variantId }), onSuccess: done }),
  }
}

// ── customers ───────────────────────────────────────────────────────────
export const useCustomers = (params: { q?: string; blacklisted?: boolean; sort?: 'orders_count' | 'created_at'; page?: number }) =>
  useQuery({
    queryKey: ['admin', 'customers', params],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<{ data: Customer[]; meta: Meta }>('/admin/customers', { params: { ...clean(params), blacklisted: params.blacklisted ? 1 : undefined } }).then((r) => r.data),
  })

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) => api.patch(`/admin/customers/${id}`, body), onSuccess: () => refresh(qc) })
}

// ── settings, wilayas, users ────────────────────────────────────────────
export const useAdminSettings = () =>
  useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<{ data: ShopSettings }>('/admin/settings').then((r) => r.data.data) })

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<ShopSettings>) => api.put<{ data: ShopSettings }>('/admin/settings', body).then((r) => r.data.data),
    onSuccess: () => {
      refresh(qc)
      qc.invalidateQueries({ queryKey: ['settings'] }) // the storefront's copy
    },
  })
}

export const useAdminWilayas = () =>
  useQuery({ queryKey: ['admin', 'wilayas'], queryFn: () => api.get<{ data: AdminWilaya[] }>('/admin/wilayas').then((r) => r.data.data) })

export function useUpdateWilaya() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Pick<AdminWilaya, 'home_fee' | 'desk_fee' | 'is_active'>>) => api.put(`/admin/wilayas/${id}`, body),
    onSuccess: () => {
      refresh(qc)
      qc.invalidateQueries({ queryKey: ['wilayas'] })
    },
  })
}

export const useUsers = () => useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<{ data: AdminUser[] }>('/admin/users').then((r) => r.data.data) })

export function useSaveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: number } & Record<string, unknown>) => (id ? api.put(`/admin/users/${id}`, body) : api.post('/admin/users', body)),
    onSuccess: () => refresh(qc),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: number) => api.delete(`/admin/users/${id}`), onSuccess: () => refresh(qc) })
}

export const useChangePassword = () =>
  useMutation({ mutationFn: (body: { current_password: string; password: string; password_confirmation: string }) => api.put('/admin/me/password', body) })

// ── dashboard & caisse ───────────────────────────────────────────────────
export const useDashboard = (from: string, to: string) =>
  useQuery({
    queryKey: ['admin', 'dashboard', from, to],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<{ data: Dashboard }>('/admin/dashboard', { params: { from, to } }).then((r) => r.data.data),
  })

export interface PosSalePayload {
  /** `unit_price` only when the cashier sells at another price than the catalogue's. */
  lines: { variant_id: number; quantity: number; unit_price?: number }[]
  discount?: number
  payment_method: 'especes' | 'carte' | 'ccp'
  amount_received?: number
  first_name?: string
  last_name?: string
  phone?: string
}

export function usePosSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PosSalePayload) => api.post<{ data: Order }>('/admin/pos/sales', body).then((r) => r.data.data),
    onSuccess: () => refresh(qc), // stock, products, orders and dashboard all changed
  })
}
