
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { defaultTenant, getTenantIdFromSlug } from '../lib/storage'
import { getTenantBySlug as getTenantSupabase, isSupabaseEnabled } from '../lib/supabase'
import type { Tenant } from '../types'

export function useTenant() {
  const params = useParams()
  const slug = params.slug || 'bakery-sari'
  const [tenant, setTenant] = useState<Tenant>(defaultTenant)
  const [loading, setLoading] = useState(true)
  // Supabase aktif tapi slug tidak ditemukan di tabel tenants -> jangan diam-diam
  // tampilkan data tenant demo "Bakery Sari" seolah itu tenant yang diminta.
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setNotFound(false)
      if (isSupabaseEnabled()) {
        const t = await getTenantSupabase(slug)
        if (cancelled) return
        if (t) setTenant(t as any)
        else setNotFound(true)
      } else {
        // Mode offline/dev tanpa Supabase: tenant ID diturunkan konsisten dari
        // slug, nama dari slug apa adanya - tidak menempelkan kota yang dikarang
        // (sebelumnya selalu " - Bekasi" walau tokonya di kota lain).
        setTenant({
          ...defaultTenant,
          id: getTenantIdFromSlug(slug),
          slug,
          name: slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        })
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  return { tenant, slug, loading, notFound }
}
