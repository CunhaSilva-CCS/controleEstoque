import type { Db, Migration } from '../types'

function hasColumn(database: Db, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((item) => item.name === column)
}

export const costSnapshotsMigration: Migration = {
  version: 4,
  name: '004-add-cost-snapshots',
  up(database) {
    if (!hasColumn(database, 'production_orders', 'unit_cost_snapshot')) {
      database.exec('ALTER TABLE production_orders ADD COLUMN unit_cost_snapshot REAL NOT NULL DEFAULT 0')
    }
    if (!hasColumn(database, 'production_orders', 'total_cost_snapshot')) {
      database.exec('ALTER TABLE production_orders ADD COLUMN total_cost_snapshot REAL NOT NULL DEFAULT 0')
    }
    if (!hasColumn(database, 'sales_invoice_items', 'unit_cost_snapshot')) {
      database.exec('ALTER TABLE sales_invoice_items ADD COLUMN unit_cost_snapshot REAL NOT NULL DEFAULT 0')
    }
  },
}
