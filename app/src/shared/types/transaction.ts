import type { DateTimeIso, MoneyAmount, TransactionType } from './common'

export interface TransactionDto {
  id: string
  type: TransactionType
  occurredAt: DateTimeIso
  recordedAt: DateTimeIso

  amount: MoneyAmount
  currency: string
  amountInBase: MoneyAmount
  baseCurrency: string
  fxRate: number

  categoryId: string | null
  accountId: string | null
  counterAccountId: string | null
  /** For cross-currency transfers: amount received at destination in counter account's currency.
   *  Null for same-currency transfers (implicitly equals `amount`) and for non-transfers. */
  counterAmount: MoneyAmount | null

  /** Pre-discount amount. Must be >= amount if present. Null = no discount. Same currency as amount. */
  originalAmount: MoneyAmount | null
  discountReason: string | null

  payee: string | null
  memo: string | null
  paymentMethod: string | null

  recurringSeriesId: string | null
  tagIds: string[]
  /** Optional category split. When non-empty, sum(splits.amount) === amount and
   *  stats aggregate by split.categoryId rather than the parent's categoryId. */
  splits: TransactionSplitDto[]

  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface TransactionSplitDto {
  id: string
  transactionId: string
  categoryId: string | null
  amount: MoneyAmount
  amountInBase: MoneyAmount
  memo: string | null
  displayOrder: number
}

export interface TransactionSplitInput {
  /** Optional id — when provided, the split is updated in place; when omitted, a new id is minted. */
  id?: string
  categoryId: string | null
  amount: MoneyAmount
  memo?: string | null
}

export interface TransactionCreateInput {
  type: TransactionType
  occurredAt: DateTimeIso
  amount: MoneyAmount
  currency: string
  /** Optional — computed from exchange_rates if omitted, or 1 if currency === baseCurrency */
  amountInBase?: MoneyAmount
  fxRate?: number
  categoryId?: string | null
  accountId?: string | null
  counterAccountId?: string | null
  counterAmount?: MoneyAmount | null
  originalAmount?: MoneyAmount | null
  discountReason?: string | null
  payee?: string | null
  memo?: string | null
  paymentMethod?: string | null
  tagIds?: string[]
  recurringSeriesId?: string | null
  /** Optional category split. When provided & non-empty, must satisfy sum(s.amount) === amount. */
  splits?: TransactionSplitInput[]
}

export type TransactionUpdateInput = Partial<TransactionCreateInput> & { id: string }

export interface TransactionFilter {
  from?: DateTimeIso
  to?: DateTimeIso
  types?: TransactionType[]
  categoryIds?: string[]
  accountIds?: string[]
  tagIds?: string[]
  /** Match if transaction has ALL of these tags (default: ANY) */
  tagsMatchMode?: 'any' | 'all'
  search?: string
  limit?: number
  offset?: number
  orderBy?: 'occurredAt' | 'amountInBase' | 'recordedAt'
  orderDir?: 'asc' | 'desc'
}

export interface TransactionListResult {
  rows: TransactionDto[]
  total: number
}
