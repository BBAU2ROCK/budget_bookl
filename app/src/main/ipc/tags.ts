import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { tagsRepo } from '../db/repositories/tags'
import type { TagCreateInput, TagUpdateInput } from '../../shared/types'

export function registerTagHandlers(): void {
  ipcMain.handle(IPC.TAG_LIST, (_e, includeArchived?: boolean) => tagsRepo.list(includeArchived))
  ipcMain.handle(IPC.TAG_CREATE, (_e, input: TagCreateInput) => tagsRepo.create(input))
  ipcMain.handle(IPC.TAG_UPDATE, (_e, input: TagUpdateInput) => tagsRepo.update(input))
  ipcMain.handle(IPC.TAG_DELETE, (_e, id: string) => tagsRepo.delete(id))
  ipcMain.handle(IPC.TAG_USAGE_COUNTS, (_e, ids?: string[]) => tagsRepo.usageCounts(ids))
  ipcMain.handle(IPC.TAG_MERGE, (_e, sourceId: string, targetId: string) =>
    tagsRepo.merge(sourceId, targetId)
  )
}
