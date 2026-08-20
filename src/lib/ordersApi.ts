import { supabase, isSupabaseEnabled } from './supabase'

export type CreateOrderInput = {
  tenantId: string
  customerName?: string
  customerWa?: string
  items: Array<{ menuId: string; quantity: number }>
  discount?: number
  tax?: number
  pickupTime?: string
  customText?: string
}

export async function createOrderServer(input: CreateOrderInput) {
  if (!isSupabaseEnabled()) {
    throw new Error('Server order API requires Supabase')
  }
  const { data: session } = await supabase!.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('Sesi login tidak tersedia')

  const idempotencyKey = crypto.randomUUID()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-order`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...input,
      items: input.items.map(i => ({ menu_id: i.menuId, qty: i.quantity })),
      idempotencyKey
    }),
  })

  const body = await response.json()
  if (!response.ok) throw new Error(body?.error || 'Gagal membuat order')
  return body.order
}


export async function cancelOrderServer(orderId: string, reason?: string) {
  if (!isSupabaseEnabled()) throw new Error('Server order API requires Supabase')
  const { data, error } = await supabase!.rpc('cancel_order_atomic', {
    p_order_id: orderId,
    p_reason: reason || null,
  })
  if (error) throw error
  return data
}
