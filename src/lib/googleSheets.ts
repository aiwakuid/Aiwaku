
import type { Order, Menu, BookingSlot, Customer } from '../types'
import { supabase, isSupabaseEnabled } from './supabase'

// Google Sheets sync - 2 modes: API (production) and CSV export (MVP)

export async function syncOrderToSheet(order: Order, tenantName: string) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase!.functions.invoke('sync-sheets', {
        body: { type: 'order', data: order, tenantName, tenantId: order.tenant_id }
      })
      if (!error) return data
    } catch (e) {
      console.warn('Sheets edge function not deployed, fallback to CSV', e)
    }
  }

  // FALLBACK MVP: Generate CSV row + Google Sheets append link
  const csvRow = [
    order.invoice_no,
    order.customer_name,
    order.customer_wa,
    order.items.map(i=>`${i.name} x${i.qty}`).join('; '),
    order.total,
    order.dp,
    order.remaining,
    order.status,
    order.pickup_time || '',
    order.custom_text || '',
    new Date(order.created_at).toLocaleString('id-ID')
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')

  return {
    csvRow,
    sheetUrl: localStorage.getItem('aiwaku_sheets_url') || '',
    status: 'pending' as const,
    mode: 'csv' as const
  }
}

export async function syncMenuToSheet(menus: Menu[]) {
  const csvHeader = 'ID,Name,Price,Stock,IsActive,Niche,Description,UpdatedAt'
  const csvRows = menus.map(m=>[
    m.id, m.name, m.price, m.stock, m.is_active, m.niche, m.description, m.updated_at
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
  
  const csvContent = [csvHeader, ...csvRows].join('\n')
  
  return {
    csvContent,
    blobUrl: URL.createObjectURL(new Blob([csvContent], { type: 'text/csv' })),
    status: 'ready' as const
  }
}

export function getSheetsIntegrationStatus() {
  const sheetsUrl = localStorage.getItem('aiwaku_sheets_url')
  return {
    connected: !!sheetsUrl,
    url: sheetsUrl,
    mode: sheetsUrl ? 'api' : 'csv',
    message: sheetsUrl ? `✅ Sheet connected: ${sheetsUrl.substring(0,40)}...` : '⚠️ Mode CSV export - Paste Sheet URL di Settings untuk auto sync'
  }
}

export function generateSheetTemplate() {
  // Template Google Sheet untuk bakery/padel
  return {
    headers: ['Invoice No','Customer','WA','Items','Total','DP','Sisa','Status','Pickup Time','Custom Text','Created At','Tenant'],
    sampleRows: [
      ['INV-AIW-20260818-1234','Rina','0812xxxx','Kue Coklat 20cm x1','185000','50000','135000','dp','2026-08-23 15:00','Happy Birthday Andi','2026-08-18 10:00','bakery-sari']
    ]
  }
}
