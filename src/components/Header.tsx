import { Menu, Search } from 'lucide-react'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

export function Header({ onToggleMobile, aiActive }: { onToggleMobile: () => void, aiActive: boolean }) {
  const now = new Date()
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 h-[64px] flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onToggleMobile} aria-label="Buka menu" className="md:hidden p-2 -ml-2 rounded-xl hover:bg-slate-100"><Menu size={19} /></button>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo.png" alt="AIWAKU" className="h-8 w-8 object-contain rounded-xl" />
          <div className="leading-none">
            <div className="font-extrabold tracking-tight text-slate-950">aiwaku</div>
            <div className="hidden sm:block text-[9px] text-slate-400 mt-1">AI-native business OS</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="hidden md:flex items-center gap-2 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-500 hover:bg-white hover:border-slate-300" aria-label="Cari">
          <Search size={14} /> <span>Cari apa saja...</span><kbd className="ml-4 rounded-md bg-white border px-1.5 py-0.5 text-[9px]">⌘ K</kbd>
        </button>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-2.5 h-8 text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {aiActive ? 'AI aktif' : 'AI jeda'}</div>
        <div className="hidden lg:block text-[10px] text-slate-400 px-2">{format(now, 'dd MMM yyyy', { locale: idLocale })}</div>
        <button className="w-9 h-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold text-[11px]" aria-label="Profil">A</button>
      </div>
    </header>
  )
}
