import type { AuditLog } from '../types'
import { supabase, isSupabaseEnabled } from './supabase'

function localKey(tenantId: string) {
  return `aiwaku_v5_audit_${tenantId}`
}

export async function logAudit(tenantId: string, action: string, entity: string, entityId: string, oldValue?: any, newValue?: any) {
  const log: AuditLog = {
    id: crypto.randomUUID(), tenant_id: tenantId, action, entity, entity_id: entityId,
    old_value: oldValue, new_value: newValue, user: 'admin', timestamp: new Date().toISOString()
  }
  try {
    const existing = JSON.parse(localStorage.getItem(localKey(tenantId)) || '[]')
    localStorage.setItem(localKey(tenantId), JSON.stringify([log, ...existing].slice(0,200)))
  } catch {}
  if (isSupabaseEnabled()) {
    const { error } = await supabase!.rpc('write_audit_log', {
      p_tenant_id: tenantId, p_action: action, p_entity: entity, p_entity_id: entityId, p_old_value: oldValue ?? null, p_new_value: newValue ?? null
    })
    if (error) console.error('Audit persistence failed:', error.message)
  }
  return log
}

export function getAuditLogs(tenantId: string): AuditLog[] {
  try {
    return (JSON.parse(localStorage.getItem(localKey(tenantId)) || '[]') as AuditLog[]).filter(l => l.tenant_id === tenantId)
  } catch { return [] }
}
