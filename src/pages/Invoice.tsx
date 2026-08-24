
import { useState, useEffect } from 'react'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useParams } from 'react-router-dom'
import { useMenus } from '../hooks/useMenus'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import { createOrderServer } from '../lib/ordersApi'
import { generateInvoicePDF, generateStruk80mm } from '../lib/invoiceEngine'
import { createQRISPayment, getPaymentStatusText } from '../lib/payment'
import { syncOrderToGoogleCalendar } from '../lib/googleCalendar'
import { syncOrderToSheet } from '../lib/googleSheets'
import { useAudit } from '../hooks/useAudit'
import type { Order, Payment } from '../types'

export function Invoice() {
  const { slug } = useParams()
  const tenantSlug = slug || 'bakery-sari'
  const { tenantId } = useTenantAuth()
  const activeTenantId = tenantId ?? ''
  const { menus } = useMenus(tenantId ?? undefined)
  const [orders, setOrders] = useState<Order[]>([])
  const [selected, setSelected] = useState<Order | null>(null)
  const [customer, setCustomer] = useState('Rina')
  const [wa, setWa] = useState('081234567890')
  const [payment, setPayment] = useState<Payment | null>(null)
  const [calendarLink, setCalendarLink] = useState<string | null>(null)
  const [sheetStatus, setSheetStatus] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { addLog } = useAudit(activeTenantId)

  useEffect(() => {
    let cancelled = false
    if (!isSupabaseEnabled()) return
    supabase!.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).then(({ data }) => {
      if (!cancelled && data) { const rows = data as Order[]; setOrders(rows); setSelected(rows[0] ?? null) }
    })
    return () => { cancelled = true }
  }, [tenantId])

  if (!tenantId) return null

  const createInvoice = async () => {
    const bakeryMenu = menus.find(m => m.niche === 'bakery' && m.is_active) || menus.find(m => m.is_active)
    if (!bakeryMenu) { setFormError('Tambahkan menu dulu sebelum bikin invoice.'); return }
    setFormError(null)
    const pickup = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    pickup.setHours(15, 0, 0, 0)
    const order = await createOrderServer({
      tenantId: activeTenantId, customerName: customer, customerWa: wa,
      items: [{ menuId: bakeryMenu.id, quantity: 1 }], discount: 10000, tax: 0, pickupTime: pickup.toISOString()
    }) as Order
    const newOrders = [order, ...orders.filter(o => o.id !== order.id)]
    setOrders(newOrders); setSelected(order); setPayment(null); setCalendarLink(null); setSheetStatus(null)
    addLog('CREATE', 'order', order.id, null, order)
    try {
      const pay = await createQRISPayment(order.id, order.remaining || order.total, customer, activeTenantId, order.invoice_no)
      const paymentObj: Payment = {
        id: pay.paymentId, order_id: order.id, tenant_id: activeTenantId, amount: order.remaining || order.total,
        method: 'qris', provider: 'midtrans', provider_order_id: pay.providerOrderId,
        payment_url: pay.paymentUrl || '', qr_string: pay.qrString, qr_image_url: pay.qrImageUrl,
        status: 'pending', created_at: new Date().toISOString()
      }
      setPayment(paymentObj); addLog('CREATE', 'payment', paymentObj.id, null, paymentObj)
    } catch (e) { console.error('Payment gagal:', e) }
    try { const cal = await syncOrderToGoogleCalendar(order, tenantSlug, activeTenantId); if (cal) setCalendarLink(cal.googleLink) } catch (e) { console.warn('Calendar sync gagal:', e) }
    try { const sheet = await syncOrderToSheet(order, tenantSlug); if (sheet) setSheetStatus(`CSV: ${sheet.csvRow.substring(0,60)}...`) } catch (e) { console.warn('Sheets sync gagal:', e) }
  }

  const handleDownloadPDF = async () => {
    if (!selected) return
    const doc = await generateInvoicePDF(selected, slug || 'bakery-sari')
    doc.save(`${selected.invoice_no}.pdf`)
    addLog('DOWNLOAD', 'invoice_pdf', selected.id, null, { invoice_no: selected.invoice_no })
  }

  const handlePrintStruk = async () => {
    if (!selected) return
    const doc = await generateStruk80mm(selected, slug || 'bakery-sari')
    doc.save(`STRUK-${selected.invoice_no}.pdf`)
    addLog('PRINT', 'struk_80mm', selected.id, null, {})
  }

  const formatPickup = (iso?: string) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleSendWA = () => {
    if (!selected) return
    const payText = payment ? `\nBayar QRIS: ${payment.payment_url} (Rp${payment.amount.toLocaleString('id-ID')})` : ''
    const text = `Halo ${selected.customer_name}, ini invoice ${selected.invoice_no} dari ${tenantSlug}\nTotal: Rp${selected.total.toLocaleString('id-ID')} (DP Rp${selected.dp.toLocaleString('id-ID')} sisa Rp${selected.remaining.toLocaleString('id-ID')})${payText}\nPickup: ${formatPickup(selected.pickup_time)}\nTerima kasih! - aiwaku.id/t/${tenantSlug}`
    const url = `https://wa.me/${selected.customer_wa.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    addLog('SEND', 'wa_invoice', selected.id, null, { wa: selected.customer_wa })
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={createInvoice} className="h-9 px-4 rounded-xl bg-slate-900 text-white text-[12px] font-semibold">+ Buat Invoice + QRIS + Calendar + Sheets (P2 Auto)</button>
        <input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Nama customer" className="h-9 rounded-xl border px-3 text-[12px] w-[140px]" />
        <input value={wa} onChange={e=>setWa(e.target.value)} placeholder="WA customer" className="h-9 rounded-xl border px-3 text-[12px] w-[150px]" />
        <span className="text-[11px] px-3 py-2 rounded-full bg-emerald-50 border border-emerald-200">P2: QRIS auto + Google Calendar link + Sheets CSV auto</span>
      </div>
      {formError && <div className="text-[12px] px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700">{formError}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-[20px] border p-6">
          {!selected ? <div className="text-[13px] text-slate-500">Belum ada invoice. Klik Buat Invoice.</div> : (
            <>
              <div className="flex justify-between"><div><div className="font-bold">INVOICE REAL + QRIS</div><div className="text-[11px] font-mono">{selected.invoice_no} • {new Date(selected.created_at).toLocaleString('id-ID')}</div></div><div className="text-right"><div className="font-bold text-[13px]">/t/{slug}</div><div className="text-[11px] text-slate-500">{selected.status.toUpperCase()}</div></div></div>
              <div className="mt-4 border-t pt-4 space-y-2 text-[12px]">
                <div>Customer: {selected.customer_name} - {selected.customer_wa}</div>
                {selected.items.map(it=><div key={it.menu_id} className="flex justify-between"><span>{it.name} x{it.qty}</span><span>Rp{it.subtotal.toLocaleString('id-ID')}</span></div>)}
                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between font-bold text-[14px]"><span>Total</span><span>Rp{selected.total.toLocaleString('id-ID')}</span></div>
                  <div className="flex justify-between"><span>DP</span><span>Rp{selected.dp.toLocaleString('id-ID')}</span></div>
                  <div className="flex justify-between font-bold text-emerald-600"><span>Sisa (untuk QRIS)</span><span>Rp{selected.remaining.toLocaleString('id-ID')}</span></div>
                </div>
              </div>

              {payment && (
                <div className="mt-4 bg-slate-50 rounded-2xl border p-4">
                  <div className="flex justify-between items-center"><span className="font-bold text-[12px]">QRIS Payment</span><span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 border">{getPaymentStatusText(payment.status)}</span></div>
                  <div className="mt-3 grid place-items-center">
                    <img src={payment.qr_image_url} alt="QRIS" className="w-[160px] h-[160px] rounded-xl border bg-white" />
                    <div className="text-[10px] font-mono mt-2 break-all">{payment.qr_string?.substring(0,50)}...</div>
                    <div className="text-[11px] mt-2">Rp{payment.amount.toLocaleString('id-ID')} • {payment.method.toUpperCase()} • {payment.provider}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={()=>window.open(payment.payment_url,'_blank')} className="h-9 rounded-xl bg-slate-900 text-white text-[11px]">Buka Link Bayar</button>
                    
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2">Di production, status jadi LUNAS otomatis via Midtrans webhook → order status auto lunas + WA struk terkirim.</div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button onClick={handleSendWA} className="h-10 rounded-xl bg-[#25D366] text-white text-[11px] font-semibold">Kirim WA + QRIS</button>
                <button onClick={handleDownloadPDF} className="h-10 rounded-xl bg-slate-900 text-white text-[11px] font-semibold">Download PDF</button>
                <button onClick={handlePrintStruk} className="h-10 rounded-xl bg-white border text-[11px] font-semibold">Print 80mm</button>
              </div>

              {calendarLink && <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2 text-[11px]"><a href={calendarLink} target="_blank" className="text-blue-600 underline">📅 Tambah ke Google Calendar (auto link)</a> • Order {selected.invoice_no}</div>}
              {sheetStatus && <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-[11px]">📊 {sheetStatus} • Auto sync ke Sheets</div>}
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-[20px] border p-4">
            <div className="font-bold text-[13px]">History Invoice + Payment + Calendar + Sheets (P2)</div>
            <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto">
              {orders.map(o=>(
                <button key={o.id} onClick={()=>setSelected(o)} className={`w-full text-left p-2 rounded-xl border text-[11px] ${selected?.id===o.id?'bg-slate-900 text-white':'bg-slate-50 hover:bg-white'}`}>
                  <div className="font-semibold">{o.invoice_no} • {o.customer_name}</div>
                  <div>Rp{o.total.toLocaleString('id-ID')} • {o.status} • {new Date(o.created_at).toLocaleDateString('id-ID')}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-slate-900 text-white rounded-2xl p-3 text-[11px]">✅ P2 REAL: QRIS auto (Midtrans Edge Function), Google Calendar link auto, Sheets CSV auto, audit log, wa.me real, PDF real. Semua multi-tenant /t/{slug}.</div>
        </div>
      </div>
    </div>
  )
}
