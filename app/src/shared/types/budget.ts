import type { DateTimeIso, MoneyAmount } from './common'

/**
 * Budget status by usage percentage.
 * - 'unset': effective budget = 0 (no budget set)
 * - 'safe': percentUsed ≤ 75%
 * - 'warning': 75% < percentUsed ≤ 100%
 * - 'over': 100% < percentUsed ≤ 125%
 * - 'critical': percentUsed > 125%
 */
export type BudgetStatus = 'unset' | 'safe' | 'warning' | 'over' | 'critical'

/**
 * Budget pace status — compares time progress vs budget usage.
 * - 'ahead': budget usage rate < time progress × 0.9 (saving)
 * - 'on_pace': within ±10% of time progress
 * - 'behind': budget usage rate > time progress × 1.1 (spending too fast, but < 100%)
 * - 'over': percentUsed ≥ 100%
 */
export type BudgetPaceStatus = 'ahead' | 'on_pace' | 'behind' | 'over'

export interface BudgetDto {
  id: string
  /** null = 전체 예산 (월 합계 행) */
  categoryId: string | null
  periodYear: number
  /** 1-12 */
  periodMonth: number
  amount: MoneyAmount
  currency: string
  includesDescendants: boolean
  carryOver: boolean
  notes: string | null
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface BudgetCreateInput {
  categoryId?: string | null
  periodYear: number
  periodMonth: number
  amount: MoneyAmount
  /** Defaults to settings.baseCurrency */
  currency?: string
  includesDescendants?: boolean
  carryOver?: boolean
  notes?: string | null
}

export type BudgetUpdateInput = Partial<BudgetCreateInput> & { id: string }

export interface BudgetListFilter {
  year?: number
  month?: number
  categoryId?: string | null
}

/* =========================================================================
 * Budget vs Actual — pace analysis included (v2.1)
 * =========================================================================*/

export interface BudgetVsActualEntry {
  budgetId: string | null
  categoryId: string | null
  categoryName: string | null
  categoryPath: string | null
  parentCategoryId: string | null

  // Money figures (all in base currency)
  budget: MoneyAmount
  /** budget converted to base currency (1:1 if currency = base) */
  budgetInBase: MoneyAmount
  carryOverFromPrev: MoneyAmount
  effectiveBudget: MoneyAmount
  actual: MoneyAmount
  remaining: MoneyAmount
  percentUsed: number
  status: BudgetStatus
  transactionCount: number
  isTotalRow: boolean

  // Pace analysis (v2.1)
  daysInPeriod: number
  daysPassed: number
  daysRemaining: number
  /** daysPassed / daysInPeriod × 100 */
  timeProgressPercent: number
  /** actual / max(daysPassed, 1) */
  dailyPace: MoneyAmount
  /** dailyPace × daysInPeriod (extrapolated month-end) */
  projectedAtPeriodEnd: MoneyAmount
  /** effectiveBudget − projectedAtPeriodEnd */
  projectedRemaining: MoneyAmount
  paceStatus: BudgetPaceStatus

  /** Positive only — projected savings if current pace continues */
  savingsAtCurrentPace: MoneyAmount

  /** Set when budget currency conversion lacked an FX rate */
  conversionWarning: 'none' | 'no_rate'
}

export interface BudgetVsActualInput {
  year: number
  month: number
  /** When true (default), include categories with no budget but with expenses */
  includeUnsetCategories?: boolean
}

export interface BudgetCopyInput {
  fromYear: number
  fromMonth: number
  toYear: number
  toMonth: number
  /** Default false — skip rows that already exist */
  overwrite?: boolean
}

export interface BudgetCopyResult {
  copied: number
  skipped: number
  overwritten: number
}

export interface BudgetBulkUpsertInput {
  budgets: BudgetCreateInput[]
}

export interface BudgetBulkUpsertResult {
  created: number
  updated: number
  errors: Array<{ index: number; message: string }>
}

/* =========================================================================
 * Cross-link: savings → goal
 * =========================================================================*/

