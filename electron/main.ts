import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildReport,
  createCategory,
  createInvoice,
  createManufacturingOrder,
  createProduct,
  createSupplier,
  getDashboard,
  getInvoice,
  getProduct,
  getProductRecipe,
  initDatabase,
  listCategories,
  listInvoices,
  listManufacturingOrders,
  listMovements,
  listProducts,
  listSuppliers,
  markSeedOffered,
  registerMovement,
  saveProductRecipe,
  seedDemoData,
  setProductActive,
  updateCategory,
  updateProduct,
  updateSupplier,
} from './db'
import {
  captureError,
  initMainTelemetry,
  registerProcessErrorHandlers,
} from './telemetry'
import type {
  InvoiceInput,
  ManufacturingInput,
  MovementFilters,
  MovementInput,
  ProductFilters,
  ProductInput,
  ProductRecipeInput,
  ProductUpdateInput,
} from '../shared/types'

initMainTelemetry()
registerProcessErrorHandlers()

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, '../public')

let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function ok<T>(data: T) {
  return { ok: true as const, data }
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false as const, error: message }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: 'Controle de Estoque',
    backgroundColor: '#1a2e28',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const devToolsShortcut =
        input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i'))
      if (devToolsShortcut) event.preventDefault()
    })
  }
}

function registerIpc(): void {
  ipcMain.handle('app:init', () => {
    try {
      const info = initDatabase()
      return ok(info)
    } catch (error) {
      captureError(error, { handler: 'app:init' })
      return fail(error)
    }
  })

  ipcMain.handle('app:seed', (_e, accept: boolean) => {
    try {
      if (accept) seedDemoData()
      else markSeedOffered()
      return ok(true)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:list', (_e, activeOnly?: boolean) => {
    try {
      return ok(listCategories(Boolean(activeOnly)))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:create', (_e, input) => {
    try {
      return ok(createCategory(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:update', (_e, input) => {
    try {
      return ok(updateCategory(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:list', (_e, activeOnly?: boolean) => {
    try {
      return ok(listSuppliers(Boolean(activeOnly)))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:create', (_e, input) => {
    try {
      return ok(createSupplier(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:update', (_e, input) => {
    try {
      return ok(updateSupplier(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:list', (_e, filters?: ProductFilters) => {
    try {
      return ok(listProducts(filters ?? {}))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:get', (_e, id: string) => {
    try {
      return ok(getProduct(id))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:create', (_e, input: ProductInput) => {
    try {
      return ok(createProduct(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:update', (_e, input: ProductUpdateInput) => {
    try {
      return ok(updateProduct(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:setActive', (_e, id: string, active: boolean) => {
    try {
      return ok(setProductActive(id, active))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('movements:list', (_e, filters?: MovementFilters) => {
    try {
      return ok(listMovements(filters ?? {}))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('movements:create', (_e, input: MovementInput) => {
    try {
      return ok(registerMovement(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('dashboard:get', () => {
    try {
      return ok(getDashboard())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    'reports:get',
    (_e, type: 'posicao' | 'movimentacoes' | 'baixo', filters?: MovementFilters) => {
      try {
        return ok(buildReport(type, filters ?? {}))
      } catch (error) {
        return fail(error)
      }
    },
  )

  ipcMain.handle(
    'reports:exportCsv',
    async (
      _e,
      payload: {
        type: 'posicao' | 'movimentacoes' | 'baixo'
        filters?: MovementFilters
        defaultName: string
      },
    ) => {
      try {
        const report = buildReport(payload.type, payload.filters ?? {})
        const header = report.columns.join(';')
        const lines = report.rows.map((row) =>
          report.columns
            .map((col) => {
              const raw = row[col]
              const value = raw == null ? '' : String(raw)
              return `"${value.replaceAll('"', '""')}"`
            })
            .join(';'),
        )
        const csv = `\uFEFF${[header, ...lines].join('\n')}`

        const result = await dialog.showSaveDialog(mainWindow!, {
          title: 'Exportar relatório CSV',
          defaultPath: payload.defaultName,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        })

        if (result.canceled || !result.filePath) {
          return ok({ saved: false })
        }

        fs.writeFileSync(result.filePath, csv, 'utf8')
        return ok({ saved: true, path: result.filePath })
      } catch (error) {
        return fail(error)
      }
    },
  )

  ipcMain.handle('invoices:list', () => {
    try {
      return ok(listInvoices())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('invoices:get', (_e, id: string) => {
    try {
      return ok(getInvoice(id))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('invoices:create', (_e, input: InvoiceInput) => {
    try {
      return ok(createInvoice(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('recipes:get', (_e, finishedProductId: string) => {
    try {
      return ok(getProductRecipe(finishedProductId))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('recipes:save', (_e, input: ProductRecipeInput) => {
    try {
      return ok(saveProductRecipe(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('manufacturing:list', () => {
    try {
      return ok(listManufacturingOrders())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('manufacturing:create', (_e, input: ManufacturingInput) => {
    try {
      return ok(createManufacturingOrder(input))
    } catch (error) {
      return fail(error)
    }
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
