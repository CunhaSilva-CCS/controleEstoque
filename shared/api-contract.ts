import type {
  ApiResponse,
  Category,
  DashboardData,
  MovementFilters,
  MovementInput,
  Product,
  ProductFilters,
  ProductInput,
  ProductUpdateInput,
  ReportType,
  StockMovement,
  Supplier,
} from './types'

export interface EstoqueApi {
  init: () => Promise<ApiResponse<{ path: string; seeded: boolean }>>
  seed: (accept: boolean) => Promise<ApiResponse<boolean>>
  listCategories: (activeOnly?: boolean) => Promise<ApiResponse<Category[]>>
  createCategory: (input: {
    name: string
    description?: string
  }) => Promise<ApiResponse<Category>>
  updateCategory: (input: {
    id: string
    name: string
    description?: string
    active: boolean
  }) => Promise<ApiResponse<Category>>
  listSuppliers: (activeOnly?: boolean) => Promise<ApiResponse<Supplier[]>>
  createSupplier: (input: {
    name: string
    document?: string
    phone?: string
    email?: string
    notes?: string
  }) => Promise<ApiResponse<Supplier>>
  updateSupplier: (input: {
    id: string
    name: string
    document?: string
    phone?: string
    email?: string
    notes?: string
    active: boolean
  }) => Promise<ApiResponse<Supplier>>
  listProducts: (filters?: ProductFilters) => Promise<ApiResponse<Product[]>>
  getProduct: (id: string) => Promise<ApiResponse<Product | null>>
  createProduct: (input: ProductInput) => Promise<ApiResponse<Product>>
  updateProduct: (input: ProductUpdateInput) => Promise<ApiResponse<Product>>
  setProductActive: (id: string, active: boolean) => Promise<ApiResponse<Product>>
  listMovements: (filters?: MovementFilters) => Promise<ApiResponse<StockMovement[]>>
  createMovement: (input: MovementInput) => Promise<ApiResponse<StockMovement>>
  getDashboard: () => Promise<ApiResponse<DashboardData>>
  getReport: (
    type: ReportType,
    filters?: MovementFilters,
  ) => Promise<
    ApiResponse<{ columns: string[]; rows: Record<string, string | number | boolean | null>[] }>
  >
  exportReportCsv: (payload: {
    type: ReportType
    filters?: MovementFilters
    defaultName: string
  }) => Promise<ApiResponse<{ saved: boolean; path?: string }>>
}
