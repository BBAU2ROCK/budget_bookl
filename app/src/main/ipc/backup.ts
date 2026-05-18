import { app, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { exportDbBackup, importDbBackup } from '../services/backup'
import { exportTransactionsCsv, importTransactionsCsv } from '../services/csv'
import { exportBudgetXlsx } from '../services/budget-export'
import { resetAllAndReseed, resetTransactionsOnly } from '../services/reset'
import type { BudgetExportInput, CsvExportInput } from '../../shared/types'

export function registerBackupHandlers(): void {
  ipcMain.handle(IPC.BACKUP_EXPORT_DB, () => exportDbBackup())
  ipcMain.handle(IPC.BACKUP_IMPORT_DB, () => importDbBackup())
  ipcMain.handle(IPC.EXPORT_TRANSACTIONS_CSV, (_e, input: CsvExportInput) =>
    exportTransactionsCsv(input)
  )
  ipcMain.handle(IPC.IMPORT_TRANSACTIONS_CSV, () => importTransactionsCsv())
  ipcMain.handle(IPC.EXPORT_BUDGET_XLSX, (_e, input: BudgetExportInput) =>
    exportBudgetXlsx(input)
  )

  ipcMain.handle(IPC.RESET_TRANSACTIONS, () => resetTransactionsOnly())
  ipcMain.handle(IPC.RESET_ALL, () => resetAllAndReseed())

  ipcMain.handle(IPC.APP_RELAUNCH, () => {
    app.relaunch()
    app.exit(0)
  })
}
