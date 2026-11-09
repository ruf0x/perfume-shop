import { ChevronLeft, ChevronRight, Compass, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLogin, useMe } from '@/admin/auth'
import { useLang } from '@/admin/i18n/lang'
import { resetDemo } from './db'
import { DEMO_CONTACT, TOUR } from './tour'

const read = (key: string) => {
  try {
    return localStorage.getItem(`demo-tour-${key}`)
  } catch {
    return null
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(`demo-tour-${key}`, value)
  } catch {
    /* not remembered */
  }
}

const WORDS = {
  fr: { guide: 'Guide de la démo', step: 'Étape', of: 'sur', next: 'Suivant', prev: 'Précédent', there: 'Aller à cette page', again: 'Recommencer la démo', note: 'Démo : données fictives, enregistrées dans votre navigateur seulement.', open: 'Ouvrir le guide', close: 'Réduire', end: 'Terminer', reset: 'La démo est remise à zéro.' },
  ar: { guide: 'دليل النسخة التجريبية', step: 'الخطوة', of: 'من', next: 'التالي', prev: 'السابق', there: 'الانتقال إلى هذه الصفحة', again: 'إعادة التجربة من البداية', note: 'نسخة تجريبية: بيانات وهمية تُحفَظ في متصفحكم فقط.', open: 'فتح الدليل', close: 'تصغير', end: 'إنهاء', reset: 'أُعيدت التجربة إلى الصفر.' },
} as const

/** The guided tour of the demo site: a small panel that walks through the shop and the admin, page by page. */
export default function DemoKit() {
  const [open, setOpen] = useState(() => read('open') !== '0')
  const [index, setIndex] = useState(() => Math.min(Number(read('step') ?? 0) || 0, TOUR.length - 1))
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const adminLang = useLang()
  const { data: user } = useMe()
  const login = useLogin()

  const ar = adminLang === 'ar'
  const t = ar ? WORDS.ar : WORDS.fr
  const lang = ar ? 'ar' : 'fr'
  const step = TOUR[index]

  useEffect(() => write('open', open ? '1' : '0'), [open])
  useEffect(() => write('step', String(index)), [index])

  // Make the step's element blink once the page has drawn it.
  useEffect(() => {
    if (!step.focus || !open) return
    let element: Element | null = null
    let tries = 0
    const find = () => {
      element = document.querySelector(step.focus!)
      if (element) element.classList.add('demo-focus')
      else if (tries++ < 15) timer = setTimeout(find, 200)
    }
    let timer = setTimeout(find, 150)

    return () => {
      clearTimeout(timer)
      element?.classList.remove('demo-focus')
    }
  }, [step, open, pathname])

  const go = async (to: number) => {
    const target = TOUR[to]
    if (target.admin && !user) {
      try {
        await login.mutateAsync({ username: 'admin', password: 'demo' })
      } catch {
        return toast.error('Connexion impossible.')
      }
    }
    setIndex(to)
    // On a phone the guide would hide the page: it folds itself, the button brings it back.
    if (window.innerWidth < 640) setOpen(false)
    navigate(target.path)
  }

  const last = index === TOUR.length - 1

  return (
    <>
      <style>{`.demo-focus{outline:3px solid #d97706;outline-offset:3px;border-radius:.6rem;animation:demo-blink 1.2s ease-in-out infinite}@keyframes demo-blink{50%{outline-color:transparent}}`}</style>

      {/* Bottom centre, below the drawers and dialogs (z-50): when one opens, it covers the guide instead of the guide covering its buttons. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[45] flex flex-col items-center gap-2 px-3" dir={ar ? 'rtl' : 'ltr'}>
        {open && (
          <section role="dialog" aria-label={t.guide} className="pointer-events-auto max-h-[60svh] w-[24rem] max-w-full overflow-y-auto rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tnum font-medium">{`${t.step} ${index + 1} ${t.of} ${TOUR.length}`}</span>
              <button type="button" onClick={() => setOpen(false)} className="flex size-7 items-center justify-center rounded-md hover:bg-secondary" aria-label={t.close}>
                <X className="size-4" />
              </button>
            </div>
            <div className="mb-3 flex gap-1" aria-hidden>
              {TOUR.map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-sidebar-primary' : 'bg-border'}`} />
              ))}
            </div>

            <h2 className="mb-1 text-base font-semibold">{step.title[lang]}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.text[lang]}</p>
            {step.tips[lang].length > 0 && (
              <ul className="mt-3 list-disc space-y-1 ps-5 text-sm">
                {step.tips[lang].map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            )}
            {last && DEMO_CONTACT && <p className="mt-3 rounded-lg bg-secondary p-3 text-sm font-medium">{DEMO_CONTACT}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-9 px-3" disabled={index === 0 || login.isPending} onClick={() => go(index - 1)}>
                <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
                {t.prev}
              </Button>
              <Button variant="outline" className="h-9 px-3" onClick={() => go(index)} disabled={login.isPending}>
                {t.there}
              </Button>
              {!last && (
                <Button className="ms-auto h-9 px-3" disabled={login.isPending} onClick={() => go(index + 1)}>
                  {t.next}
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                </Button>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{t.note}</span>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 font-medium underline underline-offset-4 hover:no-underline"
                onClick={() => {
                  toast.success(t.reset)
                  setTimeout(resetDemo, 400)
                }}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t.again}
              </button>
            </div>
          </section>
        )}

        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="pointer-events-auto flex items-center gap-2 rounded-full bg-sidebar-primary px-4 py-2.5 text-sm font-medium text-sidebar-primary-foreground shadow-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring">
            <Compass className="size-4" aria-hidden />
            {t.open}
          </button>
        )}
      </div>
    </>
  )
}
