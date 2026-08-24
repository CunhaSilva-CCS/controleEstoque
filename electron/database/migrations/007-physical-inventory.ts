import type { Migration } from '../types'

export const physicalInventoryMigration: Migration = {
  version: 7,
  name: '007-physical-inventory',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS inventory_sessions (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'aberto'
          CHECK(status IN ('aberto', 'em_contagem', 'aguarda_aprovacao', 'aprovado', 'cancelado')),
        reference_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id),
        approved_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, approved_at TEXT, cancelled_at TEXT
      );
      CREATE TABLE IF NOT EXISTS inventory_counts (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), reference_stock REAL NOT NULL,
        counted_stock REAL, difference REAL, counted_by TEXT REFERENCES users(id), counted_at TEXT,
        UNIQUE(session_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_sessions(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_counts_session ON inventory_counts(session_id);
    `)
  },
}
