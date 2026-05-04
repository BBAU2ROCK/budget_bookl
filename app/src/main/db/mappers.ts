/**
 * Row → DTO mappers. Converts Date objects to ISO strings for IPC transport.
 */
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  CurrencyRow,
  ExchangeRateRow,
  RecurringSeriesRow,
  SavingsGoalRow,
  TagRow,
  TransactionRow,
  TransactionSplitRow
} from './schema'
import type {
  AccountDto,
  BudgetDto,
  CategoryDto,
  CurrencyDto,
  ExchangeRateDto,
  GoalTagInclusionType,
  RecurringSeriesDto,
  SavingsGoalDto,
  TagDto,
  TransactionDto,
  TransactionSplitDto
} from '../../shared/types'

const iso = (d: Date): string => d.toISOString()

export const toCurrencyDto = (r: CurrencyRow): CurrencyDto => ({
  code: r.code,
  name: r.name,
  symbol: r.symbol,
  decimalPlaces: r.decimalPlaces,
  isActive: r.isActive,
  displayOrder: r.displayOrder,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toExchangeRateDto = (r: ExchangeRateRow): ExchangeRateDto => ({
  id: r.id,
  fromCurrency: r.fromCurrency,
  toCurrency: r.toCurrency,
  rate: r.rate,
  asOf: r.asOf,
  source: r.source,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toAccountDto = (r: AccountRow): AccountDto => ({
  id: r.id,
  name: r.name,
  type: r.type,
  currency: r.currency,
  initialBalance: r.initialBalance,
  color: r.color,
  icon: r.icon,
  notes: r.notes,
  displayOrder: r.displayOrder,
  isArchived: r.isArchived,
  issuer: r.issuer,
  cardLast4: r.cardLast4,
  billingDay: r.billingDay,
  statementClosing: r.statementClosing,
  creditLimit: r.creditLimit,
  annualFee: r.annualFee,
  benefitsSummary: r.benefitsSummary,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toCategoryDto = (r: CategoryRow): CategoryDto => ({
  id: r.id,
  name: r.name,
  parentId: r.parentId,
  kind: r.kind,
  color: r.color,
  icon: r.icon,
  displayOrder: r.displayOrder,
  isArchived: r.isArchived,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toTagDto = (r: TagRow): TagDto => ({
  id: r.id,
  name: r.name,
  color: r.color,
  description: r.description,
  isArchived: r.isArchived,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toTransactionDto = (
  r: TransactionRow,
  tagIds: string[] = [],
  splits: TransactionSplitDto[] = []
): TransactionDto => ({
  id: r.id,
  type: r.type,
  occurredAt: iso(r.occurredAt),
  recordedAt: iso(r.recordedAt),
  amount: r.amount,
  currency: r.currency,
  amountInBase: r.amountInBase,
  baseCurrency: r.baseCurrency,
  fxRate: r.fxRate,
  categoryId: r.categoryId,
  accountId: r.accountId,
  counterAccountId: r.counterAccountId,
  counterAmount: r.counterAmount,
  originalAmount: r.originalAmount,
  discountReason: r.discountReason,
  payee: r.payee,
  memo: r.memo,
  paymentMethod: r.paymentMethod,
  recurringSeriesId: r.recurringSeriesId,
  tagIds,
  splits,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toSplitDto = (r: TransactionSplitRow): TransactionSplitDto => ({
  id: r.id,
  transactionId: r.transactionId,
  categoryId: r.categoryId,
  amount: r.amount,
  amountInBase: r.amountInBase,
  memo: r.memo,
  displayOrder: r.displayOrder
})

export const toRecurringDto = (
  r: RecurringSeriesRow,
  tagIds: string[] = []
): RecurringSeriesDto => ({
  id: r.id,
  name: r.name,
  type: r.type,
  amount: r.amount,
  currency: r.currency,
  categoryId: r.categoryId,
  accountId: r.accountId,
  payee: r.payee,
  memo: r.memo,
  paymentMethod: r.paymentMethod,
  rrule: r.rrule,
  dtstart: r.dtstart,
  until: r.until,
  count: r.count,
  nextOccurrence: r.nextOccurrence,
  autoCreate: r.autoCreate,
  isActive: r.isActive,
  pausedUntil: r.pausedUntil,
  tagIds,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

export const toBudgetDto = (r: BudgetRow): BudgetDto => ({
  id: r.id,
  categoryId: r.categoryId,
  periodYear: r.periodYear,
  periodMonth: r.periodMonth,
  amount: r.amount,
  currency: r.currency,
  includesDescendants: r.includesDescendants,
  carryOver: r.carryOver,
  notes: r.notes,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})

function parseTagInclusionTypes(json: string): GoalTagInclusionType[] {
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (v): v is GoalTagInclusionType => v === 'income' || v === 'transfer_in'
      )
    }
  } catch {
    // ignore
  }
  return ['income', 'transfer_in']
}

export const toSavingsGoalDto = (
  r: SavingsGoalRow,
  linkedAccountIds: string[] = [],
  linkedTagIds: string[] = []
): SavingsGoalDto => ({
  id: r.id,
  name: r.name,
  description: r.description,
  targetAmount: r.targetAmount,
  currency: r.currency,
  startDate: r.startDate,
  targetDate: r.targetDate,
  status: r.status,
  achievedAt: r.achievedAt ? iso(r.achievedAt) : null,
  startingBalance: r.startingBalance,
  manualAmount: r.manualAmount,
  tagInclusionTypes: parseTagInclusionTypes(r.tagInclusionTypes),
  icon: r.icon,
  color: r.color,
  displayOrder: r.displayOrder,
  notes: r.notes,
  linkedAccountIds,
  linkedTagIds,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt)
})
