import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'
import type {
  AccountBalanceDto,
  AccountCreateInput,
  AccountDto,
  AccountSpendingInput,
  AccountSpendingResult,
  AccountUpdateInput,
  SavingsBalanceDto,
  SavingsBalanceInput,
  BackupExportResult,
  BackupImportResult,
  CardDiscountPoint,
  CardDiscountSeriesInput,
  CardSpendEntry,
  CardSpendInput,
  CategoryBreakdownEntry,
  CategoryBreakdownInput,
  CategoryCreateInput,
  CategoryDto,
  CategoryReorderInput,
  CategoryTreeNode,
  CategoryUpdateInput,
  CsvExportInput,
  CsvExportResult,
  CsvImportResult,
  ResetResult,
  CurrencyCreateInput,
  CurrencyDto,
  CurrencyUpdateInput,
  ExchangeRateDto,
  ExchangeRateUpsertInput,
  MonthlySummaryDto,
  MonthlySummaryInput,
  MultiYearComparisonDto,
  MultiYearComparisonInput,
  RecurringCreateInput,
  RecurringPreviewInput,
  RecurringSeriesDto,
  RecurringUpdateInput,
  SettingsValueMap,
  StatsFilter,
  TagBreakdownEntry,
  TagCreateInput,
  TagDto,
  TagUpdateInput,
  TimeSeriesInput,
  TimeSeriesPoint,
  TopDiscountInput,
  TopDiscountTxEntry,
  TopPayeeEntry,
  TopTransactionEntry,
  YearlySummaryDto,
  YearlySummaryInput,
  TransactionCreateInput,
  TransactionDto,
  TransactionFilter,
  TransactionListResult,
  TransactionUpdateInput,
  // Budget (v2.1)
  BudgetBulkUpsertInput,
  BudgetBulkUpsertResult,
  BudgetCopyInput,
  BudgetCopyResult,
  BudgetCreateInput,
  BudgetDto,
  BudgetListFilter,
  BudgetUpdateInput,
  BudgetVsActualEntry,
  BudgetVsActualInput,
  // Goal (v2.1)
  GoalProgressDto,
  GoalProgressFilter,
  SavingsGoalCreateInput,
  SavingsGoalDto,
  SavingsGoalListFilter,
  SavingsGoalUpdateInput
} from '../shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

export interface AppMeta {
  name: string
  version: string
  dbPath: string
  userDataPath: string
  platform: string
  electron: string
  node: string
}

export const api = {
  app: {
    meta: (): Promise<AppMeta> => invoke(IPC.APP_META)
  },
  currencies: {
    list: (): Promise<CurrencyDto[]> => invoke(IPC.CURRENCY_LIST),
    create: (input: CurrencyCreateInput): Promise<CurrencyDto> =>
      invoke(IPC.CURRENCY_CREATE, input),
    update: (input: CurrencyUpdateInput): Promise<CurrencyDto> =>
      invoke(IPC.CURRENCY_UPDATE, input),
    delete: (code: string): Promise<void> => invoke(IPC.CURRENCY_DELETE, code),
    listRates: (): Promise<ExchangeRateDto[]> => invoke(IPC.FX_LIST),
    upsertRate: (input: ExchangeRateUpsertInput): Promise<ExchangeRateDto> =>
      invoke(IPC.FX_UPSERT, input),
    deleteRate: (id: string): Promise<void> => invoke(IPC.FX_DELETE, id),
    autoRefresh: (): Promise<{
      baseCurrency: string
      fetched: number
      saved: number
      skipped: number
      asOf: string
      error?: string
    }> => invoke(IPC.FX_AUTO_REFRESH)
  },
  categories: {
    list: (includeArchived = false): Promise<CategoryDto[]> =>
      invoke(IPC.CATEGORY_LIST, includeArchived),
    tree: (includeArchived = false): Promise<CategoryTreeNode[]> =>
      invoke(IPC.CATEGORY_TREE, includeArchived),
    create: (input: CategoryCreateInput): Promise<CategoryDto> =>
      invoke(IPC.CATEGORY_CREATE, input),
    update: (input: CategoryUpdateInput): Promise<CategoryDto> =>
      invoke(IPC.CATEGORY_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.CATEGORY_DELETE, id),
    reorder: (input: CategoryReorderInput): Promise<void> => invoke(IPC.CATEGORY_REORDER, input)
  },
  tags: {
    list: (includeArchived = false): Promise<TagDto[]> => invoke(IPC.TAG_LIST, includeArchived),
    create: (input: TagCreateInput): Promise<TagDto> => invoke(IPC.TAG_CREATE, input),
    update: (input: TagUpdateInput): Promise<TagDto> => invoke(IPC.TAG_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.TAG_DELETE, id),
    usageCounts: (ids?: string[]): Promise<Record<string, number>> =>
      invoke(IPC.TAG_USAGE_COUNTS, ids),
    merge: (sourceId: string, targetId: string): Promise<{ moved: number }> =>
      invoke(IPC.TAG_MERGE, sourceId, targetId)
  },
  accounts: {
    list: (includeArchived = false): Promise<AccountDto[]> =>
      invoke(IPC.ACCOUNT_LIST, includeArchived),
    create: (input: AccountCreateInput): Promise<AccountDto> => invoke(IPC.ACCOUNT_CREATE, input),
    update: (input: AccountUpdateInput): Promise<AccountDto> => invoke(IPC.ACCOUNT_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.ACCOUNT_DELETE, id),
    balances: (ids?: string[]): Promise<AccountBalanceDto[]> => invoke(IPC.ACCOUNT_BALANCE, ids),
    distinctIssuers: (): Promise<string[]> => invoke(IPC.ACCOUNT_DISTINCT_ISSUERS)
  },
  transactions: {
    list: (filter?: TransactionFilter): Promise<TransactionListResult> =>
      invoke(IPC.TRANSACTION_LIST, filter),
    get: (id: string): Promise<TransactionDto | null> => invoke(IPC.TRANSACTION_GET, id),
    create: (input: TransactionCreateInput): Promise<TransactionDto> =>
      invoke(IPC.TRANSACTION_CREATE, input),
    update: (input: TransactionUpdateInput): Promise<TransactionDto> =>
      invoke(IPC.TRANSACTION_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.TRANSACTION_DELETE, id),
    distinctDiscountReasons: (): Promise<string[]> =>
      invoke(IPC.TRANSACTION_DISTINCT_DISCOUNT_REASONS)
  },
  recurring: {
    list: (includeInactive = false): Promise<RecurringSeriesDto[]> =>
      invoke(IPC.RECURRING_LIST, includeInactive),
    create: (input: RecurringCreateInput): Promise<RecurringSeriesDto> =>
      invoke(IPC.RECURRING_CREATE, input),
    update: (input: RecurringUpdateInput): Promise<RecurringSeriesDto> =>
      invoke(IPC.RECURRING_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.RECURRING_DELETE, id),
    preview: (input: RecurringPreviewInput): Promise<string[]> =>
      invoke(IPC.RECURRING_PREVIEW, input),
    generateDue: (): Promise<{
      created: number
      skipped: number
      seriesProcessed: number
      errors: Array<{ seriesId: string; date: string; message: string }>
    }> => invoke(IPC.RECURRING_GENERATE_DUE)
  },
  stats: {
    monthlySummary: (input: MonthlySummaryInput): Promise<MonthlySummaryDto> =>
      invoke(IPC.STATS_MONTHLY_SUMMARY, input),
    yearlySummary: (input: YearlySummaryInput): Promise<YearlySummaryDto> =>
      invoke(IPC.STATS_YEARLY_SUMMARY, input),
    multiYearComparison: (
      input: MultiYearComparisonInput
    ): Promise<MultiYearComparisonDto> => invoke(IPC.STATS_MULTI_YEAR_COMPARISON, input),
    categoryBreakdown: (input: CategoryBreakdownInput): Promise<CategoryBreakdownEntry[]> =>
      invoke(IPC.STATS_CATEGORY_BREAKDOWN, input),
    tagBreakdown: (input: StatsFilter): Promise<TagBreakdownEntry[]> =>
      invoke(IPC.STATS_TAG_BREAKDOWN, input),
    timeSeries: (input: TimeSeriesInput): Promise<TimeSeriesPoint[]> =>
      invoke(IPC.STATS_TIME_SERIES, input),
    topPayees: (input: StatsFilter & { limit?: number }): Promise<TopPayeeEntry[]> =>
      invoke(IPC.STATS_TOP_PAYEES, input),
    topTransactions: (input: StatsFilter & { limit?: number }): Promise<TopTransactionEntry[]> =>
      invoke(IPC.STATS_TOP_TRANSACTIONS, input),
    cardSpend: (input: CardSpendInput): Promise<CardSpendEntry[]> =>
      invoke(IPC.STATS_CARD_SPEND, input),
    cardDiscountSeries: (input: CardDiscountSeriesInput): Promise<CardDiscountPoint[]> =>
      invoke(IPC.STATS_CARD_DISCOUNT_SERIES, input),
    topDiscountTransactions: (input: TopDiscountInput): Promise<TopDiscountTxEntry[]> =>
      invoke(IPC.STATS_TOP_DISCOUNT_TRANSACTIONS, input),
    accountSpending: (input: AccountSpendingInput): Promise<AccountSpendingResult> =>
      invoke(IPC.STATS_ACCOUNT_SPENDING, input),
    savingsBalance: (input: SavingsBalanceInput): Promise<SavingsBalanceDto> =>
      invoke(IPC.STATS_SAVINGS_BALANCE, input),
    // v2.1 — Budget & Goal stats
    budgetVsActual: (input: BudgetVsActualInput): Promise<BudgetVsActualEntry[]> =>
      invoke(IPC.STATS_BUDGET_VS_ACTUAL, input),
    goalProgress: (goalId: string): Promise<GoalProgressDto> =>
      invoke(IPC.STATS_GOAL_PROGRESS, goalId),
    goalProgressAll: (filter?: GoalProgressFilter): Promise<GoalProgressDto[]> =>
      invoke(IPC.STATS_GOAL_PROGRESS_ALL, filter)
  },
  budgets: {
    list: (filter?: BudgetListFilter): Promise<BudgetDto[]> => invoke(IPC.BUDGET_LIST, filter),
    get: (id: string): Promise<BudgetDto | null> => invoke(IPC.BUDGET_GET, id),
    create: (input: BudgetCreateInput): Promise<BudgetDto> => invoke(IPC.BUDGET_CREATE, input),
    update: (input: BudgetUpdateInput): Promise<BudgetDto> => invoke(IPC.BUDGET_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.BUDGET_DELETE, id),
    copyMonth: (input: BudgetCopyInput): Promise<BudgetCopyResult> =>
      invoke(IPC.BUDGET_COPY_MONTH, input),
    bulkUpsert: (input: BudgetBulkUpsertInput): Promise<BudgetBulkUpsertResult> =>
      invoke(IPC.BUDGET_BULK_UPSERT, input)
  },
  goals: {
    list: (filter?: SavingsGoalListFilter): Promise<SavingsGoalDto[]> =>
      invoke(IPC.GOAL_LIST, filter),
    get: (id: string): Promise<SavingsGoalDto | null> => invoke(IPC.GOAL_GET, id),
    create: (input: SavingsGoalCreateInput): Promise<SavingsGoalDto> =>
      invoke(IPC.GOAL_CREATE, input),
    update: (input: SavingsGoalUpdateInput): Promise<SavingsGoalDto> =>
      invoke(IPC.GOAL_UPDATE, input),
    delete: (id: string): Promise<void> => invoke(IPC.GOAL_DELETE, id),
    markAchieved: (id: string): Promise<SavingsGoalDto> => invoke(IPC.GOAL_MARK_ACHIEVED, id),
    cancel: (id: string): Promise<SavingsGoalDto> => invoke(IPC.GOAL_CANCEL, id),
    reopen: (id: string): Promise<SavingsGoalDto> => invoke(IPC.GOAL_REOPEN, id),
    setAccountLinks: (goalId: string, accountIds: string[]): Promise<void> =>
      invoke(IPC.GOAL_SET_ACCOUNT_LINKS, goalId, accountIds),
    setTagLinks: (goalId: string, tagIds: string[]): Promise<void> =>
      invoke(IPC.GOAL_SET_TAG_LINKS, goalId, tagIds),
    reorder: (goalIds: string[]): Promise<void> => invoke(IPC.GOAL_REORDER, goalIds)
  },
  backup: {
    exportDb: (): Promise<BackupExportResult | null> => invoke(IPC.BACKUP_EXPORT_DB),
    importDb: (): Promise<BackupImportResult | null> => invoke(IPC.BACKUP_IMPORT_DB),
    exportCsv: (input: CsvExportInput = {}): Promise<CsvExportResult | null> =>
      invoke(IPC.EXPORT_TRANSACTIONS_CSV, input),
    importCsv: (): Promise<CsvImportResult | null> => invoke(IPC.IMPORT_TRANSACTIONS_CSV)
  },
  reset: {
    transactionsOnly: (): Promise<ResetResult> => invoke(IPC.RESET_TRANSACTIONS),
    all: (): Promise<ResetResult> => invoke(IPC.RESET_ALL)
  },
  appControl: {
    relaunch: (): Promise<void> => invoke(IPC.APP_RELAUNCH)
  },
  settings: {
    get: <K extends keyof SettingsValueMap>(
      key: K
    ): Promise<SettingsValueMap[K] | undefined> => invoke(IPC.SETTINGS_GET, key),
    getAny: <T = unknown>(key: string): Promise<T | undefined> => invoke(IPC.SETTINGS_GET, key),
    set: <K extends keyof SettingsValueMap>(
      key: K,
      value: SettingsValueMap[K]
    ): Promise<void> => invoke(IPC.SETTINGS_SET, key, value),
    setAny: (key: string, value: unknown): Promise<void> => invoke(IPC.SETTINGS_SET, key, value),
    all: (): Promise<Record<string, unknown>> => invoke(IPC.SETTINGS_ALL)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
