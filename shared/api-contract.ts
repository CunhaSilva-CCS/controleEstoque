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
  UpdateStatus,
  ProductionInput,
  ProductionOrder,
  PurchaseInvoice,
  PurchaseInvoiceInput,
  PurchaseInvoiceUpdateInput,
  Recipe,
  RecipeInput,
  ClientBrand,
  User,
  LoginInput,
  ChangePasswordInput,
  AuthSession,
  LicenseStatus,
} from './types'

export interface EstoqueApi {
  closeApp: () => Promise<ApiResponse<boolean>>
  init: () => Promise<ApiResponse<{ path: string; seeded: boolean }>>
  authStatus: () => Promise<ApiResponse<AuthSession>>
  getLicenseStatus: () => Promise<ApiResponse<LicenseStatus>>
  activateLicense: (licenseKey: string) => Promise<ApiResponse<LicenseStatus>>
  login: (input: LoginInput) => Promise<ApiResponse<AuthSession>>
  logout: () => Promise<ApiResponse<boolean>>
  changePassword: (input: ChangePasswordInput) => Promise<ApiResponse<AuthSession>>
  listUsers: () => Promise<ApiResponse<User[]>>
  createUser: (input: {
    name: string
    username: string
    password: string
    role: 'admin' | 'operador'
  }) => Promise<ApiResponse<User>>
  setUserActive: (id: string, active: boolean) => Promise<ApiResponse<User>>
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
  listPurchaseInvoices: () => Promise<ApiResponse<PurchaseInvoice[]>>
  createPurchaseInvoice: (input: PurchaseInvoiceInput) => Promise<ApiResponse<PurchaseInvoice>>
  updatePurchaseInvoice: (input: PurchaseInvoiceUpdateInput) => Promise<ApiResponse<PurchaseInvoice>>
  listRecipes: () => Promise<ApiResponse<Recipe[]>>
  getRecipe: (productId: string) => Promise<ApiResponse<Recipe | null>>
  saveRecipe: (input: RecipeInput) => Promise<ApiResponse<Recipe>>
  listProductionOrders: () => Promise<ApiResponse<ProductionOrder[]>>
  createProduction: (input: ProductionInput) => Promise<ApiResponse<ProductionOrder>>
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
  exportBackup: () => Promise<ApiResponse<{ saved: boolean; path?: string }>>
  restoreBackup: () => Promise<ApiResponse<{ restored: boolean; path?: string }>>
  getClientBrand: () => Promise<ApiResponse<ClientBrand>>
  saveClientBrand: (input: ClientBrand) => Promise<ApiResponse<ClientBrand>>
  getAppInfo: () => Promise<ApiResponse<{ version: string; dbPath: string; packaged: boolean }>>
  getUpdateStatus: () => Promise<ApiResponse<UpdateStatus>>
  checkForUpdates: () => Promise<ApiResponse<UpdateStatus>>
  installUpdate: () => Promise<ApiResponse<boolean>>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
}
