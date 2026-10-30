import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from './queries'

/** Sets the tab title (and the description meta) for the current page. The shop name comes from the settings. */
export function useDocumentTitle(title?: string | null, description?: string | null) {
  const { t } = useTranslation()
  const { data: settings } = useSettings()
  const shop = settings?.shop_name ?? t('brand.name')

  useEffect(() => {
    document.title = title ? `${title} – ${shop}` : shop

    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }
  }, [title, description, shop])
}
