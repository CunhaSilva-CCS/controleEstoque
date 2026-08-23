import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled'; reason: string }

let status: UpdateStatus = { state: 'idle' }
let mainWindow: BrowserWindow | null = null

function emit(next: UpdateStatus): void {
  status = next
  mainWindow?.webContents.send('updates:status', next)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  if (!app.isPackaged) {
    status = { state: 'disabled', reason: 'Atualizações automáticas só em builds empacotados' }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    emit({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    emit({ state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    emit({ state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emit({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    emit({ state: 'error', message: error instanceof Error ? error.message : String(error) })
  })

  // Check shortly after launch
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error) => {
      emit({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  }, 4_000)
}

export function registerUpdateIpc(): void {
  const ok = <T,>(data: T) => ({ ok: true as const, data })
  const fail = (error: unknown) => ({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  })

  ipcMain.handle('updates:getStatus', () => ok(status))

  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) {
      const disabled: UpdateStatus = {
        state: 'disabled',
        reason: 'Atualizações automáticas só em builds empacotados',
      }
      emit(disabled)
      return ok(disabled)
    }
    try {
      emit({ state: 'checking' })
      await autoUpdater.checkForUpdates()
      return ok(status)
    } catch (error) {
      const next: UpdateStatus = {
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
      emit(next)
      return ok(next)
    }
  })

  ipcMain.handle('updates:install', () => {
    try {
      if (status.state !== 'downloaded') {
        throw new Error('Nenhuma atualização baixada para instalar')
      }
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
      return ok(true)
    } catch (error) {
      return fail(error)
    }
  })
}
