import type {
  Category,
  CategoryInput,
  DashboardData,
  MovementFilters,
  MovementInput,
  Product,
  ProductInput,
  StockMovement,
  Supplier,
  SupplierInput,
} from '../../shared/types';
import {
  InventoryRuleError,
  applyAdjust,
  applyEntry,
  applyExit,
  isLowStock,
  toCsv,
  validateProductFields,
  weightedAverageCost,
} from '../../shared/inventoryRules';
import { SCHEMA_SQL } from './schema';

type SqlJsDatabase = {
  run: (sql: string, params?: unknown[]) => void;
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  prepare: (sql: string) => {
    bind: (params?: unknown[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
};

export type PersistFn = (data: Uint8Array) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function bool(n: unknown): boolean {
  return Number(n) === 1;
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: (row.description as string) ?? null,
    active: bool(row.active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: Number(row.id),
    name: String(row.name),
    document: (row.document as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    notes: (row.notes as string) ?? null,
    active: bool(row.active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  const quantity = Number(row.quantity_on_hand);
  const min = Number(row.min_stock);
  return {
    id: Number(row.id),
    sku: String(row.sku),
    name: String(row.name),
    description: (row.description as string) ?? null,
    category_id: row.category_id == null ? null : Number(row.category_id),
    category_name: (row.category_name as string) ?? null,
    supplier_id: row.supplier_id == null ? null : Number(row.supplier_id),
    supplier_name: (row.supplier_name as string) ?? null,
    unit: row.unit as Product['unit'],
    min_stock: min,
    quantity_on_hand: quantity,
    cost_price: Number(row.cost_price),
    sale_price: Number(row.sale_price),
    location: (row.location as string) ?? null,
    active: bool(row.active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    is_low_stock: isLowStock(quantity, min),
  };
}

function mapMovement(row: Record<string, unknown>): StockMovement {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    product_sku: String(row.product_sku),
    product_name: String(row.product_name),
    type: row.type as StockMovement['type'],
    quantity: Number(row.quantity),
    balance_before: Number(row.balance_before),
    balance_after: Number(row.balance_after),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    supplier_id: row.supplier_id == null ? null : Number(row.supplier_id),
    supplier_name: (row.supplier_name as string) ?? null,
    reason: (row.reason as string) ?? null,
    notes: (row.notes as string) ?? null,
    user_label: String(row.user_label),
    created_at: String(row.created_at),
  };
}

function queryAll(db: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: SqlJsDatabase, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = queryAll(db, sql, params);
  return rows[0] ?? null;
}

export class InventoryRepository {
  constructor(
    private db: SqlJsDatabase,
    private persist: PersistFn,
  ) {}

  static bootstrap(db: SqlJsDatabase, persist: PersistFn): InventoryRepository {
    db.run(SCHEMA_SQL);
    const repo = new InventoryRepository(db, persist);
    const count = queryOne(db, 'SELECT COUNT(*) AS c FROM products');
    if (Number(count?.c ?? 0) === 0) {
      repo.seedDemo();
    }
    persist(db.export());
    return repo;
  }

  private save(): void {
    this.persist(this.db.export());
  }

  private getProductRow(id: number): Record<string, unknown> {
    const row = queryOne(
      this.db,
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ?`,
      [id],
    );
    if (!row) {
      throw new InventoryRuleError('Produto não encontrado.');
    }
    return row;
  }

  seedDemo(): void {
    const ts = nowIso();
    this.db.run(
      `INSERT INTO categories (name, description, active, created_at, updated_at) VALUES
       ('Escritório', 'Materiais de escritório', 1, ?, ?),
       ('Limpeza', 'Produtos de limpeza', 1, ?, ?),
       ('Informática', 'Periféricos e acessórios', 1, ?, ?)`,
      [ts, ts, ts, ts, ts, ts],
    );
    this.db.run(
      `INSERT INTO suppliers (name, document, phone, email, notes, active, created_at, updated_at) VALUES
       ('Distribuidora Alfa', '12.345.678/0001-90', '(11) 4000-1000', 'compras@alfa.example', 'Entrega em 48h', 1, ?, ?),
       ('Casa Nova Suprimentos', '98.765.432/0001-10', '(11) 3000-2000', 'venda@casanova.example', NULL, 1, ?, ?)`,
      [ts, ts, ts, ts],
    );

    const catEscritorio = Number(queryOne(this.db, `SELECT id FROM categories WHERE name = 'Escritório'`)?.id);
    const catLimpeza = Number(queryOne(this.db, `SELECT id FROM categories WHERE name = 'Limpeza'`)?.id);
    const catInfo = Number(queryOne(this.db, `SELECT id FROM categories WHERE name = 'Informática'`)?.id);
    const supAlfa = Number(queryOne(this.db, `SELECT id FROM suppliers WHERE name = 'Distribuidora Alfa'`)?.id);
    const supCasa = Number(queryOne(this.db, `SELECT id FROM suppliers WHERE name = 'Casa Nova Suprimentos'`)?.id);

    const products: Array<[string, string, number, number, string, number, number, number, number]> = [
      ['PAP-A4-500', 'Resma Papel A4 500 folhas', catEscritorio, supAlfa, 'CX', 10, 18.9, 29.9, 8],
      ['CAN-AZUL', 'Caneta esferográfica azul', catEscritorio, supAlfa, 'UN', 50, 0.85, 1.5, 40],
      ['DET-5L', 'Detergente neutro 5L', catLimpeza, supCasa, 'UN', 6, 22.0, 34.9, 4],
      ['MOUSE-USB', 'Mouse óptico USB', catInfo, supAlfa, 'UN', 5, 35.0, 59.9, 12],
      ['CABO-HDMI', 'Cabo HDMI 2m', catInfo, supCasa, 'UN', 8, 18.0, 39.9, 3],
    ];

    for (const [sku, name, cat, sup, unit, min, cost, sale, qty] of products) {
      this.db.run(
        `INSERT INTO products
          (sku, name, description, category_id, supplier_id, unit, min_stock, quantity_on_hand, cost_price, sale_price, location, active, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, NULL, 1, ?, ?)`,
        [sku, name, cat, sup, unit, min, cost, sale, ts, ts],
      );
      const id = Number(queryOne(this.db, 'SELECT id FROM products WHERE sku = ?', [sku])?.id);
      // Entrada inicial via movimento (fluxo F4)
      this.createMovement({
        type: 'ENTRADA',
        product_id: id,
        quantity: qty,
        unit_cost: cost,
        supplier_id: sup,
        notes: 'Saldo inicial (seed)',
        user_label: 'Sistema',
      });
    }
  }

  getDashboard(): DashboardData {
    const rows = queryAll(this.db, 'SELECT * FROM products WHERE active = 1');
    const active_products = rows.length;
    const total_units = rows.reduce((a, r) => a + Number(r.quantity_on_hand), 0);
    const inventory_cost_value = rows.reduce(
      (a, r) => a + Number(r.quantity_on_hand) * Number(r.cost_price),
      0,
    );
    const inventory_sale_value = rows.reduce(
      (a, r) => a + Number(r.quantity_on_hand) * Number(r.sale_price),
      0,
    );
    const low_stock_count = rows.filter((r) =>
      isLowStock(Number(r.quantity_on_hand), Number(r.min_stock)),
    ).length;

    const critical = this.listProducts({ includeInactive: false, lowStockOnly: true }).slice(0, 5);
    const recent = this.listMovements({}).slice(0, 10);

    return {
      active_products,
      total_units,
      inventory_cost_value: Math.round(inventory_cost_value * 100) / 100,
      inventory_sale_value: Math.round(inventory_sale_value * 100) / 100,
      low_stock_count,
      critical_products: critical,
      recent_movements: recent,
    };
  }

  listCategories(includeInactive = false): Category[] {
    const sql = includeInactive
      ? 'SELECT * FROM categories ORDER BY name'
      : 'SELECT * FROM categories WHERE active = 1 ORDER BY name';
    return queryAll(this.db, sql).map(mapCategory);
  }

  createCategory(input: CategoryInput): Category {
    const name = input.name.trim();
    if (!name) throw new InventoryRuleError('Nome da categoria é obrigatório.');
    const ts = nowIso();
    try {
      this.db.run(`INSERT INTO categories (name, description, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`, [
        name,
        input.description?.trim() || null,
        ts,
        ts,
      ]);
    } catch {
      throw new InventoryRuleError('Já existe uma categoria com este nome.');
    }
    this.save();
    const row = queryOne(this.db, 'SELECT * FROM categories WHERE name = ? COLLATE NOCASE', [name]);
    return mapCategory(row!);
  }

  updateCategory(id: number, input: CategoryInput): Category {
    const name = input.name.trim();
    if (!name) throw new InventoryRuleError('Nome da categoria é obrigatório.');
    const existing = queryOne(this.db, 'SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing) throw new InventoryRuleError('Categoria não encontrada.');
    try {
      this.db.run(`UPDATE categories SET name = ?, description = ?, updated_at = ? WHERE id = ?`, [
        name,
        input.description?.trim() || null,
        nowIso(),
        id,
      ]);
    } catch {
      throw new InventoryRuleError('Já existe uma categoria com este nome.');
    }
    this.save();
    return mapCategory(queryOne(this.db, 'SELECT * FROM categories WHERE id = ?', [id])!);
  }

  setCategoryActive(id: number, active: boolean): Category {
    const existing = queryOne(this.db, 'SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing) throw new InventoryRuleError('Categoria não encontrada.');
    if (!active) {
      const linked = queryOne(this.db, 'SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND active = 1', [id]);
      if (Number(linked?.c ?? 0) > 0) {
        // Permite desativar mesmo com vínculos, conforme RF-02 (não excluir)
      }
    }
    this.db.run(`UPDATE categories SET active = ?, updated_at = ? WHERE id = ?`, [active ? 1 : 0, nowIso(), id]);
    this.save();
    return mapCategory(queryOne(this.db, 'SELECT * FROM categories WHERE id = ?', [id])!);
  }

  listSuppliers(includeInactive = false): Supplier[] {
    const sql = includeInactive
      ? 'SELECT * FROM suppliers ORDER BY name'
      : 'SELECT * FROM suppliers WHERE active = 1 ORDER BY name';
    return queryAll(this.db, sql).map(mapSupplier);
  }

  createSupplier(input: SupplierInput): Supplier {
    const name = input.name.trim();
    if (!name) throw new InventoryRuleError('Nome do fornecedor é obrigatório.');
    const ts = nowIso();
    try {
      this.db.run(
        `INSERT INTO suppliers (name, document, phone, email, notes, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          name,
          input.document?.trim() || null,
          input.phone?.trim() || null,
          input.email?.trim() || null,
          input.notes?.trim() || null,
          ts,
          ts,
        ],
      );
    } catch {
      throw new InventoryRuleError('Já existe um fornecedor com este nome.');
    }
    this.save();
    return mapSupplier(queryOne(this.db, 'SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE', [name])!);
  }

  updateSupplier(id: number, input: SupplierInput): Supplier {
    const name = input.name.trim();
    if (!name) throw new InventoryRuleError('Nome do fornecedor é obrigatório.');
    if (!queryOne(this.db, 'SELECT id FROM suppliers WHERE id = ?', [id])) {
      throw new InventoryRuleError('Fornecedor não encontrado.');
    }
    try {
      this.db.run(
        `UPDATE suppliers SET name = ?, document = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [
          name,
          input.document?.trim() || null,
          input.phone?.trim() || null,
          input.email?.trim() || null,
          input.notes?.trim() || null,
          nowIso(),
          id,
        ],
      );
    } catch {
      throw new InventoryRuleError('Já existe um fornecedor com este nome.');
    }
    this.save();
    return mapSupplier(queryOne(this.db, 'SELECT * FROM suppliers WHERE id = ?', [id])!);
  }

  setSupplierActive(id: number, active: boolean): Supplier {
    if (!queryOne(this.db, 'SELECT id FROM suppliers WHERE id = ?', [id])) {
      throw new InventoryRuleError('Fornecedor não encontrado.');
    }
    this.db.run(`UPDATE suppliers SET active = ?, updated_at = ? WHERE id = ?`, [active ? 1 : 0, nowIso(), id]);
    this.save();
    return mapSupplier(queryOne(this.db, 'SELECT * FROM suppliers WHERE id = ?', [id])!);
  }

  listProducts(opts: { includeInactive?: boolean; search?: string; lowStockOnly?: boolean } = {}): Product[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!opts.includeInactive) {
      clauses.push('p.active = 1');
    }
    if (opts.search?.trim()) {
      clauses.push('(p.sku LIKE ? OR p.name LIKE ?)');
      const q = `%${opts.search.trim()}%`;
      params.push(q, q);
    }
    if (opts.lowStockOnly) {
      clauses.push('p.quantity_on_hand <= p.min_stock');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = queryAll(
      this.db,
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       ${where}
       ORDER BY p.name`,
      params,
    );
    return rows.map(mapProduct);
  }

  createProduct(input: ProductInput): Product {
    validateProductFields(input);
    const ts = nowIso();
    try {
      this.db.run(
        `INSERT INTO products
          (sku, name, description, category_id, supplier_id, unit, min_stock, quantity_on_hand, cost_price, sale_price, location, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?)`,
        [
          input.sku.trim(),
          input.name.trim(),
          input.description?.trim() || null,
          input.category_id ?? null,
          input.supplier_id ?? null,
          input.unit,
          input.min_stock,
          input.cost_price,
          input.sale_price,
          input.location?.trim() || null,
          ts,
          ts,
        ],
      );
    } catch {
      throw new InventoryRuleError('Já existe um produto com este SKU.');
    }
    this.save();
    const id = Number(queryOne(this.db, 'SELECT id FROM products WHERE sku = ? COLLATE NOCASE', [input.sku.trim()])?.id);
    return mapProduct(this.getProductRow(id));
  }

  updateProduct(id: number, input: ProductInput): Product {
    validateProductFields(input);
    if (!queryOne(this.db, 'SELECT id FROM products WHERE id = ?', [id])) {
      throw new InventoryRuleError('Produto não encontrado.');
    }
    try {
      this.db.run(
        `UPDATE products SET
          sku = ?, name = ?, description = ?, category_id = ?, supplier_id = ?,
          unit = ?, min_stock = ?, cost_price = ?, sale_price = ?, location = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.sku.trim(),
          input.name.trim(),
          input.description?.trim() || null,
          input.category_id ?? null,
          input.supplier_id ?? null,
          input.unit,
          input.min_stock,
          input.cost_price,
          input.sale_price,
          input.location?.trim() || null,
          nowIso(),
          id,
        ],
      );
    } catch {
      throw new InventoryRuleError('Já existe um produto com este SKU.');
    }
    this.save();
    return mapProduct(this.getProductRow(id));
  }

  setProductActive(id: number, active: boolean): Product {
    if (!queryOne(this.db, 'SELECT id FROM products WHERE id = ?', [id])) {
      throw new InventoryRuleError('Produto não encontrado.');
    }
    this.db.run(`UPDATE products SET active = ?, updated_at = ? WHERE id = ?`, [active ? 1 : 0, nowIso(), id]);
    this.save();
    return mapProduct(this.getProductRow(id));
  }

  listMovements(filters: MovementFilters = {}): StockMovement[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.type) {
      clauses.push('m.type = ?');
      params.push(filters.type);
    }
    if (filters.product_id) {
      clauses.push('m.product_id = ?');
      params.push(filters.product_id);
    }
    if (filters.supplier_id) {
      clauses.push('m.supplier_id = ?');
      params.push(filters.supplier_id);
    }
    if (filters.from) {
      clauses.push('m.created_at >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      clauses.push('m.created_at <= ?');
      params.push(filters.to);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = queryAll(
      this.db,
      `SELECT m.*, p.sku AS product_sku, p.name AS product_name, s.name AS supplier_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 500`,
      params,
    );
    return rows.map(mapMovement);
  }

  createMovement(input: MovementInput): StockMovement {
    const product = this.getProductRow(input.product_id);
    if (!bool(product.active)) {
      throw new InventoryRuleError('Não é permitido movimentar produto inativo.');
    }

    const balanceBefore = Number(product.quantity_on_hand);
    const user = input.user_label?.trim() || 'Operador';
    const ts = nowIso();

    let balanceAfter = balanceBefore;
    let quantity = 0;
    let unitCost: number | null = null;
    let supplierId: number | null = null;
    let reason: string | null = null;
    let notes: string | null = input.notes?.trim() || null;
    let newCost = Number(product.cost_price);

    if (input.type === 'ENTRADA') {
      quantity = input.quantity;
      balanceAfter = applyEntry(balanceBefore, quantity);
      supplierId = input.supplier_id ?? null;
      if (input.unit_cost != null && input.unit_cost !== undefined) {
        unitCost = input.unit_cost;
        newCost = weightedAverageCost(balanceBefore, Number(product.cost_price), quantity, unitCost);
      }
      reason = 'ENTRADA';
    } else if (input.type === 'SAIDA') {
      quantity = input.quantity;
      balanceAfter = applyExit(balanceBefore, quantity);
      reason = input.reason;
      if (input.reason === 'OUTRO' && !notes) {
        throw new InventoryRuleError('Informe uma observação quando o motivo for OUTRO.');
      }
    } else {
      const adj = applyAdjust(balanceBefore, input.new_quantity);
      balanceAfter = adj.balanceAfter;
      quantity = adj.quantityRecorded;
      reason = input.reason.trim();
      if (!reason) {
        throw new InventoryRuleError('Motivo do ajuste é obrigatório.');
      }
    }

    this.db.run('BEGIN');
    try {
      this.db.run(
        `INSERT INTO stock_movements
          (product_id, type, quantity, balance_before, balance_after, unit_cost, supplier_id, reason, notes, user_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.product_id, input.type, quantity, balanceBefore, balanceAfter, unitCost, supplierId, reason, notes, user, ts],
      );
      this.db.run(`UPDATE products SET quantity_on_hand = ?, cost_price = ?, updated_at = ? WHERE id = ?`, [
        balanceAfter,
        newCost,
        ts,
        input.product_id,
      ]);
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }

    this.save();
    const moved = queryOne(
      this.db,
      `SELECT m.*, p.sku AS product_sku, p.name AS product_name, s.name AS supplier_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       WHERE m.product_id = ? AND m.created_at = ?
       ORDER BY m.id DESC LIMIT 1`,
      [input.product_id, ts],
    );
    return mapMovement(moved!);
  }

  exportInventoryCsv(): string {
    const products = this.listProducts({ includeInactive: true });
    return toCsv(
      ['SKU', 'Nome', 'Categoria', 'Fornecedor', 'Unidade', 'Saldo', 'Mínimo', 'Custo', 'Venda', 'Local', 'Ativo', 'Crítico'],
      products.map((p) => [
        p.sku,
        p.name,
        p.category_name,
        p.supplier_name,
        p.unit,
        p.quantity_on_hand,
        p.min_stock,
        p.cost_price,
        p.sale_price,
        p.location,
        p.active ? 'Sim' : 'Não',
        p.is_low_stock ? 'Sim' : 'Não',
      ]),
    );
  }

  exportCriticalCsv(): string {
    const products = this.listProducts({ includeInactive: false, lowStockOnly: true });
    return toCsv(
      ['SKU', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Fornecedor preferencial'],
      products.map((p) => [
        p.sku,
        p.name,
        p.quantity_on_hand,
        p.min_stock,
        p.quantity_on_hand - p.min_stock,
        p.supplier_name,
      ]),
    );
  }

  exportMovementsCsv(filters: MovementFilters = {}): string {
    const rows = this.listMovements(filters);
    return toCsv(
      ['Data', 'Tipo', 'SKU', 'Produto', 'Quantidade', 'Saldo antes', 'Saldo depois', 'Motivo', 'Fornecedor', 'Usuário', 'Obs'],
      rows.map((m) => [
        m.created_at,
        m.type,
        m.product_sku,
        m.product_name,
        m.quantity,
        m.balance_before,
        m.balance_after,
        m.reason,
        m.supplier_name,
        m.user_label,
        m.notes,
      ]),
    );
  }
}
