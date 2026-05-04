import { net } from 'electron'
import { currenciesRepo } from '../db/repositories/currencies'
import { settingsRepo } from '../db/repositories/settings'

/**
 * Pull the latest exchange rates from a free public API and upsert them into
 * the local exchange_rates table.
 *
 * Design notes:
 * - The app is offline-first; this is opt-in (settings.autoFxRefreshEnabled).
 * - We use Electron's built-in `net` module so requests respect the user's
 *   system proxy settings and don't drag in an external HTTP library.
 * - The endpoint chosen is open.er-api.com — free, no API key, daily updates,
 *   ~150 currency codes.
 * - Errors never bubble up to crash the boot sequence; they are returned in
 *   the result object so the caller can surface a toast if desired.
 */

const API_BASE = 'https://open.er-api.com/v6/latest'
/** Hard-cap so a slow / hung server can't block app startup forever. */
const REQUEST_TIMEOUT_MS = 10_000

interface ApiResponse {
  result: 'success' | string
  base_code: string
  rates: Record<string, number>
  time_last_update_unix: number
}

export interface FxRefreshResult {
  /** The base currency the API was queried against. */
  baseCurrency: string
  /** Total currency codes returned by the API. */
  fetched: number
  /** How many local currencies were updated with a fresh rate. */
  saved: number
  /** Local currencies skipped because the API didn't have a rate for them. */
  skipped: number
  /** ISO date used as `as_of` for inserted rows. */
  asOf: string
  /** Populated only on failure. */
  error?: string
}

export async function refreshFxRates(): Promise<FxRefreshResult> {
  const baseCurrency = settingsRepo.getBaseCurrency()
  const url = `${API_BASE}/${encodeURIComponent(baseCurrency)}`
  const today = new Date().toISOString().slice(0, 10)

  const result: FxRefreshResult = {
    baseCurrency,
    fetched: 0,
    saved: 0,
    skipped: 0,
    asOf: today
  }

  try {
    const data = await fetchJson<ApiResponse>(url)
    if (data.result !== 'success' || typeof data.rates !== 'object') {
      result.error = `API returned non-success: ${data.result ?? 'unknown'}`
      return result
    }
    result.fetched = Object.keys(data.rates).length

    const allCurrencies = currenciesRepo.list()
    for (const c of allCurrencies) {
      if (!c.isActive) continue
      if (c.code === baseCurrency) continue
      // API gives base→target; we want to store target→base for convenience.
      const baseToTarget = data.rates[c.code]
      if (typeof baseToTarget !== 'number' || !Number.isFinite(baseToTarget) || baseToTarget <= 0) {
        result.skipped++
        continue
      }
      const targetToBase = 1 / baseToTarget
      currenciesRepo.upsertRate({
        fromCurrency: c.code,
        toCurrency: baseCurrency,
        rate: targetToBase,
        asOf: today,
        source: 'api'
      })
      result.saved++
    }

    settingsRepo.set('autoFxRefreshLastRunAt', new Date().toISOString())
  } catch (err) {
    result.error = (err as Error).message
  }

  return result
}

/**
 * Decide whether the boot-time refresh should run.
 *
 * - Only when explicitly enabled in settings.
 * - At most once per ~24h (the API itself updates daily, and we don't want
 *   to hit it on every restart of a long-running session).
 */
export function shouldRunBootRefresh(): boolean {
  const enabled = settingsRepo.get<boolean>('autoFxRefreshEnabled') ?? false
  if (!enabled) return false
  const lastRunRaw = settingsRepo.get<string | null>('autoFxRefreshLastRunAt') ?? null
  if (!lastRunRaw) return true
  const lastMs = Date.parse(lastRunRaw)
  if (!Number.isFinite(lastMs)) return true
  return Date.now() - lastMs > 24 * 60 * 60 * 1000
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url, redirect: 'follow' })
    let body = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        request.abort()
      } catch {
        /* ignore */
      }
      reject(new Error(`FX refresh timed out after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        clearTimeout(timer)
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      response.on('data', (chunk) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        if (timedOut) return
        clearTimeout(timer)
        try {
          resolve(JSON.parse(body) as T)
        } catch (err) {
          reject(new Error(`JSON parse failed: ${(err as Error).message}`))
        }
      })
      response.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
    request.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    request.end()
  })
}
