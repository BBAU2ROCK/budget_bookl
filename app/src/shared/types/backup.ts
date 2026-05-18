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

/* =========================================================================
 * Budget Excel export (v0.1.16)
 * =========================================================================*/

export interface BudgetExportInput {
  year: number
  month: number
}

export interface BudgetExportResult {
  savedPath: string
  /** 시트에 출력된 카테고리 행 수 (합계 행 제외) */
  rowCount: number
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
