import type { Db, Migration } from '../types'

function hasColumn(database: Db, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((item) => item.name === column)
}

export const unitsAndLotsMigration: Migration = {
  version: 8,
  name: '008-units-conversions-and-lots',
  up(database) {
    if (!hasColumn(database, 'products', 'purchase_unit')) database.exec('ALTER TABLE products ADD COLUMN purchase_unit TEXT')
    if (!hasColumn(database, 'products', 'purchase_conversion_factor')) database.exec('ALTER TABLE products ADD COLUMN purchase_conversion_factor REAL NOT NULL DEFAULT 1')
    if (!hasColumn(database, 'products', 'lot_control')) database.exec('ALTER TABLE products ADD COLUMN lot_control INTEGER NOT NULL DEFAULT 0')
    if (!hasColumn(database, 'purchase_invoice_items', 'lot_number')) database.exec("ALTER TABLE purchase_invoice_items ADD COLUMN lot_number TEXT NOT NULL DEFAULT ''")
    if (!hasColumn(database, 'purchase_invoice_items', 'manufactured_at')) database.exec('ALTER TABLE purchase_invoice_items ADD COLUMN manufactured_at TEXT')
    if (!hasColumn(database, 'purchase_invoice_items', 'expires_at')) database.exec('ALTER TABLE purchase_invoice_items ADD COLUMN expires_at TEXT')
    database.exec(`
      CREATE TABLE IF NOT EXISTS unit_conversions (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        from_unit TEXT NOT NULL, to_unit TEXT NOT NULL, factor REAL NOT NULL CHECK(factor > 0),
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
        UNIQUE(product_id, from_unit, to_unit)
      );
      CREATE TABLE IF NOT EXISTS stock_lots (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), supplier_id TEXT REFERENCES suppliers(id),
        lot_number TEXT NOT NULL, manufactured_at TEXT, expires_at TEXT, received_at TEXT NOT NULL,
        initial_quantity REAL NOT NULL CHECK(initial_quantity >= 0),
        available_quantity REAL NOT NULL CHECK(available_quantity >= 0), status TEXT NOT NULL DEFAULT 'disponivel',
        UNIQUE(product_id, lot_number)
      );
      CREATE TABLE IF NOT EXISTS lot_movements (
        id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES stock_lots(id), stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id),
        quantity REAL NOT NULL CHECK(quantity > 0), direction TEXT NOT NULL CHECK(direction IN ('entrada', 'saida')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lots_fefo ON stock_lots(product_id, expires_at, received_at);
      CREATE INDEX IF NOT EXISTS idx_lot_movements_lot ON lot_movements(lot_id, created_at);
    `)
  },
}
