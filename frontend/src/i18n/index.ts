import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { shopLang } from '@/admin/i18n/lang'
import ar from './ar.json'
import fr from './fr.json'

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar } },
  lng: shopLang(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export default i18n
