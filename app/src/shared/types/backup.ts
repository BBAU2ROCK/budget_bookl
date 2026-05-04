import type { TransactionFilter } from './transaction'

export interface BackupExportResult {
  savedPath: string
  sizeBytes: number
}

export interface BackupImportResult {
  replacedPath: string
  previousBackupPath: string
  restoredSizeBytes: number
}

export interface CsvExportInput {
  filter?: TransactionFilter
  /** If omitted, shows a save-file dialog */
  suggestedFilename?: string
}

export interface CsvExportResult {
  savedPath: string
  rowCount: number
}

export interface CsvImportResult {
  inserted: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

export type ResetMode = 'transactions' | 'all'

export interface ResetResult {
  mode: ResetMode
  deleted: {
    transactions: number
    transactionSplits?: number
    recurringSeries: number
    attachments: number
    accounts?: number
    categories?: number
    tags?: number
    exchangeRates?: number
    budgets?: number
    savingsGoals?: number
  }
}
