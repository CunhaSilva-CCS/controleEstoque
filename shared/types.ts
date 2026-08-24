export type ProductStatus = 'ok' | 'low' | 'zero'
export type ProductKind = 'insumo' | 'acabado'
export type MovementType = 'entrada' | 'saida' | 'ajuste'
export type MovementOrigin =
  | 'fatura'
  | 'fabricacao_consumo'
  | 'fabricacao_producao'
  | 'ajuste'
  | 'seed'
  | 'legacy'

export interface Category {
  id: string
  name: string
  description: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  name: string
  document: string
  phone: string
  email: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string
  categoryId: string | null
  supplierId: string | null
  kind: ProductKind
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
  stock: number
  active: boolean
  createdAt: string
  updatedAt: string
  categoryName?: string | null
  supplierName?: string | null
  status?: ProductStatus
  stockValue?: number
}

export interface StockMovement {
  id: string
  productId: string
  type: MovementType
  quantity: number
  previousStock: number
  newStock: number
  reason: string
  reference: string
  origin: MovementOrigin
  createdAt: string
  productName?: string
  productSku?: string
}

export interface ProductInput {
  sku: string
  name: string
  description?: string
  categoryId?: string | null
  supplierId?: string | null
  kind?: ProductKind
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
  /** Ignorado: estoque entra somente via fatura ou fabricação */
  initialStock?: number
}

export interface ProductUpdateInput {
  id: string
  sku: string
  name: string
  description?: string
  categoryId?: string | null
  supplierId?: string | null
  kind: ProductKind
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
}

export interface MovementInput {
  productId: string
  type: 'ajuste'
  quantity: number
  reason: string
  reference?: string
  /** Used only for type=ajuste: absolute new stock */
  newStock?: number
}

export interface PurchaseInvoiceItemInput {
  productId: string
  quantity: number
  unitCost: number
}

export interface PurchaseInvoiceInput {
  number: string
  supplierId?: string | null
  issueDate: string
  notes?: string
  items: PurchaseInvoiceItemInput[]
}

export interface PurchaseInvoiceItem {
  id: string
  productId: string
  productName: string
  productSku: string
  quantity: number
  unitCost: number
}

export interface PurchaseInvoice {
  id: string
  number: string
  supplierId: string | null
  supplierName: string | null
  issueDate: string
  notes: string
  createdAt: string
  items: PurchaseInvoiceItem[]
}

export interface RecipeItemInput {
  productId: string
  quantity: number
}

export interface RecipeInput {
  productId: string
  notes?: string
  items: RecipeItemInput[]
}

export interface RecipeItem {
  id: string
  productId: string
  productName: string
  productSku: string
  quantity: number
}

export interface Recipe {
  id: string
  productId: string
  productName: string
  productSku: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
  items: RecipeItem[]
}

export interface ProductionInput {
  productId: string
  quantity: number
  notes?: string
}

export interface ProductionOrder {
  id: string
  recipeId: string
  productId: string
  productName: string
  productSku: string
  quantity: number
  notes: string
  createdAt: string
}

export interface ProductFilters {
  search?: string
  categoryId?: string
  kind?: ProductKind
  active?: boolean
  lowStockOnly?: boolean
}

export interface MovementFilters {
  productId?: string
  type?: MovementType
  from?: string
  to?: string
}

export interface DashboardData {
  activeProducts: number
  totalStockValue: number
  lowStockCount: number
  zeroStockCount: number
  movementsToday: number
  criticalProducts: Product[]
  recentMovements: StockMovement[]
}

export interface ReportRow {
  [key: string]: string | number | boolean | null
}

export type ReportType = 'posicao' | 'movimentacoes' | 'baixo'

export interface ApiResult<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
}

export type ApiResponse<T> = ApiResult<T> | ApiError

export interface ClientBrand {
  name: string
  logoDataUrl: string
}

export type UserRole = 'admin' | 'operador'

export interface User {
  id: string
  name: string
  username: string
  role: UserRole
  active: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginInput {
  username: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface AuthSession {
  authenticated: boolean
  user: User | null
}

export type LicenseEdition = 'standard' | 'professional'

export interface LicenseDetails {
  version: 1
  licenseId: string
  installationId: string
  customer: string
  edition: LicenseEdition
  issuedAt: string
  expiresAt: string | null
}

export type LicenseStatus =
  | { active: true; details: LicenseDetails }
  | { active: false; reason: string; installationId: string }

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: string }
