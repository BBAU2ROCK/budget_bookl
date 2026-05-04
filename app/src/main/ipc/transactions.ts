import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { transactionsRepo } from '../db/repositories/transactions'
import type {
  TransactionCreateInput,
  TransactionFilter,
  TransactionUpdateInput
} from '../../shared/types'

export function registerTransactionHandlers(): void {
  ipcMain.handle(IPC.TRANSACTION_LIST, (_e, filter?: TransactionFilter) =>
    transactionsRepo.list(filter)
  )
  ipcMain.handle(IPC.TRANSACTION_GET, (_e, id: string) => transactionsRepo.get(id))
  ipcMain.handle(IPC.TRANSACTION_CREATE, (_e, input: TransactionCreateInput) =>
    transactionsRepo.create(input)
  )
  ipcMain.handle(IPC.TRANSACTION_UPDATE, (_e, input: TransactionUpdateInput) =>
    transactionsRepo.update(input)
  )
  ipcMain.handle(IPC.TRANSACTION_DELETE, (_e, id: string) => transactionsRepo.delete(id))
  ipcMain.handle(IPC.TRANSACTION_DISTINCT_DISCOUNT_REASONS, () =>
    transactionsRepo.distinctDiscountReasons()
  )
}
