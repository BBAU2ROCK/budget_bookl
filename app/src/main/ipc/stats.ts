import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { statsRepo } from '../db/repositories/stats'
import type {
  AccountSpendingInput,
  CardDiscountSeriesInput,
  CardSpendInput,
  CategoryBreakdownInput,
  MonthlySummaryInput,
  MultiYearComparisonInput,
  SavingsBalanceInput,
  StatsFilter,
  TimeSeriesInput,
  TopDiscountInput,
  YearlySummaryInput
} from '../../shared/types'

export function registerStatsHandlers(): void {
  ipcMain.handle(IPC.STATS_MONTHLY_SUMMARY, (_e, input: MonthlySummaryInput) =>
    statsRepo.monthlySummary(input)
  )
  ipcMain.handle(IPC.STATS_YEARLY_SUMMARY, (_e, input: YearlySummaryInput) =>
    statsRepo.yearlySummary(input)
  )
  ipcMain.handle(IPC.STATS_MULTI_YEAR_COMPARISON, (_e, input: MultiYearComparisonInput) =>
    statsRepo.multiYearComparison(input)
  )
  ipcMain.handle(IPC.STATS_CATEGORY_BREAKDOWN, (_e, input: CategoryBreakdownInput) =>
    statsRepo.categoryBreakdown(input)
  )
  ipcMain.handle(IPC.STATS_TAG_BREAKDOWN, (_e, input: StatsFilter) =>
    statsRepo.tagBreakdown(input)
  )
  ipcMain.handle(IPC.STATS_TIME_SERIES, (_e, input: TimeSeriesInput) =>
    statsRepo.timeSeries(input)
  )
  ipcMain.handle(
    IPC.STATS_TOP_PAYEES,
    (_e, input: StatsFilter & { limit?: number }) => statsRepo.topPayees(input)
  )
  ipcMain.handle(
    IPC.STATS_TOP_TRANSACTIONS,
    (_e, input: StatsFilter & { limit?: number }) => statsRepo.topTransactions(input)
  )
  ipcMain.handle(IPC.STATS_CARD_SPEND, (_e, input: CardSpendInput) =>
    statsRepo.cardSpendSummary(input)
  )
  ipcMain.handle(IPC.STATS_CARD_DISCOUNT_SERIES, (_e, input: CardDiscountSeriesInput) =>
    statsRepo.cardDiscountTimeSeries(input)
  )
  ipcMain.handle(IPC.STATS_TOP_DISCOUNT_TRANSACTIONS, (_e, input: TopDiscountInput) =>
    statsRepo.topDiscountTransactions(input)
  )
  ipcMain.handle(IPC.STATS_ACCOUNT_SPENDING, (_e, input: AccountSpendingInput) =>
    statsRepo.accountSpending(input)
  )
  ipcMain.handle(IPC.STATS_SAVINGS_BALANCE, (_e, input: SavingsBalanceInput) =>
    statsRepo.savingsBalance(input)
  )
}
