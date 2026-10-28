const number = new Intl.NumberFormat('fr-FR')

/** 1500 -> "1 500 DA" (non-breaking spaces so a price never wraps). */
export const formatPrice = (amount: number) => `${number.format(amount).replace(/[\s ]/g, ' ')} DA`

/** "0550123456" -> "05 50 12 34 56" */
export const formatPhone = (phone: string) => phone.replace(/\D/g, '').replace(/(\d{2})(?=\d)/g, '$1 ').trim()

/** Telephone href that works for "+213 ..." and "0550 ..." alike. */
export const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
