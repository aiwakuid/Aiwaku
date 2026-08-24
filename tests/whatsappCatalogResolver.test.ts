import { describe, expect, it } from 'vitest'
import { resolveCatalogOrder } from '../supabase/functions/_shared/whatsapp/catalogResolver'

describe('WhatsApp catalog resolver', () => {
  const catalog = [
    { id: '1', name: 'Kopi Susu', price: 15000, stock: 10, is_active: true },
    { id: '2', name: 'Kopi Susu Gula Aren', price: 18000, stock: 5, is_active: true },
    { id: '3', name: 'Teh Manis', price: 8000, stock: 20, is_active: true },
  ]
  it('resolves exact product and quantity', () => expect(resolveCatalogOrder('kopi susu 2', catalog).items).toEqual([{ menu_id: '1', name: 'Kopi Susu', qty: 2, price: 15000, subtotal: 30000 }]))
  it('resolves multiple products', () => expect(resolveCatalogOrder('kopi susu 2 dan teh manis 3', catalog).items.map(x => [x.menu_id, x.qty])).toEqual([['1', 2], ['3', 3]]))
  it('flags ambiguous partial names instead of guessing', () => expect(resolveCatalogOrder('kopi', catalog).ambiguous[0].candidates.map(x => x.id)).toEqual(['1', '2']))
  it('rejects insufficient stock', () => expect(resolveCatalogOrder('kopi susu 11', catalog).unmatched[0]).toContain('stok tersisa 10'))
})
