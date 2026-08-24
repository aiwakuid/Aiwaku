import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import { NICHE_CATALOG, FEATURE_CATALOG, NICHE_FEATURE_DEFAULTS } from '../lib/features'
import type { Niche, FeatureKey } from '../types'

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

type Step = 1 | 2 | 3

export function Register() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)

  // Step 1 - akun & data usaha
  const [businessName, setBusinessName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [waNumber, setWaNumber] = useState('')

  // Step 2 - niche
  const [niche, setNiche] = useState<Niche | null>(null)
  const [nicheLabel, setNicheLabel] = useState('')

  // Step 3 - fitur
  const [features, setFeatures] = useState<Set<FeatureKey>>(new Set())

  const effectiveSlug = slugTouched ? slug : slugify(businessName)

  const canGoStep2 = businessName.trim().length >= 3 && effectiveSlug.length >= 3 && /^\S+@\S+\.\S+$/.test(email) && password.length >= 6
  const canGoStep3 = !!niche && (niche !== 'lainnya' || nicheLabel.trim().length >= 2)
  const canSubmit = canGoStep2 && canGoStep3

  const toggleFeature = (key: FeatureKey, available: boolean) => {
    if (!available) return
    setFeatures(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const selectNiche = (n: Niche) => {
    setNiche(n)
    setFeatures(new Set(NICHE_FEATURE_DEFAULTS[n]))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !isSupabaseEnabled()) { setError('Supabase production belum dikonfigurasi.'); return }
    if (!canSubmit || !niche) return
    setBusy(true); setError(null)

    const registration = {
      business_name: businessName.trim(),
      slug: effectiveSlug,
      niche,
      niche_label: niche === 'lainnya' ? nicheLabel.trim() : null,
      owner_name: null,
      wa_number: waNumber.trim() || null,
      features: Array.from(features),
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { aiwaku_registration: registration } },
    })
    if (signUpError) { setError(signUpError.message); setBusy(false); return }

    // Jika email confirmation aktif, session belum tersedia. Draft registrasi
    // sudah tersimpan di auth user metadata dan akan diselesaikan otomatis
    // saat login pertama setelah konfirmasi.
    if (!signUpData.session) {
      setPendingConfirmation(true)
      setBusy(false)
      return
    }

    const { data: completed, error: rpcError } = await supabase.rpc('complete_registration_from_metadata')
    if (rpcError) { setError(rpcError.message); setBusy(false); return }
    const tenantSlug = completed?.slug || effectiveSlug
    setBusy(false)
    navigate(`/t/${tenantSlug}`, { replace: true })
  }

  const stepLabel = useMemo(() => ({ 1: 'Data usaha', 2: 'Jenis usaha', 3: 'Fitur' }[step]), [step])

  if (pendingConfirmation) {
    return (
      <div className="min-h-screen bg-[#F6F7F8] grid place-items-center p-4">
        <div className="w-full max-w-[420px] bg-white border rounded-3xl p-6 shadow-sm text-center">
          <div className="text-xl font-bold">Cek email Anda</div>
          <p className="text-sm text-slate-500 mt-2">Kami sudah kirim link konfirmasi ke <span className="font-semibold">{email}</span>. Setelah konfirmasi, kembali ke sini dan login. Setup usaha akan dilanjutkan otomatis.</p>
          <Link to="/login" className="inline-block mt-5 h-11 leading-[44px] px-5 rounded-xl bg-slate-900 text-white font-semibold">Ke halaman login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F8] grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-[520px] bg-white border rounded-3xl p-6 shadow-sm">
        <div className="text-xl font-bold">Daftar AIWAKU</div>
        <div className="text-sm text-slate-500 mt-1">Langkah {step}/3 — {stepLabel}</div>

        {step === 1 && (
          <div className="mt-6 space-y-3">
            <input value={businessName} onChange={e=>setBusinessName(e.target.value)} required placeholder="Nama usaha" className="w-full h-11 rounded-xl border px-3" />
            <div>
              <div className="flex items-center h-11 rounded-xl border px-3 gap-1 text-sm text-slate-500">
                <span>app.aiwaku.id/t/</span>
                <input
                  value={effectiveSlug}
                  onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                  placeholder="nama-usaha"
                  className="flex-1 outline-none text-slate-900"
                />
              </div>
              <div className="text-[11px] text-slate-400 mt-1 px-1">Huruf kecil, angka, dan tanda strip saja.</div>
            </div>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="Email" className="w-full h-11 rounded-xl border px-3" />
            <input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="new-password" required placeholder="Password (min. 6 karakter)" className="w-full h-11 rounded-xl border px-3" />
            <input value={waNumber} onChange={e=>setWaNumber(e.target.value)} placeholder="Nomor WhatsApp (opsional)" className="w-full h-11 rounded-xl border px-3" />
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>}
            <button type="button" disabled={!canGoStep2} onClick={() => setStep(2)} className="w-full h-11 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40">Lanjut</button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-2">
              {NICHE_CATALOG.map(n => (
                <button type="button" key={n.key} onClick={() => selectNiche(n.key)}
                  className={`h-16 rounded-xl border text-left px-3 flex items-center gap-2 text-[13px] font-semibold ${niche === n.key ? 'bg-slate-900 text-white border-slate-900' : 'hover:bg-slate-50'}`}>
                  <span className="text-lg">{n.emoji}</span><span>{n.label}</span>
                </button>
              ))}
            </div>
            {niche === 'lainnya' && (
              <input
                value={nicheLabel}
                onChange={e => setNicheLabel(e.target.value)}
                placeholder="Tulis jenis usaha Anda"
                className="w-full h-11 rounded-xl border px-3 mt-3"
              />
            )}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setStep(1)} className="flex-1 h-11 rounded-xl border font-semibold">Kembali</button>
              <button type="button" disabled={!canGoStep3} onClick={() => setStep(3)} className="flex-1 h-11 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40">Lanjut</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6">
            <div className="text-[12px] text-slate-500 mb-3">Sudah kami pilihkan sesuai jenis usaha — boleh diubah. "Menu & Stok" dan "Jualan" selalu aktif untuk semua tenant.</div>
            <div className="space-y-2">
              {FEATURE_CATALOG.map(f => (
                <label key={f.key} className={`flex items-start gap-3 rounded-xl border p-3 ${f.is_available ? 'cursor-pointer' : 'opacity-50'}`}>
                  <input type="checkbox" className="mt-1" checked={features.has(f.key)} disabled={!f.is_available} onChange={() => toggleFeature(f.key, f.is_available)} />
                  <div>
                    <div className="text-[13px] font-semibold">{f.label}{!f.is_available && <span className="ml-2 text-[10px] text-amber-600 font-normal">Segera hadir</span>}</div>
                    <div className="text-[11px] text-slate-500">{f.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mt-3">{error}</div>}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setStep(2)} className="flex-1 h-11 rounded-xl border font-semibold">Kembali</button>
              <button disabled={busy || !canSubmit} className="flex-1 h-11 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40">{busy ? 'Memproses...' : 'Daftar & Mulai'}</button>
            </div>
          </div>
        )}

        <div className="text-center text-[12px] text-slate-500 mt-5">Sudah punya akun? <Link to="/login" className="font-semibold text-slate-900">Masuk</Link></div>
      </form>
    </div>
  )
}
