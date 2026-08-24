import { randomUUID } from 'node:crypto'
import os from 'node:os'
import type { Db } from './types'

type AuditContext = { userId: string | null; username: string; origin: string; computerName: string }
let context: AuditContext = { userId: null, username: 'sistema', origin: 'desktop', computerName: os.hostname() }

export function setAuditContext(user?: { id: string; username: string } | null): void {
  context = { ...context, userId: user?.id ?? null, username: user?.username ?? 'sistema' }
}

export function getAuditContext(): AuditContext {
  return context
}

export function recordAudit(
  database: Db,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
  timestamp = new Date().toISOString(),
  previousValues: Record<string, unknown> = {},
): void {
  database.prepare(
    `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at,
      user_id, username, origin, computer_name, previous_values, new_values)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), action, entityType, entityId, JSON.stringify(details), timestamp,
    context.userId, context.username, context.origin, context.computerName,
    JSON.stringify(previousValues), JSON.stringify(details))
}
