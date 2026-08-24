import type { CatalogItem, ResolvedOrderItem } from './catalogResolver.ts'
import { resolveCatalogOrder } from './catalogResolver.ts'
import type { NormalizedInboundMessage, OutboundMessage } from './types.ts'

export type BusinessFlow = 'order' | 'booking' | 'service' | 'membership' | 'hybrid'

export interface ConversationState {
  id: string
  tenantId: string
  flowType: BusinessFlow
  currentStep: string
  context: Record<string, any>
  catalog?: CatalogItem[]
}

export interface StepResult {
  nextStep: string
  contextPatch: Record<string, any>
  replies: OutboundMessage[]
  sideEffect?:
    | { type: 'create_order'; paymentMethod: 'cash' | 'qris' }
    | { type: 'book_slot' }
    | { type: 'none' }
  status?: 'active' | 'completed' | 'handoff_human'
}

type StepHandler = (state: ConversationState, message: NormalizedInboundMessage) => StepResult

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
}

function formatResolvedItems(items: ResolvedOrderItem[]) {
  return items.map(i => `${i.qty}× ${i.name} — Rp${formatRupiah(i.subtotal)}`).join('\n')
}

const orderFlowSteps: Record<string, StepHandler> = {
  greeting: (_state, message) => ({
    nextStep: 'choose_items',
    contextPatch: { customerName: message.customerName ?? null },
    replies: [{ kind: 'text', text: 'Halo! Mau pesan apa hari ini? Ketik nama produk & jumlahnya, mis. "kopi susu 2".' }],
  }),

  choose_items: (state, message) => {
    if (message.listReplyId?.startsWith('pick:') && state.catalog?.length) {
      const id = message.listReplyId.slice(5)
      const item = state.catalog.find(x => x.id === id && x.is_active)
      if (item) {
        const resolved = [{ menu_id: item.id, name: item.name, qty: 1, price: item.price, subtotal: item.price }]
        return {
          nextStep: 'confirm_items',
          contextPatch: { pendingOrderItems: resolved, pendingOrderSubtotal: item.price, pendingOrderText: item.name },
          replies: [{ kind: 'button_list', text: `Pesanan kamu:\n1× ${item.name} — Rp${formatRupiah(item.price)}\nTotal: Rp${formatRupiah(item.price)}\n\nKonfirmasi?`, buttons: [{ id: 'confirm_yes', label: 'Ya, benar' }, { id: 'confirm_no', label: 'Ulangi' }] }],
        }
      }
    }

    const text = message.text?.trim() || ''
    if (!text) return { nextStep: 'choose_items', contextPatch: {}, replies: [{ kind: 'text', text: 'Boleh ketik nama produk dan jumlahnya ya kak. Contoh: "kopi susu 2".' }] }
    if (!state.catalog?.length) {
      return { nextStep: 'choose_items', contextPatch: {}, replies: [{ kind: 'text', text: 'Maaf, katalog sedang tidak tersedia. Admin akan membantu.' }], status: 'handoff_human' }
    }

    const resolution = resolveCatalogOrder(text, state.catalog)
    if (resolution.ambiguous.length) {
      const first = resolution.ambiguous[0]
      return {
        nextStep: 'choose_items', contextPatch: {},
        replies: [{ kind: 'interactive_list', text: `Produk "${first.text}" cocok dengan beberapa pilihan. Pilih yang benar ya.`, sections: [{ title: 'Pilihan produk', items: first.candidates.slice(0, 10).map(x => ({ id: `pick:${x.id}`, label: x.name, description: `Rp${formatRupiah(x.price)}` })) }] }],
      }
    }
    if (!resolution.items.length || resolution.unmatched.length) {
      const missing = resolution.unmatched.join(', ')
      return {
        nextStep: 'choose_items', contextPatch: {},
        replies: [{ kind: 'text', text: missing ? `Saya belum menemukan: ${missing}. Coba gunakan nama produk seperti di katalog ya kak.` : 'Saya belum menemukan produknya. Coba ketik nama produk seperti di katalog ya kak.' }],
      }
    }

    const subtotal = resolution.items.reduce((sum, item) => sum + item.subtotal, 0)
    return {
      nextStep: 'confirm_items',
      contextPatch: { pendingOrderItems: resolution.items, pendingOrderSubtotal: subtotal, pendingOrderText: text },
      replies: [{ kind: 'button_list', text: `Pesanan kamu:\n${formatResolvedItems(resolution.items)}\nTotal: Rp${formatRupiah(subtotal)}\n\nKonfirmasi?`, buttons: [{ id: 'confirm_yes', label: 'Ya, benar' }, { id: 'confirm_no', label: 'Ulangi' }] }],
    }
  },

  confirm_items: (state, message) => {
    if (message.buttonReplyId === 'confirm_no') return { nextStep: 'choose_items', contextPatch: { pendingOrderItems: null, pendingOrderSubtotal: null, pendingOrderText: null }, replies: [{ kind: 'text', text: 'Oke, boleh diketik ulang pesanannya.' }] }
    if (message.buttonReplyId === 'confirm_yes' && Array.isArray(state.context.pendingOrderItems) && state.context.pendingOrderItems.length) {
      return { nextStep: 'awaiting_payment_method', contextPatch: {}, replies: [{ kind: 'button_list', text: 'Mau bayar pakai apa?', buttons: [{ id: 'pay_cash', label: 'Tunai (COD)' }, { id: 'pay_qris', label: 'QRIS' }] }] }
    }
    return { nextStep: 'confirm_items', contextPatch: {}, replies: [{ kind: 'text', text: 'Ketuk salah satu tombol ya kak 🙏' }] }
  },

  awaiting_payment_method: (state, message) => {
    if ((message.buttonReplyId === 'pay_cash' || message.buttonReplyId === 'pay_qris') && Array.isArray(state.context.pendingOrderItems) && state.context.pendingOrderItems.length) {
      const paymentMethod = message.buttonReplyId === 'pay_cash' ? 'cash' : 'qris'
      return {
        nextStep: 'processing_order',
        contextPatch: { paymentMethod },
        replies: [{ kind: 'text', text: paymentMethod === 'qris' ? 'Siap, saya membuat order dan QRIS-nya dulu ya kak.' : 'Siap, saya membuat order dan mencatat pembayaran tunainya ya kak.' }],
        sideEffect: { type: 'create_order', paymentMethod },
        status: 'active',
      }
    }
    return { nextStep: 'awaiting_payment_method', contextPatch: {}, replies: [{ kind: 'text', text: 'Pilih metode bayar dari tombol ya kak.' }] }
  },

  processing_order: (_state, _message) => ({
    nextStep: 'processing_order', contextPatch: {}, replies: [{ kind: 'text', text: 'Pesanan sedang diproses. Mohon tunggu sebentar ya kak.' }], status: 'active',
  }),
}

const bookingFlowSteps: Record<string, StepHandler> = {}

export function routeMessage(state: ConversationState, message: NormalizedInboundMessage): StepResult {
  const steps = state.flowType === 'order' ? orderFlowSteps : bookingFlowSteps
  const handler = steps[state.currentStep]
  if (!handler) {
    return {
      nextStep: state.currentStep,
      contextPatch: {},
      replies: [{ kind: 'text', text: state.flowType === 'booking' ? 'Mohon tunggu, admin kami akan membalas manual.' : 'Maaf ada kendala teknis, admin akan segera membantu.' }],
      status: 'handoff_human',
    }
  }
  return handler(state, message)
}
