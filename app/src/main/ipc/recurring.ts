import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { recurringRepo } from '../db/repositories/recurring'
import { materializeDueRecurrings } from '../db/recurring-materializer'
import type {
  RecurringCreateInput,
  RecurringPreviewInput,
  RecurringUpdateInput
} from '../../shared/types'

export function registerRecurringHandlers(): void {
  ipcMain.handle(IPC.RECURRING_LIST, (_e, includeInactive?: boolean) =>
    recurringRepo.list(includeInactive)
  )
  ipcMain.handle(IPC.RECURRING_CREATE, (_e, input: RecurringCreateInput) =>
    recurringRepo.create(input)
  )
  ipcMain.handle(IPC.RECURRING_UPDATE, (_e, input: RecurringUpdateInput) =>
    recurringRepo.update(input)
  )
  ipcMain.handle(IPC.RECURRING_DELETE, (_e, id: string) => recurringRepo.delete(id))
  ipcMain.handle(IPC.RECURRING_PREVIEW, (_e, input: RecurringPreviewInput) =>
    recurringRepo.preview(input)
  )
  ipcMain.handle(IPC.RECURRING_GENERATE_DUE, () => materializeDueRecurrings())
}
