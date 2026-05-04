import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { accountsRepo } from '../db/repositories/accounts'
import type { AccountCreateInput, AccountUpdateInput } from '../../shared/types'

export function registerAccountHandlers(): void {
  ipcMain.handle(IPC.ACCOUNT_LIST, (_e, includeArchived?: boolean) =>
    accountsRepo.list(includeArchived)
  )
  ipcMain.handle(IPC.ACCOUNT_CREATE, (_e, input: AccountCreateInput) =>
    accountsRepo.create(input)
  )
  ipcMain.handle(IPC.ACCOUNT_UPDATE, (_e, input: AccountUpdateInput) =>
    accountsRepo.update(input)
  )
  ipcMain.handle(IPC.ACCOUNT_DELETE, (_e, id: string) => accountsRepo.delete(id))
  ipcMain.handle(IPC.ACCOUNT_BALANCE, (_e, ids?: string[]) => accountsRepo.balances(ids))
  ipcMain.handle(IPC.ACCOUNT_DISTINCT_ISSUERS, () => accountsRepo.distinctIssuers())
}
