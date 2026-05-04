import type { CurrencyDto, MoneyAmount } from '../../../shared/types'

/** Locale used for all numeric formatting — explicit so output is consistent across OS locales. */
const NUMBER_LOCALE = 'ko-KR'

/** Format a smallest-unit integer amount as a display string, e.g. 12500 (KRW) → "12,500". */
export function formatMoney(
  amount: MoneyAmount,
  currency: string,
  currencies?: CurrencyDto[]
): string {
  const decimals = currencies?.find((c) => c.code === currency)?.decimalPlaces ?? 2
  const display = decimals === 0 ? amount : amount / Math.pow(10, decimals)
  return display.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/**
 * Format an integer count (transaction count, occurrence count, etc.)
 * with thousand separators and no decimals. e.g. 1234 → "1,234".
 */
export function formatInteger(n: number): string {
  return Math.round(n).toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

export function formatWithSymbol(
  amount: MoneyAmount,
  currency: string,
  currencies?: CurrencyDto[]
): string {
  const c = currencies?.find((c) => c.code === currency)
  const symbol = c?.symbol ?? currency
  return `${symbol} ${formatMoney(amount, currency, currencies)}`
}

export function formatSignedMoney(
  amount: MoneyAmount,
  currency: string,
  currencies?: CurrencyDto[]
): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  return `${sign}${formatMoney(Math.abs(amount), currency, currencies)}`
}

export function formatDeltaPct(pct: number | null): string {
  if (pct == null) return '—'
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}%`
}
