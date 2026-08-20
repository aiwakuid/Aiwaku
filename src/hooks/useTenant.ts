
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

  useEffect(() => {
    async function load() {
      setLoading(true)
      if (isSupabaseEnabled()) {
        const t = await getTenantSupabase(slug)
        if (t) setTenant(t as any)
      } else {
        setTenant({
          ...defaultTenant,
          id: getTenantIdFromSlug(slug),
          slug,
          name: slug.split('-').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ') + ' - Bekasi'
        })
      }
      setLoading(false)
    }
    load()
  }, [slug])

  return { tenant, slug, loading }
}
