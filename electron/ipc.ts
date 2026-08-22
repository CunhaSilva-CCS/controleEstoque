import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { InventoryRepository } from './db/repository';
import { InventoryRuleError } from '../shared/inventoryRules';
import type {
  ApiResponse,
  CategoryInput,
  MovementFilters,
  MovementInput,
  ProductInput,
  SupplierInput,
} from '../shared/types';

let SQL: SqlJsStatic | null = null;
let repo: InventoryRepository | null = null;
let dbPath = '';

function wrap<T>(fn: () => T): ApiResponse<T> {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    const message =
      err instanceof InventoryRuleError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Erro inesperado.';
    return { ok: false, error: message };
  }
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });
  return SQL;
}

export async function initDatabase(userDataPath: string): Promise<InventoryRepository> {
  const sql = await loadSqlJs();
  const dir = path.join(userDataPath, 'controle-estoque');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'inventory.sqlite');

  let db: Database;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new sql.Database(fileBuffer);
  } else {
    db = new sql.Database();
  }

  const persist = (data: Uint8Array) => {
    fs.writeFileSync(dbPath, Buffer.from(data));
  };

  repo = InventoryRepository.bootstrap(db as unknown as ConstructorParameters<typeof InventoryRepository>[0], persist);
  return repo;
}

function getRepo(): InventoryRepository {
  if (!repo) {
    throw new Error('Banco de dados não inicializado.');
  }
  return repo;
}

export const handlers = {
  getDashboard: () => wrap(() => getRepo().getDashboard()),
  listCategories: (_: unknown, includeInactive?: boolean) =>
    wrap(() => getRepo().listCategories(Boolean(includeInactive))),
  createCategory: (_: unknown, input: CategoryInput) => wrap(() => getRepo().createCategory(input)),
  updateCategory: (_: unknown, id: number, input: CategoryInput) =>
    wrap(() => getRepo().updateCategory(id, input)),
  setCategoryActive: (_: unknown, id: number, active: boolean) =>
    wrap(() => getRepo().setCategoryActive(id, active)),
  listSuppliers: (_: unknown, includeInactive?: boolean) =>
    wrap(() => getRepo().listSuppliers(Boolean(includeInactive))),
  createSupplier: (_: unknown, input: SupplierInput) => wrap(() => getRepo().createSupplier(input)),
  updateSupplier: (_: unknown, id: number, input: SupplierInput) =>
    wrap(() => getRepo().updateSupplier(id, input)),
  setSupplierActive: (_: unknown, id: number, active: boolean) =>
    wrap(() => getRepo().setSupplierActive(id, active)),
  listProducts: (
    _: unknown,
    opts?: { includeInactive?: boolean; search?: string; lowStockOnly?: boolean },
  ) => wrap(() => getRepo().listProducts(opts ?? {})),
  createProduct: (_: unknown, input: ProductInput) => wrap(() => getRepo().createProduct(input)),
  updateProduct: (_: unknown, id: number, input: ProductInput) =>
    wrap(() => getRepo().updateProduct(id, input)),
  setProductActive: (_: unknown, id: number, active: boolean) =>
    wrap(() => getRepo().setProductActive(id, active)),
  listMovements: (_: unknown, filters?: MovementFilters) =>
    wrap(() => getRepo().listMovements(filters ?? {})),
  createMovement: (_: unknown, input: MovementInput) => wrap(() => getRepo().createMovement(input)),
  exportInventoryCsv: () => wrap(() => getRepo().exportInventoryCsv()),
  exportCriticalCsv: () => wrap(() => getRepo().exportCriticalCsv()),
  exportMovementsCsv: (_: unknown, filters?: MovementFilters) =>
    wrap(() => getRepo().exportMovementsCsv(filters ?? {})),
};
