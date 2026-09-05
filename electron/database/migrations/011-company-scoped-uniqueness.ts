import type { Migration } from '../types'

/**
 * As restrições UNIQUE originais (nome de categoria, SKU, número de fatura de saída,
 * código de inventário) eram globais, impedindo que duas empresas usassem o mesmo
 * valor. SQLite não permite alterar uma constraint UNIQUE de tabela via ALTER TABLE,
 * por isso as 4 tabelas afetadas são reconstruídas com a constraint composta
 * (company_id, coluna). foreign_keys é desligado pelo runner (index.ts) durante todo
 * o lote de migrações pendentes, o que é obrigatório para este rebuild funcionar.
 */
export const companyScopedUniquenessMigration: Migration = {
  version: 11,
  name: '011-company-scoped-uniqueness',
  up(database) {
    database.exec(`
      CREATE TABLE categories_new (
        id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
        company_id TEXT NOT NULL REFERENCES companies(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(company_id, name)
      );
      INSERT INTO categories_new (id, name, description, active, company_id, created_at, updated_at)
        SELECT id, name, description, active, company_id, created_at, updated_at FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;
      CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(company_id);

      CREATE TABLE products_new (
        id TEXT PRIMARY KEY, sku TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', category_id TEXT REFERENCES categories(id),
        supplier_id TEXT REFERENCES suppliers(id), kind TEXT NOT NULL DEFAULT 'insumo',
        unit TEXT NOT NULL DEFAULT 'un', cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
        sale_price REAL NOT NULL DEFAULT 0 CHECK(sale_price >= 0),
        min_stock REAL NOT NULL DEFAULT 0 CHECK(min_stock >= 0),
        stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0), active INTEGER NOT NULL DEFAULT 1,
        purchase_unit TEXT, purchase_conversion_factor REAL NOT NULL DEFAULT 1,
        lot_control INTEGER NOT NULL DEFAULT 0, company_id TEXT NOT NULL REFERENCES companies(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(company_id, sku)
      );
      INSERT INTO products_new (
        id, sku, name, description, category_id, supplier_id, kind, unit, cost_price, sale_price,
        min_stock, stock, active, purchase_unit, purchase_conversion_factor, lot_control, company_id,
        created_at, updated_at
      )
        SELECT id, sku, name, description, category_id, supplier_id, kind, unit, cost_price, sale_price,
          min_stock, stock, active, purchase_unit, purchase_conversion_factor, lot_control, company_id,
          created_at, updated_at
        FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
      CREATE INDEX IF NOT EXISTS idx_products_kind ON products(kind);
      CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

      CREATE TABLE sales_invoices_new (
        id TEXT PRIMARY KEY, number TEXT NOT NULL COLLATE NOCASE,
        customer_id TEXT NOT NULL REFERENCES customers(id), issue_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmado', created_by TEXT REFERENCES users(id),
        cancelled_by TEXT REFERENCES users(id), cancelled_at TEXT,
        cancellation_reason TEXT NOT NULL DEFAULT '', reversal_id TEXT,
        company_id TEXT NOT NULL REFERENCES companies(id), UNIQUE(company_id, number)
      );
      INSERT INTO sales_invoices_new (
        id, number, customer_id, issue_date, notes, created_at, status, created_by,
        cancelled_by, cancelled_at, cancellation_reason, reversal_id, company_id
      )
        SELECT id, number, customer_id, issue_date, notes, created_at, status, created_by,
          cancelled_by, cancelled_at, cancellation_reason, reversal_id, company_id
        FROM sales_invoices;
      DROP TABLE sales_invoices;
      ALTER TABLE sales_invoices_new RENAME TO sales_invoices;
      CREATE INDEX IF NOT EXISTS idx_sales_invoices_created ON sales_invoices(created_at);
      CREATE INDEX IF NOT EXISTS idx_sales_invoices_company ON sales_invoices(company_id);

      CREATE TABLE inventory_sessions_new (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aberto'
          CHECK(status IN ('aberto', 'em_contagem', 'aguarda_aprovacao', 'aprovado', 'cancelado')),
        reference_at TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id),
        approved_by TEXT REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id),
        created_at TEXT NOT NULL, approved_at TEXT, cancelled_at TEXT, UNIQUE(company_id, code)
      );
      INSERT INTO inventory_sessions_new (
        id, code, status, reference_at, notes, created_by, approved_by, company_id,
        created_at, approved_at, cancelled_at
      )
        SELECT id, code, status, reference_at, notes, created_by, approved_by, company_id,
          created_at, approved_at, cancelled_at
        FROM inventory_sessions;
      DROP TABLE inventory_sessions;
      ALTER TABLE inventory_sessions_new RENAME TO inventory_sessions;
      CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_sessions(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory_sessions(company_id);

      DROP INDEX IF EXISTS idx_invoice_number_supplier;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_supplier
        ON purchase_invoices(company_id, number, COALESCE(supplier_id, ''));
    `)
  },
}
