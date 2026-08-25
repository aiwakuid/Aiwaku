import { useState, useEffect } from 'react'
import type { Customer } from '../types'
import { supabase, isSupabaseEnabled, subscribeToTable } from '../lib/supabase'

export function useCustomers(tenantId?: string) {
  const safeTenantId = tenantId || ''
  const storageKey = `aiwaku_v5_customers_${safeTenantId}`
  // Sebelumnya fallback ke 2 customer demo ("Rina"/"Andi" dengan total_spent
  // karangan) untuk TENANT MANAPUN yang belum punya cache localStorage -
  // lalu tersimpan dan terhitung di Reports/Customers seolah data asli.
  // Kalau memang belum ada data, tampilkan kosong, bukan data karangan.
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return (JSON.parse(raw) as Customer[]).filter(c => c.tenant_id === safeTenantId)
    } catch {}
    return []
  })

  useEffect(() => {
    if (!safeTenantId) { setCustomers([]); return }
    setCustomers(prev => prev.filter(c => c.tenant_id === safeTenantId))
  }, [safeTenantId])

  useEffect(() => {
    if (!safeTenantId) return
    localStorage.setItem(storageKey, JSON.stringify(customers.filter(c => c.tenant_id === safeTenantId)))
  }, [customers, storageKey, safeTenantId])

  useEffect(() => {
    if (!safeTenantId || !isSupabaseEnabled()) return
    let cancelled = false
    supabase!.from('customers').select('*').eq('tenant_id', safeTenantId).order('created_at', { ascending: false }).then(({data,error}) => {
      if (!cancelled && !error && data) setCustomers(data as Customer[])
    })
    const sub = subscribeToTable('customers', safeTenantId, payload => {
      if (payload.eventType === 'INSERT') setCustomers(prev => [payload.new as Customer, ...prev.filter(c => c.id !== payload.new.id)])
      if (payload.eventType === 'UPDATE') setCustomers(prev => prev.map(c => c.id === payload.new.id ? payload.new as Customer : c))
      if (payload.eventType === 'DELETE') setCustomers(prev => prev.filter(c => c.id !== payload.old.id))
    })
    return () => { cancelled = true; sub.unsubscribe() }
  }, [safeTenantId])

  const addCustomer = async (c: Omit<Customer, 'id'|'created_at'|'total_orders'|'total_spent'>) => {
    const newC: Customer = { ...c, tenant_id: safeTenantId, id: crypto.randomUUID(), total_orders: 0, total_spent: 0, created_at: new Date().toISOString() }
    setCustomers(prev => [newC, ...prev])
    if (isSupabaseEnabled()) {
      const { error } = await supabase!.rpc('admin_upsert_customer', { p_customer: newC })
      if (error) {
        setCustomers(prev => prev.filter(x => x.id !== newC.id))
        throw error
      }
    }
    return newC
  }

  const updateCustomerSpent = async (customerWa: string, amount: number) => {
    const current = customers.find(c => c.wa === customerWa)
    if (!current) return false
    const next = { ...current, total_orders: current.total_orders + 1, total_spent: current.total_spent + amount, last_order_at: new Date().toISOString() }
    setCustomers(prev => prev.map(c => c.id === current.id ? next : c))
    if (isSupabaseEnabled()) {
      const { error } = await supabase!.rpc('admin_upsert_customer', { p_customer: next })
      return !error
    }
    return true
  }

  return { customers, addCustomer, updateCustomerSpent }
}
