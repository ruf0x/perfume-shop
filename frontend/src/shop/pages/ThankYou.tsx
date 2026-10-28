import { Link, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { linkButton } from '../components/ui'
import { formatPrice } from '../format'
import { useSettings } from '../queries'
import { formatPhone, phoneHref } from '../format'
import { useDocumentTitle } from '../useDocumentTitle'

export default function ThankYou() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.thanks'))
  const { reference } = useParams()
  const total = (useLocation().state as { total?: number } | null)?.total
  const { data: settings } = useSettings()
  const steps = t('thanks.steps', { returnObjects: true }) as string[]

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
      <h1 className="text-4xl sm:text-5xl">{t('thanks.title')}</h1>
      <p className="mt-5 text-lg">
        {t('thanks.reference')} <strong className="tnum font-medium">{reference}</strong>
        {total !== undefined && <span className="text-muted-foreground"> {t('thanks.total', { total: formatPrice(total) })}</span>}
      </p>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-muted-foreground">{t('thanks.lead')}</p>

      <ol className="mt-10 space-y-4 border-l-2 border-primary/30 pl-6">
        {steps.map((step) => (
          <li key={step} className="leading-relaxed">
            {step}
          </li>
        ))}
      </ol>

      {settings?.shop_phone && (
        <p className="mt-10 text-muted-foreground">
          {t('thanks.question')}{' '}
          <a href={phoneHref(settings.shop_phone)} className="tnum text-foreground underline underline-offset-4 hover:no-underline">
            {formatPhone(settings.shop_phone)}
          </a>
        </p>
      )}

      <Link to="/boutique" className={linkButton('default', 'mt-10')}>
        {t('thanks.continue')}
      </Link>
    </div>
  )
}
