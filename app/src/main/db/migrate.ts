import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { getDb } from './client'

/**
 * Run pending migrations.
 * - Dev: <project>/drizzle (next to package.json)
 * - Prod: resources/drizzle (via electron-builder extraResources)
 *
 * Throws (fail-fast) if the folder is missing OR contains no .sql files —
 * a silent skip can otherwise leave production builds running against an
 * outdated schema, producing runtime errors when new columns are accessed.
 */
export function runMigrations(): void {
  const migrationsFolder = app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(app.getAppPath(), 'drizzle')

  if (!existsSync(migrationsFolder)) {
    throw new Error(
      `[db] migrations folder not found: ${migrationsFolder}\n` +
        '빌드에서 drizzle 폴더가 누락되었습니다. electron-builder.yml의 ' +
        'extraResources에 drizzle/ 가 포함되어 있는지 확인하세요.'
    )
  }

  // Sanity check: at least one .sql migration must exist. Empty folder ≠ "schema is up-to-date".
  const sqlFiles = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql'))
  if (sqlFiles.length === 0) {
    throw new Error(
      `[db] migrations folder is empty: ${migrationsFolder}\n` +
        '드리즐 마이그레이션 SQL 파일을 찾을 수 없습니다.'
    )
  }

  const db = getDb()
  migrate(db, { migrationsFolder })
}
