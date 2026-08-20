import { useState, useEffect } from 'react'
import { getAuditLogs, logAudit } from '../lib/auditLog'
import type { AuditLog } from '../types'

export function useAudit(tenantId: string) {
  const [logs, setLogs] = useState<AuditLog[]>(() => getAuditLogs(tenantId))
  useEffect(() => { setLogs(getAuditLogs(tenantId)) }, [tenantId])
  const addLog = async (action: string, entity: string, entityId: string, oldValue?: any, newValue?: any) => {
    const log = await logAudit(tenantId, action, entity, entityId, oldValue, newValue)
    setLogs(prev => [log, ...prev].slice(0,200))
    return log
  }
  return { logs, addLog }
}
