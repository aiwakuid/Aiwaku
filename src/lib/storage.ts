
import type { Menu, Order, Tenant } from '../types'

// Kunci storage diseragamkan ke v5 (sebelumnya campur v3/v4/v5).
// Baca lama tetap didukung sekali lewat migrasi agar data user tidak hilang.
const STORAGE_KEYS = {
  menus: 'aiwaku_v5_menus',
  orders: 'aiwaku_v5_orders',
  tenant: 'aiwaku_v5_tenant'
}
const LEGACY_KEYS: Record<string, string[]> = {
  menus: ['aiwaku_v3_menus'],
  orders: ['aiwaku_v3_orders']
}

// Tenant ID konsisten di seluruh app: slug 'bakery-sari' -> 'tenant_bakery_sari'
// (sebelumnya halaman memakai `tenant_${slug}` -> 'tenant_bakery-sari' sehingga
//  tidak cocok dengan id di data dan filter multi-tenant bocor)
export function getTenantIdFromSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, '_')}`
}

// Tenant model - 7 niche template architecture
export const defaultTenant: Tenant = {
  id: getTenantIdFromSlug('bakery-sari'),
  slug: 'bakery-sari',
  name: 'Bakery Sari - Harapan Indah',
  niche: 'bakery',
  owner_name: 'Bu Sari',
  wa_number: '62812xxxx',
  plan: 'pro'
}

const defaultMenus: Menu[] = [
  { id: 'm1', tenant_id: defaultTenant.id, niche: 'bakery', name: 'Kue Ultah Coklat 20cm', price: 185000, stock: 10, is_active: true, description: 'Coklat Belgia, free lilin angka + pisau', emoji: '🎂', custom_fields: { ukuran: '20cm', tulisan: 'Happy Birthday' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'm2', tenant_id: defaultTenant.id, niche: 'bakery', name: 'Blackforest 20cm', price: 220000, stock: 0, is_active: false, description: 'Cherry premium, krim lembut', emoji: '🍒', custom_fields: { status: 'Stok habis' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'm3', tenant_id: defaultTenant.id, niche: 'bakery', name: 'Brownies Sekat 20x10', price: 45000, stock: 20, is_active: true, description: '8 sekat topping keju & coklat', emoji: '🍫', custom_fields: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'm4', tenant_id: defaultTenant.id, niche: 'padel', name: 'Lapangan 1 - Malam', price: 250000, stock: 8, is_active: true, description: '18:00-23:00 / jam', emoji: '⚡', custom_fields: { slot: 'malam' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'm5', tenant_id: defaultTenant.id, niche: 'padel', name: 'Promo Pagi 07-10', price: 150000, stock: 5, is_active: true, description: 'Promo sampai 31 Agustus 2026', emoji: '🔥', custom_fields: { hot: true }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'm6', tenant_id: defaultTenant.id, niche: 'salon', name: 'Facial Glowing 60m', price: 250000, stock: 99, is_active: true, description: 'Serum brightening premium', emoji: '✨', custom_fields: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

function readWithMigration<T>(key: string, legacyKeys: string[]): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
    // Migrasi satu kali dari kunci lama
    for (const oldKey of legacyKeys) {
      const oldRaw = localStorage.getItem(oldKey)
      if (oldRaw) {
        const parsed = JSON.parse(oldRaw)
        localStorage.setItem(key, oldRaw)
        localStorage.removeItem(oldKey)
        return parsed
      }
    }
  } catch {}
  return null
}

function scopedKey(base: string, tenantId: string) {
  return `${base}_${tenantId}`
}

export function loadMenus(tenantId: string = defaultTenant.id): Menu[] {
  const key = scopedKey(STORAGE_KEYS.menus, tenantId)
  const data = readWithMigration<Menu[]>(key, tenantId === defaultTenant.id ? LEGACY_KEYS.menus : [])
  if (data) return data.filter(m => m.tenant_id === tenantId)
  return tenantId === defaultTenant.id ? defaultMenus : []
}

export function saveMenus(menus: Menu[], tenantId: string = defaultTenant.id) {
  localStorage.setItem(scopedKey(STORAGE_KEYS.menus, tenantId), JSON.stringify(
    menus.filter(m => m.tenant_id === tenantId)
  ))
}

export function loadOrders(tenantId?: string): Order[] {
  if (!tenantId) return readWithMigration<Order[]>(STORAGE_KEYS.orders, LEGACY_KEYS.orders) || []
  const key = scopedKey(STORAGE_KEYS.orders, tenantId)
  const data = readWithMigration<Order[]>(key, tenantId === defaultTenant.id ? LEGACY_KEYS.orders : [])
  return data ? data.filter(o => o.tenant_id === tenantId) : []
}

export function saveOrders(orders: Order[], tenantId?: string) {
  const id = tenantId || orders[0]?.tenant_id
  if (!id) return
  localStorage.setItem(scopedKey(STORAGE_KEYS.orders, id), JSON.stringify(
    orders.filter(o => o.tenant_id === id)
  ))
}
