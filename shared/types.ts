/** Tipos compartilhados entre UI e processo main. */

export type Unit = 'UN' | 'KG' | 'L' | 'CX' | 'MT';

export type MovementType = 'ENTRADA' | 'SAIDA' | 'AJUSTE';

export type ExitReason = 'VENDA' | 'USO_INTERNO' | 'PERDA' | 'OUTRO';

export interface Category {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name?: string | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  unit: Unit;
  min_stock: number;
  quantity_on_hand: number;
  cost_price: number;
  sale_price: number;
  location: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  is_low_stock?: boolean;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_sku: string;
  product_name: string;
  type: MovementType;
  quantity: number;
  balance_before: number;
  balance_after: number;
  unit_cost: number | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  reason: string | null;
  notes: string | null;
  user_label: string;
  created_at: string;
}

export interface ProductInput {
  sku: string;
  name: string;
  description?: string | null;
  category_id?: number | null;
  supplier_id?: number | null;
  unit: Unit;
  min_stock: number;
  cost_price: number;
  sale_price: number;
  location?: string | null;
}

export interface CategoryInput {
  name: string;
  description?: string | null;
}

export interface SupplierInput {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface EntryMovementInput {
  type: 'ENTRADA';
  product_id: number;
  quantity: number;
  unit_cost?: number | null;
  supplier_id?: number | null;
  notes?: string | null;
  user_label?: string;
}

export interface ExitMovementInput {
  type: 'SAIDA';
  product_id: number;
  quantity: number;
  reason: ExitReason;
  notes?: string | null;
  user_label?: string;
}

export interface AdjustMovementInput {
  type: 'AJUSTE';
  product_id: number;
  new_quantity: number;
  reason: string;
  notes?: string | null;
  user_label?: string;
}

export type MovementInput = EntryMovementInput | ExitMovementInput | AdjustMovementInput;

export interface MovementFilters {
  type?: MovementType | '';
  product_id?: number | null;
  supplier_id?: number | null;
  from?: string | null;
  to?: string | null;
}

export interface DashboardData {
  active_products: number;
  total_units: number;
  inventory_cost_value: number;
  inventory_sale_value: number;
  low_stock_count: number;
  critical_products: Product[];
  recent_movements: StockMovement[];
}

export interface ApiResult<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
}

export type ApiResponse<T> = ApiResult<T> | ApiError;

export interface InventoryApi {
  getDashboard: () => Promise<ApiResponse<DashboardData>>;
  listCategories: (includeInactive?: boolean) => Promise<ApiResponse<Category[]>>;
  createCategory: (input: CategoryInput) => Promise<ApiResponse<Category>>;
  updateCategory: (id: number, input: CategoryInput) => Promise<ApiResponse<Category>>;
  setCategoryActive: (id: number, active: boolean) => Promise<ApiResponse<Category>>;
  listSuppliers: (includeInactive?: boolean) => Promise<ApiResponse<Supplier[]>>;
  createSupplier: (input: SupplierInput) => Promise<ApiResponse<Supplier>>;
  updateSupplier: (id: number, input: SupplierInput) => Promise<ApiResponse<Supplier>>;
  setSupplierActive: (id: number, active: boolean) => Promise<ApiResponse<Supplier>>;
  listProducts: (opts?: {
    includeInactive?: boolean;
    search?: string;
    lowStockOnly?: boolean;
  }) => Promise<ApiResponse<Product[]>>;
  createProduct: (input: ProductInput) => Promise<ApiResponse<Product>>;
  updateProduct: (id: number, input: ProductInput) => Promise<ApiResponse<Product>>;
  setProductActive: (id: number, active: boolean) => Promise<ApiResponse<Product>>;
  listMovements: (filters?: MovementFilters) => Promise<ApiResponse<StockMovement[]>>;
  createMovement: (input: MovementInput) => Promise<ApiResponse<StockMovement>>;
  exportInventoryCsv: () => Promise<ApiResponse<string>>;
  exportCriticalCsv: () => Promise<ApiResponse<string>>;
  exportMovementsCsv: (filters?: MovementFilters) => Promise<ApiResponse<string>>;
  saveCsvFile: (defaultName: string, content: string) => Promise<ApiResponse<string | null>>;
}
