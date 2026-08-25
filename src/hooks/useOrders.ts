import { useState, useEffect } from 'react'
import type { Order } from '../types'
import { loadOrders, saveOrders } from '../lib/storage'
import { supabase, isSupabaseEnabled, subscribeToTable } from '../lib/supabase'

// Orders dibuat oleh POS dan bot WhatsApp langsung ke Supabase (lihat
// lib/ordersApi.ts / wa-webhook), bukan lewat saveOrders() ke localStorage.
// Dashboard/Reports/Calendar sebelumnya memanggil loadOrders() saja, yang
// membaca kunci localStorage yang tidak pernah ditulis siapa pun -> selalu
// kosong. Hook ini menyamakan pola dengan useMenus/useCustomers: localStorage
// dipakai sebagai cache tampilan awal, lalu selalu ditimpa oleh data
// Supabase (sumber kebenaran) begitu tersedia, plus realtime sync.
export function useOrders(tenantId?: string) {
  const id = tenantId || ''
  const [orders, setOrders] = useState<Order[]>(() => loadOrders(id || undefined))

  useEffect(() => {
    let cancelled = false
    if (!id) { setOrders([]); return }
    setOrders(loadOrders(id))

    if (!isSupabaseEnabled()) return
    supabase!.from('orders').select('*').eq('tenant_id', id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled && !error && data) {
          setOrders(data as Order[])
          saveOrders(data as Order[], id)
        }
      })

    const sub = subscribeToTable('orders', id, (payload) => {
      if (payload.eventType === 'INSERT') setOrders(prev => [payload.new as Order, ...prev.filter(o => o.id !== payload.new.id)])
      if (payload.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as Order : o))
      if (payload.eventType === 'DELETE') setOrders(prev => prev.filter(o => o.id !== payload.old.id))
    })
    return () => { cancelled = true; sub.unsubscribe() }
  }, [id])

  useEffect(() => {
    if (id) saveOrders(orders, id)
  }, [orders, id])

  return { orders }
}
