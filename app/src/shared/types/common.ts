/**
 * Shared primitive types used across DTOs.
 * IPC serialization rule: Dates are ISO 8601 strings (not JS Date objects).
 */

/** ISO 8601 datetime string, e.g. "2026-04-14T09:30:00.000Z" */
export type DateTimeIso = string
/** Date-only string (YYYY-MM-DD) */
export type DateIso = string

/** Money amount stored in smallest unit (원 / cent) */
export type MoneyAmount = number

/** Standard result envelope for IPC failures that want structured error info */
export interface IpcError {
  code: string
  message: string
  details?: unknown
}

export type TransactionType = 'expense' | 'income' | 'transfer'
export type CategoryKind = 'income' | 'expense'
export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'cash'
  | 'investment'
  | 'loan'
  | 'other'
