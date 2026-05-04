import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { currenciesRepo } from '../db/repositories/currencies'
import { refreshFxRates } from '../services/fx-refresh'
import type {
  CurrencyCreateInput,
  CurrencyUpdateInput,
  ExchangeRateUpsertInput
} from '../../shared/types'

export function registerCurrencyHandlers(): void {
  ipcMain.handle(IPC.CURRENCY_LIST, () => currenciesRepo.list())
  ipcMain.handle(IPC.CURRENCY_CREATE, (_e, input: CurrencyCreateInput) => currenciesRepo.create(input))
  ipcMain.handle(IPC.CURRENCY_UPDATE, (_e, input: CurrencyUpdateInput) => currenciesRepo.update(input))
  ipcMain.handle(IPC.CURRENCY_DELETE, (_e, code: string) => currenciesRepo.delete(code))

  ipcMain.handle(IPC.FX_LIST, () => currenciesRepo.listRates())
  ipcMain.handle(IPC.FX_UPSERT, (_e, input: ExchangeRateUpsertInput) =>
    currenciesRepo.upsertRate(input)
  )
  ipcMain.handle(IPC.FX_DELETE, (_e, id: string) => currenciesRepo.deleteRate(id))
  ipcMain.handle(IPC.FX_AUTO_REFRESH, () => refreshFxRates())
}
