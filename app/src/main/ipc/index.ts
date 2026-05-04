import { app, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDbPath } from '../db/client'
import { registerCurrencyHandlers } from './currencies'
import { registerCategoryHandlers } from './categories'
import { registerTagHandlers } from './tags'
import { registerAccountHandlers } from './accounts'
import { registerTransactionHandlers } from './transactions'
import { registerRecurringHandlers } from './recurring'
import { registerSettingsHandlers } from './settings'
import { registerStatsHandlers } from './stats'
import { registerBackupHandlers } from './backup'
import { registerBudgetHandlers } from './budgets'
import { registerGoalHandlers } from './goals'

export function registerAllIpcHandlers(): void {
  ipcMain.handle(IPC.APP_META, () => ({
    name: app.getName(),
    version: app.getVersion(),
    dbPath: getDbPath(),
    userDataPath: app.getPath('userData'),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node
  }))

  registerCurrencyHandlers()
  registerCategoryHandlers()
  registerTagHandlers()
  registerAccountHandlers()
  registerTransactionHandlers()
  registerRecurringHandlers()
  registerSettingsHandlers()
  registerStatsHandlers()
  registerBackupHandlers()
  registerBudgetHandlers()
  registerGoalHandlers()
}
