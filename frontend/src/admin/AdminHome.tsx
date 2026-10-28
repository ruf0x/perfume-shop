import { useTranslation } from 'react-i18next'

export default function AdminHome() {
  const { t } = useTranslation()
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">{t('admin.title')}</h1>
    </main>
  )
}
