import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { formatPhone, phoneHref } from '../format'
import { useSettings } from '../queries'

const SOCIAL_LABELS: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp' }

export function Footer() {
  const { t } = useTranslation()
  const { data: s } = useSettings()
  const socials = Object.entries(s?.socials ?? {}).filter(([, url]) => url)

  return (
    <footer className="mt-24 bg-oud text-oud-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <img src="/brand/logo-light.webp" alt={s?.shop_name ?? t('brand.name')} width={900} height={797} className="h-32 w-auto" />
          <p className="max-w-sm text-sm leading-relaxed text-oud-foreground/75">{t('footer.about')}</p>
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-display text-lg">{t('footer.contact')}</p>
          {s?.shop_phone && (
            <p>
              <a href={phoneHref(s.shop_phone)} className="tnum underline-offset-4 hover:underline">
                {formatPhone(s.shop_phone)}
              </a>
            </p>
          )}
          {s?.shop_address && <p className="text-oud-foreground/75">{s.shop_address}</p>}
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {socials.map(([key, url]) => (
                <li key={key}>
                  <a href={url!} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                    {SOCIAL_LABELS[key] ?? key}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-display text-lg">{t('footer.shop')}</p>
          <ul className="space-y-1.5">
            <li>
              <Link to="/boutique" className="underline-offset-4 hover:underline">
                {t('nav.shop')}
              </Link>
            </li>
            <li>
              <Link to="/packs" className="underline-offset-4 hover:underline">
                {t('nav.packs')}
              </Link>
            </li>
            <li>
              <Link to="/panier" className="underline-offset-4 hover:underline">
                {t('nav.cart')}
              </Link>
            </li>
          </ul>
          <p className="pt-2 text-oud-foreground/75">{t('footer.payment')}</p>
        </div>
      </div>
    </footer>
  )
}
