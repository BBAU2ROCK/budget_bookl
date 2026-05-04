import type { DateIso, DateTimeIso, MoneyAmount, TransactionType } from './common'

/** Common filter for stats queries. Dates are inclusive. */
export interface StatsFilter {
  from: DateTimeIso
  to: DateTimeIso
  types?: TransactionType[]
  categoryIds?: string[]
  /** Include subtree of the given categories (walks descendants) */
  categoryIncludeDescendants?: boolean
  tagIds?: string[]
  accountIds?: string[]
}

export interface PeriodComparisonAxis {
  current: MoneyAmount
  previous: MoneyAmount
  deltaAbs: MoneyAmount
  /** null when previous = 0 (division by zero) */
  deltaPct: number | null
}

export interface PeriodComparisonDto {
  income: PeriodComparisonAxis
  expense: PeriodComparisonAxis
  net: PeriodComparisonAxis
}

export interface MonthlySummaryInput {
  year: number
  month: number // 1-12
  categoryIds?: string[]
  tagIds?: string[]
  accountIds?: string[]
}

export interface MonthlySummaryDto {
  period: { year: number; month: number; from: DateTimeIso; to: DateTimeIso }
  baseCurrency: string
  income: MoneyAmount
  expense: MoneyAmount
  net: MoneyAmount
  transactionCount: number
  vsPrevMonth: PeriodComparisonDto
  vsPrevYear: PeriodComparisonDto
}

export interface CategoryBreakdownEntry {
  categoryId: string | null
  categoryName: string | null
  categoryPath: string | null
  parentId: string | null
  kind: 'income' | 'expense' | 'unknown'
  total: MoneyAmount
  count: number
  percent: number
}

export interface CategoryBreakdownInput extends StatsFilter {
  /** Restrict to a single kind, default: no restriction */
  kind?: 'income' | 'expense'
  /** If true, roll up to top-level roots. Default: false (show each category as-is) */
  rollupToRoot?: boolean
}

export interface TagBreakdownEntry {
  tagId: string
  tagName: string
  color: string | null
  total: MoneyAmount
  count: number
  percent: number
}

export type TimeGranularity = 'day' | 'week' | 'month'

export interface TimeSeriesInput extends StatsFilter {
  granularity: TimeGranularity
  /** If true, emit cumulative sums per axis */
  cumulative?: boolean
}

export interface TimeSeriesPoint {
  /** Bucket start in local time (YYYY-MM-DD) */
  bucket: DateIso
  income: MoneyAmount
  expense: MoneyAmount
  net: MoneyAmount
}

export interface TopPayeeEntry {
  payee: string
  total: MoneyAmount
  count: number
}

export interface TopTransactionEntry {
  id: string
  occurredAt: DateTimeIso
  amount: MoneyAmount
  amountInBase: MoneyAmount
  currency: string
  categoryPath: string | null
  payee: string | null
  memo: string | null
}

/* ==========================================================================
 * Yearly stats
 * ==========================================================================*/

export interface YearlySummaryInput {
  year: number
  categoryIds?: string[]
  tagIds?: string[]
  accountIds?: string[]
}

export interface YearlyMonthBucket {
  month: number // 1-12
  income: MoneyAmount
  expense: MoneyAmount
  net: MoneyAmount
  transactionCount: number
}

export interface YearlySummaryDto {
  period: { year: number; from: DateTimeIso; to: DateTimeIso }
  baseCurrency: string
  income: MoneyAmount
  expense: MoneyAmount
  net: MoneyAmount
  transactionCount: number
  vsPrevYear: PeriodComparisonDto
  monthlyBreakdown: YearlyMonthBucket[]
}

export interface MultiYearComparisonInput {
  /** Years to include going backwards from reference year (default: current year).
   *  Example: yearsBack=4 + referenceYear=2026 → [2022..2026] */
  yearsBack: number
  referenceYear?: number
  categoryIds?: string[]
  tagIds?: string[]
  accountIds?: string[]
}

export interface YearTotal {
  year: number
  income: MoneyAmount
  expense: MoneyAmount
  net: MoneyAmount
  transactionCount: number
}

export interface MultiYearComparisonDto {
  baseCurrency: string
  years: YearTotal[]
}

/* ==========================================================================
 * Card spend (credit card analysis)
 * ==========================================================================*/

export type CardGroupBy = 'account' | 'issuer'

export interface CardSpendInput {
  from: DateTimeIso
  to: DateTimeIso
  groupBy: CardGroupBy
  /** When provided, restrict to specific card accounts. */
  accountIds?: string[]
}

export interface CardSpendEntry {
  /** When groupBy='account': accountId. When groupBy='issuer': issuer name (or '(미지정)'). */
  groupId: string
  groupLabel: string
  accountIds: string[] // which accounts contribute to this group
  originalTotal: MoneyAmount // pre-discount total (uses amount when no discount recorded)
  actualTotal: MoneyAmount // what actually left the wallet
  discountTotal: MoneyAmount // original - actual for rows with original_amount set
  discountRate: number // % (discountTotal / originalTotal * 100)
  transactionCount: number
  discountedTxCount: number
}

export interface CardDiscountPoint {
  bucket: DateIso // YYYY-MM-01 for month, YYYY-MM-DD for day
  originalTotal: MoneyAmount
  actualTotal: MoneyAmount
  discountTotal: MoneyAmount
}

export interface CardDiscountSeriesInput {
  from: DateTimeIso
  to: DateTimeIso
  granularity: TimeGranularity
  accountIds?: string[]
}

export interface TopDiscountTxEntry {
  id: string
  occurredAt: DateTimeIso
  amount: MoneyAmount
  originalAmount: MoneyAmount
  discountAmount: MoneyAmount
  discountRate: number
  currency: string
  accountId: string | null
  payee: string | null
  memo: string | null
  discountReason: string | null
}

export interface TopDiscountInput {
  from: DateTimeIso
  to: DateTimeIso
  accountIds?: string[]
  limit?: number
}

/* ==========================================================================
 * Account-level spending (per-account expense totals for the period)
 * ==========================================================================*/

export interface AccountSpendingInput {
  from: DateTimeIso
  to: DateTimeIso
}

export interface AccountSpendingEntry {
  accountId: string
  name: string
  icon: string | null
  color: string | null
  accountType: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'loan' | 'other'
  currency: string
  /** 신용카드만 의미 있음. 다른 종류는 null. */
  creditLimit: number | null
  /** 그 기간 내 expense 거래 합계 (amount_in_base 기준) */
  total: MoneyAmount
  txCount: number
  /** total / sum(전체 entries.total) — 0~1 */
  percent: number
}

export interface AccountSpendingResult {
  baseCurrency: string
  entries: AccountSpendingEntry[]
  /** 모든 엔트리 합계 */
  totalSum: MoneyAmount
}

/* ==========================================================================
 * Savings balance — actual money moved into savings/investment accounts
 * ==========================================================================*/

export interface SavingsBalanceInput {
  /** "이번 달 신규 저축" 집계 기간 */
  from: DateTimeIso
  to: DateTimeIso
}

export interface SavingsBalanceDto {
  baseCurrency: string
  /** 현재 시점 모든 savings + investment 계좌 잔액 합 (base currency 환산) */
  totalBalance: MoneyAmount
  /**
   * 이 기간 동안 savings/investment 계좌로 들어온 모든 금액의 합 (base currency).
   *  = income (이자/배당 등, 계좌가 savings)
   *  + transfer in (외부 → savings, cross-currency 환산)
   * 내부 이체(savings A → savings B)는 outflow 쪽과 자동 상쇄되도록 transfer에서 배제.
   */
  inflowInPeriod: MoneyAmount
  /**
   * 이 기간 동안 savings/investment 계좌에서 나간 모든 금액의 합 (base currency).
   *  = expense (계좌가 savings — 적금 직접 결제 등 드문 케이스)
   *  + transfer out (savings → 외부)
   */
  outflowInPeriod: MoneyAmount
  /** inflow - outflow — 이 기간 동안 실제로 모은(또는 잃은) 금액 */
  netInPeriod: MoneyAmount
  /** 집계에 포함된 계좌 ID 리스트 (디버그/툴팁용) */
  savingsAccountIds: string[]
}
