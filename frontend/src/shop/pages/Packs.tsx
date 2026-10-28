import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ProductGrid } from '../components/ProductGrid'
import { bigButton, linkButton } from '../components/ui'
import { useProducts } from '../queries'
import { useDocumentTitle } from '../useDocumentTitle'

export default function Packs() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.packs'), t('packs.lead'))
  const query = useProducts({ kind: 'pack' }, 12)
  const items = query.data?.pages.flatMap((p) => p.data) ?? []

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
            {query.hasNextPage && (
              <div className="mt-12 flex justify-center">
                <Button variant="outline" className={bigButton} onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                  {t('common.seeMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
