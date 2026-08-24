import Database from 'better-sqlite3-multiple-ciphers'
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type {
  Category,
  DashboardData,
  MovementFilters,
  MovementInput,
  MovementOrigin,
  MovementType,
  Product,
  ProductFilters,
  ProductInput,
  ProductKind,
  ProductStatus,
  ProductUpdateInput,
  ProductionInput,
  ProductionOrder,
  PurchaseInvoice,
  PurchaseInvoiceInput,
  Recipe,
  RecipeInput,
  RecipeItem,
  StockMovement,
  Supplier,
  ClientBrand,
  User,
  UserRole,
} from '../shared/types'
import { movementLabel, statusLabel } from '../shared/labels'

type Db = Database.Database

let db: Db | null = null
let activeDatabaseKey: Buffer | null = null

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8')

function isPlaintextDatabase(filePath: string): boolean {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return true
  const handle = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length)
    fs.readSync(handle, header, 0, header.length, 0)
    return header.equals(SQLITE_HEADER)
  } finally {
    fs.closeSync(handle)
  }
}

function configureCipher(database: Db): void {
  database.pragma("cipher='sqlcipher'")
  database.pragma('legacy=4')
}

function openDatabase(filePath: string, key?: Buffer): Db {
  const database = new Database(filePath)
  if (key) {
    configureCipher(database)
    database.key(key)
  }
  return database
}

function assertDatabaseIntegrity(database: Db): void {
  const result = database.pragma('integrity_check', { simple: true })
  if (result !== 'ok') throw new Error('Falha na verificação de integridade do banco')
}

function getOrCreateDatabaseKey(dbPath: string): Buffer {
  const keyPath = path.join(path.dirname(dbPath), 'estoque.key')
  if (fs.existsSync(keyPath)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('O cofre seguro do sistema operacional não está disponível')
    }
    const protectedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64')
    const keyHex = safeStorage.decryptString(protectedKey)
    if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('A chave protegida do banco é inválida')
    return Buffer.from(keyHex, 'hex')
  }

  if (fs.existsSync(dbPath) && !isPlaintextDatabase(dbPath)) {
    throw new Error('A chave de criptografia do banco não foi encontrada. Restaure-a antes de continuar.')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O cofre seguro do sistema operacional não está disponível')
  }
  const key = randomBytes(32)
  const protectedKey = safeStorage.encryptString(key.toString('hex'))
  const tempKeyPath = `${keyPath}.tmp`
  fs.writeFileSync(tempKeyPath, protectedKey.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tempKeyPath, keyPath)
  return key
}

function migratePlaintextDatabase(dbPath: string, key: Buffer): void {
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0 || !isPlaintextDatabase(dbPath)) return
  const encryptedPath = `${dbPath}.encrypting`
  const originalPath = `${dbPath}.pre-encryption`
  fs.rmSync(encryptedPath, { force: true })

  const source = new Database(dbPath)
  try {
    assertDatabaseIntegrity(source)
    source.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    source.close()
  }
  fs.copyFileSync(dbPath, encryptedPath)

  const candidate = new Database(encryptedPath)
  try {
    configureCipher(candidate)
    candidate.rekey(key)
    assertDatabaseIntegrity(candidate)
  } finally {
    candidate.close()
  }

  const verification = openDatabase(encryptedPath, key)
  try {
    assertDatabaseIntegrity(verification)
  } finally {
    verification.close()
  }

  fs.rmSync(originalPath, { force: true })
  fs.renameSync(dbPath, originalPath)
  try {
    fs.renameSync(encryptedPath, dbPath)
    const finalCheck = openDatabase(dbPath, key)
    try {
      assertDatabaseIntegrity(finalCheck)
    } finally {
      finalCheck.close()
    }
    fs.rmSync(originalPath, { force: true })
  } catch (error) {
    fs.rmSync(dbPath, { force: true })
    if (fs.existsSync(originalPath)) fs.renameSync(originalPath, dbPath)
    throw error
  }
}

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
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    description: String(row.description ?? ''),
    categoryId: row.category_id ? String(row.category_id) : null,
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    kind: (row.kind as ProductKind) ?? 'insumo',
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

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    username: String(row.username),
    role: row.role as UserRole,
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
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
    origin: (row.origin as MovementOrigin) ?? 'legacy',
    createdAt: String(row.created_at),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    productSku: row.product_sku != null ? String(row.product_sku) : undefined,
  }
}

export function getDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'estoque.db')
}

export function initDatabase(): { path: string; seeded: boolean } {
  const dbPath = getDbPath()
  const key = getOrCreateDatabaseKey(dbPath)
  migratePlaintextDatabase(dbPath, key)
  return initDatabaseAtPath(dbPath, key)
}

/** Inicializa um banco em caminho explícito para testes e diagnósticos seguros. */
export function initDatabaseAtPath(dbPath: string, encryptionKey?: Buffer): { path: string; seeded: boolean } {
  closeDatabase()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = openDatabase(dbPath, encryptionKey)
  activeDatabaseKey = encryptionKey ?? null
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operador')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
  `)

  migrateSchema(db)

  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get() as { c: number }
  const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'seed_offered'").get() as
    | { value: string }
    | undefined

  return { path: dbPath, seeded: count.c > 0 || Boolean(meta) }
}

function migrateSchema(database: Db): void {
  const productCols = database.prepare('PRAGMA table_info(products)').all() as { name: string }[]
  if (!productCols.some((c) => c.name === 'kind')) {
    database.exec(`ALTER TABLE products ADD COLUMN kind TEXT NOT NULL DEFAULT 'insumo'`)
  }

  const movementCols = database.prepare('PRAGMA table_info(stock_movements)').all() as { name: string }[]
  if (!movementCols.some((c) => c.name === 'origin')) {
    database.exec(`ALTER TABLE stock_movements ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy'`)
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL,
      supplier_id TEXT REFERENCES suppliers(id),
      issue_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost REAL NOT NULL CHECK(unit_cost >= 0)
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL UNIQUE REFERENCES products(id),
      notes TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0)
    );

    CREATE TABLE IF NOT EXISTS production_orders (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES recipes(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_created ON purchase_invoices(created_at);
    CREATE INDEX IF NOT EXISTS idx_production_created ON production_orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_products_kind ON products(kind);
    CREATE INDEX IF NOT EXISTS idx_movements_origin ON stock_movements(origin);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON purchase_invoices(number);
    CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON purchase_invoice_items(invoice_id);
  `)

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_supplier
    ON purchase_invoices(number, COALESCE(supplier_id, ''));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_item_unique
    ON recipe_items(recipe_id, product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_item_unique
    ON purchase_invoice_items(invoice_id, product_id);
  `)

  const userCols = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!userCols.some((c) => c.name === 'must_change_password')) {
    database.exec(
      `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
    )
  }

  ensureDefaultAdmin(database)
}

const DEFAULT_PASSWORD = 'admin123'

function legacyHashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith('scrypt$')) {
    const actual = Buffer.from(legacyHashPassword(password), 'hex')
    const expected = Buffer.from(storedHash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const [, salt, expectedHex] = storedHash.split('$')
  if (!salt || !expectedHex) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function assertNewPassword(newPassword: string, currentPassword: string): void {
  if (newPassword.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres')
  if (newPassword === currentPassword) throw new Error('A nova senha deve ser diferente da atual')
  if (newPassword === DEFAULT_PASSWORD) throw new Error('Não use a senha padrão. Escolha outra senha.')
}

function ensureDefaultAdmin(database: Db): void {
  const count = (database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  if (count === 0) {
    const ts = nowIso()
    database
      .prepare(
        `INSERT INTO users (id, name, username, password_hash, role, active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, ?)`,
      )
      .run(randomUUID(), 'Administrador', 'admin', hashPassword(DEFAULT_PASSWORD), ts, ts)
    return
  }

  database
    .prepare('UPDATE users SET must_change_password = 1 WHERE password_hash = ?')
    .run(legacyHashPassword(DEFAULT_PASSWORD))
}

function requireDb(): Db {
  if (!db) throw new Error('Banco de dados não inicializado')
  return db
}


export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
  activeDatabaseKey = null
}

/** Online-safe backup using better-sqlite3 backup API (WAL-aware). */
export async function backupDatabase(destPath: string): Promise<void> {
  const database = requireDb()
  const tempPath = `${destPath}.tmp`
  fs.rmSync(tempPath, { force: true })
  if (activeDatabaseKey) {
    database.pragma('wal_checkpoint(TRUNCATE)')
    fs.copyFileSync(database.name, tempPath)
    const backup = openDatabase(tempPath, activeDatabaseKey)
    try {
      assertDatabaseIntegrity(backup)
    } finally {
      backup.close()
    }
  } else {
    await database.backup(tempPath)
  }
  fs.rmSync(destPath, { force: true })
  fs.renameSync(tempPath, destPath)
}

/** Replace the live database with a backup file and reopen. */
export function restoreDatabase(sourcePath: string): { path: string; seeded: boolean } {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Arquivo de cópia de segurança não encontrado')
  }

  let candidate: Database.Database | null = null
  try {
    candidate = new Database(sourcePath, { readonly: true, fileMustExist: true })
    if (!isPlaintextDatabase(sourcePath)) {
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

const USER_COLUMNS =
  'id, name, username, role, active, must_change_password, created_at, updated_at'

function getUser(id: string): User {
  const row = requireDb()
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Usuário não encontrado')
  return mapUser(row)
}

export function listUsers(): User[] {
  const rows = requireDb()
    .prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY name`)
    .all() as Record<string, unknown>[]
  return rows.map(mapUser)
}

export function createUser(input: {
  name: string
  username: string
  password: string
  role: UserRole
}): User {
  const name = input.name.trim()
  const username = input.username.trim()
  const password = input.password
  if (!name) throw new Error('Nome do usuário é obrigatório')
  if (!username) throw new Error('Usuário é obrigatório')
  if (password.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres')
  const ts = nowIso()
  const id = randomUUID()
  try {
    requireDb()
      .prepare(
        `INSERT INTO users (id, name, username, password_hash, role, active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      )
      .run(id, name, username, hashPassword(password), input.role, ts, ts)
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Este usuário já está cadastrado')
    throw err
  }
  return getUser(id)
}

export function setUserActive(id: string, active: boolean): User {
  const db = requireDb()
  if (!active) {
    const admins = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get() as { c: number }).c
    const target = db.prepare('SELECT role, active FROM users WHERE id = ?').get(id) as { role: UserRole; active: number } | undefined
    if (!target) throw new Error('Usuário não encontrado')
    if (target.role === 'admin' && target.active && admins <= 1) {
      throw new Error('Não é possível desativar o último administrador')
    }
  }
  const ts = nowIso()
  const result = db
    .prepare('UPDATE users SET active = ?, updated_at = ? WHERE id = ?')
    .run(active ? 1 : 0, ts, id)
  if (result.changes === 0) throw new Error('Usuário não encontrado')
  return getUser(id)
}

export function authenticateUser(username: string, password: string): User | null {
  const row = requireDb()
    .prepare(
      `SELECT ${USER_COLUMNS}, password_hash
       FROM users
       WHERE username = ? COLLATE NOCASE`,
    )
    .get(username.trim()) as (Record<string, unknown> & { password_hash: string }) | undefined
  if (!row || !verifyPassword(password, row.password_hash)) return null
  const user = mapUser(row)
  if (!user.active) return null
  if (!row.password_hash.startsWith('scrypt$')) {
    requireDb()
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), nowIso(), user.id)
  }
  return user
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): User {
  const row = requireDb()
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(userId) as { id: string; password_hash: string } | undefined
  if (!row) throw new Error('Usuário não encontrado')
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('Senha atual incorreta')
  }
  assertNewPassword(newPassword, currentPassword)
  const ts = nowIso()
  requireDb()
    .prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
    )
    .run(hashPassword(newPassword), ts, userId)
  return getUser(userId)
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
  if (filters.kind) {
    clauses.push('p.kind = ?')
    params.push(filters.kind)
  }
  if (filters.active !== undefined) {
    clauses.push('p.active = ?')
    params.push(filters.active ? 1 : 0)
  }
  if (filters.lowStockOnly) {
    clauses.push('p.stock <= p.min_stock')
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
  costPrice: number
  salePrice: number
  minStock: number
}): void {
  if (!input.sku.trim()) throw new Error('Código é obrigatório')
  if (!input.name.trim()) throw new Error('Nome do produto é obrigatório')
  if (!input.unit.trim()) throw new Error('Unidade é obrigatória')
  if (input.costPrice < 0 || input.salePrice < 0) throw new Error('Preços não podem ser negativos')
  if (input.minStock < 0) throw new Error('Estoque mínimo não pode ser negativo')
}

export function createProduct(input: ProductInput): Product {
  validateProductFields(input)
  const kind: ProductKind = input.kind ?? 'insumo'

  const id = randomUUID()
  const ts = nowIso()
  const database = requireDb()

  const tx = database.transaction(() => {
    try {
      database
        .prepare(
          `INSERT INTO products (
            id, sku, name, description, category_id, supplier_id, kind, unit,
            cost_price, sale_price, min_stock, stock, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        )
        .run(
          id,
          input.sku.trim(),
          input.name.trim(),
          input.description?.trim() ?? '',
          input.categoryId || null,
          input.supplierId || null,
          kind,
          input.unit.trim(),
          input.costPrice,
          input.salePrice,
          input.minStock,
          ts,
          ts,
        )
    } catch (err) {
      if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este código')
      throw err
    }
  })

  tx()
  return getProduct(id)!
}

export function updateProduct(input: ProductUpdateInput): Product {
  validateProductFields(input)
  const ts = nowIso()
  try {
    const result = requireDb()
      .prepare(
        `UPDATE products SET
          sku = ?, name = ?, description = ?, category_id = ?, supplier_id = ?,
          kind = ?, unit = ?, cost_price = ?, sale_price = ?, min_stock = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.sku.trim(),
        input.name.trim(),
        input.description?.trim() ?? '',
        input.categoryId || null,
        input.supplierId || null,
        input.kind,
        input.unit.trim(),
        input.costPrice,
        input.salePrice,
        input.minStock,
        ts,
        input.id,
      )
    if (result.changes === 0) throw new Error('Produto não encontrado')
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new Error('Já existe um produto com este código')
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

type ApplyMovementInput = {
  productId: string
  type: MovementType
  quantity?: number
  newStock?: number
  reason: string
  reference: string
  origin: MovementOrigin
}

function applyStockMovement(input: ApplyMovementInput): StockMovement {
  const reason = input.reason.trim()
  if (!reason) throw new Error('Motivo é obrigatório')

  const database = requireDb()
  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as
    | Record<string, unknown>
    | undefined

  if (!product) throw new Error('Produto não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode receber movimentações')

  const previous = Number(product.stock)
  let quantity = input.quantity ?? 0
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
  const ts = nowIso()

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO stock_movements (
          id, product_id, type, quantity, previous_stock, new_stock, reason, reference, origin, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.productId,
        input.type,
        quantity,
        previous,
        newStock,
        reason,
        input.reference.trim(),
        input.origin,
        ts,
      )
    database
      .prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, ts, input.productId)
  })

  tx()

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

function mapInvoiceRow(
  row: Record<string, unknown>,
  items: PurchaseInvoice['items'],
): PurchaseInvoice {
  return {
    id: String(row.id),
    number: String(row.number),
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    supplierName: row.supplier_name != null ? String(row.supplier_name) : null,
    issueDate: String(row.issue_date),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    items,
  }
}

export function listPurchaseInvoices(): PurchaseInvoice[] {
  const database = requireDb()
  const rows = database
    .prepare(
      `SELECT i.*, s.name AS supplier_name
       FROM purchase_invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       ORDER BY i.created_at DESC
       LIMIT 200`,
    )
    .all() as Record<string, unknown>[]

  const itemStmt = database.prepare(
    `SELECT ii.*, p.name AS product_name, p.sku AS product_sku
     FROM purchase_invoice_items ii
     JOIN products p ON p.id = ii.product_id
     WHERE ii.invoice_id = ?
     ORDER BY p.name`,
  )

  return rows.map((row) => {
    const items = (itemStmt.all(row.id) as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      productId: String(item.product_id),
      productName: String(item.product_name),
      productSku: String(item.product_sku),
      quantity: Number(item.quantity),
      unitCost: Number(item.unit_cost),
    }))
    return mapInvoiceRow(row, items)
  })
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
        `INSERT INTO purchase_invoices (id, number, supplier_id, issue_date, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invoiceId,
        number,
        input.supplierId || null,
        input.issueDate,
        input.notes?.trim() ?? '',
        ts,
      )

    const insertItem = database.prepare(
      `INSERT INTO purchase_invoice_items (id, invoice_id, product_id, quantity, unit_cost)
       VALUES (?, ?, ?, ?, ?)`,
    )

    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('Quantidade do item deve ser maior que zero')
      if (item.unitCost < 0) throw new Error('Custo unitário não pode ser negativo')

      const product = database
        .prepare('SELECT id, kind, active FROM products WHERE id = ?')
        .get(item.productId) as { id: string; kind: string; active: number } | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error('Produto inativo não pode entrar por fatura')
      if (product.kind !== 'insumo') {
        throw new Error('Entrada por fatura permitida apenas para insumos')
      }

      insertItem.run(randomUUID(), invoiceId, item.productId, item.quantity, item.unitCost)

      applyStockMovement({
        productId: item.productId,
        type: 'entrada',
        quantity: item.quantity,
        reason: `Fatura ${number}`,
        reference: invoiceId,
        origin: 'fatura',
      })

      database
        .prepare('UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ?')
        .run(item.unitCost, ts, item.productId)
    }
  })

  tx()

  return listPurchaseInvoices().find((i) => i.id === invoiceId)!
}

function mapRecipeRow(row: Record<string, unknown>, items: RecipeItem[]): Recipe {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productSku: String(row.product_sku),
    notes: String(row.notes ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
  }
}

export function listRecipes(): Recipe[] {
  const database = requireDb()
  const rows = database
    .prepare(
      `SELECT r.*, p.name AS product_name, p.sku AS product_sku
       FROM recipes r
       JOIN products p ON p.id = r.product_id
       ORDER BY p.name`,
    )
    .all() as Record<string, unknown>[]

  const itemStmt = database.prepare(
    `SELECT ri.*, p.name AS product_name, p.sku AS product_sku
     FROM recipe_items ri
     JOIN products p ON p.id = ri.product_id
     WHERE ri.recipe_id = ?
     ORDER BY p.name`,
  )

  return rows.map((row) => {
    const items = (itemStmt.all(row.id) as Record<string, unknown>[]).map((item) => ({
      id: String(item.id),
      productId: String(item.product_id),
      productName: String(item.product_name),
      productSku: String(item.product_sku),
      quantity: Number(item.quantity),
    }))
    return mapRecipeRow(row, items)
  })
}

export function getRecipeByProductId(productId: string): Recipe | null {
  return listRecipes().find((r) => r.productId === productId) ?? null
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

      insertItem.run(randomUUID(), recipeId, item.productId, item.quantity)
    }
  })

  tx()
  return getRecipeByProductId(input.productId)!
}

export function listProductionOrders(): ProductionOrder[] {
  const database = requireDb()
  const rows = database
    .prepare(
      `SELECT po.*, p.name AS product_name, p.sku AS product_sku
       FROM production_orders po
       JOIN products p ON p.id = po.product_id
       ORDER BY po.created_at DESC
       LIMIT 200`,
    )
    .all() as Record<string, unknown>[]

  return rows.map((row) => ({
    id: String(row.id),
    recipeId: String(row.recipe_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productSku: String(row.product_sku),
    quantity: Number(row.quantity),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
  }))
}

export function createProduction(input: ProductionInput): ProductionOrder {
  if (!(input.quantity > 0)) throw new Error('Quantidade produzida deve ser maior que zero')

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
    const needed = item.quantity * input.quantity
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

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO production_orders (id, recipe_id, product_id, quantity, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(orderId, recipe.id, input.productId, input.quantity, input.notes?.trim() ?? '', ts)

    for (const item of recipe.items) {
      const qty = item.quantity * input.quantity
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
      quantity: input.quantity,
      reason: `Fabricação · ${product.name}`,
      reference: orderId,
      origin: 'fabricacao_producao',
    })
  })

  tx()

  return listProductionOrders().find((o) => o.id === orderId)!
}
