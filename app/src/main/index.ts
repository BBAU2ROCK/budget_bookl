import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, closeDb, checkpoint } from './db/client'
import { runMigrations } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { materializeDueRecurrings } from './db/recurring-materializer'
import { registerAllIpcHandlers } from './ipc'
import { refreshFxRates, shouldRunBootRefresh } from './services/fx-refresh'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jwchoo.budgetbook')

  // Database lifecycle: init → migrate → seed (idempotent) → register IPC
  try {
    initDb()
    runMigrations()
    seedIfEmpty()
    const matResult = materializeDueRecurrings()
    if (matResult.created > 0 || matResult.errors.length > 0) {
      console.log(
        `[recurring] materialized ${matResult.created} tx (skipped ${matResult.skipped}, errors ${matResult.errors.length})`
      )
    }
    checkpoint() // force WAL → main so data is visible to external inspectors
    registerAllIpcHandlers()

    // Opt-in FX refresh — runs at most once per 24h, fire-and-forget so a
    // slow or unreachable API never blocks startup.
    if (shouldRunBootRefresh()) {
      refreshFxRates()
        .then((r) => {
          if (r.error) {
            console.warn('[fx-refresh] boot refresh failed:', r.error)
          } else {
            console.log(
              `[fx-refresh] boot refresh ok — ${r.saved}/${r.fetched} rates updated for ${r.baseCurrency} as of ${r.asOf}`
            )
          }
        })
        .catch((err) => console.warn('[fx-refresh] unexpected error:', err))
    }
  } catch (err) {
    console.error('[main] DB initialization failed:', err)
    throw err
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Legacy ping used by the landing page for IPC smoke test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
