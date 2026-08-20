
import type { Order, OrderItem, Menu } from '../types'

function generateInvoiceId(): string {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth()+1).padStart(2,'0')
  const d = String(date.getDate()).padStart(2,'0')
  const rand = Math.floor(Math.random()*9000+1000)
  return `INV-AIW-${y}${m}${d}-${rand}`
}

export function calculateOrder(items: {menu: Menu, qty: number}[], discount = 0, dp = 0, taxRate = 0) {
  const orderItems: OrderItem[] = items.map(({menu, qty}) => ({
    menu_id: menu.id,
    name: menu.name,
    qty,
    price: menu.price,
    subtotal: menu.price * qty
  }))
  const subtotal = orderItems.reduce((s,i)=>s+i.subtotal,0)
  const tax = Math.round(subtotal * taxRate)
  const total = subtotal - discount + tax
  const remaining = Math.max(0, total - dp)
  
  return { items: orderItems, subtotal, discount, tax, total, dp, remaining }
}

export function createOrderFromMenus(
  tenantId: string,
  customerName: string,
  customerWa: string,
  items: {menu: Menu, qty: number}[],
  opts: { discount?: number, dp?: number, pickupTime?: string, customText?: string, niche?: any } = {}
): Order {
  const calc = calculateOrder(items, opts.discount||0, opts.dp||0)
  const now = new Date().toISOString()
  
  return {
    id: `ord_${Date.now()}`,
    tenant_id: tenantId,
    invoice_no: generateInvoiceId(),
    customer_name: customerName,
    customer_wa: customerWa,
    items: calc.items,
    subtotal: calc.subtotal,
    discount: calc.discount,
    tax: calc.tax,
    total: calc.total,
    dp: calc.dp,
    remaining: calc.remaining,
    status: calc.dp>0 && calc.remaining>0 ? 'dp' : calc.remaining===0 ? 'lunas' : 'pending',
    niche: opts.niche || 'bakery',
    pickup_time: opts.pickupTime,
    custom_text: opts.customText,
    created_at: now
  }
}

// Real PDF generation
export async function generateInvoicePDF(order: Order, tenantName: string) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const now = new Date()
  
  doc.setFontSize(20)
  doc.setFont('helvetica','bold')
  doc.text('aiwaku', 15, 18)
  doc.setFontSize(10)
  doc.setFont('helvetica','normal')
  doc.text(`${tenantName}`, 15, 24)
  doc.text(`app.aiwaku.id | ${now.toLocaleDateString('id-ID')}`, 15, 29)
  
  doc.setFontSize(12)
  doc.setFont('helvetica','bold')
  doc.text(order.invoice_no, 130, 18)
  doc.setFontSize(9)
  doc.setFont('helvetica','normal')
  doc.text(`Customer: ${order.customer_name}`, 130, 24)
  doc.text(`WA: ${order.customer_wa}`, 130, 28)
  doc.text(`Status: ${order.status.toUpperCase()}`, 130, 32)
  if (order.pickup_time) doc.text(`Ambil: ${order.pickup_time}`, 130, 36)
  if (order.custom_text) doc.text(`Catatan: ${order.custom_text}`, 130, 40)
  
  doc.setFontSize(10)
  doc.setFont('helvetica','bold')
  doc.text('Item', 15, 50)
  doc.text('Qty', 110, 50)
  doc.text('Harga', 130, 50)
  doc.text('Subtotal', 160, 50)
  doc.line(15,52,195,52)
  
  let y = 60
  doc.setFont('helvetica','normal')
  order.items.forEach(it => {
    doc.text(it.name.substring(0,35), 15, y)
    doc.text(String(it.qty), 110, y)
    doc.text(`Rp${it.price.toLocaleString('id-ID')}`, 130, y)
    doc.text(`Rp${it.subtotal.toLocaleString('id-ID')}`, 160, y)
    y+=7
  })
  
  y+=2
  doc.line(15,y,195,y)
  y+=8
  doc.text(`Subtotal: Rp${order.subtotal.toLocaleString('id-ID')}`, 130, y)
  y+=6
  if (order.discount>0) { doc.text(`Diskon: -Rp${order.discount.toLocaleString('id-ID')}`, 130, y); y+=6 }
  if (order.tax>0) { doc.text(`Pajak: Rp${order.tax.toLocaleString('id-ID')}`, 130, y); y+=6 }
  doc.setFont('helvetica','bold')
  doc.setFontSize(12)
  doc.text(`TOTAL: Rp${order.total.toLocaleString('id-ID')}`, 130, y)
  y+=7
  doc.setFontSize(10)
  doc.setFont('helvetica','normal')
  doc.text(`DP: Rp${order.dp.toLocaleString('id-ID')} | Sisa: Rp${order.remaining.toLocaleString('id-ID')}`, 130, y)
  
  y+=12
  doc.setFontSize(9)
  doc.text('Pembayaran: QRIS BCA / Transfer / GoPay', 15, y)
  y+=5
  doc.text('Terima kasih - Powered by aiwaku.id', 15, y)
  y+=5
  doc.text(`Dicetak: ${now.toLocaleString('id-ID')}`, 15, y)
  
  return doc
}

export async function generateStruk80mm(order: Order, tenantName: string) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: [80, 200] })
  
  doc.setFontSize(11)
  doc.setFont('helvetica','bold')
  doc.text(`aiwaku`, 5, 8)
  doc.setFontSize(9)
  doc.text(`${tenantName}`, 5, 12)
  doc.setFontSize(7)
  doc.setFont('helvetica','normal')
  doc.text(`${order.invoice_no}`, 5, 15)
  doc.text(`${new Date().toLocaleString('id-ID')}`, 5, 18)
  doc.text('--------------------------------', 5, 21)
  doc.text(`${order.customer_name}`, 5, 24)
  doc.text(`${order.customer_wa}`, 5, 27)
  
  let y = 31
  order.items.forEach(it => {
    doc.text(`${it.name} x${it.qty}`, 5, y)
    doc.text(`Rp${it.subtotal.toLocaleString('id-ID')}`, 55, y)
    y+=4
  })
  doc.text('--------------------------------', 5, y)
  y+=4
  doc.setFont('helvetica','bold')
  doc.setFontSize(10)
  doc.text(`TOTAL Rp${order.total.toLocaleString('id-ID')}`, 5, y)
  y+=5
  doc.setFontSize(7)
  doc.setFont('helvetica','normal')
  doc.text(`DP Rp${order.dp.toLocaleString('id-ID')} | Sisa Rp${order.remaining.toLocaleString('id-ID')}`, 5, y)
  y+=4
  doc.text(`Status: ${order.status}`, 5, y)
  y+=8
  doc.text('Terima kasih - aiwaku.id', 5, y)
  
  return doc
}
