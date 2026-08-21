
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useCustomers } from '../hooks/useCustomers'
import type { ChatMessage } from '../types'
import { Send, MessageCircle } from 'lucide-react'

function storageKey(tenantId: string, customerId: string) {
  return `aiwaku_v5_livechat_${tenantId}_${customerId}`
}

function loadThread(tenantId: string, customerId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId, customerId))
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveThread(tenantId: string, customerId: string, messages: ChatMessage[]) {
  localStorage.setItem(storageKey(tenantId, customerId), JSON.stringify(messages))
}

export function LiveChat() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const { customers } = useCustomers(tenantId ?? undefined)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [aiActive, setAiActive] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tenantId) return
    if (customers.length && !activeId) setActiveId(customers[0].id)
  }, [customers])

  useEffect(() => {
    if (activeId && tenantId) setMessages(loadThread(tenantId, activeId))
  }, [activeId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  if (!tenantId) return null

  const activeCustomer = customers.find(c => c.id === activeId)

  const sendMessage = (text: string, role: 'user' | 'ai') => {
    if (!activeId || !text.trim()) return
    const msg: ChatMessage = { role, text: text.trim(), timestamp: new Date().toISOString() }
    const updated = [...messages, msg]
    setMessages(updated)
    saveThread(tenantId, activeId, updated)
  }

  const handleOwnerReply = () => {
    if (!input.trim()) return
    sendMessage(input, 'ai') // balasan owner/admin ditampilkan di sisi "ai" (kiri, seperti toko)
    setInput('')
  }

  const simulateIncoming = () => {
    if (!activeCustomer) return
    const samples = [
      `Halo, masih ada ${activeCustomer.tags[0] || 'produk'} nggak?`,
      'Kak, pesanan saya kapan siap ya?',
      'Boleh minta info harga terbaru?'
    ]
    sendMessage(samples[Math.floor(Math.random() * samples.length)], 'user')
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="font-bold text-[18px] flex items-center gap-2"><MessageCircle size={18}/> Live Chat - {slug}</h2>
        <button onClick={() => setAiActive(!aiActive)} className={`text-[11px] px-3 h-8 rounded-full font-semibold ${aiActive ? 'bg-[#25D366] text-white' : 'bg-slate-200 text-slate-600'}`}>AI Sales {aiActive ? 'ON' : 'OFF'}</button>
      </div>

      <div className="bg-white rounded-[20px] border overflow-hidden grid md:grid-cols-[260px_1fr] h-[560px]">
        <div className="border-r overflow-y-auto">
          {customers.length === 0 && <div className="p-4 text-[12px] text-slate-500">Belum ada customer. Tambah dulu di Customer DB.</div>}
          {customers.map(c => (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={`w-full text-left p-3 border-b flex items-center gap-3 hover:bg-slate-50 ${activeId === c.id ? 'bg-slate-100' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white grid place-items-center font-bold text-[11px] shrink-0">{c.name[0]}</div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold truncate">{c.name}</div>
                <div className="text-[10px] text-slate-500 truncate">{c.wa}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col">
          {!activeCustomer ? (
            <div className="flex-1 grid place-items-center text-[12px] text-slate-400">Pilih customer untuk mulai chat</div>
          ) : (
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <div>
                  <div className="font-bold text-[13px]">{activeCustomer.name}</div>
                  <div className="text-[10px] text-slate-500">{activeCustomer.wa}</div>
                </div>
                <button onClick={simulateIncoming} className="text-[10px] px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">+ Simulasikan pesan masuk</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
                {messages.length === 0 && <div className="text-[11px] text-slate-400 text-center mt-8">Belum ada percakapan. Klik "Simulasikan pesan masuk" untuk coba, atau tunggu customer chat via WA.</div>}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[12px] ${m.role === 'user' ? 'bg-white border shadow-sm' : 'bg-[#0F172A] text-white'}`}>
                      {m.text}
                      <div className={`text-[9px] mt-1 ${m.role === 'user' ? 'text-slate-400' : 'text-white/50'}`}>{new Date(m.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOwnerReply()} placeholder="Balas sebagai toko..." className="flex-1 h-11 rounded-xl border px-3 text-[13px]" />
                <button onClick={handleOwnerReply} className="h-11 px-4 rounded-xl bg-[#0F172A] text-white grid place-items-center"><Send size={16} /></button>
                <button onClick={() => window.open(`https://wa.me/${activeCustomer.wa.replace(/[^0-9]/g,'')}`, '_blank')} className="h-11 px-4 rounded-xl bg-[#25D366] text-white text-[11px] font-semibold">Buka WA Asli</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-800">⚠️ Mode saat ini: inbox simulasi tersimpan di localStorage, belum terhubung WhatsApp Business API sungguhan (butuh integrasi terpisah dengan Meta/provider WA resmi). Tombol "Buka WA Asli" membuka chat WA beneran untuk percakapan langsung sementara ini.</div>
    </div>
  )
}
