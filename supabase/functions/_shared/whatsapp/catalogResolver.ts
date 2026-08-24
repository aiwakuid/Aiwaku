export interface CatalogItem {
  id: string
  name: string
  price: number
  stock: number
  is_active: boolean
  description?: string | null
}

export interface ResolvedOrderItem {
  menu_id: string
  name: string
  qty: number
  price: number
  subtotal: number
}

export interface CatalogResolution {
  items: ResolvedOrderItem[]
  unmatched: string[]
  ambiguous: Array<{ text: string; candidates: CatalogItem[] }>
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function extractQuantityAndName(part: string) {
  const clean = normalize(part)
  const prefix = clean.match(/^(\d+)\s+(.+)$/)
  if (prefix) return { qty: Math.floor(Number(prefix[1])), name: prefix[2] }
  const suffix = clean.match(/^(.+?)\s+(\d+)$/)
  if (suffix) return { qty: Math.floor(Number(suffix[2])), name: suffix[1] }
  return { qty: 1, name: clean }
}

function splitParts(text: string) {
  return text.split(/\s+(?:dan|sama|plus)\s+|[,;+]/i).map(s => s.trim()).filter(Boolean)
}

export function resolveCatalogOrder(text: string, catalog: CatalogItem[]): CatalogResolution {
  const items: ResolvedOrderItem[] = []
  const unmatched: string[] = []
  const ambiguous: Array<{ text: string; candidates: CatalogItem[] }> = []
  const active = catalog.filter(x => x.is_active).map(x => ({ ...x, normalized: normalize(x.name) }))

  for (const part of splitParts(text)) {
    const { qty, name } = extractQuantityAndName(part)
    if (!qty || qty < 1 || qty > 999) { unmatched.push(part); continue }

    const exact = active.filter(x => x.normalized === name)
    const contains = active.filter(x => x.normalized.includes(name) || name.includes(x.normalized))
    const matches = exact.length ? exact : contains

    if (matches.length === 0) { unmatched.push(part); continue }
    if (matches.length > 1) { ambiguous.push({ text: part, candidates: matches }); continue }

    const item = matches[0]
    if (item.stock < qty) {
      unmatched.push(`${item.name} (stok tersisa ${item.stock})`)
      continue
    }
    const existing = items.find(x => x.menu_id === item.id)
    if (existing) {
      existing.qty += qty
      existing.subtotal = existing.qty * existing.price
    } else {
      items.push({ menu_id: item.id, name: item.name, qty, price: item.price, subtotal: item.price * qty })
    }
  }

  return { items, unmatched, ambiguous }
}
