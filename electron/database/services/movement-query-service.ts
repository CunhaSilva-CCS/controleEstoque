import type { MovementFilters, StockMovement } from '../../../shared/types'
import type { Db } from '../types'

/** Consultas de histórico separadas da fachada de operações da base. */
export function queryMovements(
  database: Db,
  filters: MovementFilters,
  map: (row: Record<string, unknown>) => StockMovement,
): StockMovement[] {
  const clauses: string[] = []
  const params: unknown[] = []
  if (filters.productId) { clauses.push('m.product_id = ?'); params.push(filters.productId) }
  if (filters.type) { clauses.push('m.type = ?'); params.push(filters.type) }
  if (filters.from) { clauses.push('m.created_at >= ?'); params.push(filters.from) }
  if (filters.to) { clauses.push('m.created_at <= ?'); params.push(filters.to) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return (database.prepare(`SELECT m.*, p.name AS product_name, p.sku AS product_sku
    FROM stock_movements m JOIN products p ON p.id = m.product_id ${where}
    ORDER BY m.created_at DESC LIMIT 500`).all(...params) as Record<string, unknown>[]).map(map)
}
