import { InventoryRepository } from '../../electron/db/repository';
import { InventoryRuleError } from '../../shared/inventoryRules';
import type {
  ApiResponse,
  CategoryInput,
  InventoryApi,
  MovementFilters,
  MovementInput,
  ProductInput,
  SupplierInput,
} from '../../shared/types';

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<{
  Database: new (data?: ArrayLike<number> | null) => unknown;
}>;

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

let repoPromise: Promise<InventoryRepository> | null = null;

function publicAsset(name: string): string {
  const base = import.meta.env.BASE_URL || './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(name, `${window.location.origin}${normalizedBase.replace(/^\.\//, '/')}`).toString();
}

function loadInitSqlJs(): Promise<InitSqlJs> {
  const w = window as Window & { initSqlJs?: InitSqlJs };
  if (w.initSqlJs) {
    return Promise.resolve(w.initSqlJs);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = publicAsset('sql-wasm.js');
    script.async = true;
    script.onload = () => {
      if (!w.initSqlJs) {
        reject(new Error('sql.js não disponibilizou initSqlJs global.'));
        return;
      }
      resolve(w.initSqlJs);
    };
    script.onerror = () => reject(new Error('Falha ao carregar sql-wasm.js'));
    document.head.appendChild(script);
  });
}

async function getRepo(): Promise<InventoryRepository> {
  if (!repoPromise) {
    repoPromise = (async () => {
      const initSqlJs = await loadInitSqlJs();
      const SQL = await initSqlJs({
        locateFile: () => publicAsset('sql-wasm.wasm'),
      });
      const key = 'controle-estoque-demo-db';
      let db;
      const saved = localStorage.getItem(key);
      if (saved) {
        const bytes = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
        db = new SQL.Database(bytes);
      } else {
        db = new SQL.Database();
      }
      const persist = (data: Uint8Array) => {
        let binary = '';
        for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!);
        localStorage.setItem(key, btoa(binary));
      };
      return InventoryRepository.bootstrap(
        db as unknown as ConstructorParameters<typeof InventoryRepository>[0],
        persist,
      );
    })();
  }
  return repoPromise;
}

async function run<T>(fn: (repo: InventoryRepository) => T): Promise<ApiResponse<T>> {
  const repo = await getRepo();
  return wrap(() => fn(repo));
}

function downloadCsv(filename: string, content: string): string {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export const browserApi: InventoryApi = {
  getDashboard: () => run((r) => r.getDashboard()),
  listCategories: (includeInactive) => run((r) => r.listCategories(Boolean(includeInactive))),
  createCategory: (input: CategoryInput) => run((r) => r.createCategory(input)),
  updateCategory: (id, input) => run((r) => r.updateCategory(id, input)),
  setCategoryActive: (id, active) => run((r) => r.setCategoryActive(id, active)),
  listSuppliers: (includeInactive) => run((r) => r.listSuppliers(Boolean(includeInactive))),
  createSupplier: (input: SupplierInput) => run((r) => r.createSupplier(input)),
  updateSupplier: (id, input) => run((r) => r.updateSupplier(id, input)),
  setSupplierActive: (id, active) => run((r) => r.setSupplierActive(id, active)),
  listProducts: (opts) => run((r) => r.listProducts(opts ?? {})),
  createProduct: (input: ProductInput) => run((r) => r.createProduct(input)),
  updateProduct: (id, input) => run((r) => r.updateProduct(id, input)),
  setProductActive: (id, active) => run((r) => r.setProductActive(id, active)),
  listMovements: (filters?: MovementFilters) => run((r) => r.listMovements(filters ?? {})),
  createMovement: (input: MovementInput) => run((r) => r.createMovement(input)),
  exportInventoryCsv: () => run((r) => r.exportInventoryCsv()),
  exportCriticalCsv: () => run((r) => r.exportCriticalCsv()),
  exportMovementsCsv: (filters) => run((r) => r.exportMovementsCsv(filters ?? {})),
  saveCsvFile: async (defaultName, content) => {
    downloadCsv(defaultName, content);
    return { ok: true, data: defaultName };
  },
};

export function getInventoryApi(): InventoryApi {
  if (typeof window !== 'undefined' && window.inventoryApi) {
    return window.inventoryApi;
  }
  return browserApi;
}
