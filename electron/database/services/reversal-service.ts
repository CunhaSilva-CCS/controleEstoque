import { randomUUID } from 'node:crypto'
import { getAuditContext, recordAudit } from '../audit'
import type { Db } from '../types'
import { updateInvoiceAverageCost } from './costing-service'
import { applyStockMovement } from './stock-service'

function reason(value: string): string {
  const normalized = value.trim()
  if (normalized.length < 5) throw new Error('Indique um motivo de estorno com, pelo menos, 5 caracteres')
  return normalized
}

export function reversePurchase(database: Db, id: string, cancellationReason: string, timestamp: string): void {
  const document = database.prepare('SELECT number, status FROM purchase_invoices WHERE id = ?').get(id) as { number: string; status: string } | undefined
  if (!document) throw new Error('Fatura de entrada não encontrada')
  if (document.status !== 'confirmado') throw new Error('Apenas faturas confirmadas podem ser estornadas')
  const items = database.prepare('SELECT product_id, quantity FROM purchase_invoice_items WHERE invoice_id = ?').all(id) as { product_id: string; quantity: number }[]
  for (const item of items) {
    const product = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(item.product_id) as { name: string; stock: number }
    if (product.stock < item.quantity) throw new Error(`Não é possível estornar: o stock de ${product.name} já foi consumido`)
  }
  const reversalId = randomUUID(); const normalized = reason(cancellationReason)
  database.transaction(() => {
    for (const item of items) applyStockMovement(database, { productId: item.product_id, type: 'saida', quantity: item.quantity,
      reason: `Estorno da fatura de entrada ${document.number}: ${normalized}`, reference: reversalId, origin: 'estorno' }, timestamp)
    database.prepare(`UPDATE purchase_invoices SET status = 'estornado', cancelled_by = ?, cancelled_at = ?,
      cancellation_reason = ?, reversal_id = ? WHERE id = ?`).run(getAuditContext().userId, timestamp, normalized, reversalId, id)
    items.forEach((item) => updateInvoiceAverageCost(database, item.product_id, timestamp))
  })()
  recordAudit(database, 'reverse', 'purchase_invoice', id, { status: 'estornado', reason: normalized, reversalId }, timestamp, { status: 'confirmado' })
}

export function reverseSale(database: Db, id: string, cancellationReason: string, timestamp: string): void {
  const document = database.prepare('SELECT number, status FROM sales_invoices WHERE id = ?').get(id) as { number: string; status: string } | undefined
  if (!document) throw new Error('Fatura de saída não encontrada')
  if (document.status !== 'confirmado') throw new Error('Apenas faturas confirmadas podem ser estornadas')
  const items = database.prepare('SELECT product_id, quantity FROM sales_invoice_items WHERE invoice_id = ?').all(id) as { product_id: string; quantity: number }[]
  const reversalId = randomUUID(); const normalized = reason(cancellationReason)
  database.transaction(() => {
    for (const item of items) applyStockMovement(database, { productId: item.product_id, type: 'entrada', quantity: item.quantity,
      reason: `Estorno da fatura de saída ${document.number}: ${normalized}`, reference: reversalId, origin: 'estorno' }, timestamp)
    database.prepare(`UPDATE sales_invoices SET status = 'estornado', cancelled_by = ?, cancelled_at = ?,
      cancellation_reason = ?, reversal_id = ? WHERE id = ?`).run(getAuditContext().userId, timestamp, normalized, reversalId, id)
  })()
  recordAudit(database, 'reverse', 'sales_invoice', id, { status: 'estornado', reason: normalized, reversalId }, timestamp, { status: 'confirmado' })
}

export function reverseProduction(database: Db, id: string, cancellationReason: string, timestamp: string): void {
  const order = database.prepare('SELECT product_id, quantity, status FROM production_orders WHERE id = ?').get(id) as { product_id: string; quantity: number; status: string } | undefined
  if (!order) throw new Error('Ordem de fabrico não encontrada')
  if (order.status !== 'confirmado') throw new Error('Apenas ordens confirmadas podem ser estornadas')
  const finished = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(order.product_id) as { name: string; stock: number }
  if (finished.stock < order.quantity) throw new Error(`Não é possível estornar: ${finished.name} já foi vendido ou consumido`)
  const consumed = database.prepare('SELECT product_id, quantity FROM production_order_items WHERE order_id = ?').all(id) as { product_id: string; quantity: number }[]
  if (!consumed.length) throw new Error('Esta ordem antiga não possui fotografia de consumo para estorno seguro')
  const reversalId = randomUUID(); const normalized = reason(cancellationReason)
  database.transaction(() => {
    applyStockMovement(database, { productId: order.product_id, type: 'saida', quantity: order.quantity,
      reason: `Estorno de fabrico: ${normalized}`, reference: reversalId, origin: 'estorno' }, timestamp)
    for (const item of consumed) applyStockMovement(database, { productId: item.product_id, type: 'entrada', quantity: item.quantity,
      reason: `Reposição por estorno de fabrico: ${normalized}`, reference: reversalId, origin: 'estorno' }, timestamp)
    database.prepare(`UPDATE production_orders SET status = 'estornado', cancelled_by = ?, cancelled_at = ?,
      cancellation_reason = ?, reversal_id = ? WHERE id = ?`).run(getAuditContext().userId, timestamp, normalized, reversalId, id)
  })()
  recordAudit(database, 'reverse', 'production_order', id, { status: 'estornado', reason: normalized, reversalId }, timestamp, { status: 'confirmado' })
}
