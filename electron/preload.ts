import { contextBridge, ipcRenderer } from 'electron';
import type { InventoryApi } from '../shared/types';

const api: InventoryApi = {
  getDashboard: () => ipcRenderer.invoke('getDashboard'),
  listCategories: (includeInactive) => ipcRenderer.invoke('listCategories', includeInactive),
  createCategory: (input) => ipcRenderer.invoke('createCategory', input),
  updateCategory: (id, input) => ipcRenderer.invoke('updateCategory', id, input),
  setCategoryActive: (id, active) => ipcRenderer.invoke('setCategoryActive', id, active),
  listSuppliers: (includeInactive) => ipcRenderer.invoke('listSuppliers', includeInactive),
  createSupplier: (input) => ipcRenderer.invoke('createSupplier', input),
  updateSupplier: (id, input) => ipcRenderer.invoke('updateSupplier', id, input),
  setSupplierActive: (id, active) => ipcRenderer.invoke('setSupplierActive', id, active),
  listProducts: (opts) => ipcRenderer.invoke('listProducts', opts),
  createProduct: (input) => ipcRenderer.invoke('createProduct', input),
  updateProduct: (id, input) => ipcRenderer.invoke('updateProduct', id, input),
  setProductActive: (id, active) => ipcRenderer.invoke('setProductActive', id, active),
  listMovements: (filters) => ipcRenderer.invoke('listMovements', filters),
  createMovement: (input) => ipcRenderer.invoke('createMovement', input),
  exportInventoryCsv: () => ipcRenderer.invoke('exportInventoryCsv'),
  exportCriticalCsv: () => ipcRenderer.invoke('exportCriticalCsv'),
  exportMovementsCsv: (filters) => ipcRenderer.invoke('exportMovementsCsv', filters),
  saveCsvFile: (defaultName, content) => ipcRenderer.invoke('saveCsvFile', defaultName, content),
};

contextBridge.exposeInMainWorld('inventoryApi', api);
