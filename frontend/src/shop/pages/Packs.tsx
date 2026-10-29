import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Pager } from '../components/Pager'
import { ProductGrid } from '../components/ProductGrid'
import { bigButton, linkButton } from '../components/ui'
import { usePagedProducts } from '../queries'
import { useDocumentTitle } from '../useDocumentTitle'

export default function Packs() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.packs'), t('packs.lead'))
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = usePagedProducts({ kind: 'pack' }, page)
  const items = query.data?.data ?? []
  const goToPage = (n: number) => setParams((prev) => { const next = new URLSearchParams(prev); n > 1 ? next.set('page', String(n)) : next.delete('page'); return next }, { replace: true })

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <h1 className="text-4xl sm:text-5xl">{t('packs.title')}</h1>
      <p className="mt-3 max-w-lg text-lg text-muted-foreground">{t('packs.lead')}</p>

      <div className="mt-10">
        {query.isError ? (
          <div className="py-10">
            <p className="font-display text-2xl">{t('shopPage.error')}</p>
            <Button className={`${bigButton} mt-5`} onClick={() => query.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : !query.isPending && items.length === 0 ? (
          <div className="py-10">
            <p className="font-display text-2xl">{t('packs.empty')}</p>
            <Link to="/boutique" className={linkButton('default', 'mt-5')}>
              {t('cart.discover')}
            </Link>
          </div>
        ) : (
          <>
            <ProductGrid products={items} loading={query.isPending} skeletons={6} className="md:grid-cols-3 lg:grid-cols-3" />
            <Pager page={query.data?.meta.current_page ?? page} lastPage={query.data?.meta.last_page ?? 1} total={query.data?.meta.total ?? 0} onPage={goToPage} />
          </>
        )}
      </div>
    </div>
  )
}
