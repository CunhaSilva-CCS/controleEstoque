import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { EstoqueApi } from '../shared/api-contract'
import type {
  MovementFilters,
  MovementInput,
  ProductFilters,
  ProductInput,
  ProductUpdateInput,
  ReportType,
  UpdateStatus,
} from '../shared/types'

const api: EstoqueApi = {
  closeApp: () => ipcRenderer.invoke('app:close'),
  init: () => ipcRenderer.invoke('app:init'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  exportSupportPackage: () => ipcRenderer.invoke('diagnostics:exportSupport'),
  activateLicense: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
  login: (input) => ipcRenderer.invoke('auth:login', input),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (input) => ipcRenderer.invoke('auth:changePassword', input),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (input) => ipcRenderer.invoke('users:create', input),
  setUserActive: (id, active) => ipcRenderer.invoke('users:setActive', id, active),
  resetUserPassword: (id, temporaryPassword) =>
    ipcRenderer.invoke('users:resetPassword', id, temporaryPassword),
  seed: (accept: boolean) => ipcRenderer.invoke('app:seed', accept),

  listCategories: (activeOnly?: boolean) => ipcRenderer.invoke('categories:list', activeOnly),
  createCategory: (input) => ipcRenderer.invoke('categories:create', input),
  updateCategory: (input) => ipcRenderer.invoke('categories:update', input),

  listSuppliers: (activeOnly?: boolean) => ipcRenderer.invoke('suppliers:list', activeOnly),
  createSupplier: (input) => ipcRenderer.invoke('suppliers:create', input),
  updateSupplier: (input) => ipcRenderer.invoke('suppliers:update', input),
  listCustomers: (activeOnly?: boolean) => ipcRenderer.invoke('customers:list', activeOnly),
  createCustomer: (input) => ipcRenderer.invoke('customers:create', input),
  updateCustomer: (input) => ipcRenderer.invoke('customers:update', input),

  listProducts: (filters?: ProductFilters) => ipcRenderer.invoke('products:list', filters),
  getProduct: (id: string) => ipcRenderer.invoke('products:get', id),
  createProduct: (input: ProductInput) => ipcRenderer.invoke('products:create', input),
  updateProduct: (input: ProductUpdateInput) => ipcRenderer.invoke('products:update', input),
  setProductActive: (id: string, active: boolean) =>
    ipcRenderer.invoke('products:setActive', id, active),

  listMovements: (filters?: MovementFilters) => ipcRenderer.invoke('movements:list', filters),
  createMovement: (input: MovementInput) => ipcRenderer.invoke('movements:create', input),

  listPurchaseInvoices: () => ipcRenderer.invoke('invoices:list'),
  createPurchaseInvoice: (input) => ipcRenderer.invoke('invoices:create', input),
  updatePurchaseInvoice: (input) => ipcRenderer.invoke('invoices:update', input),
  reversePurchaseInvoice: (input) => ipcRenderer.invoke('invoices:reverse', input),
  listSalesInvoices: () => ipcRenderer.invoke('sales:list'),
  createSalesInvoice: (input) => ipcRenderer.invoke('sales:create', input),
  reverseSalesInvoice: (input) => ipcRenderer.invoke('sales:reverse', input),

  listRecipes: () => ipcRenderer.invoke('recipes:list'),
  getRecipe: (productId: string) => ipcRenderer.invoke('recipes:get', productId),
  saveRecipe: (input) => ipcRenderer.invoke('recipes:save', input),

  listProductionOrders: () => ipcRenderer.invoke('production:list'),
  createProduction: (input) => ipcRenderer.invoke('production:create', input),
  reverseProductionOrder: (input) => ipcRenderer.invoke('production:reverse', input),
  listInventorySessions: () => ipcRenderer.invoke('inventory:list'),
  openInventorySession: (notes?: string) => ipcRenderer.invoke('inventory:open', notes),
  recordInventoryCount: (sessionId: string, productId: string, countedStock: number) =>
    ipcRenderer.invoke('inventory:count', sessionId, productId, countedStock),
  submitInventorySession: (id: string) => ipcRenderer.invoke('inventory:submit', id),
  approveInventorySession: (id: string) => ipcRenderer.invoke('inventory:approve', id),
  cancelInventorySession: (id: string, reason: string) => ipcRenderer.invoke('inventory:cancel', id, reason),

  getDashboard: () => ipcRenderer.invoke('dashboard:get'),

  getReport: (type: ReportType, filters?: MovementFilters) =>
    ipcRenderer.invoke('reports:get', type, filters),

  exportReportCsv: (payload) => ipcRenderer.invoke('reports:exportCsv', payload),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  getClientBrand: () => ipcRenderer.invoke('brand:get'),
  saveClientBrand: (input) => ipcRenderer.invoke('brand:save', input),

  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus) => callback(status)
    ipcRenderer.on('updates:status', listener)
    return () => {
      ipcRenderer.removeListener('updates:status', listener)
    }
  },
}

contextBridge.exposeInMainWorld('estoque', api)

export type { EstoqueApi }
