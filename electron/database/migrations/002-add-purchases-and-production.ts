import type { Migration } from '../types'

export const purchasesAndProductionMigration: Migration = {
  version: 2,
  name: '002-add-purchases-and-production',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id TEXT PRIMARY KEY, number TEXT NOT NULL, supplier_id TEXT REFERENCES suppliers(id),
        issue_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
        unit_cost REAL NOT NULL CHECK(unit_cost >= 0)
      );
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL UNIQUE REFERENCES products(id),
        notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recipe_items (
        id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0)
      );
      CREATE TABLE IF NOT EXISTS production_orders (
        id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id),
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_created ON purchase_invoices(created_at);
      CREATE INDEX IF NOT EXISTS idx_invoices_number ON purchase_invoices(number);
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON purchase_invoice_items(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
      CREATE INDEX IF NOT EXISTS idx_production_created ON production_orders(created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_supplier
        ON purchase_invoices(number, COALESCE(supplier_id, ''));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_item_unique ON recipe_items(recipe_id, product_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_item_unique ON purchase_invoice_items(invoice_id, product_id);
    `)
  },
}
