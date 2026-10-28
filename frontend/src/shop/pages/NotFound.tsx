import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { linkButton } from '../components/ui'
import { useDocumentTitle } from '../useDocumentTitle'

export default function NotFound() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.notFound'))

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-4xl sm:text-5xl">{t('notFound.title')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('notFound.text')}</p>
      <Link to="/" className={linkButton('default', 'mt-8')}>
        {t('notFound.home')}
      </Link>
    </div>
  )
}
