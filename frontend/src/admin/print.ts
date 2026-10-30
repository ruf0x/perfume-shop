import { formatPhone, formatPrice } from '@/shop/format'
import { formatDateTime } from './lib'
import type { Order } from './types'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const MODE: Record<string, string> = { domicile: 'À domicile', stop_desk: 'Point relais', boutique: 'Retrait en boutique' }

/** Opens a printable order slip (bon de commande) in a new window and prints it. */
export function printOrderSlip(order: Order, shopName: string) {
  const c = order.customer
  const rows = (order.items ?? [])
    .map((i) => `<tr><td>${esc(i.product_name)} <small>${esc(i.variant_label)}</small></td><td class="n">${i.quantity}</td><td class="n">${formatPrice(i.unit_price)}</td><td class="n">${formatPrice(i.line_total)}</td></tr>`)
    .join('')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(order.reference)}</title>
<style>
  body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:24px;max-width:720px}
  h1{font-size:20px;margin:0 0 2px} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
  table{width:100%;border-collapse:collapse} td,th{padding:5px 4px;border-bottom:1px solid #e5e5e5;text-align:left;vertical-align:top}
  .n{text-align:right;white-space:nowrap} small{color:#555} .total td{font-weight:700;font-size:16px;border-bottom:0}
  .meta{color:#555;margin:0 0 12px} .box{border:1px solid #bbb;padding:8px;min-height:40px}
  @media print{body{margin:0}}
</style></head><body>
  <h1>${esc(shopName)}</h1>
  <p class="meta">Bon de commande ${esc(order.reference)}, ${esc(formatDateTime(order.created_at))}</p>

  <h2>Client</h2>
  <div>${esc([c.first_name, c.last_name].filter(Boolean).join(' '))}</div>
  <div>${c.phone ? esc(formatPhone(c.phone)) : ''}${c.phone2 ? ` / ${esc(formatPhone(c.phone2))}` : ''}</div>
  <div>${esc([order.address, order.commune?.name, order.wilaya?.name].filter(Boolean).join(', '))}</div>
  <div><small>${esc(order.delivery_mode ? MODE[order.delivery_mode] : '')}</small></div>
  ${order.customer_note ? `<div><small>Note du client : ${esc(order.customer_note)}</small></div>` : ''}

  <h2>Articles</h2>
  <table><thead><tr><th>Article</th><th class="n">Qté</th><th class="n">Prix</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="3" class="n">Sous-total</td><td class="n">${formatPrice(order.subtotal)}</td></tr>
    <tr><td colspan="3" class="n">Livraison</td><td class="n">${formatPrice(order.delivery_fee)}</td></tr>
    ${order.discount ? `<tr><td colspan="3" class="n">Remise</td><td class="n">−${formatPrice(order.discount)}</td></tr>` : ''}
    <tr class="total"><td colspan="3" class="n">À encaisser</td><td class="n">${formatPrice(order.total)}</td></tr>
  </tfoot></table>

  <h2>Notes</h2>
  <div class="box">${esc(order.admin_note)}</div>
  <script>window.onload=()=>{window.print()}</script>
</body></html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}

const PAYMENT: Record<string, string> = { especes: 'Espèces', carte: 'Carte', ccp: 'CCP / BaridiMob', cod: 'À la livraison' }

/** Opens an 80 mm thermal-printer receipt (ticket de caisse) in a new window and prints it. */
export function printReceipt(order: Order, shop: { name: string; phone?: string | null; address?: string | null }) {
  const c = order.customer
  const lines = (order.items ?? [])
    .map((i) => `<div class="row"><span>${esc(i.product_name)} ${esc(i.variant_label)}</span></div><div class="row sub"><span>${i.quantity} x ${formatPrice(i.unit_price)}</span><span>${formatPrice(i.line_total)}</span></div>${i.list_price && i.list_price > i.unit_price ? `<div class="sub muted">Prix normal ${formatPrice(i.list_price)}</div>` : ''}`)
    .join('')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(order.reference)}</title>
<style>
  @page{size:80mm auto;margin:0}
  body{width:72mm;margin:3mm 4mm;font:12px/1.35 "Courier New",monospace;color:#000}
  h1{font-size:15px;text-align:center;margin:0 0 2px} .c{text-align:center} .muted{color:#333;font-size:11px}
  .row{display:flex;justify-content:space-between;gap:6px} .sub{padding-left:8px;font-size:11px}
  hr{border:0;border-top:1px dashed #000;margin:6px 0} .total{font-size:15px;font-weight:700}
</style></head><body>
  <h1>${esc(shop.name)}</h1>
  <div class="c muted">${esc(shop.address ?? '')}${shop.phone ? `<br>${esc(formatPhone(shop.phone))}` : ''}</div>
  <hr>
  <div class="row"><span>Ticket ${esc(order.reference)}</span><span>${esc(formatDateTime(order.created_at))}</span></div>
  ${order.created_by ? `<div class="muted">Vendeur : ${esc(order.created_by)}</div>` : ''}
  ${c.first_name || c.last_name ? `<div class="muted">Client : ${esc([c.first_name, c.last_name].filter(Boolean).join(' '))}</div>` : ''}
  <hr>
  ${lines}
  <hr>
  <div class="row"><span>Sous-total</span><span>${formatPrice(order.subtotal)}</span></div>
  ${order.discount ? `<div class="row"><span>Remise</span><span>-${formatPrice(order.discount)}</span></div>` : ''}
  <div class="row total"><span>TOTAL</span><span>${formatPrice(order.total)}</span></div>
  <div class="row"><span>Paiement</span><span>${esc(PAYMENT[order.payment_method] ?? order.payment_method)}</span></div>
  ${order.amount_received !== null ? `<div class="row"><span>Reçu</span><span>${formatPrice(order.amount_received)}</span></div><div class="row"><span>Rendu</span><span>${formatPrice(order.change_due ?? 0)}</span></div>` : ''}
  <hr>
  <div class="c">Merci de votre visite !</div>
  <script>window.onload=()=>{window.print()}</script>
</body></html>`

  const w = window.open('', '_blank', 'width=420,height=720')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
