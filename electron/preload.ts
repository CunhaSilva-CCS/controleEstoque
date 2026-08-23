import { contextBridge, ipcRenderer } from 'electron'
import type { EstoqueApi } from '../shared/api-contract'
import type {
  InvoiceInput,
  ManufacturingInput,
  MovementFilters,
  MovementInput,
  ProductFilters,
  ProductInput,
  ProductRecipeInput,
  ProductUpdateInput,
  ReportType,
} from '../shared/types'

const api: EstoqueApi = {
  init: () => ipcRenderer.invoke('app:init'),
  seed: (accept: boolean) => ipcRenderer.invoke('app:seed', accept),

  listCategories: (activeOnly?: boolean) => ipcRenderer.invoke('categories:list', activeOnly),
  createCategory: (input) => ipcRenderer.invoke('categories:create', input),
  updateCategory: (input) => ipcRenderer.invoke('categories:update', input),

  listSuppliers: (activeOnly?: boolean) => ipcRenderer.invoke('suppliers:list', activeOnly),
  createSupplier: (input) => ipcRenderer.invoke('suppliers:create', input),
  updateSupplier: (input) => ipcRenderer.invoke('suppliers:update', input),

  listProducts: (filters?: ProductFilters) => ipcRenderer.invoke('products:list', filters),
  getProduct: (id: string) => ipcRenderer.invoke('products:get', id),
  createProduct: (input: ProductInput) => ipcRenderer.invoke('products:create', input),
  updateProduct: (input: ProductUpdateInput) => ipcRenderer.invoke('products:update', input),
  setProductActive: (id: string, active: boolean) =>
    ipcRenderer.invoke('products:setActive', id, active),

  listMovements: (filters?: MovementFilters) => ipcRenderer.invoke('movements:list', filters),
  createMovement: (input: MovementInput) => ipcRenderer.invoke('movements:create', input),

  getDashboard: () => ipcRenderer.invoke('dashboard:get'),

  getReport: (type: ReportType, filters?: MovementFilters) =>
    ipcRenderer.invoke('reports:get', type, filters),

  exportReportCsv: (payload) => ipcRenderer.invoke('reports:exportCsv', payload),

  listInvoices: () => ipcRenderer.invoke('invoices:list'),
  getInvoice: (id: string) => ipcRenderer.invoke('invoices:get', id),
  createInvoice: (input: InvoiceInput) => ipcRenderer.invoke('invoices:create', input),

  getProductRecipe: (finishedProductId: string) =>
    ipcRenderer.invoke('recipes:get', finishedProductId),
  saveProductRecipe: (input: ProductRecipeInput) => ipcRenderer.invoke('recipes:save', input),

  listManufacturingOrders: () => ipcRenderer.invoke('manufacturing:list'),
  createManufacturingOrder: (input: ManufacturingInput) =>
    ipcRenderer.invoke('manufacturing:create', input),
}

contextBridge.exposeInMainWorld('estoque', api)

export type { EstoqueApi }
