export interface SettingsValueMap {
  baseCurrency: string
  locale: string
  theme: 'light' | 'dark' | 'system'
  firstDayOfMonth: number // 1-28
  firstDayOfWeek: number // 0=Sun..6=Sat
  /**
   * When true, the app fetches the latest exchange rates from a public API
   * (open.er-api.com) on launch, no more than once per 24h. Off-by-default
   * to preserve the offline-first contract — user must opt in explicitly.
   */
  autoFxRefreshEnabled: boolean
  /** ISO timestamp of the last successful auto-refresh. */
  autoFxRefreshLastRunAt: string | null
}

export type SettingsKey = keyof SettingsValueMap | string

export interface SettingsEntry<K extends SettingsKey = SettingsKey> {
  key: K
  value: K extends keyof SettingsValueMap ? SettingsValueMap[K] : unknown
}
