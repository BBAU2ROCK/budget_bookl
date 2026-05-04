import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import * as schema from './schema'

type Db = BetterSQLite3Database<typeof schema>

let _sqlite: Database.Database | null = null
let _db: Db | null = null

export function initDb(): { db: Db; sqlite: Database.Database } {
  if (_db && _sqlite) return { db: _db, sqlite: _sqlite }

  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  const dbPath = join(userData, 'budgetbook.db')

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')

  const db = drizzle(sqlite, { schema })

  _sqlite = sqlite
  _db = db
  return { db, sqlite }
}

export function getDb(): Db {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function getSqlite(): Database.Database {
  if (!_sqlite) throw new Error('Database not initialized. Call initDb() first.')
  return _sqlite
}

export function closeDb(): void {
  if (_sqlite) {
    try {
      _sqlite.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // checkpoint best-effort
    }
    _sqlite.close()
    _sqlite = null
    _db = null
  }
}

/** Force WAL contents to merge into main db file. Useful after seed. */
export function checkpoint(): void {
  if (_sqlite) {
    _sqlite.pragma('wal_checkpoint(PASSIVE)')
  }
}

export function getDbPath(): string {
  return join(app.getPath('userData'), 'budgetbook.db')
}
