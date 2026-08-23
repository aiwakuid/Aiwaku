
export type Niche = 'salon' | 'barbershop' | 'resto' | 'gedung' | 'futsal' | 'padel' | 'bakery'
  | 'car_wash' | 'spa' | 'klinik_kesehatan' | 'klinik_kecantikan'
  | 'cafe' | 'dental' | 'hotel_villa' | 'rental_kendaraan' | 'laundry'
  | 'gym' | 'pet_grooming' | 'karaoke' | 'event_organizer' | 'wedding_organizer'
  | 'kursus' | 'bengkel' | 'travel_tour'

// Feature key opsional (lihat migration 20260824_v58_registration_niche_features.sql
// untuk daftar sumber kebenaran di database — feature_catalog).
// 'queue' sengaja ada di sini walau belum ada halaman-nya (placeholder).
export type FeatureKey = 'inventory' | 'kds' | 'tables' | 'booking' | 'queue' | 'customers' | 'reports' | 'calendar' | 'catalog'

export interface Tenant {
  id: string
  slug: string
  name: string
  niche: Niche
  owner_name?: string
  wa_number?: string
  logo_url?: string
  plan: 'basic' | 'pro' | 'enterprise'
}

export interface Menu {
  id: string
  tenant_id: string
  niche: Niche
  name: string
  price: number
  stock: number // actual quantity
  is_active: boolean // listing active, independent from stock
  description: string
  emoji: string
  custom_fields?: Record<string, any>
  image_url?: string
  created_at: string
  updated_at: string
}


export interface Ingredient {
  id: string
  tenant_id: string
  name: string
  unit: string
  stock: number
  reorder_point: number
  cost_per_unit: number
  is_active: boolean
}

export interface MenuRecipe {
  id: string
  tenant_id: string
  menu_id: string
  ingredient_id: string
  quantity: number
}

export interface OrderItem {
  menu_id: string
  name: string
  qty: number
  price: number
  subtotal: number
}

export interface Order {
  id: string
  tenant_id: string
  invoice_no: string
  customer_name: string
  customer_wa: string
  items: OrderItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  dp: number
  remaining: number
  status: 'pending' | 'dp' | 'lunas' | 'batal' | 'baking' | 'ready' | 'delivered'
  fulfillment_status?: 'new' | 'preparing' | 'ready' | 'served' | 'cancelled'
  niche: Niche
  pickup_time?: string
  custom_text?: string
  payment_url?: string
  qr_image_url?: string
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'ai' | 'system'
  text: string
  meta?: string[]
  timestamp: string
}

export interface Intent {
  intent: 'UPDATE_STOCK' | 'UPDATE_PRICE' | 'TOGGLE_ACTIVE' | 'CREATE_ORDER' | 'CREATE_INVOICE' | 'ADD_PROMO' | 'UNKNOWN'
  entities: Record<string, any>
  confidence: number
  raw: string
}

export interface Customer {
  id: string
  tenant_id: string
  name: string
  wa: string
  email?: string
  notes?: string
  total_orders: number
  total_spent: number
  last_order_at?: string
  tags: string[] // ['VIP','Bakery','Padel']
  created_at: string
}

export interface BookingSlot {
  id: string
  tenant_id: string
  date: string // YYYY-MM-DD
  start: string // HH:mm
  end: string // HH:mm
  field: string // Lapangan 1, Room A
  customer_id?: string
  customer_name: string
  customer_wa: string
  status: 'available' | 'booked' | 'blocked' | 'selesai' | 'batal'
  order_id?: string
  price: number
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  tenant_id: string
  amount: number
  method: 'qris' | 'gopay' | 'bca_va' | 'bri_va' | 'cash'
  provider: 'midtrans' | 'xendit' | 'manual'
  provider_order_id: string
  payment_url: string
  qr_string?: string
  qr_image_url?: string
  status: 'pending' | 'paid' | 'failed' | 'expired'
  paid_at?: string
  created_at: string
}

export interface GoogleCalendarEvent {
  id: string
  tenant_id: string
  booking_id?: string
  order_id?: string
  summary: string
  description: string
  start: string
  end: string
  google_event_id?: string
  status: 'synced' | 'pending' | 'failed'
}

export interface AuditLog {
  id: string
  tenant_id: string
  action: string
  entity: string
  entity_id: string
  old_value?: any
  new_value?: any
  user: string
  timestamp: string
}
