export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  document TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  unit TEXT NOT NULL CHECK(unit IN ('UN','KG','L','CX','MT')),
  min_stock REAL NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
  quantity_on_hand REAL NOT NULL DEFAULT 0 CHECK(quantity_on_hand >= 0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
  sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
  location TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(sku)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK(type IN ('ENTRADA','SAIDA','AJUSTE')),
  quantity REAL NOT NULL CHECK(quantity >= 0),
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
  unit_cost REAL,
  supplier_id INTEGER REFERENCES suppliers(id),
  reason TEXT,
  notes TEXT,
  user_label TEXT NOT NULL DEFAULT 'Operador',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(type);
`;
