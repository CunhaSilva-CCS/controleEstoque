const { app, BrowserWindow, clipboard, dialog, ipcMain, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createPublicKey, randomUUID, sign, verify } = require('node:crypto')

let mainWindow = null
let selectedPrivateKeyPath = ''
const expectedPublicKey = fs.readFileSync(path.join(__dirname, 'expected-public-key.pem'), 'utf8')
const appPageUrl = pathToFileURL(path.join(__dirname, 'index.html')).toString()

function ok(data) { return { ok: true, data } }
function fail(error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }

function trusted(event) {
  const url = event.senderFrame?.url || event.sender.getURL()
  if (url.split('#')[0] !== appPageUrl) throw new Error('Origem não autorizada')
}

function validatePrivateKey(filePath) {
  const privateKey = fs.readFileSync(filePath)
  const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()
  if (derived.trim() !== expectedPublicKey.trim()) {
    throw new Error('Esta chave privada não corresponde ao ERP distribuído')
  }
  return privateKey
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 650,
    title: 'Gerador de Licenças Cortexis',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#071b26',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== appPageUrl) event.preventDefault()
  })
}

ipcMain.handle('key:select', async (event) => {
  try {
    trusted(event)
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar chave privada de licenciamento',
      properties: ['openFile'],
      filters: [{ name: 'Chave privada PEM', extensions: ['pem'] }],
    })
    if (result.canceled || !result.filePaths[0]) return ok({ selected: false })
    validatePrivateKey(result.filePaths[0])
    selectedPrivateKeyPath = result.filePaths[0]
    return ok({ selected: true, name: path.basename(selectedPrivateKeyPath) })
  } catch (error) { return fail(error) }
})

ipcMain.handle('license:generate', (event, input) => {
  try {
    trusted(event)
    if (!selectedPrivateKeyPath) throw new Error('Selecione a chave privada')
    const privateKey = validatePrivateKey(selectedPrivateKeyPath)
    const customer = String(input?.customer || '').trim()
    const installationId = String(input?.installationId || '').trim()
    const edition = input?.edition
    const perpetual = Boolean(input?.perpetual)
    const days = Number(input?.days)
    if (!customer || customer.length > 120) throw new Error('Informe um cliente válido')
    if (!installationId || installationId.length > 120) throw new Error('Informe o código da instalação')
    if (edition !== 'standard' && edition !== 'professional') throw new Error('Selecione a edição')
    if (!perpetual && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new Error('A validade deve estar entre 1 e 3650 dias')
    const issued = new Date()
    const payload = {
      version: 1,
      licenseId: randomUUID(),
      installationId,
      customer,
      edition,
      issuedAt: issued.toISOString(),
      expiresAt: perpetual ? null : new Date(issued.getTime() + days * 86400000).toISOString(),
    }
    const payloadBuffer = Buffer.from(JSON.stringify(payload))
    const signature = sign(null, payloadBuffer, privateKey)
    if (!verify(null, payloadBuffer, expectedPublicKey, signature)) throw new Error('Falha ao validar a licença gerada')
    const licenseKey = `CTX1-${payloadBuffer.toString('base64url')}.${signature.toString('base64url')}`
    return ok({ licenseKey, details: payload })
  } catch (error) { return fail(error) }
})

ipcMain.handle('license:save', async (event, licenseKey, customer) => {
  try {
    trusted(event)
    if (typeof licenseKey !== 'string' || !licenseKey.startsWith('CTX1-')) throw new Error('Gere uma licença primeiro')
    const safeName = String(customer || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar licença',
      defaultPath: `${safeName || 'cliente'}.license`,
      filters: [{ name: 'Licença Cortexis', extensions: ['license'] }],
    })
    if (result.canceled || !result.filePath) return ok({ saved: false })
    fs.writeFileSync(result.filePath, `${licenseKey}\n`, { encoding: 'utf8', mode: 0o600 })
    return ok({ saved: true, path: result.filePath })
  } catch (error) { return fail(error) }
})

ipcMain.handle('clipboard:copy', (event, value) => {
  try { trusted(event); clipboard.writeText(String(value || '')); return ok(true) } catch (error) { return fail(error) }
})

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
