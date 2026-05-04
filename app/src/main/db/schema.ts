import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  unique,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

/**
 * Timestamp defaults — stored as unix epoch millis (INTEGER), deserialized to JS Date by Drizzle.
 */
const createdAt = integer('created_at', { mode: 'timestamp_ms' })
  .notNull()
  .$defaultFn(() => new Date())
const updatedAt = integer('updated_at', { mode: 'timestamp_ms' })
  .notNull()
  .$defaultFn(() => new Date())

/* =====================================================================
 * 1. currencies
 * =====================================================================*/
export const currencies = sqliteTable('currencies', {
  code: text('code').primaryKey(), // "KRW", "USD", ...
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimalPlaces: integer('decimal_places').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt,
  updatedAt
})

/* =====================================================================
 * 2. exchange_rates — manual user-entered rates per day
 * =====================================================================*/
export const exchangeRates = sqliteTable(
  'exchange_rates',
  {
    id: text('id').primaryKey(),
    fromCurrency: text('from_currency')
      .notNull()
      .references(() => currencies.code),
    toCurrency: text('to_currency')
      .notNull()
      .references(() => currencies.code),
    rate: real('rate').notNull(),
    asOf: text('as_of').notNull(), // YYYY-MM-DD
    source: text('source', { enum: ['manual', 'api'] })
      .notNull()
      .default('manual'),
    createdAt,
    updatedAt
  },
  (t) => ({
    unq: unique('uq_fx_pair_date').on(t.fromCurrency, t.toCurrency, t.asOf),
    idxAsOf: index('idx_fx_as_of').on(t.asOf)
  })
)

/* =====================================================================
 * 3. accounts — optional asset tracking
 * =====================================================================*/
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['checking', 'savings', 'credit_card', 'cash', 'investment', 'loan', 'other']
  }).notNull(),
  currency: text('currency')
    .notNull()
    .references(() => currencies.code),
  initialBalance: integer('initial_balance').notNull().default(0),
  color: text('color'),
  icon: text('icon'),
  notes: text('notes'),
  displayOrder: integer('display_order').notNull().default(0),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),

  // Credit card-specific metadata (all nullable, only meaningful for type='credit_card')
  issuer: text('issuer'),
  cardLast4: text('card_last4'),
  billingDay: integer('billing_day'), // 1-31
  statementClosing: integer('statement_closing'), // 1-31
  creditLimit: integer('credit_limit'),
  annualFee: integer('annual_fee'),
  benefitsSummary: text('benefits_summary'),

  createdAt,
  updatedAt
})

/* =====================================================================
 * 4. categories — self-referencing tree (adjacency list)
 * =====================================================================*/
export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parentId: text('parent_id').references((): AnySQLiteColumn => categories.id, {
      onDelete: 'set null'
    }),
    kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
    color: text('color'),
    icon: text('icon'),
    displayOrder: integer('display_order').notNull().default(0),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    createdAt,
    updatedAt
  },
  (t) => ({
    idxParent: index('idx_cat_parent').on(t.parentId),
    idxKind: index('idx_cat_kind').on(t.kind)
  })
)

/* =====================================================================
 * 5. tags — multi-dimensional flat labels
 * =====================================================================*/
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  description: text('description'),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  createdAt,
  updatedAt
})

/* =====================================================================
 * 6. transactions — core table
 * =====================================================================*/
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['expense', 'income', 'transfer'] }).notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    // Money (stored as integer in smallest unit)
    amount: integer('amount').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    // Normalized to base currency at time of recording (historical accuracy)
    amountInBase: integer('amount_in_base').notNull(),
    baseCurrency: text('base_currency')
      .notNull()
      .references(() => currencies.code),
    fxRate: real('fx_rate').notNull().default(1),

    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // For transfers: where money is moving to
    counterAccountId: text('counter_account_id').references(() => accounts.id, {
      onDelete: 'set null'
    }),
    // For cross-currency transfers: amount received at destination in counter account's currency.
    // Null for same-currency transfers (implicitly = amount) and for non-transfer transactions.
    counterAmount: integer('counter_amount'),

    // Discount tracking: original_amount is the pre-discount price. amount remains what actually left the wallet.
    // Null for non-discounted transactions. Always in same `currency` as amount.
    originalAmount: integer('original_amount'),
    discountReason: text('discount_reason'),

    payee: text('payee'),
    memo: text('memo'),
    paymentMethod: text('payment_method'),

    recurringSeriesId: text('recurring_series_id').references(
      (): AnySQLiteColumn => recurringSeries.id,
      { onDelete: 'set null' }
    ),

    createdAt,
    updatedAt
  },
  (t) => ({
    idxOccurred: index('idx_tx_occurred').on(t.occurredAt),
    idxType: index('idx_tx_type').on(t.type),
    idxCategory: index('idx_tx_category').on(t.categoryId),
    idxAccount: index('idx_tx_account').on(t.accountId),
    idxRecurring: index('idx_tx_recurring').on(t.recurringSeriesId)
  })
)

/* =====================================================================
 * 6b. transaction_splits — split a transaction across multiple categories
 * =====================================================================*/
export const transactionSplits = sqliteTable(
  'transaction_splits',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    amountInBase: integer('amount_in_base').notNull(),
    memo: text('memo'),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt,
    updatedAt
  },
  (t) => ({
    idxTx: index('idx_split_tx').on(t.transactionId),
    idxCategory: index('idx_split_category').on(t.categoryId)
  })
)

/* =====================================================================
 * 7. transaction_tags — M:N
 * =====================================================================*/
export const transactionTags = sqliteTable(
  'transaction_tags',
  {
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => ({
    pk: primaryKey({ columns: [t.transactionId, t.tagId] }),
    idxTag: index('idx_txtag_tag').on(t.tagId)
  })
)

/* =====================================================================
 * 8. recurring_series — RRULE-based repeating transactions
 * =====================================================================*/
export const recurringSeries = sqliteTable(
  'recurring_series',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),

    amount: integer('amount').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),

    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),

    payee: text('payee'),
    memo: text('memo'),
    paymentMethod: text('payment_method'),

    // iCal RFC 5545 RRULE (e.g., "FREQ=MONTHLY;BYMONTHDAY=1")
    rrule: text('rrule').notNull(),
    dtstart: text('dtstart').notNull(), // YYYY-MM-DD
    until: text('until'), // YYYY-MM-DD | null
    count: integer('count'), // total occurrences | null

    // Cached next occurrence for quick queries; recomputed after each materialization
    nextOccurrence: text('next_occurrence'),

    autoCreate: integer('auto_create', { mode: 'boolean' }).notNull().default(true),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

    /**
     * Temporarily suspend materialization until this date (YYYY-MM-DD).
     * When non-null and >= today, the materializer skips this series.
     * Different from `isActive=false` (permanent off): a paused series will
     * resume automatically once the date passes.
     */
    pausedUntil: text('paused_until'),

    createdAt,
    updatedAt
  },
  (t) => ({
    idxNext: index('idx_rec_next').on(t.nextOccurrence),
    idxActive: index('idx_rec_active').on(t.isActive),
    idxPausedUntil: index('idx_rec_paused_until').on(t.pausedUntil)
  })
)

/* =====================================================================
 * 9. recurring_tags — M:N
 * =====================================================================*/
export const recurringTags = sqliteTable(
  'recurring_tags',
  {
    seriesId: text('series_id')
      .notNull()
      .references(() => recurringSeries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => ({
    pk: primaryKey({ columns: [t.seriesId, t.tagId] })
  })
)

/* =====================================================================
 * 10. attachments — receipt images etc.
 * =====================================================================*/
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id')
    .notNull()
    .references(() => transactions.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(), // relative to userData/attachments/
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type'),
  size: integer('size'),
  createdAt,
  updatedAt
})

/* =====================================================================
 * 11. settings — KV app settings
 * =====================================================================*/
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON string
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
})

/* =====================================================================
 * 12. budgets — monthly category budgets (v2.1 design)
 * =====================================================================*/
export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null'
    }),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    includesDescendants: integer('includes_descendants', { mode: 'boolean' })
      .notNull()
      .default(true),
    carryOver: integer('carry_over', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt,
    updatedAt
  },
  (t) => ({
    idxPeriod: index('idx_bg_period').on(t.periodYear, t.periodMonth),
    idxCategory: index('idx_bg_category').on(t.categoryId)
  })
)

/* =====================================================================
 * 13. savings_goals — personal savings targets
 * =====================================================================*/
export const savingsGoals = sqliteTable(
  'savings_goals',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    targetAmount: integer('target_amount').notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    startDate: text('start_date').notNull(),
    targetDate: text('target_date'),
    status: text('status', { enum: ['active', 'achieved', 'cancelled'] })
      .notNull()
      .default('active'),
    achievedAt: integer('achieved_at', { mode: 'timestamp_ms' }),
    startingBalance: integer('starting_balance').notNull().default(0),
    manualAmount: integer('manual_amount'),
    /** JSON array of GoalTagInclusionType: e.g. '["income","transfer_in"]' */
    tagInclusionTypes: text('tag_inclusion_types')
      .notNull()
      .default('["income","transfer_in"]'),
    icon: text('icon'),
    color: text('color'),
    displayOrder: integer('display_order').notNull().default(0),
    notes: text('notes'),
    createdAt,
    updatedAt
  },
  (t) => ({
    idxStatus: index('idx_sg_status').on(t.status),
    idxTargetDate: index('idx_sg_target_date').on(t.targetDate)
  })
)

/* =====================================================================
 * 14. savings_goal_accounts — M:N goal ↔ account
 * =====================================================================*/
export const savingsGoalAccounts = sqliteTable(
  'savings_goal_accounts',
  {
    goalId: text('goal_id')
      .notNull()
      .references(() => savingsGoals.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' })
  },
  (t) => ({
    pk: primaryKey({ columns: [t.goalId, t.accountId] }),
    idxAccount: index('idx_sga_account').on(t.accountId)
  })
)

/* =====================================================================
 * 15. savings_goal_tags — M:N goal ↔ tag
 * =====================================================================*/
export const savingsGoalTags = sqliteTable(
  'savings_goal_tags',
  {
    goalId: text('goal_id')
      .notNull()
      .references(() => savingsGoals.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => ({
    pk: primaryKey({ columns: [t.goalId, t.tagId] }),
    idxTag: index('idx_sgt_tag').on(t.tagId)
  })
)

/* =====================================================================
 * Inferred row types (for repositories/services)
 * =====================================================================*/
export type CurrencyRow = typeof currencies.$inferSelect
export type CurrencyInsert = typeof currencies.$inferInsert
export type ExchangeRateRow = typeof exchangeRates.$inferSelect
export type ExchangeRateInsert = typeof exchangeRates.$inferInsert
export type AccountRow = typeof accounts.$inferSelect
export type AccountInsert = typeof accounts.$inferInsert
export type CategoryRow = typeof categories.$inferSelect
export type CategoryInsert = typeof categories.$inferInsert
export type TagRow = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert
export type TransactionRow = typeof transactions.$inferSelect
export type TransactionInsert = typeof transactions.$inferInsert
export type RecurringSeriesRow = typeof recurringSeries.$inferSelect
export type RecurringSeriesInsert = typeof recurringSeries.$inferInsert
export type TransactionSplitRow = typeof transactionSplits.$inferSelect
export type TransactionSplitInsert = typeof transactionSplits.$inferInsert
export type AttachmentRow = typeof attachments.$inferSelect
export type SettingsRow = typeof settings.$inferSelect
export type BudgetRow = typeof budgets.$inferSelect
export type BudgetInsert = typeof budgets.$inferInsert
export type SavingsGoalRow = typeof savingsGoals.$inferSelect
export type SavingsGoalInsert = typeof savingsGoals.$inferInsert
export type SavingsGoalAccountRow = typeof savingsGoalAccounts.$inferSelect
export type SavingsGoalTagRow = typeof savingsGoalTags.$inferSelect
