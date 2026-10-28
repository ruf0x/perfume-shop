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
