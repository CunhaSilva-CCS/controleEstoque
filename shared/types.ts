export type ProductStatus = 'ok' | 'low' | 'zero'
export type MovementType = 'entrada' | 'saida' | 'ajuste'

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
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
  initialStock?: number
}

export interface ProductUpdateInput {
  id: string
  sku: string
  name: string
  description?: string
  categoryId?: string | null
  supplierId?: string | null
  unit: string
  costPrice: number
  salePrice: number
  minStock: number
}

export interface MovementInput {
  productId: string
  type: MovementType
  quantity: number
  reason: string
  reference?: string
  /** Used only for type=ajuste: absolute new stock */
  newStock?: number
}

export interface ProductFilters {
  search?: string
  categoryId?: string
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

export interface InvoiceItem {
  id: string
  invoiceId: string
  productId: string
  quantity: number
  unitCost: number
  productName?: string
  productSku?: string
}

export interface Invoice {
  id: string
  number: string
  supplierId: string | null
  issueDate: string
  notes: string
  createdAt: string
  supplierName?: string | null
  items?: InvoiceItem[]
  itemCount?: number
  totalValue?: number
}

export interface InvoiceItemInput {
  productId: string
  quantity: number
  unitCost?: number
}

export interface InvoiceInput {
  number: string
  supplierId?: string | null
  issueDate: string
  notes?: string
  items: InvoiceItemInput[]
}

export interface ProductRecipeItem {
  id: string
  finishedProductId: string
  materialProductId: string
  quantity: number
  materialName?: string
  materialSku?: string
  materialUnit?: string
  materialStock?: number
}

export interface ProductRecipeInput {
  finishedProductId: string
  items: { materialProductId: string; quantity: number }[]
}

export interface ManufacturingOrder {
  id: string
  finishedProductId: string
  quantity: number
  notes: string
  createdAt: string
  finishedProductName?: string
  finishedProductSku?: string
}

export interface ManufacturingInput {
  finishedProductId: string
  quantity: number
  notes?: string
}

export interface ApiResult<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: string
}

export type ApiResponse<T> = ApiResult<T> | ApiError
