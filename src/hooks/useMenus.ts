import { useState, useEffect, useCallback } from 'react'
import type { Menu } from '../types'
import { loadMenus, saveMenus } from '../lib/storage'
import { supabase, isSupabaseEnabled, subscribeToTable } from '../lib/supabase'

export function useMenus(tenantId?: string) {
  const [menus, setMenusState] = useState<Menu[]>(() => loadMenus(tenantId))
  const id = tenantId || ''

  useEffect(() => {
    let cancelled = false
    if (!id) { setMenusState([]); return }
    setMenusState(loadMenus(id))

    if (!isSupabaseEnabled()) return
    supabase!.from('menus').select('*').eq('tenant_id', id).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled && !error && data) {
          setMenusState(data as Menu[])
          saveMenus(data as Menu[], id)
        }
      })

    const sub = subscribeToTable('menus', id, (payload) => {
      if (payload.eventType === 'INSERT') setMenusState(prev => [payload.new as Menu, ...prev.filter(m => m.id !== payload.new.id)])
      if (payload.eventType === 'UPDATE') setMenusState(prev => prev.map(m => m.id === payload.new.id ? payload.new as Menu : m))
      if (payload.eventType === 'DELETE') setMenusState(prev => prev.filter(m => m.id !== payload.old.id))
    })
    return () => { cancelled = true; sub.unsubscribe() }
  }, [id])

  useEffect(() => {
    if (id) saveMenus(menus, id)
  }, [menus, id])

  const persist = useCallback(async (menu: Menu) => {
    if (!isSupabaseEnabled()) return false
    const { error } = await supabase!.rpc('admin_upsert_menu', { p_menu: menu })
    if (error) { console.error('Menu persistence failed:', error.message); return false }
    return true
  }, [])

  const updateStock = async (menuId: string, newStock: number) => {
    const safeStock = Math.max(0, Math.floor(newStock))
    const current = menus.find(m => m.id === menuId)
    if (!current) return false
    const next = { ...current, stock: safeStock, is_active: safeStock > 0 ? current.is_active : false, updated_at: new Date().toISOString() }
    setMenusState(prev => prev.map(m => m.id === menuId ? next : m))
    return persist(next)
  }

  const addStock = (menuId: string, delta: number) => {
    const current = menus.find(m => m.id === menuId)
    return current ? updateStock(menuId, current.stock + delta) : Promise.resolve(false)
  }

  const toggleActive = async (menuId: string) => {
    const current = menus.find(m => m.id === menuId)
    if (!current) return false
    const next = { ...current, is_active: !current.is_active, updated_at: new Date().toISOString() }
    setMenusState(prev => prev.map(m => m.id === menuId ? next : m))
    return persist(next)
  }

  const updatePrice = async (menuId: string, price: number) => {
    const safePrice = Math.max(0, Math.floor(price))
    const current = menus.find(m => m.id === menuId)
    if (!current) return false
    const next = { ...current, price: safePrice, updated_at: new Date().toISOString() }
    setMenusState(prev => prev.map(m => m.id === menuId ? next : m))
    return persist(next)
  }

  const addMenu = async (menu: Omit<Menu, 'id' | 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString()
    const newMenu: Menu = { ...menu, tenant_id: id, id: crypto.randomUUID(), created_at: now, updated_at: now }
    setMenusState(prev => [newMenu, ...prev])
    const ok = await persist(newMenu)
    if (!ok) setMenusState(prev => prev.filter(m => m.id !== newMenu.id))
    return ok ? newMenu : null
  }

  const findByName = (name: string) => {
    const q = name.trim().toLowerCase()
    if (!q) return undefined
    const exact = menus.find(m => m.name.trim().toLowerCase() === q)
    if (exact) return exact
    const matches = menus.filter(m => m.name.toLowerCase().includes(q))
    return matches.length === 1 ? matches[0] : undefined
  }

  return { menus, setMenusState, updateStock, addStock, toggleActive, updatePrice, addMenu, findByName }
}
