import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { goalsRepo } from '../db/repositories/goals'
import { statsRepo } from '../db/repositories/stats'
import type {
  GoalProgressFilter,
  SavingsGoalCreateInput,
  SavingsGoalListFilter,
  SavingsGoalUpdateInput
} from '../../shared/types'

export function registerGoalHandlers(): void {
  ipcMain.handle(IPC.GOAL_LIST, (_e, filter?: SavingsGoalListFilter) =>
    goalsRepo.list(filter)
  )
  ipcMain.handle(IPC.GOAL_GET, (_e, id: string) => goalsRepo.get(id))
  ipcMain.handle(IPC.GOAL_CREATE, (_e, input: SavingsGoalCreateInput) =>
    goalsRepo.create(input)
  )
  ipcMain.handle(IPC.GOAL_UPDATE, (_e, input: SavingsGoalUpdateInput) =>
    goalsRepo.update(input)
  )
  ipcMain.handle(IPC.GOAL_DELETE, (_e, id: string) => goalsRepo.delete(id))
  ipcMain.handle(IPC.GOAL_MARK_ACHIEVED, (_e, id: string) => goalsRepo.markAchieved(id))
  ipcMain.handle(IPC.GOAL_CANCEL, (_e, id: string) => goalsRepo.cancel(id))
  ipcMain.handle(IPC.GOAL_REOPEN, (_e, id: string) => goalsRepo.reopen(id))
  ipcMain.handle(IPC.GOAL_SET_ACCOUNT_LINKS, (_e, goalId: string, accountIds: string[]) =>
    goalsRepo.setAccountLinks(goalId, accountIds)
  )
  ipcMain.handle(IPC.GOAL_SET_TAG_LINKS, (_e, goalId: string, tagIds: string[]) =>
    goalsRepo.setTagLinks(goalId, tagIds)
  )
  ipcMain.handle(IPC.GOAL_REORDER, (_e, goalIds: string[]) => goalsRepo.reorder(goalIds))

  ipcMain.handle(IPC.STATS_GOAL_PROGRESS, (_e, goalId: string) =>
    statsRepo.goalProgress(goalId)
  )
  ipcMain.handle(IPC.STATS_GOAL_PROGRESS_ALL, (_e, filter?: GoalProgressFilter) =>
    statsRepo.goalProgressAll(filter)
  )
}
