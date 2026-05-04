import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { budgetsRepo } from '../db/repositories/budgets'
import { statsRepo } from '../db/repositories/stats'
import type {
  BudgetBulkUpsertInput,
  BudgetCopyInput,
  BudgetCreateInput,
  BudgetListFilter,
  BudgetUpdateInput,
  BudgetVsActualInput
} from '../../shared/types'

export function registerBudgetHandlers(): void {
  ipcMain.handle(IPC.BUDGET_LIST, (_e, filter?: BudgetListFilter) =>
    budgetsRepo.list(filter)
  )
  ipcMain.handle(IPC.BUDGET_GET, (_e, id: string) => budgetsRepo.get(id))
  ipcMain.handle(IPC.BUDGET_CREATE, (_e, input: BudgetCreateInput) => budgetsRepo.create(input))
  ipcMain.handle(IPC.BUDGET_UPDATE, (_e, input: BudgetUpdateInput) => budgetsRepo.update(input))
  ipcMain.handle(IPC.BUDGET_DELETE, (_e, id: string) => budgetsRepo.delete(id))
  ipcMain.handle(IPC.BUDGET_COPY_MONTH, (_e, input: BudgetCopyInput) =>
    budgetsRepo.copyMonth(input)
  )
  ipcMain.handle(IPC.BUDGET_BULK_UPSERT, (_e, input: BudgetBulkUpsertInput) =>
    budgetsRepo.bulkUpsert(input)
  )

  ipcMain.handle(IPC.STATS_BUDGET_VS_ACTUAL, (_e, input: BudgetVsActualInput) =>
    statsRepo.budgetVsActual(input)
  )
}
