/**
 * All IPC channel names. Centralized to prevent typos and enable type-checked dispatch.
 * Naming convention: `<domain>:<verb>`
 */
export const IPC = {
  // Meta
  APP_META: 'app:meta',

  // Currencies
  CURRENCY_LIST: 'currency:list',
  CURRENCY_CREATE: 'currency:create',
  CURRENCY_UPDATE: 'currency:update',
  CURRENCY_DELETE: 'currency:delete',

  // Exchange rates
  FX_LIST: 'fx:list',
  FX_UPSERT: 'fx:upsert',
  FX_DELETE: 'fx:delete',
  FX_AUTO_REFRESH: 'fx:autoRefresh',

  // Categories
  CATEGORY_LIST: 'category:list',
  CATEGORY_TREE: 'category:tree',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',
  CATEGORY_REORDER: 'category:reorder',

  // Tags
  TAG_LIST: 'tag:list',
  TAG_CREATE: 'tag:create',
  TAG_UPDATE: 'tag:update',
  TAG_DELETE: 'tag:delete',
  TAG_USAGE_COUNTS: 'tag:usageCounts',
  TAG_MERGE: 'tag:merge',

  // Accounts
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_CREATE: 'account:create',
  ACCOUNT_UPDATE: 'account:update',
  ACCOUNT_DELETE: 'account:delete',
  ACCOUNT_BALANCE: 'account:balance',
  ACCOUNT_DISTINCT_ISSUERS: 'account:distinctIssuers',

  // Transactions
  TRANSACTION_LIST: 'transaction:list',
  TRANSACTION_GET: 'transaction:get',
  TRANSACTION_CREATE: 'transaction:create',
  TRANSACTION_UPDATE: 'transaction:update',
  TRANSACTION_DELETE: 'transaction:delete',
  TRANSACTION_DISTINCT_DISCOUNT_REASONS: 'transaction:distinctDiscountReasons',

  // Recurring
  RECURRING_LIST: 'recurring:list',
  RECURRING_CREATE: 'recurring:create',
  RECURRING_UPDATE: 'recurring:update',
  RECURRING_DELETE: 'recurring:delete',
  RECURRING_PREVIEW: 'recurring:preview',
  RECURRING_GENERATE_DUE: 'recurring:generateDue',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_ALL: 'settings:all',

  // Stats
  STATS_MONTHLY_SUMMARY: 'stats:monthlySummary',
  STATS_YEARLY_SUMMARY: 'stats:yearlySummary',
  STATS_MULTI_YEAR_COMPARISON: 'stats:multiYearComparison',
  STATS_CATEGORY_BREAKDOWN: 'stats:categoryBreakdown',
  STATS_TAG_BREAKDOWN: 'stats:tagBreakdown',
  STATS_TIME_SERIES: 'stats:timeSeries',
  STATS_TOP_PAYEES: 'stats:topPayees',
  STATS_TOP_TRANSACTIONS: 'stats:topTransactions',
  STATS_CARD_SPEND: 'stats:cardSpend',
  STATS_CARD_DISCOUNT_SERIES: 'stats:cardDiscountSeries',
  STATS_TOP_DISCOUNT_TRANSACTIONS: 'stats:topDiscountTransactions',
  STATS_ACCOUNT_SPENDING: 'stats:accountSpending',
  STATS_SAVINGS_BALANCE: 'stats:savingsBalance',

  // Backup / Export (Step 5)
  BACKUP_EXPORT_DB: 'backup:exportDb',
  BACKUP_IMPORT_DB: 'backup:importDb',
  EXPORT_TRANSACTIONS_CSV: 'export:transactionsCsv',
  IMPORT_TRANSACTIONS_CSV: 'import:transactionsCsv',

  // Reset
  RESET_TRANSACTIONS: 'reset:transactions',
  RESET_ALL: 'reset:all',
  APP_RELAUNCH: 'app:relaunch',

  // Budget (v2.1)
  BUDGET_LIST: 'budget:list',
  BUDGET_GET: 'budget:get',
  BUDGET_CREATE: 'budget:create',
  BUDGET_UPDATE: 'budget:update',
  BUDGET_DELETE: 'budget:delete',
  BUDGET_COPY_MONTH: 'budget:copyMonth',
  BUDGET_BULK_UPSERT: 'budget:bulkUpsert',

  // Goal (v2.1)
  GOAL_LIST: 'goal:list',
  GOAL_GET: 'goal:get',
  GOAL_CREATE: 'goal:create',
  GOAL_UPDATE: 'goal:update',
  GOAL_DELETE: 'goal:delete',
  GOAL_MARK_ACHIEVED: 'goal:markAchieved',
  GOAL_CANCEL: 'goal:cancel',
  GOAL_REOPEN: 'goal:reopen',
  GOAL_SET_ACCOUNT_LINKS: 'goal:setAccountLinks',
  GOAL_SET_TAG_LINKS: 'goal:setTagLinks',
  GOAL_REORDER: 'goal:reorder',

  // Stats (v2.1 additions)
  STATS_BUDGET_VS_ACTUAL: 'stats:budgetVsActual',
  STATS_GOAL_PROGRESS: 'stats:goalProgress',
  STATS_GOAL_PROGRESS_ALL: 'stats:goalProgressAll'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
