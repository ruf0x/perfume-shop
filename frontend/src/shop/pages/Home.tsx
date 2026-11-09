import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ProductGrid } from '../components/ProductGrid'
import { linkButton } from '../components/ui'
import { useProductTypes, useProducts, useSettings } from '../queries'
import type { ShopProductType } from '../types'
import { useDocumentTitle } from '../useDocumentTitle'
import { brand } from '@/lib/brand'

/** A product type on the home page: its categories as links, and a few of its products. */
function TypeSection({ type }: { type: ShopProductType }) {
  const { t } = useTranslation()
  const products = useProducts({ rayon: type.slug, kind: 'perfume,standard' }, type.profile === 'perfume' ? 8 : 4)
  const items = products.data?.pages.flatMap((p) => p.data) ?? []

  if (!products.isPending && items.length === 0) return null

  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h2 className="text-3xl sm:text-4xl">{type.name}</h2>
        <Link to={`/boutique?rayon=${type.slug}`} className="py-2 text-sm underline underline-offset-4 hover:no-underline">
          {t('home.seeAll')}
        </Link>
      </div>
      {type.profile !== 'perfume' && type.categories.length > 0 && (
        <ul className="mb-8 flex flex-wrap gap-2">
          {type.categories.map((category) => (
            <li key={category.id}>
              <Link to={`/boutique?rayon=${type.slug}&type=${category.slug}`} className="inline-flex h-10 items-center rounded-full border border-input bg-card px-4 text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ProductGrid products={items} loading={products.isPending} skeletons={4} />
    </section>
  )
}

export default function Home() {
  const { t } = useTranslation()
  useDocumentTitle(null, t('meta.homeDescription'))
  const { data: settings } = useSettings()

  const types = useProductTypes()
  const packs = useProducts({ kind: 'pack' }, 3)
  const packItems = packs.data?.pages.flatMap((p) => p.data) ?? []
  const perfumeTypes = (types.data ?? []).filter((x) => x.profile === 'perfume')
  // "parfums, cosmétiques, montres et lunettes": the shop's own types, so the text never lies about what is sold.
  const names = (types.data ?? []).map((x) => x.name.toLowerCase())
  const lead = names.length > 1 ? t('home.leadTypes', { types: new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(names) }) : t('home.lead')
  const steps = t('home.steps', { returnObjects: true }) as { title: string; text: string }[]

  return (
    <>
      <section className="bg-oud text-oud-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:py-24 md:[&:has(>div+div)]:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1 className="text-[2.75rem] leading-[1.02] font-medium sm:text-6xl lg:text-7xl">{t('home.title')}</h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-oud-foreground/80">{lead}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link to="/boutique" className="inline-flex h-12 items-center rounded-md bg-oud-foreground px-6 font-medium text-oud transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oud-foreground">
                {t('home.cta')}
              </Link>
              <a href="#commander" className="py-2 underline underline-offset-4 hover:no-underline">
                {t('home.ctaSecondary')}
              </a>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm justify-center">
            <img src={brand('logo-light')} alt={settings?.shop_name ?? t('brand.name')} width={632} height={900} className="h-auto max-h-[26rem] w-auto max-w-full" />
          </div>
        </div>
      </section>

      {perfumeTypes.map((type) => (
        <section key={type.id} className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <h2 className="text-3xl sm:text-4xl">{perfumeTypes.length > 1 ? type.name : t('home.families')}</h2>
          <ul className="mt-8 divide-y divide-border border-y border-border">
            {type.categories.map((category) => (
              <li key={category.id}>
                <Link
                  to={`/boutique?rayon=${type.slug}&type=${category.slug}`}
                  className="group flex flex-col gap-1 py-5 transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 sm:px-3"
                >
                  <span className="font-display text-2xl sm:text-3xl">{category.name}</span>
                  <span className="text-muted-foreground sm:max-w-sm sm:text-end">{t(`home.familyText.${category.slug}`, { defaultValue: '' })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(types.data ?? []).map((type) => (
        <TypeSection key={type.id} type={type} />
      ))}

      {packItems.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl sm:text-4xl">{t('home.packsTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('home.packsLead')}</p>
            </div>
            <Link to="/packs" className="py-2 text-sm underline underline-offset-4 hover:no-underline">
              {t('home.seeAll')}
            </Link>
          </div>
          <ProductGrid products={packItems} className="md:grid-cols-3 lg:grid-cols-3" />
        </section>
      )}

      <section id="commander" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20 sm:px-6">
        <h2 className="text-3xl sm:text-4xl">{t('home.howTitle')}</h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-5 md:block">
              <span className="font-display text-5xl leading-none text-primary" aria-hidden>
                {i + 1}
              </span>
              <div className="md:mt-4">
                <h3 className="text-xl">{step.title}</h3>
                <p className="mt-2 max-w-xs leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link to="/boutique" className={linkButton('default', 'mt-12')}>
          {t('home.cta')}
        </Link>
      </section>
    </>
  )
}
