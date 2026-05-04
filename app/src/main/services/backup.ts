import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { closeDb, getDbPath, getSqlite, initDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import type { BackupExportResult, BackupImportResult } from '../../shared/types'

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export async function exportDbBackup(): Promise<BackupExportResult | null> {
  // Checkpoint WAL first so the main .db file has the latest state.
  // pragma('wal_checkpoint(FULL)') 는 (busy, log_pages, checkpointed_pages) 튜플을 반환.
  // busy=-1이면 다른 connection이 잡고 있어 부분 체크포인트만 됨 → 백업이 옛 상태일 수 있음.
  const sqlite = getSqlite()
  try {
    const result = sqlite.pragma('wal_checkpoint(FULL)') as Array<{
      busy: number
      log: number
      checkpointed: number
    }>
    if (result?.[0]?.busy === 1) {
      // eslint-disable-next-line no-console
      console.warn(
        '[backup] wal_checkpoint(FULL) busy — 백업이 일부 옛 상태를 반영할 수 있음'
      )
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[backup] wal_checkpoint failed:', (e as Error).message)
  }

  const focused = BrowserWindow.getFocusedWindow()
  const { canceled, filePath } = await dialog.showSaveDialog(focused ?? undefined!, {
    title: 'BudgetBook DB 백업',
    defaultPath: `budgetbook-backup-${stamp()}.db`,
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  })
  if (canceled || !filePath) return null

  copyFileSync(getDbPath(), filePath)
  const size = statSync(filePath).size
  return { savedPath: filePath, sizeBytes: size }
}

export async function importDbBackup(): Promise<BackupImportResult | null> {
  const focused = BrowserWindow.getFocusedWindow()
  const { canceled, filePaths } = await dialog.showOpenDialog(focused ?? undefined!, {
    title: '백업 파일 선택',
    properties: ['openFile'],
    filters: [{ name: 'SQLite DB', extensions: ['db'] }]
  })
  if (canceled || filePaths.length === 0) return null
  const sourcePath = filePaths[0]

  if (!existsSync(sourcePath)) throw new Error(`파일을 찾을 수 없습니다: ${sourcePath}`)

  const confirmed = await dialog.showMessageBox(focused ?? undefined!, {
    type: 'warning',
    buttons: ['취소', '현재 DB를 교체'],
    defaultId: 0,
    cancelId: 0,
    title: 'DB 복원',
    message: '현재 데이터를 백업 파일로 교체합니다.',
    detail: '기존 DB는 자동으로 안전 백업됩니다. 계속하시겠습니까?'
  })
  if (confirmed.response !== 1) return null

  const dbPath = getDbPath()
  const safeBackupPath = join(app.getPath('userData'), `budgetbook.pre-restore-${stamp()}.db`)

  // Close DB, take safety backup, copy source over, reopen
  closeDb()
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, safeBackupPath)
  }
  copyFileSync(sourcePath, dbPath)

  // Reopen and run migrations to ensure schema is current.
  // 만약 백업이 옛 스키마/다른 앱 DB라 마이그레이션이 실패하면, 안전 백업으로 자동 복원해
  // 사용자가 영구 손실을 피하도록 한다.
  try {
    initDb()
    runMigrations()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[backup] importDbBackup migration failed, rolling back:', e)
    try {
      closeDb()
    } catch {
      // best-effort
    }
    if (existsSync(safeBackupPath)) {
      copyFileSync(safeBackupPath, dbPath)
      initDb() // 안전 백업으로 다시 열기 — 원래 스키마이므로 마이그레이션 추가 불필요
    }
    throw new Error(
      `백업 파일이 유효하지 않아 원래 데이터로 복원했습니다. 원인: ${(e as Error).message}`
    )
  }

  const size = statSync(dbPath).size
  return {
    replacedPath: dbPath,
    previousBackupPath: safeBackupPath,
    restoredSizeBytes: size
  }
}
