import { useState } from 'react'
import { setLang, type AdminLang } from '@/admin/i18n/lang'
import { brand } from '@/lib/brand'

const KEY = 'demo-lang-chosen'

const chosen = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** First screen of the demo: the visitor picks Arabic or French, once; it applies to the shop, the admin and the guide. */
export function LanguageGate() {
  const [done, setDone] = useState(chosen)
  if (done) return null

  const pick = (lang: AdminLang) => {
    setLang(lang)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* asked again next time */
    }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6" role="dialog" aria-modal="true" aria-label="Langue / اللغة" dir="ltr">
      <div className="w-full max-w-md text-center">
        <img src={brand('logo-mark')} alt="" width={221} height={256} className="mx-auto mb-5 h-20 w-auto" />
        <h1 className="font-display text-3xl">Parfumerie Démo</h1>
        <p className="mt-3 text-muted-foreground">Choisissez votre langue</p>
        <p className="text-muted-foreground" lang="ar" dir="rtl">اختر لغتك</p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <button type="button" lang="fr" onClick={() => pick('fr')} className="rounded-2xl border border-border bg-card px-4 py-6 text-xl font-medium shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring">
            Français
          </button>
          <button type="button" lang="ar" onClick={() => pick('ar')} className="rounded-2xl border border-border bg-card px-4 py-6 text-xl font-medium shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
            العربية
          </button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Vous pourrez changer à tout moment · يمكنك التغيير في أي وقت</p>
      </div>
    </div>
  )
}
