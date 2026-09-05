import { DEFAULT_COMPANY_ID } from '../../../shared/types'
import type { Migration } from '../types'

const COMPANY_SCOPED_TABLES = [
  'categories',
  'suppliers',
  'customers',
  'products',
  'purchase_invoices',
  'sales_invoices',
  'production_orders',
  'recipes',
  'stock_movements',
  'financial_entries',
  'inventory_sessions',
  'audit_logs',
]

export const multiCompanyMigration: Migration = {
  version: 10,
  name: '010-multi-company',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, tax_number TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `)
    const now = new Date().toISOString()
    database
      .prepare(
        `INSERT OR IGNORE INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .run(DEFAULT_COMPANY_ID, 'Empresa Principal', now, now)

    for (const table of COMPANY_SCOPED_TABLES) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
      if (columns.some((column) => column.name === 'company_id')) continue
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN company_id TEXT NOT NULL DEFAULT '${DEFAULT_COMPANY_ID}' REFERENCES companies(id)`,
      )
      database.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_company ON ${table}(company_id)`)
    }
  },
}
