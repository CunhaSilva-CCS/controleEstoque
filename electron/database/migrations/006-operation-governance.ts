import type { Db, Migration } from '../types'

function hasColumn(database: Db, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((item) => item.name === column)
}

function addColumn(database: Db, table: string, column: string, definition: string): void {
  if (!hasColumn(database, table, column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export const operationGovernanceMigration: Migration = {
  version: 6,
  name: '006-operation-governance',
  up(database) {
    for (const table of ['purchase_invoices', 'sales_invoices', 'production_orders']) {
      addColumn(database, table, 'status', "TEXT NOT NULL DEFAULT 'confirmado'")
      addColumn(database, table, 'created_by', 'TEXT REFERENCES users(id)')
      addColumn(database, table, 'cancelled_by', 'TEXT REFERENCES users(id)')
      addColumn(database, table, 'cancelled_at', 'TEXT')
      addColumn(database, table, 'cancellation_reason', "TEXT NOT NULL DEFAULT ''")
      addColumn(database, table, 'reversal_id', 'TEXT')
    }
    addColumn(database, 'stock_movements', 'created_by', 'TEXT REFERENCES users(id)')
    addColumn(database, 'stock_movements', 'reversal_of', 'TEXT REFERENCES stock_movements(id)')
    addColumn(database, 'audit_logs', 'user_id', 'TEXT')
    addColumn(database, 'audit_logs', 'username', "TEXT NOT NULL DEFAULT ''")
    addColumn(database, 'audit_logs', 'origin', "TEXT NOT NULL DEFAULT 'desktop'")
    addColumn(database, 'audit_logs', 'computer_name', "TEXT NOT NULL DEFAULT ''")
    addColumn(database, 'audit_logs', 'previous_values', "TEXT NOT NULL DEFAULT '{}'")
    addColumn(database, 'audit_logs', 'new_values', "TEXT NOT NULL DEFAULT '{}'")
    database.exec(`
      CREATE TABLE IF NOT EXISTS production_order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES production_orders(id),
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
        unit_cost_snapshot REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_production_order_items_order ON production_order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
      CREATE TRIGGER IF NOT EXISTS prevent_stock_movement_update
      BEFORE UPDATE ON stock_movements BEGIN
        SELECT RAISE(ABORT, 'Movimentos históricos não podem ser alterados');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_stock_movement_delete
      BEFORE DELETE ON stock_movements BEGIN
        SELECT RAISE(ABORT, 'Movimentos históricos não podem ser eliminados');
      END;
    `)
  },
}
