import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { categoriesRepo } from '../db/repositories/categories'
import type {
  CategoryCreateInput,
  CategoryReorderInput,
  CategoryUpdateInput
} from '../../shared/types'

export function registerCategoryHandlers(): void {
  ipcMain.handle(IPC.CATEGORY_LIST, (_e, includeArchived?: boolean) =>
    categoriesRepo.list(includeArchived)
  )
  ipcMain.handle(IPC.CATEGORY_TREE, (_e, includeArchived?: boolean) =>
    categoriesRepo.tree(includeArchived)
  )
  ipcMain.handle(IPC.CATEGORY_CREATE, (_e, input: CategoryCreateInput) =>
    categoriesRepo.create(input)
  )
  ipcMain.handle(IPC.CATEGORY_UPDATE, (_e, input: CategoryUpdateInput) =>
    categoriesRepo.update(input)
  )
  ipcMain.handle(IPC.CATEGORY_DELETE, (_e, id: string) => categoriesRepo.delete(id))
  ipcMain.handle(IPC.CATEGORY_REORDER, (_e, input: CategoryReorderInput) =>
    categoriesRepo.reorder(input)
  )
}
