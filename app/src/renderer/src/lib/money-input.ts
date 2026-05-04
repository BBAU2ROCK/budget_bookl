import type { CurrencyDto, MoneyAmount } from '../../../shared/types'

/** Parse user input string (with commas/symbols) into smallest-unit integer. */
export function parseMoneyInput(
  display: string,
  currency: string,
  currencies: CurrencyDto[]
): MoneyAmount {
  const decimals = currencies.find((c) => c.code === currency)?.decimalPlaces ?? 2
  const cleaned = display.replace(/[^\d.-]/g, '') // Keep only digits, dots, and minus
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * Math.pow(10, decimals))
}

/** Convert stored smallest-unit amount back to an editable display string (with optional formatting). */
export function formatMoneyForInput(
  amount: MoneyAmount,
  currency: string,
  currencies: CurrencyDto[],
  withCommas = true
): string {
  const decimals = currencies.find((c) => c.code === currency)?.decimalPlaces ?? 2
  const val = amount / Math.pow(10, decimals)
  if (withCommas) {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }
  return val.toFixed(decimals)
}

/** 
 * Live formatting for input onChange: 
 * Prevents non-numeric input and adds commas.
 */
export function formatLiveInput(value: string): string {
  // Allow digits and at most one dot
  const cleaned = value.replace(/[^\d.]/g, '')
  const parts = cleaned.split('.')
  let integerPart = parts[0]
  const decimalPart = parts.length > 1 ? '.' + parts[1] : ''

  // Add commas to integer part
  if (integerPart) {
    integerPart = parseInt(integerPart, 10).toLocaleString()
  }

  return integerPart + decimalPart
}
