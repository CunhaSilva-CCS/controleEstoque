import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  Category,
  DashboardData,
  Invoice,
  InvoiceInput,
  InvoiceItem,
  ManufacturingInput,
  ManufacturingOrder,
  MovementFilters,
  MovementInput,
  Product,
  ProductFilters,
  ProductInput,
  ProductRecipeInput,
  ProductRecipeItem,
  ProductStatus,
  ProductUpdateInput,
  StockMovement,
  Supplier,
} from '../shared/types'
import {
  FINISHED_PRODUCT_TYPES,
  isProductType,
  MATERIAL_PRODUCT_TYPES,
  productTypeLabel,
  type ProductType,
} from '../shared/product-types'

type Db = Database.Database

let db: Db | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function computeStatus(stock: number, minStock: number): ProductStatus {
  if (stock <= 0) return 'zero'
  if (stock <= minStock) return 'low'
  return 'ok'
}

function mapProduct(row: Record<string, unknown>): Product {
  const stock = Number(row.stock)
  const minStock = Number(row.min_stock)
  const costPrice = Number(row.cost_price)
  const rawType = String(row.product_type ?? 'revenda')
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    description: String(row.description ?? ''),
    productType: isProductType(rawType) ? rawType : 'revenda',
    categoryId: row.category_id ? String(row.category_id) : null,
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    unit: String(row.unit),
    costPrice,
    salePrice: Number(row.sale_price),
    minStock,
    stock,
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    categoryName: row.category_name != null ? String(row.category_name) : null,
    supplierName: row.supplier_name != null ? String(row.supplier_name) : null,
    status: computeStatus(stock, minStock),
    stockValue: stock * costPrice,
  }
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    name: String(row.name),
    document: String(row.document ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    notes: String(row.notes ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    type: row.type as StockMovement['type'],
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    reason: String(row.reason),
    reference: String(row.reference ?? ''),
    createdAt: String(row.created_at),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    productSku: row.product_sku != null ? String(row.product_sku) : undefined,
  }
}

function mapInvoiceItem(row: Record<string, unknown>): InvoiceItem {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    productId: String(row.product_id),
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    productSku: row.product_sku != null ? String(row.product_sku) : undefined,
  }
}

function mapInvoice(row: Record<string, unknown>, items?: InvoiceItem[]): Invoice {
  const itemCount = row.item_count != null ? Number(row.item_count) : items?.length
  const totalValue =
    row.total_value != null
      ? Number(row.total_value)
      : items?.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)
  return {
    id: String(row.id),
    number: String(row.number),
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    issueDate: String(row.issue_date),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    supplierName: row.supplier_name != null ? String(row.supplier_name) : null,
    items,
    itemCount,
    totalValue,
  }
}

function mapRecipeItem(row: Record<string, unknown>): ProductRecipeItem {
  return {
    id: String(row.id),
    finishedProductId: String(row.finished_product_id),
    materialProductId: String(row.material_product_id),
    quantity: Number(row.quantity),
    materialName: row.material_name != null ? String(row.material_name) : undefined,
    materialSku: row.material_sku != null ? String(row.material_sku) : undefined,
    materialUnit: row.material_unit != null ? String(row.material_unit) : undefined,
    materialStock: row.material_stock != null ? Number(row.material_stock) : undefined,
  }
}

function mapManufacturingOrder(row: Record<string, unknown>): ManufacturingOrder {
  return {
    id: String(row.id),
    finishedProductId: String(row.finished_product_id),
    quantity: Number(row.quantity),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    finishedProductName:
      row.finished_product_name != null ? String(row.finished_product_name) : undefined,
    finishedProductSku:
      row.finished_product_sku != null ? String(row.finished_product_sku) : undefined,
  }
}

export function getDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'estoque.db')
}

export function initDatabase(): { path: string; seeded: boolean } {
  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(name)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      document TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category_id TEXT REFERENCES categories(id),
      supplier_id TEXT REFERENCES suppliers(id),
      unit TEXT NOT NULL DEFAULT 'un',
      cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
      sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
      min_stock REAL NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
      stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0),
      product_type TEXT NOT NULL DEFAULT 'revenda',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(sku)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      type TEXT NOT NULL CHECK(type IN ('entrada', 'saida', 'ajuste')),
      quantity REAL NOT NULL,
      previous_stock REAL NOT NULL,
      new_stock REAL NOT NULL CHECK(new_stock >= 0),
      reason TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
    CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL COLLATE NOCASE,
      supplier_id TEXT REFERENCES suppliers(id),
      issue_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(number)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost >= 0)
    );

    CREATE TABLE IF NOT EXISTS product_recipes (
      id TEXT PRIMARY KEY,
      finished_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      material_product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      UNIQUE(finished_product_id, material_product_id)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_orders (
      id TEXT PRIMARY KEY,
      finished_product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_finished ON product_recipes(finished_product_id);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_created ON manufacturing_orders(created_at);
  `)

  migrateProductsTable(db)

  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }
  const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'seed_offered'").get() as
    | { value: string }
    | undefined

  return { path: dbPath, seeded: count.c > 0 || Boolean(meta) }
}

function requireDb(): Db {
  if (!db) throw new Error('Banco de dados não inicializado')
  return db
}

function migrateProductsTable(database: Db): void {
  const cols = database.prepare('PRAGMA table_info(products)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'product_type')) {
    database.exec(`ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'revenda'`)
  }
}

function normalizeProductType(type: ProductType | string | undefined): ProductType {
  if (type && isProductType(type)) return type
  throw new Error('Tipo de produto inválido')
}

export function markSeedOffered(): void {
  requireDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES ('seed_offered', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run()
}

export function seedDemoData(): void {
  const database = requireDb()
  const ts = nowIso()

  const run = database.transaction(() => {
    const catGeral = randomUUID()
    const catEletronicos = randomUUID()
    const catEscritorio = randomUUID()

    const insertCat = database.prepare(
      `INSERT INTO categories (id, name, description, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    insertCat.run(catGeral, 'Geral', 'Categoria padrão', ts, ts)
    insertCat.run(catEletronicos, 'Eletrônicos', 'Equipamentos e acessórios', ts, ts)
    insertCat.run(catEscritorio, 'Escritório', 'Material de escritório', ts, ts)

    const sup1 = randomUUID()
    const sup2 = randomUUID()
    const insertSup = database.prepare(
      `INSERT INTO suppliers (id, name, document, phone, email, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    insertSup.run(sup1, 'Distribuidora Norte', '12.345.678/0001-90', '(11) 3000-1000', 'contato@norte.com', '', ts, ts)
    insertSup.run(sup2, 'Papelaria Central', '98.765.432/0001-10', '(11) 4000-2000', 'vendas@papelaria.com', '', ts, ts)

    const products = [
      {
        sku: 'CAB-USB-C',
        name: 'Cabo USB-C 1m',
        productType: 'revenda' as ProductType,
        categoryId: catEletronicos,
        supplierId: sup1,
        unit: 'un',
        cost: 8.5,
        sale: 19.9,
        min: 10,
        stock: 45,
      },
      {
        sku: 'MOUSE-OP',
        name: 'Mouse óptico USB',
        productType: 'revenda' as ProductType,
        categoryId: catEletronicos,
        supplierId: sup1,
        unit: 'un',
        cost: 22,
        sale: 49.9,
        min: 5,
        stock: 3,
      },
      {
        sku: 'CANETA-AZ',
        name: 'Caneta esferográfica azul',
        productType: 'revenda' as ProductType,
        categoryId: catEscritorio,
        supplierId: sup2,
        unit: 'cx',
        cost: 12,
        sale: 24,
        min: 8,
        stock: 20,
      },
      {
        sku: 'RESMA-A4',
        name: 'Resma papel A4 500 folhas',
        productType: 'materia_prima' as ProductType,
        categoryId: catEscritorio,
        supplierId: sup2,
        unit: 'un',
        cost: 18,
        sale: 32,
        min: 15,
        stock: 30,
      },
      {
        sku: 'FITA-DUP',
        name: 'Fita adesiva dupla face',
        productType: 'insumo' as ProductType,
        categoryId: catGeral,
        supplierId: null,
        unit: 'un',
        cost: 4.5,
        sale: 9.9,
        min: 12,
        stock: 12,
      },
      {
        sku: 'KIT-ESCR',
        name: 'Kit material de escritório',
        productType: 'produto_final' as ProductType,
        categoryId: catEscritorio,
        supplierId: null,
        unit: 'un',
        cost: 35,
        sale: 69.9,
        min: 3,
        stock: 0,
      },
    ]

    const insertProd = database.prepare(
      `INSERT INTO products (
        id, sku, name, description, category_id, supplier_id, unit,
        cost_price, sale_price, min_stock, stock, product_type, active, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    const insertMov = database.prepare(
      `INSERT INTO stock_movements (
        id, product_id, type, quantity, previous_stock, new_stock, reason, reference, created_at
      ) VALUES (?, ?, 'entrada', ?, 0, ?, 'Estoque inicial', 'SEED', ?)`,
    )
    const insertRecipe = database.prepare(
      `INSERT INTO product_recipes (id, finished_product_id, material_product_id, quantity)
       VALUES (?, ?, ?, ?)`,
    )

    const productIds = new Map<string, string>()

    for (const p of products) {
      const id = randomUUID()
      productIds.set(p.sku, id)
      insertProd.run(
        id,
        p.sku,
        p.name,
        p.categoryId,
        p.supplierId,
        p.unit,
        p.cost,
        p.sale,
        p.min,
        p.stock,
        p.productType,
        ts,
        ts,
      )
      if (p.stock > 0) {
        insertMov.run(randomUUID(), id, p.stock, p.stock, ts)
      }
    }

    const kitId = productIds.get('KIT-ESCR')!
    const resmaId = productIds.get('RESMA-A4')!
    const fitaId = productIds.get('FITA-DUP')!
    insertRecipe.run(randomUUID(), kitId, resmaId, 1)
    insertRecipe.run(randomUUID(), kitId, fitaId, 1)

    markSeedOffered()
  })

  run()
}

export function listCategories(activeOnly = false): Category[] {
  const sql = activeOnly
    ? 'SELECT * FROM categories WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM categories ORDER BY name'
  return (requireDb().prepare(sql).all() as Record<string, unknown>[]).map(mapCategory)
}

export function createCategory(input: { name: string; description?: string }): Category {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da categoria é obrigatório')

  const id = randomUUID()
  const ts = nowIso()
  try {
    requireDb()
      .prepare(
        `INSERT INTO categories (id, name, description, active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(id, name, input.description?.trim() ?? '', ts, ts)
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe uma categoria com este nome')
    throw err
  }
  return listCategories().find((c) => c.id === id)!
}

export function updateCategory(input: {
  id: string
  name: string
  description?: string
  active: boolean
}): Category {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da categoria é obrigatório')
  const ts = nowIso()

  if (!input.active) {
    const linked = requireDb()
      .prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND active = 1')
      .get(input.id) as { c: number }
    if (linked.c > 0) {
      throw new Error(
        `Não é possível inativar: há ${linked.c} produto(s) ativo(s) nesta categoria`,
      )
    }
  }

  try {
    const result = requireDb()
      .prepare(
        `UPDATE categories SET name = ?, description = ?, active = ?, updated_at = ? WHERE id = ?`,
      )
      .run(name, input.description?.trim() ?? '', input.active ? 1 : 0, ts, input.id)
    if (result.changes === 0) throw new Error('Categoria não encontrada')
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe uma categoria com este nome')
    throw err
  }
  return listCategories().find((c) => c.id === input.id)!
}

export function listSuppliers(activeOnly = false): Supplier[] {
  const sql = activeOnly
    ? 'SELECT * FROM suppliers WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM suppliers ORDER BY name'
  return (requireDb().prepare(sql).all() as Record<string, unknown>[]).map(mapSupplier)
}

export function createSupplier(input: {
  name: string
  document?: string
  phone?: string
  email?: string
  notes?: string
}): Supplier {
  const name = input.name.trim()
  if (!name) throw new Error('Nome do fornecedor é obrigatório')
  const id = randomUUID()
  const ts = nowIso()
  requireDb()
    .prepare(
      `INSERT INTO suppliers (id, name, document, phone, email, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      name,
      input.document?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.email?.trim() ?? '',
      input.notes?.trim() ?? '',
      ts,
      ts,
    )
  return listSuppliers().find((s) => s.id === id)!
}

export function updateSupplier(input: {
  id: string
  name: string
  document?: string
  phone?: string
  email?: string
  notes?: string
  active: boolean
}): Supplier {
  const name = input.name.trim()
  if (!name) throw new Error('Nome do fornecedor é obrigatório')
  const ts = nowIso()
  const result = requireDb()
    .prepare(
      `UPDATE suppliers
       SET name = ?, document = ?, phone = ?, email = ?, notes = ?, active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      input.document?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.email?.trim() ?? '',
      input.notes?.trim() ?? '',
      input.active ? 1 : 0,
      ts,
      input.id,
    )
  if (result.changes === 0) throw new Error('Fornecedor não encontrado')
  return listSuppliers().find((s) => s.id === input.id)!
}

export function listProducts(filters: ProductFilters = {}): Product[] {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.search?.trim()) {
    clauses.push('(p.name LIKE ? OR p.sku LIKE ?)')
    const q = `%${filters.search.trim()}%`
    params.push(q, q)
  }
  if (filters.categoryId) {
    clauses.push('p.category_id = ?')
    params.push(filters.categoryId)
  }
  if (filters.active !== undefined) {
    clauses.push('p.active = ?')
    params.push(filters.active ? 1 : 0)
  }
  if (filters.lowStockOnly) {
    clauses.push('p.stock <= p.min_stock')
  }
  if (filters.productType) {
    clauses.push('p.product_type = ?')
    params.push(filters.productType)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = requireDb()
    .prepare(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${where}
       ORDER BY p.name`,
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(mapProduct)
}

export function getProduct(id: string): Product | null {
  const row = requireDb()
    .prepare(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined
  return row ? mapProduct(row) : null
}

function validateProductFields(input: {
  sku: string
  name: string
  unit: string
  productType: ProductType | string
  costPrice: number
  salePrice: number
  minStock: number
}): void {
  if (!input.sku.trim()) throw new Error('SKU é obrigatório')
  if (!input.name.trim()) throw new Error('Nome do produto é obrigatório')
  if (!input.unit.trim()) throw new Error('Unidade é obrigatória')
  normalizeProductType(input.productType)
  if (input.costPrice < 0 || input.salePrice < 0) throw new Error('Preços não podem ser negativos')
  if (input.minStock < 0) throw new Error('Estoque mínimo não pode ser negativo')
}

export function createProduct(input: ProductInput): Product {
  validateProductFields(input)
  const productType = normalizeProductType(input.productType)
  const initial = input.initialStock ?? 0
  if (initial < 0) throw new Error('Estoque inicial não pode ser negativo')

  const id = randomUUID()
  const ts = nowIso()
  const database = requireDb()

  const tx = database.transaction(() => {
    try {
      database
        .prepare(
          `INSERT INTO products (
            id, sku, name, description, category_id, supplier_id, unit,
            cost_price, sale_price, min_stock, stock, product_type, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          id,
          input.sku.trim(),
          input.name.trim(),
          input.description?.trim() ?? '',
          input.categoryId || null,
          input.supplierId || null,
          input.unit.trim(),
          input.costPrice,
          input.salePrice,
          input.minStock,
          initial,
          productType,
          ts,
          ts,
        )
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este SKU')
      throw err
    }

    if (initial > 0) {
      database
        .prepare(
          `INSERT INTO stock_movements (
            id, product_id, type, quantity, previous_stock, new_stock, reason, reference, created_at
          ) VALUES (?, ?, 'entrada', ?, 0, ?, 'Estoque inicial', '', ?)`,
        )
        .run(randomUUID(), id, initial, initial, ts)
    }
  })

  tx()
  return getProduct(id)!
}

export function updateProduct(input: ProductUpdateInput): Product {
  validateProductFields(input)
  const productType = normalizeProductType(input.productType)
  const ts = nowIso()
  try {
    const result = requireDb()
      .prepare(
        `UPDATE products SET
          sku = ?, name = ?, description = ?, category_id = ?, supplier_id = ?,
          unit = ?, cost_price = ?, sale_price = ?, min_stock = ?, product_type = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.sku.trim(),
        input.name.trim(),
        input.description?.trim() ?? '',
        input.categoryId || null,
        input.supplierId || null,
        input.unit.trim(),
        input.costPrice,
        input.salePrice,
        input.minStock,
        productType,
        ts,
        input.id,
      )
    if (result.changes === 0) throw new Error('Produto não encontrado')
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este SKU')
    throw err
  }
  return getProduct(input.id)!
}

export function setProductActive(id: string, active: boolean): Product {
  const ts = nowIso()
  const result = requireDb()
    .prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
    .run(active ? 1 : 0, ts, id)
  if (result.changes === 0) throw new Error('Produto não encontrado')
  return getProduct(id)!
}

function registerMovementInternal(
  database: Db,
  input: MovementInput,
  ts: string = nowIso(),
): string {
  const reason = input.reason.trim()
  if (!reason) throw new Error('Motivo é obrigatório')

  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as
    | Record<string, unknown>
    | undefined

  if (!product) throw new Error('Produto não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode receber movimentações')

  const previous = Number(product.stock)
  let quantity = input.quantity
  let newStock: number

  if (input.type === 'entrada') {
    if (!(quantity > 0)) throw new Error('Quantidade da entrada deve ser maior que zero')
    newStock = previous + quantity
  } else if (input.type === 'saida') {
    if (!(quantity > 0)) throw new Error('Quantidade da saída deve ser maior que zero')
    if (quantity > previous) {
      throw new Error(`Saldo insuficiente. Disponível: ${previous}`)
    }
    newStock = previous - quantity
  } else if (input.type === 'ajuste') {
    if (input.newStock === undefined || input.newStock < 0) {
      throw new Error('Informe o novo saldo (≥ 0) para o ajuste')
    }
    newStock = input.newStock
    quantity = newStock - previous
  } else {
    throw new Error('Tipo de movimentação inválido')
  }

  const id = randomUUID()

  database
    .prepare(
      `INSERT INTO stock_movements (
        id, product_id, type, quantity, previous_stock, new_stock, reason, reference, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.productId,
      input.type,
      quantity,
      previous,
      newStock,
      reason,
      input.reference?.trim() ?? '',
      ts,
    )
  database
    .prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
    .run(newStock, ts, input.productId)

  return id
}

export function registerMovement(input: MovementInput): StockMovement {
  const database = requireDb()
  const ts = nowIso()
  const id = registerMovementInternal(database, input, ts)

  const row = database
    .prepare(
      `SELECT m.*, p.name AS product_name, p.sku AS product_sku
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       WHERE m.id = ?`,
    )
    .get(id) as Record<string, unknown>

  return mapMovement(row)
}

export function listMovements(filters: MovementFilters = {}): StockMovement[] {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters.productId) {
    clauses.push('m.product_id = ?')
    params.push(filters.productId)
  }
  if (filters.type) {
    clauses.push('m.type = ?')
    params.push(filters.type)
  }
  if (filters.from) {
    clauses.push('m.created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    clauses.push('m.created_at <= ?')
    params.push(filters.to)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = requireDb()
    .prepare(
      `SELECT m.*, p.name AS product_name, p.sku AS product_sku
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT 500`,
    )
    .all(...params) as Record<string, unknown>[]

  return rows.map(mapMovement)
}

export function getDashboard(): DashboardData {
  const database = requireDb()
  const activeProducts = (
    database.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get() as { c: number }
  ).c
  const totalStockValue = (
    database
      .prepare('SELECT COALESCE(SUM(stock * cost_price), 0) AS v FROM products WHERE active = 1')
      .get() as { v: number }
  ).v
  const lowStockCount = (
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM products
         WHERE active = 1 AND stock > 0 AND stock <= min_stock`,
      )
      .get() as { c: number }
  ).c
  const zeroStockCount = (
    database
      .prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock <= 0')
      .get() as { c: number }
  ).c

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const movementsToday = (
    database
      .prepare('SELECT COUNT(*) AS c FROM stock_movements WHERE created_at >= ?')
      .get(startOfDay.toISOString()) as { c: number }
  ).c

  const criticalProducts = listProducts({ active: true, lowStockOnly: true })
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5)

  const recentMovements = listMovements().slice(0, 8)

  return {
    activeProducts,
    totalStockValue,
    lowStockCount,
    zeroStockCount,
    movementsToday,
    criticalProducts,
    recentMovements,
  }
}

export function buildReport(
  type: 'posicao' | 'movimentacoes' | 'baixo',
  filters: MovementFilters = {},
): { columns: string[]; rows: Record<string, string | number | boolean | null>[] } {
  if (type === 'posicao') {
    const products = listProducts({ active: true })
    return {
      columns: ['SKU', 'Nome', 'Tipo', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
      rows: products.map((p) => ({
        SKU: p.sku,
        Nome: p.name,
        Tipo: productTypeLabel(p.productType),
        Categoria: p.categoryName ?? '',
        Saldo: p.stock,
        Unidade: p.unit,
        Custo: p.costPrice,
        Valor: p.stockValue ?? 0,
        Status: p.status ?? 'ok',
      })),
    }
  }

  if (type === 'baixo') {
    const products = listProducts({ active: true, lowStockOnly: true })
    return {
      columns: ['SKU', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Status'],
      rows: products.map((p) => ({
        SKU: p.sku,
        Nome: p.name,
        Saldo: p.stock,
        Mínimo: p.minStock,
        Diferença: p.stock - p.minStock,
        Status: p.status ?? 'low',
      })),
    }
  }

  const movements = listMovements(filters)
  return {
    columns: ['Data', 'SKU', 'Produto', 'Tipo', 'Quantidade', 'Saldo anterior', 'Saldo novo', 'Motivo'],
    rows: movements.map((m) => ({
      Data: m.createdAt,
      SKU: m.productSku ?? '',
      Produto: m.productName ?? '',
      Tipo: m.type,
      Quantidade: m.quantity,
      'Saldo anterior': m.previousStock,
      'Saldo novo': m.newStock,
      Motivo: m.reason,
    })),
  }
}

export function listInvoices(): Invoice[] {
  const rows = requireDb()
    .prepare(
      `SELECT i.*, s.name AS supplier_name,
              COUNT(ii.id) AS item_count,
              COALESCE(SUM(ii.quantity * ii.unit_cost), 0) AS total_value
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT 200`,
    )
    .all() as Record<string, unknown>[]

  return rows.map((row) => mapInvoice(row))
}

export function getInvoice(id: string): Invoice | null {
  const database = requireDb()
  const row = database
    .prepare(
      `SELECT i.*, s.name AS supplier_name
       FROM invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined

  if (!row) return null

  const items = (
    database
      .prepare(
        `SELECT ii.*, p.name AS product_name, p.sku AS product_sku
         FROM invoice_items ii
         JOIN products p ON p.id = ii.product_id
         WHERE ii.invoice_id = ?
         ORDER BY p.name`,
      )
      .all(id) as Record<string, unknown>[]
  ).map(mapInvoiceItem)

  return mapInvoice(row, items)
}

export function createInvoice(input: InvoiceInput): Invoice {
  const number = input.number.trim()
  if (!number) throw new Error('Número da fatura é obrigatório')
  if (!input.issueDate.trim()) throw new Error('Data da fatura é obrigatória')
  if (!input.items.length) throw new Error('Informe ao menos um item na fatura')

  const database = requireDb()
  const invoiceId = randomUUID()
  const ts = nowIso()

  const tx = database.transaction(() => {
    try {
      database
        .prepare(
          `INSERT INTO invoices (id, number, supplier_id, issue_date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          invoiceId,
          number,
          input.supplierId || null,
          input.issueDate.trim(),
          input.notes?.trim() ?? '',
          ts,
        )
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new Error('Já existe uma fatura com este número')
      throw err
    }

    const insertItem = database.prepare(
      `INSERT INTO invoice_items (id, invoice_id, product_id, quantity, unit_cost)
       VALUES (?, ?, ?, ?, ?)`,
    )

    for (const item of input.items) {
      if (!(item.quantity > 0)) {
        throw new Error('Quantidade do item deve ser maior que zero')
      }

      const product = database.prepare('SELECT * FROM products WHERE id = ?').get(item.productId) as
        | Record<string, unknown>
        | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error(`Produto inativo: ${product.name}`)

      const unitCost = item.unitCost ?? Number(product.cost_price)
      if (unitCost < 0) throw new Error('Custo unitário não pode ser negativo')

      insertItem.run(randomUUID(), invoiceId, item.productId, item.quantity, unitCost)

      registerMovementInternal(database, {
        productId: item.productId,
        type: 'entrada',
        quantity: item.quantity,
        reason: 'Entrada por fatura',
        reference: number,
      }, ts)
    }
  })

  tx()
  return getInvoice(invoiceId)!
}

export function getProductRecipe(finishedProductId: string): ProductRecipeItem[] {
  const rows = requireDb()
    .prepare(
      `SELECT r.*, p.name AS material_name, p.sku AS material_sku, p.unit AS material_unit, p.stock AS material_stock
       FROM product_recipes r
       JOIN products p ON p.id = r.material_product_id
       WHERE r.finished_product_id = ?
       ORDER BY p.name`,
    )
    .all(finishedProductId) as Record<string, unknown>[]

  return rows.map(mapRecipeItem)
}

export function saveProductRecipe(input: ProductRecipeInput): ProductRecipeItem[] {
  const database = requireDb()
  const finished = database
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(input.finishedProductId) as Record<string, unknown> | undefined

  if (!finished) throw new Error('Produto acabado não encontrado')
  if (!finished.active) throw new Error('Produto acabado inativo não pode ter ficha técnica')
  const finishedType = String(finished.product_type ?? 'revenda')
  if (!FINISHED_PRODUCT_TYPES.includes(finishedType as ProductType)) {
    throw new Error('A ficha técnica só pode ser cadastrada para produto final')
  }

  const seen = new Set<string>()
  for (const item of input.items) {
    if (!(item.quantity > 0)) {
      throw new Error('Quantidade da matéria-prima deve ser maior que zero')
    }
    if (item.materialProductId === input.finishedProductId) {
      throw new Error('O produto acabado não pode ser matéria-prima de si mesmo')
    }
    if (seen.has(item.materialProductId)) {
      throw new Error('Matéria-prima duplicada na ficha técnica')
    }
    seen.add(item.materialProductId)

    const material = database
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(item.materialProductId) as Record<string, unknown> | undefined
    if (!material) throw new Error('Matéria-prima não encontrada')
    if (!material.active) throw new Error(`Matéria-prima inativa: ${material.name}`)
    const materialType = String(material.product_type ?? 'revenda')
    if (!MATERIAL_PRODUCT_TYPES.includes(materialType as ProductType)) {
      throw new Error(`${material.name} deve ser matéria-prima ou insumo`)
    }
  }

  const tx = database.transaction(() => {
    database
      .prepare('DELETE FROM product_recipes WHERE finished_product_id = ?')
      .run(input.finishedProductId)

    const insert = database.prepare(
      `INSERT INTO product_recipes (id, finished_product_id, material_product_id, quantity)
       VALUES (?, ?, ?, ?)`,
    )

    for (const item of input.items) {
      insert.run(randomUUID(), input.finishedProductId, item.materialProductId, item.quantity)
    }
  })

  tx()
  return getProductRecipe(input.finishedProductId)
}

export function listManufacturingOrders(): ManufacturingOrder[] {
  const rows = requireDb()
    .prepare(
      `SELECT mo.*, p.name AS finished_product_name, p.sku AS finished_product_sku
       FROM manufacturing_orders mo
       JOIN products p ON p.id = mo.finished_product_id
       ORDER BY mo.created_at DESC
       LIMIT 200`,
    )
    .all() as Record<string, unknown>[]

  return rows.map(mapManufacturingOrder)
}

export function createManufacturingOrder(input: ManufacturingInput): ManufacturingOrder {
  if (!(input.quantity > 0)) throw new Error('Quantidade produzida deve ser maior que zero')

  const database = requireDb()
  const finished = database
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(input.finishedProductId) as Record<string, unknown> | undefined

  if (!finished) throw new Error('Produto acabado não encontrado')
  if (!finished.active) throw new Error('Produto acabado inativo não pode ser fabricado')
  const finishedType = String(finished.product_type ?? 'revenda')
  if (!FINISHED_PRODUCT_TYPES.includes(finishedType as ProductType)) {
    throw new Error('Somente produto final pode ser fabricado')
  }

  const recipe = getProductRecipe(input.finishedProductId)
  if (!recipe.length) {
    throw new Error('Cadastre a ficha técnica (matérias-primas) antes de fabricar')
  }

  for (const item of recipe) {
    const required = item.quantity * input.quantity
    const stock = item.materialStock ?? 0
    if (required > stock) {
      throw new Error(
        `Saldo insuficiente de ${item.materialName ?? 'matéria-prima'}. Necessário: ${required}, disponível: ${stock}`,
      )
    }
  }

  const orderId = randomUUID()
  const ts = nowIso()
  const reference = `FAB-${orderId.slice(0, 8).toUpperCase()}`

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO manufacturing_orders (id, finished_product_id, quantity, notes, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        orderId,
        input.finishedProductId,
        input.quantity,
        input.notes?.trim() ?? '',
        ts,
      )

    for (const item of recipe) {
      registerMovementInternal(
        database,
        {
          productId: item.materialProductId,
          type: 'saida',
          quantity: item.quantity * input.quantity,
          reason: 'Baixa por fabricação',
          reference,
        },
        ts,
      )
    }

    registerMovementInternal(
      database,
      {
        productId: input.finishedProductId,
        type: 'entrada',
        quantity: input.quantity,
        reason: 'Entrada por fabricação',
        reference,
      },
      ts,
    )
  })

  tx()

  const row = database
    .prepare(
      `SELECT mo.*, p.name AS finished_product_name, p.sku AS finished_product_sku
       FROM manufacturing_orders mo
       JOIN products p ON p.id = mo.finished_product_id
       WHERE mo.id = ?`,
    )
    .get(orderId) as Record<string, unknown>

  return mapManufacturingOrder(row)
}
