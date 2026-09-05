import { randomUUID } from 'node:crypto'
import type { Product, ProductFilters, ProductInput, ProductKind, ProductStatus, ProductUpdateInput } from '../../../shared/types'
import type { Db } from '../types'
import { recordAudit } from '../audit'
import { calculateInvoiceAverageCost } from '../services/costing-service'

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

function validateProductFields(input: {
  sku: string
  name: string
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
  purchaseConversionFactor?: number
}): void {
  if (!input.sku.trim()) throw new Error('Código é obrigatório')
  if (!input.name.trim()) throw new Error('Nome do produto é obrigatório')
  if (!input.unit.trim()) throw new Error('Unidade é obrigatória')
  if (input.costPrice < 0 || input.salePrice < 0) throw new Error('Preços não podem ser negativos')
  if (input.minStock < 0) throw new Error('O stock mínimo não pode ser negativo')
  if (input.purchaseConversionFactor !== undefined && !(input.purchaseConversionFactor > 0)) {
    throw new Error('O fator de conversão deve ser superior a zero')
  }
}

export function createProduct(database: Db, input: ProductInput, timestamp: string): Product {
  validateProductFields(input)
  const kind: ProductKind = input.kind ?? 'insumo'

  const id = randomUUID()
  const normalizedSku = input.sku.trim()
  const duplicate = database
    .prepare('SELECT id FROM products WHERE lower(trim(sku)) = lower(?) LIMIT 1')
    .get(normalizedSku)
  if (duplicate) throw new Error('Já existe um produto com este código')

  const tx = database.transaction(() => {
    try {
      database
        .prepare(
          `INSERT INTO products (
            id, sku, name, description, category_id, supplier_id, kind, unit,
            cost_price, sale_price, min_stock, stock, active, created_at, updated_at,
            purchase_unit, purchase_conversion_factor, lot_control
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          normalizedSku,
          input.name.trim(),
          input.description?.trim() ?? '',
          input.categoryId || null,
          input.supplierId || null,
          kind,
          input.unit.trim(),
          0,
          input.salePrice,
          input.minStock,
          timestamp,
          timestamp,
          input.purchaseUnit?.trim() || null,
          input.purchaseConversionFactor ?? 1,
          input.lotControl ? 1 : 0,
        )
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este código')
      throw err
    }
  })

  tx()
  recordAudit(database, 'create', 'product', id, { sku: normalizedSku, kind }, timestamp)
  return getProduct(database, id)!
}

export function updateProduct(database: Db, input: ProductUpdateInput, timestamp: string): Product {
  validateProductFields(input)
  const normalizedSku = input.sku.trim()
  const duplicate = database
    .prepare('SELECT id FROM products WHERE lower(trim(sku)) = lower(?) AND id <> ? LIMIT 1')
    .get(normalizedSku, input.id)
  if (duplicate) throw new Error('Já existe um produto com este código')
  const effectiveCostPrice = input.kind === 'insumo'
    ? (calculateInvoiceAverageCost(database, input.id) ?? 0)
    : (getProduct(database, input.id)?.costPrice ?? 0)
  try {
    const result = database
      .prepare(
        `UPDATE products SET
          sku = ?, name = ?, description = ?, category_id = ?, supplier_id = ?,
          kind = ?, unit = ?, cost_price = ?, sale_price = ?, min_stock = ?, updated_at = ?,
          purchase_unit = ?, purchase_conversion_factor = ?, lot_control = ?
         WHERE id = ?`,
      )
      .run(
        normalizedSku,
        input.name.trim(),
        input.description?.trim() ?? '',
        input.categoryId || null,
        input.supplierId || null,
        input.kind,
        input.unit.trim(),
        effectiveCostPrice,
        input.salePrice,
        input.minStock,
        timestamp,
        input.purchaseUnit?.trim() || null,
        input.purchaseConversionFactor ?? 1,
        input.lotControl ? 1 : 0,
        input.id,
      )
    if (result.changes === 0) throw new Error('Produto não encontrado')
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este código')
    throw err
  }
  recordAudit(database, 'update', 'product', input.id, { sku: normalizedSku, kind: input.kind }, timestamp)
  return getProduct(database, input.id)!
}

export function setProductActive(database: Db, id: string, active: boolean, timestamp: string): Product {
  const result = database
    .prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
    .run(active ? 1 : 0, timestamp, id)
  if (result.changes === 0) throw new Error('Produto não encontrado')
  return getProduct(database, id)!
}
