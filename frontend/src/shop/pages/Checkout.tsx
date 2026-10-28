import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCart } from '@/stores/cart'
import { Field, NativeSelect, fieldClass } from '../components/form'
import { bigButton, linkButton } from '../components/ui'
import { formatPrice } from '../format'
import { useCartQuote, useCommunes, useSettings, useWilayas } from '../queries'
import type { ApiError, DeliveryMode } from '../types'
import { useDocumentTitle } from '../useDocumentTitle'

/** "+213 550 12 34 56", "0550-12-34-56", "0550123456" are all accepted; the server normalises. */
const isPhone = (value: string) => /^0[5-7]\d{8}$/.test(value.replace(/[\s.\-()]/g, '').replace(/^(\+213|00213)/, '0'))

type FormValues = {
  first_name: string
  last_name: string
  phone: string
  phone2: string
  delivery_mode: DeliveryMode
  wilaya_id: string
  commune_id: string
  address: string
  customer_note: string
  website: string
}

const FIELDS: (keyof FormValues)[] = ['first_name', 'last_name', 'phone', 'phone2', 'delivery_mode', 'wilaya_id', 'commune_id', 'address', 'customer_note']

export default function Checkout() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.checkout'))
  const navigate = useNavigate()
  const lines = useCart((s) => s.lines)
  const clear = useCart((s) => s.clear)
  const { data: settings } = useSettings()
  const wilayas = useWilayas()
  const done = useRef(false)
  const [shortages, setShortages] = useState<NonNullable<ApiError['shortages']>>([])

  const schema = useMemo(
    () =>
      z
        .object({
          first_name: z.string().trim().min(1, t('checkout.errors.required')).max(80),
          last_name: z.string().trim().min(1, t('checkout.errors.required')).max(80),
          phone: z.string().trim().min(1, t('checkout.errors.required')).refine(isPhone, t('checkout.errors.phone')),
          phone2: z.string().trim().refine((v) => v === '' || isPhone(v), t('checkout.errors.phone')),
          delivery_mode: z.enum(['domicile', 'stop_desk', 'boutique']),
          wilaya_id: z.string(),
          commune_id: z.string(),
          address: z.string().trim().max(255),
          customer_note: z.string().max(1000),
          website: z.string().max(0),
        })
        .superRefine((v, ctx) => {
          if (v.delivery_mode === 'boutique') return
          const need = (path: keyof FormValues, empty: boolean) => empty && ctx.addIssue({ code: 'custom', path: [path], message: t('checkout.errors.required') })
          need('wilaya_id', !v.wilaya_id)
          need('commune_id', !v.commune_id)
          need('address', !v.address)
        }),
    [t],
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { first_name: '', last_name: '', phone: '', phone2: '', delivery_mode: 'domicile', wilaya_id: '', commune_id: '', address: '', customer_note: '', website: '' },
  })
  const { register, handleSubmit, watch, setValue, setError, formState } = form
  const { errors } = formState
  const mode = watch('delivery_mode')
  const wilayaId = watch('wilaya_id') ? Number(watch('wilaya_id')) : null
  const pickup = mode === 'boutique'

  const communes = useCommunes(pickup ? null : wilayaId)
  const wilaya = wilayas.data?.find((w) => w.id === wilayaId)
  const { data: quote, isFetching: quoting } = useCartQuote(lines, pickup ? null : wilayaId, pickup ? 'boutique' : wilayaId ? mode : null)

  const submit = useMutation({
    mutationFn: (v: FormValues) =>
      api
        .post<{ data: { reference: string; total: number } }>('/orders', {
          first_name: v.first_name.trim(),
          last_name: v.last_name.trim(),
          phone: v.phone.trim(),
          phone2: v.phone2.trim() || undefined,
          delivery_mode: v.delivery_mode,
          wilaya_id: pickup ? undefined : Number(v.wilaya_id),
          commune_id: pickup ? undefined : Number(v.commune_id),
          address: pickup ? undefined : v.address.trim(),
          customer_note: v.customer_note.trim() || undefined,
          website: v.website,
          lines: lines.map((l) => ({ variant_id: l.variantId, quantity: l.qty })),
        })
        .then((r) => r.data.data),
    onSuccess: (order) => {
      done.current = true
      clear()
      navigate(`/commande/merci/${order.reference}`, { replace: true, state: { total: order.total } })
    },
    onError: (err) => {
      setShortages([])
      if (!isAxiosError<ApiError>(err) || !err.response) {
        toast.error(t('checkout.errors.network'))
        return
      }
      const { errors: fieldErrors, message, shortages: short } = err.response.data
      if (short?.length) setShortages(short)
      let shown = false
      for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
        if ((FIELDS as string[]).includes(key)) {
          setError(key as keyof FormValues, { message: messages[0] })
          shown = true
        }
      }
      if (!shown) toast.error(message ?? t('checkout.errors.generic'))
    },
  })

  if (lines.length === 0 && !done.current) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">{t('cart.empty')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('checkout.emptyHint')}</p>
        <Link to="/boutique" className={linkButton('default', 'mt-8')}>
          {t('cart.discover')}
        </Link>
      </div>
    )
  }

  const subtotal = quote?.subtotal ?? lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const freeOver = settings?.free_delivery_over ?? null
  const feeFor = (m: 'domicile' | 'stop_desk') => {
    if (!wilaya) return t('checkout.feeByWilaya')
    if (freeOver !== null && subtotal >= freeOver) return t('common.free')
    return formatPrice(m === 'domicile' ? wilaya.home_fee : wilaya.desk_fee)
  }
  const deliveryFee = quote?.delivery_fee ?? null
  const blocked = quote ? !quote.all_available : false
  const err = (k: keyof FormValues) => errors[k]?.message
  const describe = (k: keyof FormValues) => (errors[k] ? `${k}-error` : undefined)

  const options: { value: DeliveryMode; title: string; text: string; price: string }[] = [
    { value: 'domicile', title: t('checkout.modes.domicile'), text: t('checkout.modes.domicileText'), price: feeFor('domicile') },
    { value: 'stop_desk', title: t('checkout.modes.stop_desk'), text: t('checkout.modes.stop_deskText'), price: feeFor('stop_desk') },
  ]
  if (settings?.store_pickup_enabled) {
    options.push({ value: 'boutique', title: t('checkout.modes.boutique'), text: settings.shop_address ?? t('checkout.modes.boutiqueText'), price: t('common.free') })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <h1 className="text-4xl sm:text-5xl">{t('checkout.title')}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted-foreground">{t('checkout.lead')}</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_380px]">
        <form id="checkout-form" onSubmit={handleSubmit((v) => submit.mutate(v))} noValidate className="space-y-12">
          <section className="space-y-5" aria-labelledby="who">
            <h2 id="who" className="text-2xl">{t('checkout.who')}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="first_name" label={t('checkout.firstName')} error={err('first_name')}>
                <input id="first_name" autoComplete="given-name" aria-invalid={!!errors.first_name} aria-describedby={describe('first_name')} className={fieldClass} {...register('first_name')} />
              </Field>
              <Field id="last_name" label={t('checkout.lastName')} error={err('last_name')}>
                <input id="last_name" autoComplete="family-name" aria-invalid={!!errors.last_name} aria-describedby={describe('last_name')} className={fieldClass} {...register('last_name')} />
              </Field>
              <Field id="phone" label={t('checkout.phone')} error={err('phone')} hint={t('checkout.phoneHint')}>
                <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05 50 12 34 56" aria-invalid={!!errors.phone} aria-describedby={describe('phone') ?? 'phone-hint'} className={fieldClass} {...register('phone')} />
              </Field>
              <Field id="phone2" label={t('checkout.phone2')} error={err('phone2')} optional optionalLabel={t('checkout.optional')}>
                <input id="phone2" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errors.phone2} aria-describedby={describe('phone2')} className={fieldClass} {...register('phone2')} />
              </Field>
            </div>
          </section>

          <section className="space-y-5" aria-labelledby="where">
            <h2 id="where" className="text-2xl">{t('checkout.where')}</h2>

            <fieldset>
              <legend className="sr-only">{t('checkout.mode')}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {options.map((o) => (
                  <label key={o.value} className={cn('flex cursor-pointer flex-col gap-1 rounded-md border border-input bg-card p-4 transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring')}>
                    <input type="radio" value={o.value} className="sr-only" {...register('delivery_mode')} />
                    <span className="font-medium">{o.title}</span>
                    <span className="text-sm text-muted-foreground">{o.text}</span>
                    <span className="tnum mt-auto pt-2 text-sm font-medium">{o.price}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {!pickup && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="wilaya_id" label={t('checkout.wilaya')} error={err('wilaya_id')}>
                  <NativeSelect id="wilaya_id" aria-invalid={!!errors.wilaya_id} aria-describedby={describe('wilaya_id')} {...register('wilaya_id', { onChange: () => setValue('commune_id', '') })}>
                    <option value="">{wilayas.isPending ? t('common.loading') : t('checkout.choose')}</option>
                    {wilayas.data?.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} – {w.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="commune_id" label={t('checkout.commune')} error={err('commune_id')}>
                  <NativeSelect id="commune_id" disabled={!wilayaId} aria-invalid={!!errors.commune_id} aria-describedby={describe('commune_id')} {...register('commune_id')}>
                    <option value="">{!wilayaId ? t('checkout.wilayaFirst') : communes.isPending ? t('common.loading') : t('checkout.choose')}</option>
                    {communes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="address" label={mode === 'stop_desk' ? t('checkout.addressDesk') : t('checkout.address')} error={err('address')} className="sm:col-span-2">
                  <input id="address" autoComplete="street-address" aria-invalid={!!errors.address} aria-describedby={describe('address')} className={fieldClass} {...register('address')} />
                </Field>
              </div>
            )}
          </section>

          <section className="space-y-5" aria-labelledby="note">
            <h2 id="note" className="text-2xl">{t('checkout.noteTitle')}</h2>
            <Field id="customer_note" label={t('checkout.note')} error={err('customer_note')} optional optionalLabel={t('checkout.optional')}>
              <Textarea id="customer_note" rows={3} className="text-base" {...register('customer_note')} />
            </Field>
          </section>

          {/* Honeypot: invisible to people, tempting to bots. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
            </label>
          </div>
        </form>

        <aside className="h-fit space-y-5 rounded-md bg-secondary/70 p-6 lg:sticky lg:top-24" aria-label={t('cart.summary')}>
          <h2 className="text-xl">{t('cart.summary')}</h2>
          <ul className="space-y-3 text-[0.95rem]">
            {lines.map((l) => {
              const q = quote?.lines.find((x) => x.variant_id === l.variantId)
              return (
                <li key={l.variantId} className="flex justify-between gap-4">
                  <span>
                    {l.name} <span className="text-muted-foreground">{l.label} × {l.qty}</span>
                  </span>
                  <span className="tnum shrink-0">{formatPrice(q?.line_total ?? l.price * l.qty)}</span>
                </li>
              )
            })}
          </ul>
          <dl className={cn('space-y-2 border-t border-border pt-4 text-[0.95rem]', quoting && 'opacity-70')}>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('cart.subtotal', { count: lines.reduce((n, l) => n + l.qty, 0) })}</dt>
              <dd className="tnum">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('cart.delivery')}</dt>
              <dd className="tnum">{deliveryFee === null ? t('checkout.feePending') : deliveryFee === 0 ? t('common.free') : formatPrice(deliveryFee)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3 text-lg font-medium">
              <dt>{t('checkout.total')}</dt>
              <dd className="tnum font-display text-2xl">{formatPrice(quote && deliveryFee !== null ? quote.total : subtotal)}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">{t('checkout.payOnDelivery')}</p>

          {(blocked || shortages.length > 0) && (
            <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{t('checkout.stockProblem')}</p>
              {shortages.map((s) => (
                <p key={s.name}>{t('checkout.shortage', { name: s.name, available: s.available, unit: s.unit })}</p>
              ))}
              <Link to="/panier" className="underline underline-offset-4">{t('checkout.editCart')}</Link>
            </div>
          )}

          <Button type="submit" form="checkout-form" className={cn(bigButton, 'h-12 w-full text-base')} disabled={submit.isPending || blocked}>
            {submit.isPending ? t('checkout.sending') : t('checkout.submit')}
          </Button>
          <Link to="/panier" className="block text-center text-sm underline underline-offset-4 hover:no-underline">
            {t('checkout.editCart')}
          </Link>
        </aside>
      </div>
    </div>
  )
}
