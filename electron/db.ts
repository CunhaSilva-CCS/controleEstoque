import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  Category,
  Company,
  CompanyInput,
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
  FinanceEntry,
  FinanceEntryFilters,
  FinanceEntryInput,
} from '../shared/types'
import { DEFAULT_COMPANY_ID } from '../shared/types'
import { roundQuantity } from '../shared/quantity'
import { movementLabel, statusLabel } from '../shared/labels'
import type { Db } from './database/types'
import { MigrationFailure, runMigrations } from './database/migrations'
import { captureMessage } from './telemetry'
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
import { recordAudit as writeAudit } from './database/audit'
import {
  recalculateAllFinishedProductCosts,
  recalculateAllInvoiceAverageCosts,
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
  createProduct as createProductRepository,
  updateProduct as updateProductRepository,
  setProductActive as setProductActiveRepository,
} from './database/repositories/products'
import {
  listPurchaseInvoices as listPurchaseInvoicesRepository,
  createPurchaseInvoice as createPurchaseInvoiceRepository,
  updatePurchaseInvoice as updatePurchaseInvoiceRepository,
} from './database/repositories/purchases'
import {
  listSalesInvoices as listSalesInvoicesRepository,
  createSalesInvoice as createSalesInvoiceRepository,
} from './database/repositories/sales'
import {
  getRecipeByProductId as getRecipeByProductIdRepository,
  listProductionOrders as listProductionOrdersRepository,
  listRecipes as listRecipesRepository,
  saveRecipe as saveRecipeRepository,
  createProduction as createProductionRepository,
} from './database/repositories/production'
import {
  listCategories as listCategoriesRepository,
  createCategory as createCategoryRepository,
  updateCategory as updateCategoryRepository,
} from './database/repositories/categories'
import {
  listSuppliers as listSuppliersRepository,
  createSupplier as createSupplierRepository,
  updateSupplier as updateSupplierRepository,
} from './database/repositories/suppliers'
import {
  listCustomers as listCustomersRepository,
  createCustomer as createCustomerRepository,
  updateCustomer as updateCustomerRepository,
} from './database/repositories/customers'
import { collectLocalDiagnostics } from './database/services/diagnostics-service'
import { queryMovements } from './database/services/movement-query-service'
import { reverseProduction, reversePurchase, reverseSale } from './database/services/reversal-service'
import { getDashboard as getDashboardService } from './database/services/dashboard-service'
import { buildReport as buildReportService } from './database/services/reports-service'
import {
  approveInventorySession as approveInventorySessionService,
  cancelInventorySession as cancelInventorySessionService,
  listInventorySessions as listInventorySessionsService,
  openInventorySession as openInventorySessionService,
  recordInventoryCount as recordInventoryCountService,
  submitInventorySession as submitInventorySessionService,
} from './database/services/inventory-service'
import {
  listFinanceEntries as listFinanceEntriesRepository,
  createFinanceEntry as createFinanceEntryRepository,
  markFinanceEntryPaid as markFinanceEntryPaidRepository,
  deleteFinanceEntry as deleteFinanceEntryRepository,
} from './database/repositories/finance'
import {
  listCompanies as listCompaniesRepository,
  getCompany as getCompanyRepository,
  createCompany as createCompanyRepository,
  updateCompany as updateCompanyRepository,
} from './database/repositories/companies'
import { getCurrentCompanyId, setCurrentCompanyId } from './database/company-context'


function nowIso(): string {
  return new Date().toISOString()
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
      captureMessage(
        `Migração da base de dados falhou e foi revertida para o backup pré-migração: ${error.message}`,
        'warning',
      )
    }
    throw error
  }
  ensureDefaultAdminRepository(database, nowIso())
  setCurrentCompanyId(getMeta('active_company_id') || DEFAULT_COMPANY_ID)
  recalculateAllInvoiceAverageCosts(database, nowIso())
  recalculateAllFinishedProductCosts(database, nowIso())

  const companyId = getCurrentCompanyId()
  const count = database.prepare('SELECT COUNT(*) AS c FROM products WHERE company_id = ?').get(companyId) as { c: number }
  const meta = database.prepare('SELECT value FROM app_meta WHERE key = ?').get(seedOfferedKey(companyId)) as
    | { value: string }
    | undefined

  return { path: dbPath, seeded: count.c > 0 || Boolean(meta) }
}

function seedOfferedKey(companyId: string): string {
  return `seed_offered:${companyId}`
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
      `INSERT INTO app_meta (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(seedOfferedKey(getCurrentCompanyId()))
}

export function getMeta(key: string): string {
  const row = requireDb()
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function setMeta(key: string, value: string): void {
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
  const companyId = getCurrentCompanyId()

  const run = database.transaction(() => {
    const catGeral = randomUUID()
    const catEletronicos = randomUUID()
    const catEscritorio = randomUUID()

    const insertCat = database.prepare(
      `INSERT INTO categories (id, name, description, active, company_id, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    )
    insertCat.run(catGeral, 'Geral', 'Categoria padrão', companyId, ts, ts)
    insertCat.run(catEletronicos, 'Eletrônicos', 'Equipamentos e acessórios', companyId, ts, ts)
    insertCat.run(catEscritorio, 'Escritório', 'Material de escritório', companyId, ts, ts)

    const sup1 = randomUUID()
    const sup2 = randomUUID()
    const insertSup = database.prepare(
      `INSERT INTO suppliers (id, name, document, phone, email, notes, active, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    insertSup.run(sup1, 'Distribuidora Norte', '12.345.678/0001-90', '(11) 3000-1000', 'contato@norte.com', '', companyId, ts, ts)
    insertSup.run(sup2, 'Papelaria Central', '98.765.432/0001-10', '(11) 4000-2000', 'vendas@papelaria.com', '', companyId, ts, ts)

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
        cost_price, sale_price, min_stock, stock, active, company_id, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    const insertMov = database.prepare(
      `INSERT INTO stock_movements (
        id, product_id, type, quantity, previous_stock, new_stock, reason, reference, origin, company_id, created_at
      ) VALUES (?, ?, 'entrada', ?, 0, ?, 'Demonstração', 'Demonstração', 'seed', ?, ?)`,
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
        companyId,
        ts,
        ts,
      )
      if (p.kind === 'insumo') insumoIds[p.sku] = id
      if (p.stock > 0) {
        insertMov.run(randomUUID(), id, p.stock, p.stock, companyId, ts)
      }
    }

    const finishedId = database
      .prepare(`SELECT id FROM products WHERE sku = 'KIT-OFFICE' AND company_id = ?`)
      .get(companyId) as { id: string }
    const recipeId = randomUUID()
    database
      .prepare(
        `INSERT INTO recipes (id, product_id, notes, active, company_id, created_at, updated_at)
         VALUES (?, ?, 'Kit de demonstração', 1, ?, ?, ?)`,
      )
      .run(recipeId, finishedId.id, companyId, ts, ts)

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
  return listCategoriesRepository(requireDb(), activeOnly)
}

export function createCategory(input: { name: string; description?: string }): Category {
  return createCategoryRepository(requireDb(), input, nowIso())
}

export function updateCategory(input: {
  id: string
  name: string
  description?: string
  active: boolean
}): Category {
  return updateCategoryRepository(requireDb(), input, nowIso())
}

export function listSuppliers(activeOnly = false): Supplier[] {
  return listSuppliersRepository(requireDb(), activeOnly)
}

export function createSupplier(input: {
  name: string
  document?: string
  phone?: string
  email?: string
  notes?: string
}): Supplier {
  return createSupplierRepository(requireDb(), input, nowIso())
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
  return updateSupplierRepository(requireDb(), input, nowIso())
}

export function listCustomers(activeOnly = false): Customer[] {
  return listCustomersRepository(requireDb(), activeOnly)
}

export function createCustomer(input: CustomerInput): Customer {
  return createCustomerRepository(requireDb(), input, nowIso())
}

export function updateCustomer(input: CustomerUpdateInput): Customer {
  return updateCustomerRepository(requireDb(), input, nowIso())
}


export function listProducts(filters: ProductFilters = {}): Product[] {
  return listProductsRepository(requireDb(), filters)
}

export function getProduct(id: string): Product | null {
  return getProductRepository(requireDb(), id)
}

export function createProduct(input: ProductInput): Product {
  return createProductRepository(requireDb(), input, nowIso())
}

export function updateProduct(input: ProductUpdateInput): Product {
  return updateProductRepository(requireDb(), input, nowIso())
}

export function setProductActive(id: string, active: boolean): Product {
  return setProductActiveRepository(requireDb(), id, active, nowIso())
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
  return getDashboardService(requireDb(), mapMovement)
}

export function buildReport(
  type: ReportType,
  filters: MovementFilters = {},
): { columns: string[]; rows: Record<string, string | number | boolean | null>[] } {
  return buildReportService(requireDb(), type, filters, mapMovement)
}

export function listPurchaseInvoices(): PurchaseInvoice[] {
  return listPurchaseInvoicesRepository(requireDb())
}

export function createPurchaseInvoice(input: PurchaseInvoiceInput): PurchaseInvoice {
  return createPurchaseInvoiceRepository(requireDb(), input, nowIso())
}

export function updatePurchaseInvoice(input: PurchaseInvoiceUpdateInput): PurchaseInvoice {
  return updatePurchaseInvoiceRepository(requireDb(), input, nowIso())
}

export function listSalesInvoices(): SalesInvoice[] {
  return listSalesInvoicesRepository(requireDb())
}

export function createSalesInvoice(input: SalesInvoiceInput): SalesInvoice {
  return createSalesInvoiceRepository(requireDb(), input, nowIso())
}

export function listRecipes(): Recipe[] {
  return listRecipesRepository(requireDb())
}

export function getRecipeByProductId(productId: string): Recipe | null {
  return getRecipeByProductIdRepository(requireDb(), productId)
}

export function saveRecipe(input: RecipeInput): Recipe {
  return saveRecipeRepository(requireDb(), input, nowIso())
}

export function listProductionOrders(): ProductionOrder[] {
  return listProductionOrdersRepository(requireDb())
}

export function createProduction(input: ProductionInput): ProductionOrder {
  return createProductionRepository(requireDb(), input, nowIso())
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

export function listFinanceEntries(filters: FinanceEntryFilters = {}): FinanceEntry[] {
  return listFinanceEntriesRepository(requireDb(), filters)
}

export function createFinanceEntry(input: FinanceEntryInput): FinanceEntry {
  return createFinanceEntryRepository(requireDb(), input, nowIso())
}

export function markFinanceEntryPaid(id: string, paid: boolean): FinanceEntry {
  return markFinanceEntryPaidRepository(requireDb(), id, paid, nowIso())
}

export function deleteFinanceEntry(id: string): void {
  deleteFinanceEntryRepository(requireDb(), id)
}

export function listCompanies(activeOnly = false): Company[] {
  return listCompaniesRepository(requireDb(), activeOnly)
}

export function createCompany(input: CompanyInput): Company {
  return createCompanyRepository(requireDb(), input, nowIso())
}

export function updateCompany(input: {
  id: string
  name: string
  taxNumber?: string
  address?: string
  phone?: string
  email?: string
  active: boolean
}): Company {
  return updateCompanyRepository(requireDb(), input, nowIso())
}

export function getCurrentCompany(): Company {
  const company = getCompanyRepository(requireDb(), getCurrentCompanyId())
  if (!company) throw new Error('Empresa ativa não encontrada')
  return company
}

export function setCurrentCompany(id: string): Company {
  const company = getCompanyRepository(requireDb(), id)
  if (!company) throw new Error('Empresa não encontrada')
  if (!company.active) throw new Error('Não é possível ativar uma empresa inativa')
  setCurrentCompanyId(company.id)
  setMeta('active_company_id', company.id)
  return company
}
