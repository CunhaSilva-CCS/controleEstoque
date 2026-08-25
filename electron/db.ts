import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  Category,
  DashboardData,
  MovementFilters,
  MovementInput,
  MovementOrigin,
  Product,
  ProductFilters,
  ProductInput,
  ProductKind,
  ProductUpdateInput,
  ProductionInput,
  ProductionOrder,
  PurchaseInvoice,
  PurchaseInvoiceInput,
  PurchaseInvoiceUpdateInput,
  Recipe,
  RecipeInput,
  StockMovement,
  Supplier,
  ClientBrand,
  User,
  UserRole,
  Customer,
  CustomerInput,
  CustomerUpdateInput,
  SalesInvoice,
  SalesInvoiceInput,
  ReportType,
  CancelOperationInput,
  InventorySession,
  LocalDiagnostics,
} from '../shared/types'
import { roundQuantity } from '../shared/quantity'
import { movementLabel, statusLabel } from '../shared/labels'
import type { Db } from './database/types'
import { MigrationFailure, runMigrations } from './database/migrations'
import {
  assertDatabaseIntegrity,
  configureCipher,
  connect,
  disconnect,
  getDatabase,
  getDatabaseKey,
  getDefaultDatabasePath,
  isPlaintextDatabase,
  prepareDefaultConnection,
} from './database/connection'
import { getAuditContext, recordAudit as writeAudit } from './database/audit'
import {
  calculateInvoiceAverageCost,
  calculateFinishedProductCost,
  recalculateAllFinishedProductCosts,
  recalculateAllInvoiceAverageCosts,
  updateFinishedProductCost,
  updateFinishedProductCostsUsingInput,
  updateInvoiceAverageCost,
} from './database/services/costing-service'
import {
  authenticateUser as authenticateUserRepository,
  changePassword as changePasswordRepository,
  createUser as createUserRepository,
  ensureDefaultAdmin as ensureDefaultAdminRepository,
  listUsers as listUsersRepository,
  resetUserPassword as resetUserPasswordRepository,
  setUserActive as setUserActiveRepository,
} from './database/repositories/users'
import {
  applyStockMovement as applyStockMovementService,
  type ApplyMovementInput,
} from './database/services/stock-service'
import {
  backupDatabase as backupDatabaseService,
  createAutomaticBackup as createAutomaticBackupService,
} from './database/services/backup-service'
import {
  getProduct as getProductRepository,
  listProducts as listProductsRepository,
} from './database/repositories/products'
import { listPurchaseInvoices as listPurchaseInvoicesRepository } from './database/repositories/purchases'
import { listSalesInvoices as listSalesInvoicesRepository } from './database/repositories/sales'
import {
  getRecipeByProductId as getRecipeByProductIdRepository,
  listProductionOrders as listProductionOrdersRepository,
  listRecipes as listRecipesRepository,
} from './database/repositories/production'
import { convertToStockUnit } from './database/services/unit-service'
import { collectLocalDiagnostics } from './database/services/diagnostics-service'
import { queryMovements } from './database/services/movement-query-service'
import { receiveLot } from './database/services/lot-service'
import { reverseProduction, reversePurchase, reverseSale } from './database/services/reversal-service'
import {
  approveInventorySession as approveInventorySessionService,
  cancelInventorySession as cancelInventorySessionService,
  listInventorySessions as listInventorySessionsService,
  openInventorySession as openInventorySessionService,
  recordInventoryCount as recordInventoryCountService,
  submitInventorySession as submitInventorySessionService,
} from './database/services/inventory-service'

function nowIso(): string {
  return new Date().toISOString()
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

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id), name: String(row.name), taxNumber: String(row.tax_number ?? ''),
    address: String(row.address ?? ''), phone: String(row.phone ?? ''), email: String(row.email ?? ''),
    notes: String(row.notes ?? ''), active: Boolean(row.active),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
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
    origin: (row.origin as MovementOrigin) ?? 'legacy',
    createdAt: String(row.created_at),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    productSku: row.product_sku != null ? String(row.product_sku) : undefined,
  }
}

export function getDbPath(): string {
  return getDefaultDatabasePath()
}

/** Dados operacionais sem registos de negócio, utilizadores ou credenciais. */
export function getLocalDiagnostics(appVersion: string): LocalDiagnostics {
  return collectLocalDiagnostics(requireDb(), getDbPath(), appVersion)
}

export function initDatabase(): { path: string; seeded: boolean } {
  const prepared = prepareDefaultConnection()
  return initDatabaseAtPath(prepared.path, prepared.key)
}

/** Inicializa um banco em caminho explícito para testes e diagnósticos seguros. */
export function initDatabaseAtPath(dbPath: string, encryptionKey?: Buffer): { path: string; seeded: boolean } {
  let database = connect(dbPath, encryptionKey)
  try {
    runMigrations(database, dbPath)
  } catch (error) {
    if (error instanceof MigrationFailure) {
      closeDatabase()
      fs.copyFileSync(error.backupPath, dbPath)
      fs.rmSync(error.backupPath, { force: true })
      database = connect(dbPath, encryptionKey)
      assertDatabaseIntegrity(database)
    }
    throw error
  }
  ensureDefaultAdminRepository(database, nowIso())
  recalculateAllInvoiceAverageCosts(database, nowIso())
  recalculateAllFinishedProductCosts(database, nowIso())

  const count = database.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }
  const meta = database.prepare("SELECT value FROM app_meta WHERE key = 'seed_offered'").get() as
    | { value: string }
    | undefined

  return { path: dbPath, seeded: count.c > 0 || Boolean(meta) }
}

function recordAudit(action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}): void {
  writeAudit(requireDb(), action, entityType, entityId, details, nowIso())
}

function requireDb(): Db {
  return getDatabase()
}


export function closeDatabase(): void {
  disconnect()
}

/** Online-safe backup using better-sqlite3 backup API (WAL-aware). */
export async function backupDatabase(destPath: string): Promise<void> {
  await backupDatabaseService(destPath)
}

export async function createAutomaticBackup(retention = 30): Promise<string | null> {
  return createAutomaticBackupService(retention)
}

/** Replace the live database with a backup file and reopen. */
export function restoreDatabase(sourcePath: string): { path: string; seeded: boolean } {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Ficheiro da cópia de segurança não encontrado')
  }

  let candidate: Database.Database | null = null
  try {
    candidate = new Database(sourcePath, { readonly: true, fileMustExist: true })
    if (!isPlaintextDatabase(sourcePath)) {
      const activeDatabaseKey = getDatabaseKey()
      if (!activeDatabaseKey) throw new Error('chave indisponível')
      configureCipher(candidate)
      candidate.key(activeDatabaseKey)
    }
    assertDatabaseIntegrity(candidate)
    const requiredTables = ['app_meta', 'categories', 'products', 'stock_movements', 'users']
    const rows = candidate
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[]
    const names = new Set(rows.map((row) => row.name))
    if (!requiredTables.every((table) => names.has(table))) {
      throw new Error('estrutura obrigatória ausente')
    }
  } catch {
    throw new Error('A cópia selecionada não é um banco de dados válido deste sistema')
  } finally {
    candidate?.close()
  }

  closeDatabase()

  const dest = getDbPath()
  for (const suffix of ['-wal', '-shm']) {
    const side = `${dest}${suffix}`
    if (fs.existsSync(side)) fs.unlinkSync(side)
  }

  fs.copyFileSync(sourcePath, dest)
  return initDatabase()
}

export function markSeedOffered(): void {
  requireDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES ('seed_offered', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run()
}

function getMeta(key: string): string {
  const row = requireDb()
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? ''
}

function setMeta(key: string, value: string): void {
  requireDb()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value)
}

const MAX_LOGO_CHARS = 2_800_000
const LOGO_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(;charset=[^;]+)?;base64,/i

export function getClientBrand(): ClientBrand {
  return {
    name: getMeta('client_name'),
    logoDataUrl: getMeta('client_logo'),
  }
}

export function saveClientBrand(input: ClientBrand): ClientBrand {
  const name = input.name.trim()
  if (name.length > 80) throw new Error('Nome da empresa deve ter no máximo 80 caracteres')

  const logo = input.logoDataUrl.trim()
  if (logo) {
    if (logo.length > MAX_LOGO_CHARS) throw new Error('A logo é muito grande. Use uma imagem de até 2 MB.')
    if (!LOGO_PATTERN.test(logo) && !logo.startsWith('data:image/svg+xml,')) {
      throw new Error('Use uma imagem PNG, JPG, WEBP ou SVG')
    }
  }

  setMeta('client_name', name)
  setMeta('client_logo', logo)
  return getClientBrand()
}

export function listUsers(): User[] {
  return listUsersRepository(requireDb())
}

export function createUser(input: {
  name: string
  username: string
  password: string
  role: UserRole
}): User {
  return createUserRepository(requireDb(), input, nowIso())
}

export function setUserActive(id: string, active: boolean): User {
  return setUserActiveRepository(requireDb(), id, active, nowIso())
}

export function authenticateUser(username: string, password: string): User | null {
  return authenticateUserRepository(requireDb(), username, password, nowIso())
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): User {
  return changePasswordRepository(requireDb(), userId, currentPassword, newPassword, nowIso())
}

export function resetUserPassword(userId: string, temporaryPassword: string): User {
  return resetUserPasswordRepository(requireDb(), userId, temporaryPassword, nowIso())
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
        categoryId: catEletronicos,
        supplierId: sup1,
        kind: 'insumo' as const,
        unit: 'un',
        cost: 8.5,
        sale: 19.9,
        min: 10,
        stock: 45,
      },
      {
        sku: 'MOUSE-OP',
        name: 'Mouse óptico USB',
        categoryId: catEletronicos,
        supplierId: sup1,
        kind: 'insumo' as const,
        unit: 'un',
        cost: 22,
        sale: 49.9,
        min: 5,
        stock: 3,
      },
      {
        sku: 'CANETA-AZ',
        name: 'Caneta esferográfica azul',
        categoryId: catEscritorio,
        supplierId: sup2,
        kind: 'insumo' as const,
        unit: 'cx',
        cost: 12,
        sale: 24,
        min: 8,
        stock: 20,
      },
      {
        sku: 'RESMA-A4',
        name: 'Resma papel A4 500 folhas',
        categoryId: catEscritorio,
        supplierId: sup2,
        kind: 'insumo' as const,
        unit: 'un',
        cost: 18,
        sale: 32,
        min: 15,
        stock: 0,
      },
      {
        sku: 'KIT-OFFICE',
        name: 'Kit escritório montado',
        categoryId: catGeral,
        supplierId: null,
        kind: 'acabado' as const,
        unit: 'un',
        cost: 35,
        sale: 69.9,
        min: 3,
        stock: 0,
      },
    ]

    const insertProd = database.prepare(
      `INSERT INTO products (
        id, sku, name, description, category_id, supplier_id, kind, unit,
        cost_price, sale_price, min_stock, stock, active, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    const insertMov = database.prepare(
      `INSERT INTO stock_movements (
        id, product_id, type, quantity, previous_stock, new_stock, reason, reference, origin, created_at
      ) VALUES (?, ?, 'entrada', ?, 0, ?, 'Demonstração', 'Demonstração', 'seed', ?)`,
    )

    const insumoIds: Record<string, string> = {}
    for (const p of products) {
      const id = randomUUID()
      insertProd.run(
        id,
        p.sku,
        p.name,
        p.categoryId,
        p.supplierId,
        p.kind,
        p.unit,
        p.cost,
        p.sale,
        p.min,
        p.stock,
        ts,
        ts,
      )
      if (p.kind === 'insumo') insumoIds[p.sku] = id
      if (p.stock > 0) {
        insertMov.run(randomUUID(), id, p.stock, p.stock, ts)
      }
    }

    const finishedId = database
      .prepare(`SELECT id FROM products WHERE sku = 'KIT-OFFICE'`)
      .get() as { id: string }
    const recipeId = randomUUID()
    database
      .prepare(
        `INSERT INTO recipes (id, product_id, notes, active, created_at, updated_at)
         VALUES (?, ?, 'Kit de demonstração', 1, ?, ?)`,
      )
      .run(recipeId, finishedId.id, ts, ts)

    const insertRecipeItem = database.prepare(
      `INSERT INTO recipe_items (id, recipe_id, product_id, quantity) VALUES (?, ?, ?, ?)`,
    )
    if (insumoIds['CANETA-AZ']) {
      insertRecipeItem.run(randomUUID(), recipeId, insumoIds['CANETA-AZ'], 1)
    }
    if (insumoIds['RESMA-A4']) {
      insertRecipeItem.run(randomUUID(), recipeId, insumoIds['RESMA-A4'], 1)
    }

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

export function listCustomers(activeOnly = false): Customer[] {
  const sql = activeOnly ? 'SELECT * FROM customers WHERE active = 1 ORDER BY name' : 'SELECT * FROM customers ORDER BY name'
  return (requireDb().prepare(sql).all() as Record<string, unknown>[]).map(mapCustomer)
}

export function createCustomer(input: CustomerInput): Customer {
  const name = input.name.trim()
  if (!name) throw new Error('O nome do cliente é obrigatório')
  const id = randomUUID()
  const ts = nowIso()
  requireDb().prepare(`INSERT INTO customers (id, name, tax_number, address, phone, email, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(id, name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.notes?.trim() ?? '', ts, ts)
  recordAudit('create', 'customer', id, { name })
  return listCustomers().find((item) => item.id === id)!
}

export function updateCustomer(input: CustomerUpdateInput): Customer {
  const name = input.name.trim()
  if (!name) throw new Error('O nome do cliente é obrigatório')
  const result = requireDb().prepare(`UPDATE customers SET name = ?, tax_number = ?, address = ?, phone = ?, email = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?`)
    .run(name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.notes?.trim() ?? '', input.active ? 1 : 0, nowIso(), input.id)
  if (result.changes === 0) throw new Error('Cliente não encontrado')
  recordAudit('update', 'customer', input.id, { name, active: input.active })
  return listCustomers().find((item) => item.id === input.id)!
}

export function listProducts(filters: ProductFilters = {}): Product[] {
  return listProductsRepository(requireDb(), filters)
}

export function getProduct(id: string): Product | null {
  return getProductRepository(requireDb(), id)
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

export function createProduct(input: ProductInput): Product {
  validateProductFields(input)
  const kind: ProductKind = input.kind ?? 'insumo'

  const id = randomUUID()
  const ts = nowIso()
  const database = requireDb()
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
          ts,
          ts,
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
  recordAudit('create', 'product', id, { sku: normalizedSku, kind })
  return getProduct(id)!
}

export function updateProduct(input: ProductUpdateInput): Product {
  validateProductFields(input)
  const ts = nowIso()
  const database = requireDb()
  const normalizedSku = input.sku.trim()
  const duplicate = database
    .prepare('SELECT id FROM products WHERE lower(trim(sku)) = lower(?) AND id <> ? LIMIT 1')
    .get(normalizedSku, input.id)
  if (duplicate) throw new Error('Já existe um produto com este código')
  const effectiveCostPrice = input.kind === 'insumo'
    ? (calculateInvoiceAverageCost(database, input.id) ?? 0)
    : (getProduct(input.id)?.costPrice ?? 0)
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
        ts,
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
  recordAudit('update', 'product', input.id, { sku: normalizedSku, kind: input.kind })
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

export function registerMovement(input: MovementInput): StockMovement {
  if (input.type !== 'ajuste') {
    throw new Error(
      'Entrada e saída só podem ser registradas por fatura de compra ou fabricação. Use ajuste para inventário.',
    )
  }
  return applyStockMovement({
    productId: input.productId,
    type: 'ajuste',
    quantity: input.quantity,
    newStock: input.newStock,
    reason: input.reason,
    reference: input.reference ?? '',
    origin: 'ajuste',
  })
}

function applyStockMovement(input: ApplyMovementInput): StockMovement {
  return applyStockMovementService(requireDb(), input, nowIso())
}

export function listMovements(filters: MovementFilters = {}): StockMovement[] {
  return queryMovements(requireDb(), filters, mapMovement)
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
  type: ReportType,
  filters: MovementFilters = {},
): { columns: string[]; rows: Record<string, string | number | boolean | null>[] } {
  if (type === 'posicao') {
    const products = listProducts({ active: true })
    return {
      columns: ['Código', 'Nome', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
      rows: products.map((p) => ({
        Código: p.sku,
        Nome: p.name,
        Categoria: p.categoryName ?? '',
        Saldo: p.stock,
        Unidade: p.unit,
        Custo: p.costPrice,
        Valor: p.stockValue ?? 0,
        Status: statusLabel(p.status ?? 'ok'),
      })),
    }
  }

  if (type === 'baixo') {
    const products = listProducts({ active: true, lowStockOnly: true })
    return {
      columns: ['Código', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Status'],
      rows: products.map((p) => ({
        Código: p.sku,
        Nome: p.name,
        Saldo: p.stock,
        Mínimo: p.minStock,
        Diferença: p.stock - p.minStock,
        Status: statusLabel(p.status ?? 'low'),
      })),
    }
  }

  if (type === 'custo-venda') {
    const products = listProducts({ active: true, kind: 'acabado' })
    return {
      columns: ['Código', 'Produto final', 'Saldo', 'Unidade', 'Preço de custo', 'Preço de venda', 'Diferença', 'Margem'],
      rows: products.map((product) => {
        const difference = product.salePrice - product.costPrice
        return {
          Código: product.sku,
          'Produto final': product.name,
          Saldo: product.stock,
          Unidade: product.unit,
          'Preço de custo': product.costPrice,
          'Preço de venda': product.salePrice,
          Diferença: difference,
          Margem: product.salePrice > 0 ? (difference / product.salePrice) * 100 : 0,
        }
      }),
    }
  }

  if (type === 'auditoria') {
    const clauses: string[] = []
    const params: string[] = []
    if (filters.from) { clauses.push('created_at >= ?'); params.push(filters.from) }
    if (filters.to) { clauses.push('created_at <= ?'); params.push(filters.to) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = requireDb().prepare(`SELECT created_at, username, action, entity_type, entity_id,
      previous_values, new_values, origin, computer_name FROM audit_logs ${where}
      ORDER BY created_at DESC LIMIT 1000`).all(...params) as Record<string, unknown>[]
    return { columns: ['Data', 'Utilizador', 'Ação', 'Entidade', 'Identificador', 'Valor anterior', 'Valor novo', 'Origem', 'Computador'],
      rows: rows.map((row) => ({ Data: String(row.created_at), Utilizador: String(row.username || 'sistema'),
        Ação: String(row.action), Entidade: String(row.entity_type), Identificador: String(row.entity_id),
        'Valor anterior': String(row.previous_values ?? '{}'), 'Valor novo': String(row.new_values ?? '{}'),
        Origem: String(row.origin ?? 'desktop'), Computador: String(row.computer_name ?? '') })) }
  }

  if (type === 'inventarios') {
    const rows = requireDb().prepare(`SELECT s.code, s.created_at, s.reference_at, s.status,
      COUNT(c.id) products, SUM(CASE WHEN c.counted_stock IS NOT NULL THEN 1 ELSE 0 END) counted,
      COALESCE(SUM(ABS(COALESCE(c.difference, 0))), 0) total_difference, s.approved_at
      FROM inventory_sessions s LEFT JOIN inventory_counts c ON c.session_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC`).all() as Record<string, unknown>[]
    return { columns: ['Código', 'Abertura', 'Referência', 'Estado', 'Produtos', 'Contados', 'Diferença absoluta', 'Aprovação'],
      rows: rows.map((row) => ({ Código: String(row.code), Abertura: String(row.created_at),
        Referência: String(row.reference_at), Estado: String(row.status), Produtos: Number(row.products),
        Contados: Number(row.counted), 'Diferença absoluta': Number(row.total_difference),
        Aprovação: String(row.approved_at ?? '') })) }
  }

  const fromDate = filters.from?.slice(0, 10)
  const toDate = filters.to?.slice(0, 10)
  const dateClauses: string[] = []
  const dateParams: string[] = []
  if (fromDate) { dateClauses.push('i.issue_date >= ?'); dateParams.push(fromDate) }
  if (toDate) { dateClauses.push('i.issue_date <= ?'); dateParams.push(toDate) }
  const invoiceWhere = dateClauses.length ? `WHERE ${dateClauses.join(' AND ')}` : ''
  const database = requireDb()

  if (type === 'compras') {
    const rows = database.prepare(`SELECT i.issue_date, i.number, COALESCE(s.name, 'Sem fornecedor') supplier, p.sku, p.name product, ii.quantity, p.unit, ii.unit_cost, ii.quantity * ii.unit_cost total FROM purchase_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN purchase_invoice_items ii ON ii.invoice_id = i.id JOIN products p ON p.id = ii.product_id ${invoiceWhere} ORDER BY i.issue_date DESC, i.number, p.name`).all(...dateParams) as Record<string, unknown>[]
    return { columns: ['Data', 'Fatura', 'Fornecedor', 'Código', 'Matéria-prima', 'Quantidade', 'Unidade', 'Custo unitário', 'Total da compra'], rows: rows.map((row) => ({ Data: String(row.issue_date), Fatura: String(row.number), Fornecedor: String(row.supplier), Código: String(row.sku), 'Matéria-prima': String(row.product), Quantidade: Number(row.quantity), Unidade: String(row.unit), 'Custo unitário': Number(row.unit_cost), 'Total da compra': Number(row.total) })) }
  }

  if (type === 'vendas' || type === 'margem-vendas') {
    const rows = database.prepare(`SELECT i.issue_date, i.number, c.name customer, c.tax_number, p.sku, p.name product, si.quantity, p.unit, si.unit_price, si.unit_cost_snapshot, si.quantity * si.unit_price revenue, si.quantity * si.unit_cost_snapshot cost FROM sales_invoices i JOIN customers c ON c.id = i.customer_id JOIN sales_invoice_items si ON si.invoice_id = i.id JOIN products p ON p.id = si.product_id ${invoiceWhere} ORDER BY i.issue_date DESC, i.number, p.name`).all(...dateParams) as Record<string, unknown>[]
    if (type === 'vendas') return { columns: ['Data', 'Fatura', 'Cliente', 'NIF', 'Código', 'Produto final', 'Quantidade', 'Unidade', 'Preço unitário', 'Total faturado'], rows: rows.map((row) => ({ Data: String(row.issue_date), Fatura: String(row.number), Cliente: String(row.customer), NIF: String(row.tax_number ?? ''), Código: String(row.sku), 'Produto final': String(row.product), Quantidade: Number(row.quantity), Unidade: String(row.unit), 'Preço unitário': Number(row.unit_price), 'Total faturado': Number(row.revenue) })) }
    return { columns: ['Data', 'Fatura', 'Cliente', 'Produto final', 'Quantidade', 'Receita', 'Custo', 'Margem bruta', 'Margem %'], rows: rows.map((row) => { const revenue = Number(row.revenue); const cost = Number(row.cost); const margin = revenue - cost; return { Data: String(row.issue_date), Fatura: String(row.number), Cliente: String(row.customer), 'Produto final': String(row.product), Quantidade: Number(row.quantity), Receita: revenue, Custo: cost, 'Margem bruta': margin, 'Margem %': revenue > 0 ? margin / revenue * 100 : 0 } }) }
  }

  if (type === 'producao') {
    const clauses: string[] = []
    const params: string[] = []
    if (filters.from) { clauses.push('o.created_at >= ?'); params.push(filters.from) }
    if (filters.to) { clauses.push('o.created_at <= ?'); params.push(filters.to) }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = database.prepare(`SELECT o.created_at, p.sku, p.name product, o.quantity, p.unit, o.unit_cost_snapshot, o.total_cost_snapshot, o.notes FROM production_orders o JOIN products p ON p.id = o.product_id ${where} ORDER BY o.created_at DESC`).all(...params) as Record<string, unknown>[]
    return { columns: ['Data', 'Código', 'Produto final', 'Quantidade produzida', 'Unidade', 'Custo unitário', 'Custo total da produção', 'Observações'], rows: rows.map((row) => ({ Data: String(row.created_at), Código: String(row.sku), 'Produto final': String(row.product), 'Quantidade produzida': Number(row.quantity), Unidade: String(row.unit), 'Custo unitário': Number(row.unit_cost_snapshot), 'Custo total da produção': Number(row.total_cost_snapshot), Observações: String(row.notes ?? '') })) }
  }

  if (type === 'clientes') {
    const rows = database.prepare(`SELECT c.name, c.tax_number, COUNT(DISTINCT i.id) invoices, COALESCE(SUM(si.quantity), 0) quantity, COALESCE(SUM(si.quantity * si.unit_price), 0) billed, COALESCE(SUM(si.quantity * si.unit_cost_snapshot), 0) cost FROM customers c LEFT JOIN sales_invoices i ON i.customer_id = c.id LEFT JOIN sales_invoice_items si ON si.invoice_id = i.id GROUP BY c.id ORDER BY billed DESC, c.name`).all() as Record<string, unknown>[]
    return { columns: ['Cliente', 'NIF', 'Faturas emitidas', 'Unidades vendidas', 'Total faturado', 'Custo associado', 'Margem bruta'], rows: rows.map((row) => ({ Cliente: String(row.name), NIF: String(row.tax_number ?? ''), 'Faturas emitidas': Number(row.invoices), 'Unidades vendidas': Number(row.quantity), 'Total faturado': Number(row.billed), 'Custo associado': Number(row.cost), 'Margem bruta': Number(row.billed) - Number(row.cost) })) }
  }

  if (type === 'fornecedores') {
    const rows = database.prepare(`SELECT COALESCE(s.name, 'Sem fornecedor') supplier, COUNT(DISTINCT i.id) invoices, COALESCE(SUM(ii.quantity), 0) quantity, COALESCE(SUM(ii.quantity * ii.unit_cost), 0) purchased, MAX(i.issue_date) last_purchase FROM purchase_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN purchase_invoice_items ii ON ii.invoice_id = i.id GROUP BY i.supplier_id ORDER BY purchased DESC, supplier`).all() as Record<string, unknown>[]
    return { columns: ['Fornecedor', 'Faturas registadas', 'Unidades compradas', 'Valor comprado', 'Última compra'], rows: rows.map((row) => ({ Fornecedor: String(row.supplier), 'Faturas registadas': Number(row.invoices), 'Unidades compradas': Number(row.quantity), 'Valor comprado': Number(row.purchased), 'Última compra': String(row.last_purchase ?? '') })) }
  }

  const movements = listMovements(filters)
  return {
    columns: ['Data', 'Código', 'Produto', 'Tipo', 'Quantidade', 'Saldo anterior', 'Saldo novo', 'Motivo'],
    rows: movements.map((m) => ({
      Data: m.createdAt,
      Código: m.productSku ?? '',
      Produto: m.productName ?? '',
      Tipo: movementLabel(m.type),
      Quantidade: m.quantity,
      'Saldo anterior': m.previousStock,
      'Saldo novo': m.newStock,
      Motivo: m.reason,
    })),
  }
}

export function listPurchaseInvoices(): PurchaseInvoice[] {
  return listPurchaseInvoicesRepository(requireDb())
}

export function createPurchaseInvoice(input: PurchaseInvoiceInput): PurchaseInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('Número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('Data da fatura é obrigatória')
  if (!input.items.length) throw new Error('Informe ao menos um item na fatura')

  const database = requireDb()
  const invoiceId = randomUUID()
  const ts = nowIso()

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO purchase_invoices (id, number, supplier_id, issue_date, notes, created_at, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'confirmado', ?)`,
      )
      .run(
        invoiceId,
        number,
        input.supplierId || null,
        input.issueDate,
        input.notes?.trim() ?? '',
        ts,
        getAuditContext().userId,
      )

    const insertItem = database.prepare(
      `INSERT INTO purchase_invoice_items (id, invoice_id, product_id, quantity, unit_cost, lot_number, manufactured_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const affectedIds = new Set<string>()
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('Quantidade do item deve ser maior que zero')
      if (item.unitCost < 0) throw new Error('Custo unitário não pode ser negativo')

      const product = database
        .prepare('SELECT id, kind, active, purchase_unit FROM products WHERE id = ?')
        .get(item.productId) as { id: string; kind: string; active: number; purchase_unit: string | null } | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error('Produto inativo não pode entrar por fatura')
      if (product.kind !== 'insumo') {
        throw new Error('Entrada por fatura permitida apenas para insumos')
      }

      const quantity = convertToStockUnit(database, item.productId, item.quantity, product.purchase_unit ?? undefined)
      const stockUnitCost = roundQuantity(item.unitCost / (quantity / item.quantity))
      affectedIds.add(item.productId)
      insertItem.run(randomUUID(), invoiceId, item.productId, quantity, stockUnitCost,
        item.lotNumber?.trim() ?? '', item.manufacturedAt || null, item.expiresAt || null)

      const movement = applyStockMovement({
        productId: item.productId,
        type: 'entrada',
        quantity,
        reason: `Fatura ${number}`,
        reference: invoiceId,
        origin: 'fatura',
      })
      receiveLot(database, { productId: item.productId, supplierId: input.supplierId,
        lotNumber: item.lotNumber, manufacturedAt: item.manufacturedAt, expiresAt: item.expiresAt,
        quantity, stockMovementId: movement.id, timestamp: ts })

    }
    affectedIds.forEach((productId) => updateInvoiceAverageCost(database, productId, ts))
  })

  tx()
  recordAudit('create', 'purchase_invoice', invoiceId, { number, itemCount: input.items.length })

  return listPurchaseInvoices().find((i) => i.id === invoiceId)!
}

export function updatePurchaseInvoice(input: PurchaseInvoiceUpdateInput): PurchaseInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('Número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('Data da fatura é obrigatória')
  if (!input.items.length) throw new Error('Informe ao menos um item na fatura')

  const database = requireDb()
  const current = listPurchaseInvoices().find((invoice) => invoice.id === input.id)
  if (!current) throw new Error('Fatura não encontrada')
  if (current.status !== 'rascunho') {
    throw new Error('Uma fatura confirmada não pode ser alterada. Utilize o estorno para preservar o histórico.')
  }

  const duplicate = database.prepare(
    `SELECT id FROM purchase_invoices
     WHERE lower(number) = lower(?) AND COALESCE(supplier_id, '') = COALESCE(?, '') AND id <> ?`,
  ).get(number, input.supplierId || null, input.id)
  if (duplicate) throw new Error('Já existe uma fatura com este número para o fornecedor informado')

  const productIds = new Set<string>()
  for (const item of input.items) {
    if (productIds.has(item.productId)) throw new Error('Não repita o mesmo insumo na fatura')
    productIds.add(item.productId)
    if (!(item.quantity > 0)) throw new Error('Quantidade do item deve ser maior que zero')
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new Error('Custo unitário não pode ser negativo')
    }
    const product = database.prepare('SELECT kind, active FROM products WHERE id = ?').get(item.productId) as
      | { kind: string; active: number }
      | undefined
    if (!product) throw new Error('Produto não encontrado')
    if (!product.active) throw new Error('Produto inativo não pode entrar por fatura')
    if (product.kind !== 'insumo') throw new Error('Entrada por fatura permitida apenas para insumos')
  }

  const oldQuantities = new Map<string, number>()
  const newQuantities = new Map<string, number>()
  current.items.forEach((item) => oldQuantities.set(item.productId, roundQuantity(item.quantity)))
  input.items.forEach((item) => newQuantities.set(item.productId, roundQuantity(item.quantity)))
  const affectedIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()])

  for (const productId of affectedIds) {
    const delta = roundQuantity((newQuantities.get(productId) ?? 0) - (oldQuantities.get(productId) ?? 0))
    if (delta >= 0) continue
    const row = database.prepare('SELECT stock FROM products WHERE id = ?').get(productId) as { stock: number }
    if (roundQuantity(row.stock + delta) < 0) {
      throw new Error('Não é possível reduzir a fatura: parte deste stock já foi consumida')
    }
  }

  const ts = nowIso()
  const tx = database.transaction(() => {
    database.prepare(
      `UPDATE purchase_invoices SET number = ?, supplier_id = ?, issue_date = ?, notes = ? WHERE id = ?`,
    ).run(number, input.supplierId || null, input.issueDate, input.notes?.trim() ?? '', input.id)
    database.prepare('DELETE FROM purchase_invoice_items WHERE invoice_id = ?').run(input.id)
    const insertItem = database.prepare(
      `INSERT INTO purchase_invoice_items (id, invoice_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const item of input.items) {
      insertItem.run(randomUUID(), input.id, item.productId, roundQuantity(item.quantity), item.unitCost)
    }
    for (const productId of affectedIds) {
      const delta = roundQuantity((newQuantities.get(productId) ?? 0) - (oldQuantities.get(productId) ?? 0))
      if (delta === 0) continue
      applyStockMovement({
        productId,
        type: delta > 0 ? 'entrada' : 'saida',
        quantity: Math.abs(delta),
        reason: `Edição da fatura ${number}`,
        reference: input.id,
        origin: 'fatura',
      })
    }
    affectedIds.forEach((productId) => updateInvoiceAverageCost(database, productId, ts))
  })
  tx()
  recordAudit('update', 'purchase_invoice', input.id, { number, itemCount: input.items.length })
  return listPurchaseInvoices().find((invoice) => invoice.id === input.id)!
}

export function listSalesInvoices(): SalesInvoice[] {
  return listSalesInvoicesRepository(requireDb())
}

export function createSalesInvoice(input: SalesInvoiceInput): SalesInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('O número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('A data da fatura é obrigatória')
  if (!input.customerId) throw new Error('Selecione um cliente')
  if (!input.items.length) throw new Error('Adicione, pelo menos, um produto final')
  const database = requireDb()
  const customer = database.prepare('SELECT active FROM customers WHERE id = ?').get(input.customerId) as { active: number } | undefined
  if (!customer?.active) throw new Error('Selecione um cliente ativo')
  const invoiceId = randomUUID()
  const ts = nowIso()
  const tx = database.transaction(() => {
    database.prepare(`INSERT INTO sales_invoices (id, number, customer_id, issue_date, notes, created_at, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'confirmado', ?)`).run(invoiceId, number, input.customerId, input.issueDate, input.notes?.trim() ?? '', ts, getAuditContext().userId)
    const insertItem = database.prepare(`INSERT INTO sales_invoice_items (id, invoice_id, product_id, quantity, unit_price, unit_cost_snapshot) VALUES (?, ?, ?, ?, ?, ?)`)
    const used = new Set<string>()
    for (const item of input.items) {
      if (used.has(item.productId)) throw new Error('Não repita o mesmo produto na fatura')
      used.add(item.productId)
      const product = database.prepare('SELECT name, kind, active, stock, cost_price FROM products WHERE id = ?').get(item.productId) as { name: string; kind: string; active: number; stock: number; cost_price: number } | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error(`O produto ${product.name} está inativo`)
      if (product.kind !== 'acabado') throw new Error('A faturação de saída aceita apenas produtos finais')
      const quantity = roundQuantity(item.quantity)
      if (!(quantity > 0)) throw new Error('A quantidade deve ser superior a zero')
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('O preço unitário não pode ser negativo')
      if (quantity > Number(product.stock)) throw new Error(`Stock insuficiente de ${product.name}. Disponível: ${roundQuantity(Number(product.stock))}`)
      insertItem.run(randomUUID(), invoiceId, item.productId, quantity, item.unitPrice, Number(product.cost_price))
      applyStockMovement({ productId: item.productId, type: 'saida', quantity, reason: `Fatura de saída ${number}`, reference: invoiceId, origin: 'fatura_saida' })
    }
  })
  try { tx() } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('Já existe uma fatura de saída com este número')
    throw error
  }
  recordAudit('create', 'sales_invoice', invoiceId, { number, customerId: input.customerId, itemCount: input.items.length })
  return listSalesInvoices().find((invoice) => invoice.id === invoiceId)!
}

export function listRecipes(): Recipe[] {
  return listRecipesRepository(requireDb())
}

export function getRecipeByProductId(productId: string): Recipe | null {
  return getRecipeByProductIdRepository(requireDb(), productId)
}

export function saveRecipe(input: RecipeInput): Recipe {
  if (!input.items.length) throw new Error('Informe ao menos um insumo na receita')

  const database = requireDb()
  const product = database
    .prepare('SELECT id, kind, active FROM products WHERE id = ?')
    .get(input.productId) as { id: string; kind: string; active: number } | undefined

  if (!product) throw new Error('Produto final não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode receber receita')
  if (product.kind !== 'acabado') throw new Error('Receita disponível apenas para produto final')

  const ts = nowIso()
  const existing = database
    .prepare('SELECT id FROM recipes WHERE product_id = ?')
    .get(input.productId) as { id: string } | undefined
  const recipeId = existing?.id ?? randomUUID()

  const tx = database.transaction(() => {
    if (existing) {
      database
        .prepare('UPDATE recipes SET notes = ?, updated_at = ? WHERE id = ?')
        .run(input.notes?.trim() ?? '', ts, recipeId)
      database.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(recipeId)
    } else {
      database
        .prepare(
          `INSERT INTO recipes (id, product_id, notes, active, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(recipeId, input.productId, input.notes?.trim() ?? '', ts, ts)
    }

    const insertItem = database.prepare(
      `INSERT INTO recipe_items (id, recipe_id, product_id, quantity) VALUES (?, ?, ?, ?)`,
    )

    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('Quantidade do insumo deve ser maior que zero')
      if (item.productId === input.productId) {
        throw new Error('Produto final não pode ser insumo da própria receita')
      }

      const insumo = database
        .prepare('SELECT kind FROM products WHERE id = ?')
        .get(item.productId) as { kind: string } | undefined
      if (!insumo) throw new Error('Insumo não encontrado')
      if (insumo.kind !== 'insumo') throw new Error('Receita aceita apenas insumos como componentes')

      insertItem.run(randomUUID(), recipeId, item.productId, roundQuantity(item.quantity))
    }
  })

  tx()
  updateFinishedProductCost(database, input.productId, ts)
  recordAudit('save', 'recipe', recipeId, { productId: input.productId, itemCount: input.items.length })
  return getRecipeByProductId(input.productId)!
}

export function listProductionOrders(): ProductionOrder[] {
  return listProductionOrdersRepository(requireDb())
}

export function createProduction(input: ProductionInput): ProductionOrder {
  if (!(input.quantity > 0)) throw new Error('Quantidade produzida deve ser maior que zero')

  const productionQuantity = roundQuantity(input.quantity)
  const database = requireDb()
  const product = database
    .prepare('SELECT id, kind, active, name, sku FROM products WHERE id = ?')
    .get(input.productId) as
    | { id: string; kind: string; active: number; name: string; sku: string }
    | undefined

  if (!product) throw new Error('Produto não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode ser fabricado')
  if (product.kind !== 'acabado') throw new Error('Fabricação disponível apenas para produto final')

  const recipe = getRecipeByProductId(input.productId)
  if (!recipe || !recipe.items.length) {
    throw new Error('Cadastre a receita do produto final antes de fabricar')
  }

  for (const item of recipe.items) {
    const needed = roundQuantity(item.quantity * productionQuantity)
    const stockRow = database
      .prepare('SELECT stock FROM products WHERE id = ?')
      .get(item.productId) as { stock: number }
    if (stockRow.stock < needed) {
      throw new Error(
        `Saldo insuficiente de ${item.productName}. Necessário: ${needed}, disponível: ${stockRow.stock}`,
      )
    }
  }

  const orderId = randomUUID()
  const ts = nowIso()
  const unitCostSnapshot = calculateFinishedProductCost(database, input.productId)
  const totalCostSnapshot = roundQuantity(unitCostSnapshot * productionQuantity)

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO production_orders (id, recipe_id, product_id, quantity, notes, created_at, unit_cost_snapshot, total_cost_snapshot, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)`,
      )
      .run(orderId, recipe.id, input.productId, productionQuantity, input.notes?.trim() ?? '', ts, unitCostSnapshot, totalCostSnapshot, getAuditContext().userId)

    const insertSnapshot = database.prepare(`INSERT INTO production_order_items
      (id, order_id, product_id, quantity, unit_cost_snapshot) VALUES (?, ?, ?, ?, ?)`)

    for (const item of recipe.items) {
      const qty = roundQuantity(item.quantity * productionQuantity)
      const component = database.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.productId) as { cost_price: number }
      insertSnapshot.run(randomUUID(), orderId, item.productId, qty, component.cost_price)
      applyStockMovement({
        productId: item.productId,
        type: 'saida',
        quantity: qty,
        reason: `Fabricação · ${product.name}`,
        reference: orderId,
        origin: 'fabricacao_consumo',
      })
    }

    applyStockMovement({
      productId: input.productId,
      type: 'entrada',
      quantity: productionQuantity,
      reason: `Fabricação · ${product.name}`,
      reference: orderId,
      origin: 'fabricacao_producao',
    })
  })

  tx()
  recordAudit('create', 'production_order', orderId, { productId: input.productId, quantity: productionQuantity })

  return listProductionOrders().find((o) => o.id === orderId)!
}

export function reversePurchaseInvoice(input: CancelOperationInput): PurchaseInvoice {
  reversePurchase(requireDb(), input.id, input.reason, nowIso())
  return listPurchaseInvoices().find((item) => item.id === input.id)!
}

export function reverseSalesInvoice(input: CancelOperationInput): SalesInvoice {
  reverseSale(requireDb(), input.id, input.reason, nowIso())
  return listSalesInvoices().find((item) => item.id === input.id)!
}

export function reverseProductionOrder(input: CancelOperationInput): ProductionOrder {
  reverseProduction(requireDb(), input.id, input.reason, nowIso())
  return listProductionOrders().find((item) => item.id === input.id)!
}

export function listInventorySessions(): InventorySession[] {
  return listInventorySessionsService(requireDb())
}

export function openInventorySession(notes = ''): InventorySession {
  return openInventorySessionService(requireDb(), notes, nowIso())
}

export function recordInventoryCount(sessionId: string, productId: string, countedStock: number): InventorySession {
  return recordInventoryCountService(requireDb(), sessionId, productId, countedStock, nowIso())
}

export function submitInventorySession(id: string): InventorySession {
  return submitInventorySessionService(requireDb(), id, nowIso())
}

export function approveInventorySession(id: string): InventorySession {
  return approveInventorySessionService(requireDb(), id, nowIso())
}

export function cancelInventorySession(id: string, reason: string): InventorySession {
  return cancelInventorySessionService(requireDb(), id, reason, nowIso())
}
