
import type { Intent } from '../types'

export function parseIntent(raw: string): Intent {
  const text = raw.toLowerCase().trim()
  const now = new Date().toISOString()
  
  // 1. UPDATE_STOCK - "stok blackforest habis" / "tambah stok brownies 5" / "stock 0"
  const stockHabisPatterns = [
    /stok\s+(.+)\s+habis/,
    /(.+)\s+habis/,
    /(.+)\s+sudah\s+tidak\s+ada/,
    /(.+)\s+kosong/
  ]
  for (const p of stockHabisPatterns) {
    const m = text.match(p)
    if (m) {
      return { intent: 'UPDATE_STOCK', entities: { name: m[1].trim(), stock: 0, is_active: false }, confidence: 0.9, raw }
    }
  }
  
  const stockAdd = text.match(/tambah\s+stok\s+(.+)\s+(\d+)/)
  if (stockAdd) {
    return { intent: 'UPDATE_STOCK', entities: { name: stockAdd[1].trim(), stock: parseInt(stockAdd[2]), add: true }, confidence: 0.85, raw }
  }
  const stockSet = text.match(/stok\s+(.+)\s+jadi\s+(\d+)/) || text.match(/stok\s+(.+)\s+(\d+)/)
  if (stockSet) {
    return { intent: 'UPDATE_STOCK', entities: { name: stockSet[1].trim(), stock: parseInt(stockSet[2]) }, confidence: 0.8, raw }
  }
  
  // 2. UPDATE_PRICE - "naikkan harga facial glowing jadi 275 ribu" / "harga ... jadi ..."
  const priceMatch = text.match(/(?:harga|naikkan|ubah|update)\s+(.+?)\s+(?:jadi|ke)\s+([\d\.]+)\s*(rb|ribu|k)?/)
  if (priceMatch) {
    let price = parseInt(priceMatch[2].replace(/\./g,''))
    const suffix = priceMatch[3]
    if (suffix && (suffix.includes('rb') || suffix.includes('ribu') || suffix.includes('k'))) {
      price = price * 1000
    }
    // FIX: buang kata pengisi di depan nama ("naikkan harga facial glowing ..."
    // sebelumnya menangkap "harga facial glowing" sehingga produk tidak pernah ketemu)
    const name = priceMatch[1].replace(/^(?:harga|dari|untuk|produk|menu)\s+/, '').trim()
    return { intent: 'UPDATE_PRICE', entities: { name, price }, confidence: 0.9, raw }
  }
  
  // 3. TOGGLE_ACTIVE
  if (text.includes('matikan') || text.includes('nonaktifkan') || text.includes('hide')) {
    const m = text.match(/(?:matikan|nonaktifkan|hide)\s+(.+)/)
    return { intent: 'TOGGLE_ACTIVE', entities: { name: m?.[1]?.trim() || text, is_active: false }, confidence: 0.8, raw }
  }
  if (text.includes('aktifkan') || text.includes('nyalakan')) {
    const m = text.match(/(?:aktifkan|nyalakan)\s+(.+)/)
    return { intent: 'TOGGLE_ACTIVE', entities: { name: m?.[1]?.trim() || text, is_active: true }, confidence: 0.8, raw }
  }
  
  // 4. CREATE_INVOICE - "buatin invoice rina kue coklat 20cm"
  if (text.includes('invoice') || text.includes('struk') || text.includes('kwitansi')) {
    const nameMatch = text.match(/(?:invoice|struk|kwitansi)\s+(?:untuk\s+|ke\s+|atas\s*nama\s+)?(\w+)/)
    return { intent: 'CREATE_INVOICE', entities: { customer_name: nameMatch?.[1] || 'Customer', raw_text: text }, confidence: 0.75, raw }
  }
  
  // 5. CREATE_ORDER
  if (text.includes('order') || text.includes('booking') || text.includes('pesan')) {
    return { intent: 'CREATE_ORDER', entities: { raw_text: text }, confidence: 0.6, raw }
  }
  
  // 6. ADD_PROMO
  if (text.includes('promo') || text.includes('diskon')) {
    return { intent: 'ADD_PROMO', entities: { raw_text: text }, confidence: 0.7, raw }
  }
  
  return { intent: 'UNKNOWN', entities: { raw_text: text }, confidence: 0.3, raw }
}
