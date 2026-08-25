import type { Db } from '../types'
import { roundQuantity } from '../../../shared/quantity'

export function calculateInvoiceAverageCost(database: Db, productId: string): number | null {
  const result = database.prepare(
    `SELECT SUM(ii.quantity * ii.unit_cost) AS total_value, SUM(ii.quantity) AS total_quantity
     FROM purchase_invoice_items ii JOIN purchase_invoices i ON i.id = ii.invoice_id
     WHERE ii.product_id = ? AND COALESCE(i.status, 'confirmado') NOT IN ('cancelado', 'estornado')`,
  ).get(productId) as { total_value: number | null; total_quantity: number | null }
  if (!result.total_quantity) return null
  return roundQuantity((result.total_value ?? 0) / result.total_quantity)
}

export function updateInvoiceAverageCost(
  database: Db,
  productId: string,
  updatedAt: string,
  resetWhenEmpty = true,
): void {
  const average = calculateInvoiceAverageCost(database, productId)
  if (average === null && !resetWhenEmpty) return
  database.prepare('UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ? AND kind = ?')
    .run(average ?? 0, updatedAt, productId, 'insumo')
  updateFinishedProductCostsUsingInput(database, productId, updatedAt)
}

export function recalculateAllInvoiceAverageCosts(database: Db, timestamp: string): void {
  const productIds = database.prepare('SELECT DISTINCT product_id FROM purchase_invoice_items')
    .all() as { product_id: string }[]
  productIds.forEach(({ product_id }) => updateInvoiceAverageCost(database, product_id, timestamp, false))
}

export function calculateFinishedProductCost(database: Db, productId: string): number {
  const result = database.prepare(
    `SELECT COALESCE(SUM(ri.quantity * p.cost_price), 0) AS cost
     FROM recipes r
     JOIN recipe_items ri ON ri.recipe_id = r.id
     JOIN products p ON p.id = ri.product_id
     WHERE r.product_id = ? AND r.active = 1`,
  ).get(productId) as { cost: number }
  return roundQuantity(Number(result.cost))
}

export function updateFinishedProductCost(database: Db, productId: string, updatedAt: string): void {
  database.prepare('UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ? AND kind = ?')
    .run(calculateFinishedProductCost(database, productId), updatedAt, productId, 'acabado')
}

export function updateFinishedProductCostsUsingInput(database: Db, inputId: string, updatedAt: string): void {
  const rows = database.prepare(
    `SELECT DISTINCT r.product_id FROM recipes r
     JOIN recipe_items ri ON ri.recipe_id = r.id WHERE ri.product_id = ?`,
  ).all(inputId) as { product_id: string }[]
  rows.forEach(({ product_id }) => updateFinishedProductCost(database, product_id, updatedAt))
}

export function recalculateAllFinishedProductCosts(database: Db, timestamp: string): void {
  const rows = database.prepare('SELECT product_id FROM recipes WHERE active = 1')
    .all() as { product_id: string }[]
  rows.forEach(({ product_id }) => updateFinishedProductCost(database, product_id, timestamp))
}
