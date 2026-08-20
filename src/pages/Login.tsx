import { FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

export function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !isSupabaseEnabled()) { setError('Supabase production belum dikonfigurasi.'); return }
    setBusy(true); setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) { setError(signInError.message); setBusy(false); return }
    navigate(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#F6F7F8] grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-[420px] bg-white border rounded-3xl p-6 shadow-sm">
        <div className="text-xl font-bold">AIWAKU</div>
        <div className="text-sm text-slate-500 mt-1">Masuk ke dashboard tenant Anda.</div>
        <div className="mt-6 space-y-3">
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="Email" className="w-full h-11 rounded-xl border px-3" />
          <input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required placeholder="Password" className="w-full h-11 rounded-xl border px-3" />
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
          <button disabled={busy} className="w-full h-11 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50">{busy ? 'Memproses...' : 'Masuk'}</button>
        </div>
      </form>
    </div>
  )
}
