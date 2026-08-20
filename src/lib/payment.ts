
import type { Payment } from '../types'
import { supabase, isSupabaseEnabled } from './supabase'

export async function createQRISPayment(orderId: string, _amount: number, customerName: string, _tenantId: string, _invoiceNo: string) {
  if (!isSupabaseEnabled()) throw new Error('Payment production membutuhkan Supabase')
  const { data, error } = await supabase!.functions.invoke('create-payment', { body: { orderId, customerName } })
  if (error) throw error
  if (!data?.paymentId || !data?.providerOrderId) throw new Error('Payment response tidak lengkap')
  return { paymentId: data.paymentId as string, paymentUrl: data.paymentUrl as string | undefined, token: data.token as string | undefined, qrString: data.qrString as string | undefined, qrImageUrl: data.qrImageUrl as string | undefined, providerOrderId: data.providerOrderId as string, status: 'pending' as const }
}

export async function simulatePaymentPaid(_paymentId: string) {
  // Deliberately local/demo only. Production payment state MUST come from a verified webhook.
  return false
}

export function getPaymentStatusText(status: Payment['status']) {
  switch(status) {
    case 'paid': return '✅ LUNAS'
    case 'pending': return '⏳ Menunggu Pembayaran'
    case 'failed': return '❌ Gagal'
    case 'expired': return '⌛ Kadaluarsa'
    default: return status
  }
}

export async function recordCashPayment(orderId: string, amount: number) {
  if (!isSupabaseEnabled()) throw new Error('Payment production membutuhkan Supabase')
  const { data, error } = await supabase!.rpc('record_cash_payment', {
    p_order_id: orderId,
    p_amount: Math.round(amount),
  })
  if (error) throw error
  return data
}

export async function getPayment(paymentId: string) {
  if (!isSupabaseEnabled()) throw new Error('Payment production membutuhkan Supabase')
  const { data, error } = await supabase!.from('payments').select('*').eq('id', paymentId).maybeSingle()
  if (error) throw error
  return data as Payment | null
}
