import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { settingsRepo } from '../db/repositories/settings'

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => settingsRepo.get(key))
  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: unknown) =>
    settingsRepo.set(key, value)
  )
  ipcMain.handle(IPC.SETTINGS_ALL, () => settingsRepo.getAll())
}
