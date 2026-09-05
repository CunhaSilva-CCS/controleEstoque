import type { Migration } from '../types'

export const financialEntriesMigration: Migration = {
  version: 9,
  name: '009-financial-entries',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS financial_entries (
        id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('pagar', 'receber')),
        description TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0),
        due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago')),
        paid_at TEXT, reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_financial_entries_status ON financial_entries(type, status, due_date);
    `)
  },
}
