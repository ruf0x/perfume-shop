import { getLang, subscribeLang } from '@/admin/i18n/lang'
import i18n from '@/i18n'

/**
 * On the demo site one choice (Arabic or French) applies to the shop, the admin and the guide. The admin sets the page
 * direction itself while it is open; this keeps the shop's side in step with the choice.
 */
export function startDemoLanguage() {
  const html = document.documentElement
  const apply = () => {
    const lang = getLang()
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
    if (!location.hash.startsWith('#/admin')) {
      html.lang = lang
      html.dir = lang === 'ar' ? 'rtl' : 'ltr'
    }
  }

  // The shop's fallback name, when the settings have not arrived yet.
  i18n.addResource('fr', 'translation', 'brand.name', 'Parfumerie Démo')
  subscribeLang(apply)
  window.addEventListener('hashchange', () => setTimeout(apply, 0))
  apply()
}
