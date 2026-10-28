import { useEffect } from 'react'

const SHOP = 'Boutique de parfums'

/** Sets the tab title (and the description meta) for the current page. */
export function useDocumentTitle(title?: string | null, description?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} – ${SHOP}` : SHOP

    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.content = description
    }
  }, [title, description])
}
