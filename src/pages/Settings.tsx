
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getCalendarIntegrationStatus } from '../lib/googleCalendar'
import { getSheetsIntegrationStatus } from '../lib/googleSheets'
import { getAuditLogs } from '../lib/auditLog'
import { useTenantAuth } from '../context/TenantAuthContext'

export function Settings() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [qrisUrl, setQrisUrl] = useState('')
  const [calStatus, setCalStatus] = useState(getCalendarIntegrationStatus())
  const [sheetStatus, setSheetStatus] = useState(getSheetsIntegrationStatus())
  const [auditCount, setAuditCount] = useState(0)

  useEffect(()=>{
    setSheetsUrl(localStorage.getItem('aiwaku_sheets_url') || '')
    setQrisUrl(localStorage.getItem('aiwaku_qris_url') || '')
    setCalStatus(getCalendarIntegrationStatus())
    setSheetStatus(getSheetsIntegrationStatus())
    if (tenantId) setAuditCount(getAuditLogs(tenantId).length)
  }, [])

  const saveSheets = () => {
    localStorage.setItem('aiwaku_sheets_url', sheetsUrl)
    setSheetStatus(getSheetsIntegrationStatus())
  }
  const saveQris = () => {
    localStorage.setItem('aiwaku_qris_url', qrisUrl)
  }

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-4">
      <h2 className="font-bold text-[18px]">Pengaturan Integrasi P2 - /t/{slug}</h2>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4">
          <div className="font-bold text-[13px]">💳 QRIS Payment</div>
          <div className="text-[11px] text-slate-500 mt-1">Upload QRIS static BCA/BRI atau Midtrans auto</div>
          <input value={qrisUrl} onChange={e=>setQrisUrl(e.target.value)} placeholder="https://.../qris.png atau Midtrans Client Key" className="mt-3 w-full h-9 rounded-xl border px-3 text-[11px]" />
          <button onClick={saveQris} className="mt-2 w-full h-9 rounded-xl bg-slate-900 text-white text-[11px]">Simpan QRIS</button>
          <div className="mt-2 text-[10px] bg-amber-50 border border-amber-200 rounded-xl p-2">Pilihan A: QRIS static (gratis, langsung bisa transaksi)<br/>Pilihan B: Midtrans QRIS dynamic (fee 0.7%, auto lunas via webhook)</div>
        </div>

        <div className="bg-white rounded-2xl border p-4">
          <div className="font-bold text-[13px]">📅 Google Calendar</div>
          <div className="text-[11px] text-slate-500 mt-1">{calStatus.message}</div>
          <button onClick={()=>{localStorage.setItem('aiwaku_google_token','demo_token'); setCalStatus(getCalendarIntegrationStatus())}} className="mt-3 w-full h-9 rounded-xl bg-blue-600 text-white text-[11px]">Connect Google (OAuth demo)</button>
          <div className="mt-2 text-[10px] bg-blue-50 border border-blue-200 rounded-xl p-2">Mode link: setiap booking/invoice generate Google Calendar link (klik langsung tambah). Mode OAuth: auto sync via Edge Function sync-calendar.</div>
        </div>

        <div className="bg-white rounded-2xl border p-4">
          <div className="font-bold text-[13px]">📊 Google Sheets</div>
          <div className="text-[11px] text-slate-500 mt-1">{sheetStatus.message}</div>
          <input value={sheetsUrl} onChange={e=>setSheetsUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-3 w-full h-9 rounded-xl border px-3 text-[11px]" />
          <button onClick={saveSheets} className="mt-2 w-full h-9 rounded-xl bg-emerald-600 text-white text-[11px]">Simpan Sheets URL</button>
          <div className="mt-2 text-[10px] bg-emerald-50 border border-emerald-200 rounded-xl p-2">Mode CSV: export CSV + append manual. Mode API: auto append row via Edge Function sync-sheets.</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4">
        <div className="font-bold text-[13px]">Audit Log - {auditCount} events</div>
        <div className="mt-3 max-h-[200px] overflow-y-auto text-[11px] font-mono space-y-1">
          {(tenantId ? getAuditLogs(tenantId) : []).slice(0,20).map(log=>(
            <div key={log.id} className="flex gap-2 border-b py-1"><span className="opacity-60">{new Date(log.timestamp).toLocaleTimeString('id-ID')}</span><span className="font-bold">{log.action}</span><span>{log.entity}/{log.entity_id}</span></div>
          ))}
        </div>
      </div>

      <div className="bg-[#0F172A] text-white rounded-2xl p-4 text-[11px]">
        <div className="font-bold">P2 Architecture: Payment + Calendar + Sheets</div>
        <div className="mt-1 opacity-80">Supabase Edge Functions: create-payment (Midtrans QRIS), midtrans-webhook (auto lunas), sync-calendar (Google Calendar API), sync-sheets (Sheets API). Semua punya fallback demo (QR demo + Calendar link + CSV) jadi bisa jalan tanpa env.</div>
        <div className="mt-2 font-mono text-[10px]">VITE_SUPABASE_URL, MIDTRANS_SERVER_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SHEETS_ID</div>
      </div>
    </div>
  )
}
