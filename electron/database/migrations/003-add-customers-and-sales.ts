import type { Migration } from '../types'

export const customersAndSalesMigration: Migration = {
  version: 3,
  name: '003-add-customers-and-sales',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, tax_number TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_invoices (
        id TEXT PRIMARY KEY, number TEXT NOT NULL COLLATE NOCASE UNIQUE,
        customer_id TEXT NOT NULL REFERENCES customers(id), issue_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL CHECK(quantity > 0),
        unit_price REAL NOT NULL CHECK(unit_price >= 0),
        unit_cost_snapshot REAL NOT NULL DEFAULT 0 CHECK(unit_cost_snapshot >= 0),
        UNIQUE(invoice_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
      CREATE INDEX IF NOT EXISTS idx_sales_invoices_created ON sales_invoices(created_at);
      CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice ON sales_invoice_items(invoice_id);
    `)
  },
}
