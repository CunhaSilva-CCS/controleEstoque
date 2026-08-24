import type { Migration } from '../types'

export const initialSchemaMigration: Migration = {
  version: 1,
  name: '001-initial-schema',
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(name)
      );
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, sku TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', category_id TEXT REFERENCES categories(id),
        supplier_id TEXT REFERENCES suppliers(id), kind TEXT NOT NULL DEFAULT 'insumo',
        unit TEXT NOT NULL DEFAULT 'un', cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
        sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
        min_stock REAL NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
        stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0), active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(sku)
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
        type TEXT NOT NULL CHECK(type IN ('entrada', 'saida', 'ajuste')), quantity REAL NOT NULL,
        previous_stock REAL NOT NULL, new_stock REAL NOT NULL CHECK(new_stock >= 0),
        reason TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL DEFAULT 'legacy', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'operador')),
        active INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY, action TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
      CREATE INDEX IF NOT EXISTS idx_products_kind ON products(kind);
      CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
      CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_movements_origin ON stock_movements(origin);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    `)
  },
}
