import { getDb, getSqlite } from '../db/client'
import {
  accounts,
  attachments,
  budgets,
  categories,
  currencies,
  exchangeRates,
  recurringSeries,
  recurringTags,
  savingsGoalAccounts,
  savingsGoalTags,
  savingsGoals,
  settings,
  tags,
  transactionSplits,
  transactionTags,
  transactions
} from '../db/schema'
import { seedIfEmpty } from '../db/seed'
import type { ResetResult } from '../../shared/types'

/**
 * Delete only transactional data — keeps structural configuration (categories, tags, accounts, FX rates, settings).
 */
export function resetTransactionsOnly(): ResetResult {
  const db = getDb()
  const d = { transactions: 0, transactionSplits: 0, recurringSeries: 0, attachments: 0 }

  db.transaction((tx) => {
    // Order: leaves first to respect FK even though CASCADE handles most.
    d.attachments = tx.delete(attachments).run().changes
    tx.delete(transactionTags).run()
    // Splits cascade-delete with their parent transactions, but explicit wipe
    // makes the count visible and is cheap.
    d.transactionSplits = tx.delete(transactionSplits).run().changes
    d.transactions = tx.delete(transactions).run().changes
    tx.delete(recurringTags).run()
    d.recurringSeries = tx.delete(recurringSeries).run().changes
  })

  // Force main db file to reflect deletes immediately
  try {
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // best effort
  }

  return { mode: 'transactions', deleted: d }
}

/**
 * Full factory reset — wipe all tables then re-seed defaults.
 */
export function resetAllAndReseed(): ResetResult {
  const db = getDb()
  const d = {
    transactions: 0,
    transactionSplits: 0,
    recurringSeries: 0,
    attachments: 0,
    accounts: 0,
    categories: 0,
    tags: 0,
    exchangeRates: 0,
    budgets: 0,
    savingsGoals: 0
  }

  db.transaction((tx) => {
    // Wipe leaves first (FK-safe order; onDelete rules also provide defense in depth).
    // budgets/savingsGoals reference currencies → must be wiped before currencies,
    // otherwise the currencies wipe later raises a FOREIGN KEY violation.
    d.attachments = tx.delete(attachments).run().changes
    tx.delete(transactionTags).run()
    tx.delete(recurringTags).run()
    // savings goal join tables (cascade with parents, but explicit is safer)
    tx.delete(savingsGoalAccounts).run()
    tx.delete(savingsGoalTags).run()
    d.savingsGoals = tx.delete(savingsGoals).run().changes
    d.budgets = tx.delete(budgets).run().changes
    d.transactionSplits = tx.delete(transactionSplits).run().changes
    d.transactions = tx.delete(transactions).run().changes
    d.recurringSeries = tx.delete(recurringSeries).run().changes
    d.exchangeRates = tx.delete(exchangeRates).run().changes
    d.accounts = tx.delete(accounts).run().changes
    d.tags = tx.delete(tags).run().changes
    d.categories = tx.delete(categories).run().changes
    tx.delete(currencies).run()
    // Wipe settings last — this clears the __seeded__ guard so seedIfEmpty() below re-runs.
    tx.delete(settings).run()
  })

  // Re-run the idempotent seed (currencies, default categories, base settings)
  seedIfEmpty()

  try {
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // best effort
  }

  return { mode: 'all', deleted: d }
}
