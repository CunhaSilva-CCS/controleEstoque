import type { Product, ProductFilters, ProductKind, ProductStatus } from '../../../shared/types'
import type { Db } from '../types'

function status(stock: number, minimum: number): ProductStatus {
  if (stock <= 0) return 'zero'
  if (stock <= minimum) return 'low'
  return 'ok'
}

function map(row: Record<string, unknown>): Product {
  const stock = Number(row.stock)
  const minStock = Number(row.min_stock)
  const costPrice = Number(row.cost_price)
  return {
    id: String(row.id), sku: String(row.sku), name: String(row.name),
    description: String(row.description ?? ''),
    categoryId: row.category_id ? String(row.category_id) : null,
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    kind: (row.kind as ProductKind) ?? 'insumo', unit: String(row.unit),
    costPrice, salePrice: Number(row.sale_price), minStock, stock,
    active: Boolean(row.active), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    categoryName: row.category_name == null ? null : String(row.category_name),
    supplierName: row.supplier_name == null ? null : String(row.supplier_name),
    status: status(stock, minStock), stockValue: stock * costPrice,
    purchaseUnit: row.purchase_unit ? String(row.purchase_unit) : null,
    purchaseConversionFactor: Number(row.purchase_conversion_factor ?? 1),
    lotControl: Boolean(row.lot_control),
  }
}

export function listProducts(database: Db, filters: ProductFilters = {}): Product[] {
  const clauses: string[] = []
  const params: unknown[] = []
  if (filters.search?.trim()) {
    clauses.push('(p.name LIKE ? OR p.sku LIKE ?)')
    const query = `%${filters.search.trim()}%`
    params.push(query, query)
  }
  if (filters.categoryId) { clauses.push('p.category_id = ?'); params.push(filters.categoryId) }
  if (filters.kind) { clauses.push('p.kind = ?'); params.push(filters.kind) }
  if (filters.active !== undefined) { clauses.push('p.active = ?'); params.push(filters.active ? 1 : 0) }
  if (filters.lowStockOnly) clauses.push('p.stock <= p.min_stock')
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = database.prepare(`SELECT p.*, c.name AS category_name, s.name AS supplier_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id ${where} ORDER BY p.name`).all(...params)
  return (rows as Record<string, unknown>[]).map(map)
}

export function getProduct(database: Db, id: string): Product | null {
  const row = database.prepare(`SELECT p.*, c.name AS category_name, s.name AS supplier_name
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`).get(id)
  return row ? map(row as Record<string, unknown>) : null
}
