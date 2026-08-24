import { randomUUID } from 'node:crypto'
import { roundQuantity } from '../../../shared/quantity'
import type { InventorySession, InventoryStatus } from '../../../shared/types'
import { getAuditContext, recordAudit } from '../audit'
import type { Db } from '../types'
import { applyStockMovement } from './stock-service'

export function listInventorySessions(database: Db): InventorySession[] {
  const sessions = database.prepare('SELECT * FROM inventory_sessions ORDER BY created_at DESC').all() as Record<string, unknown>[]
  const counts = database.prepare(`SELECT c.*, p.name product_name, p.sku product_sku, p.unit
    FROM inventory_counts c JOIN products p ON p.id = c.product_id WHERE c.session_id = ? ORDER BY p.name`)
  return sessions.map((row) => ({
    id: String(row.id), code: String(row.code), status: row.status as InventoryStatus,
    referenceAt: String(row.reference_at), notes: String(row.notes ?? ''), createdAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    counts: (counts.all(row.id) as Record<string, unknown>[]).map((item) => ({
      id: String(item.id), productId: String(item.product_id), productName: String(item.product_name),
      productSku: String(item.product_sku), unit: String(item.unit), referenceStock: Number(item.reference_stock),
      countedStock: item.counted_stock == null ? null : Number(item.counted_stock),
      difference: item.difference == null ? null : Number(item.difference),
    })),
  }))
}

export function openInventorySession(database: Db, notes: string, timestamp: string): InventorySession {
  const active = database.prepare("SELECT id FROM inventory_sessions WHERE status NOT IN ('aprovado', 'cancelado')").get()
  if (active) throw new Error('Já existe uma sessão de inventário em curso')
  const id = randomUUID()
  const code = `INV-${timestamp.slice(0, 10).replaceAll('-', '')}-${timestamp.slice(11, 19).replaceAll(':', '')}`
  const context = getAuditContext()
  database.transaction(() => {
    database.prepare(`INSERT INTO inventory_sessions
      (id, code, status, reference_at, notes, created_by, created_at) VALUES (?, ?, 'aberto', ?, ?, ?, ?)`)
      .run(id, code, timestamp, notes.trim(), context.userId, timestamp)
    const products = database.prepare('SELECT id, stock FROM products WHERE active = 1 ORDER BY name')
      .all() as { id: string; stock: number }[]
    const insert = database.prepare(`INSERT INTO inventory_counts
      (id, session_id, product_id, reference_stock) VALUES (?, ?, ?, ?)`)
    products.forEach((product) => insert.run(randomUUID(), id, product.id, product.stock))
    database.prepare("UPDATE inventory_sessions SET status = 'em_contagem' WHERE id = ?").run(id)
  })()
  recordAudit(database, 'open', 'inventory_session', id, { code, productCount: listInventorySessions(database).find((item) => item.id === id)?.counts.length ?? 0 }, timestamp)
  return listInventorySessions(database).find((item) => item.id === id)!
}

export function recordInventoryCount(database: Db, sessionId: string, productId: string, countedStock: number, timestamp: string): InventorySession {
  if (!Number.isFinite(countedStock) || countedStock < 0) throw new Error('A contagem não pode ser negativa')
  const session = database.prepare('SELECT status FROM inventory_sessions WHERE id = ?').get(sessionId) as { status: string } | undefined
  if (!session || !['aberto', 'em_contagem'].includes(session.status)) throw new Error('Esta sessão já não aceita contagens')
  const row = database.prepare('SELECT reference_stock FROM inventory_counts WHERE session_id = ? AND product_id = ?')
    .get(sessionId, productId) as { reference_stock: number } | undefined
  if (!row) throw new Error('Produto não pertence a esta sessão')
  const value = roundQuantity(countedStock)
  database.prepare(`UPDATE inventory_counts SET counted_stock = ?, difference = ?, counted_by = ?, counted_at = ?
    WHERE session_id = ? AND product_id = ?`).run(value, roundQuantity(value - row.reference_stock), getAuditContext().userId, timestamp, sessionId, productId)
  recordAudit(database, 'count', 'inventory_session', sessionId, { productId, countedStock: value }, timestamp)
  return listInventorySessions(database).find((item) => item.id === sessionId)!
}

export function submitInventorySession(database: Db, id: string, timestamp: string): InventorySession {
  const missing = database.prepare('SELECT COUNT(*) count FROM inventory_counts WHERE session_id = ? AND counted_stock IS NULL').get(id) as { count: number }
  if (missing.count) throw new Error(`Ainda existem ${missing.count} produtos sem contagem`)
  const result = database.prepare("UPDATE inventory_sessions SET status = 'aguarda_aprovacao' WHERE id = ? AND status = 'em_contagem'").run(id)
  if (!result.changes) throw new Error('Sessão de inventário não disponível para submissão')
  recordAudit(database, 'submit', 'inventory_session', id, {}, timestamp)
  return listInventorySessions(database).find((item) => item.id === id)!
}

export function approveInventorySession(database: Db, id: string, timestamp: string): InventorySession {
  const session = database.prepare('SELECT code, status FROM inventory_sessions WHERE id = ?').get(id) as { code: string; status: string } | undefined
  if (session?.status !== 'aguarda_aprovacao') throw new Error('A sessão deve estar a aguardar aprovação')
  const counts = database.prepare('SELECT product_id, counted_stock FROM inventory_counts WHERE session_id = ?').all(id) as { product_id: string; counted_stock: number }[]
  database.transaction(() => {
    for (const count of counts) {
      const current = database.prepare('SELECT stock FROM products WHERE id = ?').get(count.product_id) as { stock: number }
      if (roundQuantity(current.stock) === roundQuantity(count.counted_stock)) continue
      applyStockMovement(database, { productId: count.product_id, type: 'ajuste', newStock: count.counted_stock,
        reason: `Inventário físico ${session.code}`, reference: id, origin: 'inventario_fisico' }, timestamp)
    }
    database.prepare("UPDATE inventory_sessions SET status = 'aprovado', approved_by = ?, approved_at = ? WHERE id = ?")
      .run(getAuditContext().userId, timestamp, id)
  })()
  recordAudit(database, 'approve', 'inventory_session', id, { adjustments: counts.length }, timestamp)
  return listInventorySessions(database).find((item) => item.id === id)!
}

export function cancelInventorySession(database: Db, id: string, reason: string, timestamp: string): InventorySession {
  if (!reason.trim()) throw new Error('Indique o motivo do cancelamento')
  const result = database.prepare(`UPDATE inventory_sessions SET status = 'cancelado', notes = notes || ?, cancelled_at = ?
    WHERE id = ? AND status NOT IN ('aprovado', 'cancelado')`).run(`\nCancelamento: ${reason.trim()}`, timestamp, id)
  if (!result.changes) throw new Error('Esta sessão não pode ser cancelada')
  recordAudit(database, 'cancel', 'inventory_session', id, { reason: reason.trim() }, timestamp)
  return listInventorySessions(database).find((item) => item.id === id)!
}
