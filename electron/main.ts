import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  backupDatabase,
  buildReport,
  createCategory,
  createProduct,
  createProduction,
  createPurchaseInvoice,
  createSupplier,
  createUser,
  authenticateUser,
  changePassword,
  getDashboard,
  getDbPath,
  getClientBrand,
  getProduct,
  getRecipeByProductId,
  initDatabase,
  listCategories,
  listMovements,
  listProductionOrders,
  listProducts,
  listPurchaseInvoices,
  listRecipes,
  listSuppliers,
  listUsers,
  markSeedOffered,
  registerMovement,
  restoreDatabase,
  saveClientBrand,
  saveRecipe,
  seedDemoData,
  setProductActive,
  setUserActive,
  updateCategory,
  updateProduct,
  updatePurchaseInvoice,
  updateSupplier,
} from './db'
import { initAutoUpdater, registerUpdateIpc } from './updater'
import { activateLicense, getLicenseStatus, requireValidLicense } from './license'
import {
  captureError,
  initMainTelemetry,
  registerProcessErrorHandlers,
} from './telemetry'
import type {
  ClientBrand,
  MovementFilters,
  MovementInput,
  ProductFilters,
  ProductInput,
  ProductUpdateInput,
  ProductionInput,
  PurchaseInvoiceInput,
  PurchaseInvoiceUpdateInput,
  RecipeInput,
  AuthSession,
  ChangePasswordInput,
  User,
} from '../shared/types'

initMainTelemetry()
registerProcessErrorHandlers()

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, '../public')

let mainWindow: BrowserWindow | null = null
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
let currentUser: User | null = null
const loginAttempts = new Map<string, { failures: number; firstFailureAt: number; blockedUntil: number }>()
const LOGIN_WINDOW_MS = 60_000
const LOGIN_BLOCK_MS = 30_000
const LOGIN_MAX_FAILURES = 5

function normalizeLoginKey(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLocaleLowerCase('pt-BR').slice(0, 120) : ''
}

function assertLoginAllowed(key: string): void {
  const attempt = loginAttempts.get(key)
  if (!attempt) return
  const now = Date.now()
  if (attempt.blockedUntil > now) {
    throw new Error('Muitas tentativas. Aguarde 30 segundos e tente novamente.')
  }
  if (now - attempt.firstFailureAt > LOGIN_WINDOW_MS) loginAttempts.delete(key)
}

function recordLoginFailure(key: string): void {
  const now = Date.now()
  const previous = loginAttempts.get(key)
  const failures = !previous || now - previous.firstFailureAt > LOGIN_WINDOW_MS
    ? 1
    : previous.failures + 1
  loginAttempts.set(key, {
    failures,
    firstFailureAt: previous && now - previous.firstFailureAt <= LOGIN_WINDOW_MS
      ? previous.firstFailureAt
      : now,
    blockedUntil: failures >= LOGIN_MAX_FAILURES ? now + LOGIN_BLOCK_MS : 0,
  })
}

function openTrustedExternalUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return
    void shell.openExternal(url.toString())
  } catch {
    // Ignora URLs inválidas ou protocolos perigosos.
  }
}

function ok<T>(data: T) {
  return { ok: true as const, data }
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false as const, error: message }
}

function requireSession(): User {
  requireValidLicense()
  if (!currentUser) throw new Error('Sessão expirada. Entre novamente.')
  return currentUser
}

function requireUser(): User {
  const user = requireSession()
  if (user.mustChangePassword) throw new Error('Altere a senha antes de continuar')
  return user
}

function requireAdmin(): User {
  const user = requireUser()
  if (user.role !== 'admin') throw new Error('Acesso restrito ao administrador')
  return user
}

function createWindow(): void {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: 'ERP Cortexis Tech · Controle de Estoque',
    backgroundColor: '#ffffff',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: 1,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // Mantém o layout consistente no Windows mesmo com escala de tela alta ou zoom persistido.
  mainWindow.webContents.setZoomFactor(1)
  void mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(1)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openTrustedExternalUrl(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    let allowed = false
    try {
      if (VITE_DEV_SERVER_URL) {
        allowed = new URL(url).origin === new URL(VITE_DEV_SERVER_URL).origin
      } else {
        const appEntry = pathToFileURL(path.join(process.env.DIST!, 'index.html')).toString()
        allowed = url.split('#')[0] === appEntry
      }
    } catch {
      allowed = false
    }
    if (!allowed) {
      event.preventDefault()
      openTrustedExternalUrl(url)
    }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const controlOrMeta = input.control || input.meta
    const zoomShortcut =
      controlOrMeta && ['+', '=', '-', '_', '0'].includes(input.key)
    const devToolsShortcut =
      app.isPackaged &&
      (input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i')))
    if (zoomShortcut || devToolsShortcut) event.preventDefault()
  })
}

function registerIpc(): void {
  ipcMain.handle('app:close', () => {
    setTimeout(() => app.quit(), 50)
    return ok(true)
  })

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
      requireAdmin()
      if (accept) seedDemoData()
      else markSeedOffered()
      return ok(true)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('auth:status', () => {
    const session: AuthSession = { authenticated: Boolean(currentUser), user: currentUser }
    return ok(session)
  })

  ipcMain.handle('license:status', () => ok(getLicenseStatus()))

  ipcMain.handle('license:activate', (_e, licenseKey: string) => {
    try {
      if (typeof licenseKey !== 'string' || licenseKey.length > 4_000) {
        throw new Error('Chave de licença inválida')
      }
      const status = activateLicense(licenseKey)
      if (!status.active) throw new Error(status.reason)
      return ok(status)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('auth:login', (_e, input: { username: string; password: string }) => {
    try {
      requireValidLicense()
      const key = normalizeLoginKey(input?.username)
      assertLoginAllowed(key)
      const password = typeof input?.password === 'string' ? input.password : ''
      const user = authenticateUser(key, password)
      if (!user) {
        recordLoginFailure(key)
        throw new Error('Usuário ou senha inválidos')
      }
      loginAttempts.delete(key)
      currentUser = user
      const session: AuthSession = { authenticated: true, user }
      return ok(session)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('auth:logout', () => {
    currentUser = null
    return ok(true)
  })

  ipcMain.handle('auth:changePassword', (_e, input: ChangePasswordInput) => {
    try {
      const sessionUser = requireSession()
      const user = changePassword(sessionUser.id, input.currentPassword, input.newPassword)
      currentUser = user
      const session: AuthSession = { authenticated: true, user }
      return ok(session)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('users:list', () => {
    try {
      requireAdmin()
      return ok(listUsers())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('users:create', (_e, input: { name: string; username: string; password: string; role: 'admin' | 'operador' }) => {
    try {
      requireAdmin()
      return ok(createUser(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('users:setActive', (_e, id: string, active: boolean) => {
    try {
      requireAdmin()
      return ok(setUserActive(id, active))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('brand:get', () => {
    try {
      return ok(getClientBrand())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('brand:save', (_e, input: ClientBrand) => {
    try {
      requireAdmin()
      return ok(saveClientBrand(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:list', (_e, activeOnly?: boolean) => {
    try {
      requireUser()
      return ok(listCategories(Boolean(activeOnly)))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:create', (_e, input) => {
    try {
      requireUser()
      return ok(createCategory(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('categories:update', (_e, input) => {
    try {
      requireUser()
      return ok(updateCategory(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:list', (_e, activeOnly?: boolean) => {
    try {
      requireUser()
      return ok(listSuppliers(Boolean(activeOnly)))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:create', (_e, input) => {
    try {
      requireUser()
      return ok(createSupplier(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('suppliers:update', (_e, input) => {
    try {
      requireUser()
      return ok(updateSupplier(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:list', (_e, filters?: ProductFilters) => {
    try {
      requireUser()
      return ok(listProducts(filters ?? {}))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:get', (_e, id: string) => {
    try {
      requireUser()
      return ok(getProduct(id))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:create', (_e, input: ProductInput) => {
    try {
      requireUser()
      return ok(createProduct(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:update', (_e, input: ProductUpdateInput) => {
    try {
      requireUser()
      return ok(updateProduct(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('products:setActive', (_e, id: string, active: boolean) => {
    try {
      requireUser()
      return ok(setProductActive(id, active))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('movements:list', (_e, filters?: MovementFilters) => {
    try {
      requireUser()
      return ok(listMovements(filters ?? {}))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('movements:create', (_e, input: MovementInput) => {
    try {
      requireUser()
      return ok(registerMovement(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('invoices:list', () => {
    try {
      requireUser()
      return ok(listPurchaseInvoices())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('invoices:create', (_e, input: PurchaseInvoiceInput) => {
    try {
      requireUser()
      return ok(createPurchaseInvoice(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('invoices:update', (_e, input: PurchaseInvoiceUpdateInput) => {
    try {
      requireUser()
      return ok(updatePurchaseInvoice(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('recipes:list', () => {
    try {
      requireUser()
      return ok(listRecipes())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('recipes:get', (_e, productId: string) => {
    try {
      requireUser()
      return ok(getRecipeByProductId(productId))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('recipes:save', (_e, input: RecipeInput) => {
    try {
      requireUser()
      return ok(saveRecipe(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('production:list', () => {
    try {
      requireUser()
      return ok(listProductionOrders())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('production:create', (_e, input: ProductionInput) => {
    try {
      requireUser()
      return ok(createProduction(input))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('dashboard:get', () => {
    try {
      requireUser()
      return ok(getDashboard())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    'reports:get',
    (_e, type: 'posicao' | 'movimentacoes' | 'baixo' | 'custo-venda', filters?: MovementFilters) => {
      try {
        requireUser()
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
        type: 'posicao' | 'movimentacoes' | 'baixo' | 'custo-venda'
        filters?: MovementFilters
        defaultName: string
      },
    ) => {
      try {
        requireUser()
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

  ipcMain.handle('backup:export', async () => {
    try {
      requireAdmin()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const defaultName = `estoque-copia-${stamp}.db`
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Escolher onde salvar a cópia de segurança',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        buttonLabel: 'Salvar cópia',
        filters: [{ name: 'SQLite', extensions: ['db'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (result.canceled || !result.filePath) {
        return ok({ saved: false })
      }
      await backupDatabase(result.filePath)
      return ok({ saved: true, path: result.filePath })
    } catch (error) {
      captureError(error, { handler: 'backup:export' })
      return fail(error)
    }
  })

  ipcMain.handle('backup:restore', async () => {
    try {
      requireAdmin()
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Restaurar cópia de segurança',
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['db'] }],
      })
      if (result.canceled || !result.filePaths[0]) {
        return ok({ restored: false })
      }

      const confirm = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: ['Cancelar', 'Restaurar'],
        defaultId: 0,
        cancelId: 0,
        title: 'Confirmar restauração',
        message: 'A restauração substitui todos os dados atuais pela cópia selecionada.',
        detail: 'Esta ação não pode ser desfeita. Feche outras operações antes de continuar.',
      })
      if (confirm.response !== 1) {
        return ok({ restored: false })
      }

      const info = restoreDatabase(result.filePaths[0])
      // Reload UI so all pages see the restored data
      mainWindow?.webContents.reload()
      return ok({ restored: true, path: info.path })
    } catch (error) {
      captureError(error, { handler: 'backup:restore' })
      return fail(error)
    }
  })

  ipcMain.handle('app:getInfo', () => {
    try {
      requireUser()
      return ok({
        version: app.getVersion(),
        dbPath: getDbPath(),
        packaged: app.isPackaged,
      })
    } catch (error) {
      return fail(error)
    }
  })

}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  registerUpdateIpc(requireAdmin)
  registerIpc()
  createWindow()
  if (mainWindow) initAutoUpdater(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
