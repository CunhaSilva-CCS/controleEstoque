import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { handlers, initDatabase } from './ipc';

const isDev = !app.isPackaged;

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    title: 'ControleEstoque',
    backgroundColor: '#e8eef2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    await win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await initDatabase(app.getPath('userData'));

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }

  ipcMain.handle('saveCsvFile', async (_event, defaultName: string, content: string) => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Exportar CSV',
        defaultPath: defaultName,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, data: null };
      }
      const fs = await import('node:fs/promises');
      await fs.writeFile(result.filePath, content, 'utf8');
      return { ok: true, data: result.filePath };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao salvar arquivo.',
      };
    }
  });

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
