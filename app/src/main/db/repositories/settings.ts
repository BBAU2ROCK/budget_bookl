import { eq } from 'drizzle-orm'
import { getDb } from '../client'
import { settings } from '../schema'
import type { SettingsValueMap } from '../../../shared/types'

export const settingsRepo = {
  getAll(): Record<string, unknown> {
    const db = getDb()
    const rows = db.select().from(settings).all()
    const out: Record<string, unknown> = {}
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value)
      } catch {
        out[r.key] = r.value
      }
    }
    return out
  },

  get<T = unknown>(key: string): T | undefined {
    const db = getDb()
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    if (!row) return undefined
    try {
      return JSON.parse(row.value) as T
    } catch {
      return row.value as unknown as T
    }
  },

  /** Typed convenience wrapper — use this for known setting keys */
  getTyped<K extends keyof SettingsValueMap>(key: K): SettingsValueMap[K] | undefined {
    return this.get<SettingsValueMap[K]>(key)
  },

  set(key: string, value: unknown): void {
    const db = getDb()
    const valueJson = JSON.stringify(value)
    db.insert(settings)
      .values({ key, value: valueJson })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: valueJson, updatedAt: new Date() }
      })
      .run()
  },

  /** Convenience: get base currency with KRW fallback. */
  getBaseCurrency(): string {
    return this.get<string>('baseCurrency') ?? 'KRW'
  }
}
