import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

export default function ShopHome() {
  const { t } = useTranslation()
  const ping = useQuery({ queryKey: ['ping'], queryFn: () => api.get('/ping').then((r) => r.data) })

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">{t('shop.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        API : {ping.isPending ? '…' : ping.isError ? 'injoignable' : 'OK'}
      </p>
    </main>
  )
}
