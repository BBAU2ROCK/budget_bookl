import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import { getDb } from '../client'
import {
  accounts,
  budgets,
  categories,
  savingsGoals,
  savingsGoalAccounts,
  savingsGoalTags,
  tags,
  transactionSplits,
  transactionTags,
  transactions
} from '../schema'
import { accountsRepo } from './accounts'
import { categoriesRepo } from './categories'
import { currenciesRepo } from './currencies'
import { goalsRepo } from './goals'
import { settingsRepo } from './settings'
import type {
  AccountSpendingEntry,
  AccountSpendingInput,
  AccountSpendingResult,
  SavingsBalanceDto,
  SavingsBalanceInput,
  BudgetPaceStatus,
  BudgetStatus,
  BudgetVsActualEntry,
  BudgetVsActualInput,
  CardDiscountPoint,
  CardDiscountSeriesInput,
  CardSpendEntry,
  CardSpendInput,
  CategoryBreakdownEntry,
  CategoryBreakdownInput,
  GoalPaceStatus,
  GoalProgressDto,
  GoalProgressFilter,
  GoalStatus,
  MonthlySummaryDto,
  MonthlySummaryInput,
  MultiYearComparisonDto,
  MultiYearComparisonInput,
  PeriodComparisonAxis,
  PeriodComparisonDto,
  StatsFilter,
  TagBreakdownEntry,
  TimeGranularity,
  TimeSeriesInput,
  TimeSeriesPoint,
  TopDiscountInput,
  TopDiscountTxEntry,
  TopPayeeEntry,
  TopTransactionEntry,
  YearlySummaryDto,
  YearlySummaryInput
} from '../../../shared/types'

/* =========================================================================
 * Helpers
 * =========================================================================*/

function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)) // exclusive end
  return { from, to }
}

function yearRange(year: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
  return { from, to }
}

function delta(current: number, previous: number): PeriodComparisonAxis {
  const deltaAbs = current - previous
  const deltaPct = previous === 0 ? null : (deltaAbs / Math.abs(previous)) * 100
  return { current, previous, deltaAbs, deltaPct }
}

/** Collect a category + all descendants as a flat id list */
function expandCategorySubtree(rootIds: string[]): string[] {
  if (rootIds.length === 0) return []
  const all = categoriesRepo.list(true)
  const childrenByParent = new Map<string, string[]>()
  for (const c of all) {
    if (c.parentId) {
      const arr = childrenByParent.get(c.parentId) ?? []
      arr.push(c.id)
      childrenByParent.set(c.parentId, arr)
    }
  }
  const result = new Set<string>()
  const walk = (id: string): void => {
    if (result.has(id)) return
    result.add(id)
    const kids = childrenByParent.get(id)
    if (kids) kids.forEach(walk)
  }
  rootIds.forEach(walk)
  return [...result]
}

/** Build a where-clause array for a given StatsFilter. */
function buildWhere(
  filter: StatsFilter
): ReturnType<typeof and> | undefined {
  const conds: ReturnType<typeof eq>[] = []
  conds.push(gte(transactions.occurredAt, new Date(filter.from)))
  conds.push(lte(transactions.occurredAt, new Date(filter.to)))
  if (filter.types && filter.types.length > 0) {
    conds.push(inArray(transactions.type, filter.types))
  }
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    const ids = filter.categoryIncludeDescendants
      ? expandCategorySubtree(filter.categoryIds)
      : filter.categoryIds
    conds.push(inArray(transactions.categoryId, ids))
  }
  if (filter.accountIds && filter.accountIds.length > 0) {
    conds.push(inArray(transactions.accountId, filter.accountIds))
  }
  return and(...conds)
}

/** Category path helper (fast lookup map) */
function buildCategoryPathMap(): Map<string, { path: string; parentId: string | null; kind: 'income' | 'expense' }> {
  const tree = categoriesRepo.list(true)
  const byId = new Map<string, (typeof tree)[number]>()
  tree.forEach((c) => byId.set(c.id, c))
  const cache = new Map<string, { path: string; parentId: string | null; kind: 'income' | 'expense' }>()

  // 카테고리 트리에 간접 사이클(A→B→A)이 있으면 무한 재귀가 메인 프로세스를 죽임.
  // 정상 경로엔 절대 발생하지 않지만 CSV import / DB 복원으로 데이터가 손상될 가능성이 있어
  // 방문 노드 set으로 가드한다.
  const resolve = (id: string, seen: Set<string> = new Set()): string => {
    const c = byId.get(id)
    if (!c) return ''
    if (seen.has(id)) return c.name // cycle 감지 — 더 이상 부모로 거슬러 올라가지 않음
    seen.add(id)
    if (!c.parentId) return c.name
    return `${resolve(c.parentId, seen)} › ${c.name}`
  }

  for (const c of tree) {
    cache.set(c.id, { path: resolve(c.id), parentId: c.parentId, kind: c.kind })
  }
  return cache
}

/* =========================================================================
 * Main queries
 * =========================================================================*/

/**
 * IPC 진입부 입력 검증. NaN/Infinity/음수/13월 같은 잘못된 값이 흘러 들어오면
 * `new Date(NaN, ...)` → Invalid Date로 빈 결과를 조용히 반환하는 대신
 * 명확한 에러를 던져 호출자가 인지하게 한다.
 */
function validateYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`잘못된 연도: ${year}`)
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`잘못된 월: ${month}`)
  }
}

function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`잘못된 연도: ${year}`)
  }
}

export const statsRepo = {
  /**
   * Compute totals for a calendar month plus comparisons vs previous month and previous year.
   */
  monthlySummary(input: MonthlySummaryInput): MonthlySummaryDto {
    validateYearMonth(input.year, input.month)
    const { from, to } = monthRange(input.year, input.month)
    const prevMonth = monthRange(
      input.month === 1 ? input.year - 1 : input.year,
      input.month === 1 ? 12 : input.month - 1
    )
    const prevYear = monthRange(input.year - 1, input.month)

    const baseFilter: Omit<StatsFilter, 'from' | 'to'> = {
      categoryIds: input.categoryIds,
      tagIds: input.tagIds,
      accountIds: input.accountIds
    }

    const sumPeriod = (p: { from: Date; to: Date }): { income: number; expense: number; count: number } => {
      const statsFilter: StatsFilter = {
        ...baseFilter,
        from: p.from.toISOString(),
        to: p.to.toISOString()
      }
      return sumIncomeExpense(statsFilter)
    }

    const current = sumPeriod({ from, to })
    const prev = sumPeriod(prevMonth)
    const yoy = sumPeriod(prevYear)

    const currentNet = current.income - current.expense

    const buildComparison = (
      a: { income: number; expense: number },
      b: { income: number; expense: number }
    ): PeriodComparisonDto => ({
      income: delta(a.income, b.income),
      expense: delta(a.expense, b.expense),
      net: delta(a.income - a.expense, b.income - b.expense)
    })

    return {
      period: {
        year: input.year,
        month: input.month,
        from: from.toISOString(),
        to: to.toISOString()
      },
      baseCurrency: settingsRepo.getBaseCurrency(),
      income: current.income,
      expense: current.expense,
      net: currentNet,
      transactionCount: current.count,
      vsPrevMonth: buildComparison(
        { income: current.income, expense: current.expense },
        { income: prev.income, expense: prev.expense }
      ),
      vsPrevYear: buildComparison(
        { income: current.income, expense: current.expense },
        { income: yoy.income, expense: yoy.expense }
      )
    }
  },

  /**
   * Aggregate totals for a full calendar year + comparison vs previous year + monthly breakdown.
   */
  yearlySummary(input: YearlySummaryInput): YearlySummaryDto {
    validateYear(input.year)
    const baseFilter: Omit<StatsFilter, 'from' | 'to'> = {
      categoryIds: input.categoryIds,
      tagIds: input.tagIds,
      accountIds: input.accountIds
    }

    const { from, to } = yearRange(input.year)
    const { from: prevFrom, to: prevTo } = yearRange(input.year - 1)

    const current = sumIncomeExpense({
      ...baseFilter,
      from: from.toISOString(),
      to: to.toISOString()
    })
    const prev = sumIncomeExpense({
      ...baseFilter,
      from: prevFrom.toISOString(),
      to: prevTo.toISOString()
    })

    const monthlyBreakdown = [] as YearlySummaryDto['monthlyBreakdown']
    for (let m = 1; m <= 12; m++) {
      const mr = monthRange(input.year, m)
      const s = sumIncomeExpense({
        ...baseFilter,
        from: mr.from.toISOString(),
        to: mr.to.toISOString()
      })
      monthlyBreakdown.push({
        month: m,
        income: s.income,
        expense: s.expense,
        net: s.income - s.expense,
        transactionCount: s.count
      })
    }

    return {
      period: {
        year: input.year,
        from: from.toISOString(),
        to: to.toISOString()
      },
      baseCurrency: settingsRepo.getBaseCurrency(),
      income: current.income,
      expense: current.expense,
      net: current.income - current.expense,
      transactionCount: current.count,
      vsPrevYear: {
        income: delta(current.income, prev.income),
        expense: delta(current.expense, prev.expense),
        net: delta(current.income - current.expense, prev.income - prev.expense)
      },
      monthlyBreakdown
    }
  },

  /**
   * Return per-year totals for the past N years (inclusive of reference year).
   * Useful for YoY bar charts.
   */
  multiYearComparison(input: MultiYearComparisonInput): MultiYearComparisonDto {
    const ref = input.referenceYear ?? new Date().getFullYear()
    validateYear(ref)
    if (!Number.isInteger(input.yearsBack) || input.yearsBack < 0 || input.yearsBack > 50) {
      throw new Error(`잘못된 yearsBack: ${input.yearsBack}`)
    }
    const count = Math.max(1, input.yearsBack + 1)
    const baseFilter: Omit<StatsFilter, 'from' | 'to'> = {
      categoryIds: input.categoryIds,
      tagIds: input.tagIds,
      accountIds: input.accountIds
    }

    const years: MultiYearComparisonDto['years'] = []
    for (let i = count - 1; i >= 0; i--) {
      const y = ref - i
      const { from, to } = yearRange(y)
      const s = sumIncomeExpense({
        ...baseFilter,
        from: from.toISOString(),
        to: to.toISOString()
      })
      years.push({
        year: y,
        income: s.income,
        expense: s.expense,
        net: s.income - s.expense,
        transactionCount: s.count
      })
    }

    return {
      baseCurrency: settingsRepo.getBaseCurrency(),
      years
    }
  },

  /**
   * Aggregate amountInBase by category within a date range.
   * Supports rolling up to root categories.
   */
  categoryBreakdown(input: CategoryBreakdownInput): CategoryBreakdownEntry[] {
    const db = getDb()
    const where = buildWhere(input)
    if (!where) return []

    // Splits-aware aggregation:
    // - For each transaction with no splits, parent's (category_id, amount_in_base) contributes once.
    // - For each transaction WITH splits, every split's (category_id, amount_in_base) contributes
    //   and the parent's row is suppressed (via NOT IN subquery), so the totals stay consistent.
    const typeCondition = input.kind
      ? eq(transactions.type, input.kind)
      : inArray(transactions.type, ['expense', 'income'])

    // Pre-resolve which transaction IDs in scope have splits.
    const txIdsWithSplits = new Set(
      db
        .selectDistinct({ id: transactionSplits.transactionId })
        .from(transactionSplits)
        .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
        .where(and(where, typeCondition))
        .all()
        .map((r) => r.id)
    )

    type Raw = { categoryId: string | null; type: 'expense' | 'income' | 'transfer'; total: number; count: number }
    let rows: Raw[]

    if (txIdsWithSplits.size === 0) {
      // Fast path: no splits in range — original aggregation.
      rows = db
        .select({
          categoryId: transactions.categoryId,
          type: transactions.type,
          total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
          count: sql<number>`COUNT(*)`
        })
        .from(transactions)
        .where(and(where, typeCondition))
        .groupBy(transactions.categoryId, transactions.type)
        .all()
    } else {
      // Combined aggregation:
      //  (a) parent rows for transactions WITHOUT splits
      //  (b) split rows for transactions WITH splits
      const parentRows = db
        .select({
          categoryId: transactions.categoryId,
          type: transactions.type,
          total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
          count: sql<number>`COUNT(*)`
        })
        .from(transactions)
        .where(
          and(
            where,
            typeCondition,
            sql`${transactions.id} NOT IN (SELECT ${transactionSplits.transactionId} FROM ${transactionSplits})`
          )
        )
        .groupBy(transactions.categoryId, transactions.type)
        .all()

      const splitRows = db
        .select({
          categoryId: transactionSplits.categoryId,
          type: transactions.type,
          total: sql<number>`COALESCE(SUM(${transactionSplits.amountInBase}), 0)`,
          // Each split counts as one record for the breakdown's count column.
          count: sql<number>`COUNT(*)`
        })
        .from(transactionSplits)
        .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
        .where(and(where, typeCondition))
        .groupBy(transactionSplits.categoryId, transactions.type)
        .all()

      rows = [...parentRows, ...splitRows]
    }

    const pathMap = buildCategoryPathMap()
    const nameById = (id: string): string | null => {
      const c = pathMap.get(id)
      return c ? c.path.split(' › ').pop()! : null
    }

    // Tag filter — keep prior behaviour: prefilter to matching tx IDs, then
    // re-aggregate (note: tag filter ignores splits-vs-parent split, since tags
    // belong to the transaction as a whole).
    if (input.tagIds && input.tagIds.length > 0) {
      const filteredIds = db
        .select({ id: transactions.id })
        .from(transactions)
        .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
        .where(and(where, inArray(transactionTags.tagId, input.tagIds)))
        .all()
        .map((r) => r.id)

      if (filteredIds.length === 0) return []

      // Same splits-aware logic on the filtered subset.
      const filteredHasSplits = new Set(
        db
          .selectDistinct({ id: transactionSplits.transactionId })
          .from(transactionSplits)
          .where(inArray(transactionSplits.transactionId, filteredIds))
          .all()
          .map((r) => r.id)
      )

      let regrouped: Raw[]
      if (filteredHasSplits.size === 0) {
        regrouped = db
          .select({
            categoryId: transactions.categoryId,
            type: transactions.type,
            total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
            count: sql<number>`COUNT(*)`
          })
          .from(transactions)
          .where(inArray(transactions.id, filteredIds))
          .groupBy(transactions.categoryId, transactions.type)
          .all()
      } else {
        const idsWithoutSplits = filteredIds.filter((id) => !filteredHasSplits.has(id))
        const idsWithSplits = filteredIds.filter((id) => filteredHasSplits.has(id))

        const parentR =
          idsWithoutSplits.length > 0
            ? db
                .select({
                  categoryId: transactions.categoryId,
                  type: transactions.type,
                  total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
                  count: sql<number>`COUNT(*)`
                })
                .from(transactions)
                .where(inArray(transactions.id, idsWithoutSplits))
                .groupBy(transactions.categoryId, transactions.type)
                .all()
            : []

        const splitR =
          idsWithSplits.length > 0
            ? db
                .select({
                  categoryId: transactionSplits.categoryId,
                  type: transactions.type,
                  total: sql<number>`COALESCE(SUM(${transactionSplits.amountInBase}), 0)`,
                  count: sql<number>`COUNT(*)`
                })
                .from(transactionSplits)
                .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
                .where(inArray(transactionSplits.transactionId, idsWithSplits))
                .groupBy(transactionSplits.categoryId, transactions.type)
                .all()
            : []

        regrouped = [...parentR, ...splitR]
      }

      return finalize(regrouped)
    }

    return finalize(rows)

    function finalize(
      raw: { categoryId: string | null; type: 'expense' | 'income' | 'transfer'; total: number; count: number }[]
    ): CategoryBreakdownEntry[] {
      // Roll up if requested
      const buckets = new Map<
        string,
        { id: string | null; total: number; count: number; kind: 'income' | 'expense' | 'unknown' }
      >()
      for (const r of raw) {
        if (r.type === 'transfer') continue
        let keyId = r.categoryId
        if (input.rollupToRoot && keyId) {
          let cur: string | null = keyId
          // cycle 가드: 손상된 카테고리 트리에서 무한 루프 방지
          const seen = new Set<string>()
          while (cur && !seen.has(cur)) {
            seen.add(cur)
            const parent = pathMap.get(cur)?.parentId ?? null
            if (!parent) break
            cur = parent
          }
          keyId = cur
        }
        const k = keyId ?? '__null__'
        const prev = buckets.get(k) ?? {
          id: keyId,
          total: 0,
          count: 0,
          kind: (r.type as 'income' | 'expense') ?? 'unknown'
        }
        prev.total += r.total
        prev.count += r.count
        buckets.set(k, prev)
      }

      const totalSum = [...buckets.values()].reduce((acc, b) => acc + b.total, 0) || 1

      return [...buckets.values()]
        .map((b) => ({
          categoryId: b.id,
          categoryName: b.id ? nameById(b.id) : null,
          categoryPath: b.id ? (pathMap.get(b.id)?.path ?? null) : null,
          parentId: b.id ? (pathMap.get(b.id)?.parentId ?? null) : null,
          kind: b.kind,
          total: b.total,
          count: b.count,
          percent: (b.total / totalSum) * 100
        }))
        .sort((a, b) => b.total - a.total)
    }
  },

  tagBreakdown(filter: StatsFilter): TagBreakdownEntry[] {
    const db = getDb()
    const where = buildWhere(filter)
    if (!where) return []

    const rows = db
      .select({
        tagId: transactionTags.tagId,
        total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
        count: sql<number>`COUNT(DISTINCT ${transactions.id})`
      })
      .from(transactions)
      .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
      .where(
        filter.types && filter.types.length > 0
          ? and(where, inArray(transactions.type, filter.types))
          : and(where, inArray(transactions.type, ['expense', 'income']))
      )
      .groupBy(transactionTags.tagId)
      .all()

    if (rows.length === 0) return []

    const tagIds = rows.map((r) => r.tagId)
    const tagRows = db.select().from(tags).where(inArray(tags.id, tagIds)).all()
    const tagById = new Map(tagRows.map((t) => [t.id, t]))
    const totalSum = rows.reduce((acc, r) => acc + r.total, 0) || 1

    return rows
      .map((r) => ({
        tagId: r.tagId,
        tagName: tagById.get(r.tagId)?.name ?? '(unknown)',
        color: tagById.get(r.tagId)?.color ?? null,
        total: r.total,
        count: r.count,
        percent: (r.total / totalSum) * 100
      }))
      .sort((a, b) => b.total - a.total)
  },

  timeSeries(input: TimeSeriesInput): TimeSeriesPoint[] {
    const db = getDb()
    const where = buildWhere(input)
    if (!where) return []

    const rows = db
      .select({
        id: transactions.id,
        occurredAt: transactions.occurredAt,
        type: transactions.type,
        amountInBase: transactions.amountInBase
      })
      .from(transactions)
      .where(and(where, inArray(transactions.type, ['expense', 'income'])))
      .all()

    // Tag filter (post-SQL)
    let filtered = rows
    if (input.tagIds && input.tagIds.length > 0) {
      const txIds = rows.map((r) => r.id)
      if (txIds.length === 0) return []
      const txTagRows = db
        .select()
        .from(transactionTags)
        .where(
          and(
            inArray(transactionTags.transactionId, txIds),
            inArray(transactionTags.tagId, input.tagIds)
          )
        )
        .all()
      const matchSet = new Set(txTagRows.map((r) => r.transactionId))
      filtered = rows.filter((r) => matchSet.has(r.id))
    }

    // Bucket in JS (local time)
    const buckets = new Map<string, { income: number; expense: number }>()
    for (const r of filtered) {
      const key = bucketKey(r.occurredAt, input.granularity)
      const b = buckets.get(key) ?? { income: 0, expense: 0 }
      if (r.type === 'income') b.income += r.amountInBase
      else if (r.type === 'expense') b.expense += r.amountInBase
      buckets.set(key, b)
    }

    // Fill missing buckets between from/to to produce continuous series
    const series: TimeSeriesPoint[] = []
    const cursor = startOf(new Date(input.from), input.granularity)
    const end = new Date(input.to)
    let cumIncome = 0
    let cumExpense = 0
    while (cursor <= end) {
      const key = bucketKey(cursor, input.granularity)
      const b = buckets.get(key) ?? { income: 0, expense: 0 }
      if (input.cumulative) {
        cumIncome += b.income
        cumExpense += b.expense
        series.push({
          bucket: key,
          income: cumIncome,
          expense: cumExpense,
          net: cumIncome - cumExpense
        })
      } else {
        series.push({
          bucket: key,
          income: b.income,
          expense: b.expense,
          net: b.income - b.expense
        })
      }
      advance(cursor, input.granularity)
    }
    return series
  },

  topPayees(input: StatsFilter & { limit?: number }): TopPayeeEntry[] {
    const db = getDb()
    const where = buildWhere(input)
    if (!where) return []
    const rows = db
      .select({
        payee: transactions.payee,
        total: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
        count: sql<number>`COUNT(*)`
      })
      .from(transactions)
      .where(
        and(
          where,
          sql`${transactions.payee} IS NOT NULL AND ${transactions.payee} != ''`,
          inArray(
            transactions.type,
            input.types && input.types.length > 0 ? input.types : ['expense', 'income']
          )
        )
      )
      .groupBy(transactions.payee)
      .all()

    const limit = input.limit ?? 10
    return rows
      .slice()
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
      .map((r) => ({
        payee: r.payee ?? '(unknown)',
        total: r.total,
        count: r.count
      }))
  },

  /**
   * Credit-card expense summary, grouped by card account or issuer.
   * 모든 합계는 base currency 단위(amountInBase 정규화). 다통화 카드가 섞여도
   * 의미 있는 그룹 합계가 나옴. originalAmount(native)는 amountInBase/amount 비율로
   * base 환산. Non-discounted rows contribute amountInBase to both originalTotal and actualTotal (discount=0).
   */
  cardSpendSummary(input: CardSpendInput): CardSpendEntry[] {
    const db = getDb()

    // Resolve target accounts: all credit_card type by default, filtered by accountIds if given
    const cardAccounts = db
      .select()
      .from(accounts)
      .where(eq(accounts.type, 'credit_card'))
      .all()
    const filtered = input.accountIds && input.accountIds.length > 0
      ? cardAccounts.filter((a) => input.accountIds!.includes(a.id))
      : cardAccounts

    if (filtered.length === 0) return []

    const targetIds = filtered.map((a) => a.id)
    const rows = db
      .select({
        accountId: transactions.accountId,
        amount: transactions.amount,
        amountInBase: transactions.amountInBase,
        originalAmount: transactions.originalAmount
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to)),
          inArray(transactions.accountId, targetIds)
        )
      )
      .all()

    // Group rows
    const groups = new Map<
      string,
      {
        label: string
        accountIds: Set<string>
        original: number
        actual: number
        discount: number
        txCount: number
        discountedTx: number
      }
    >()

    const keyFor = (acct: (typeof filtered)[number]): { id: string; label: string } => {
      if (input.groupBy === 'account') {
        return { id: acct.id, label: acct.name }
      }
      const issuer = acct.issuer && acct.issuer.trim() ? acct.issuer.trim() : '(미지정)'
      return { id: issuer, label: issuer }
    }

    const acctById = new Map(filtered.map((a) => [a.id, a]))

    for (const r of rows) {
      if (!r.accountId) continue
      const acct = acctById.get(r.accountId)
      if (!acct) continue
      const k = keyFor(acct)
      const entry = groups.get(k.id) ?? {
        label: k.label,
        accountIds: new Set<string>(),
        original: 0,
        actual: 0,
        discount: 0,
        txCount: 0,
        discountedTx: 0
      }
      entry.accountIds.add(acct.id)
      // 음수 amount(=환불성 expense)는 카드 사용 집계 대상이 아니므로 스킵.
      // 정상 expense 거래는 amount > 0이며, schema에 enforced된 CHECK는 없지만
      // transactionsRepo.create가 양수만 허용한다.
      if (r.amount <= 0) continue
      // amountInBase / amount 비율로 originalAmount(native)를 base 환산
      const ratio = r.amountInBase / r.amount
      const actualInBase = r.amountInBase
      const originalInBase =
        r.originalAmount != null ? Math.round(r.originalAmount * ratio) : actualInBase
      const discInBase = originalInBase - actualInBase
      entry.original += originalInBase
      entry.actual += actualInBase
      entry.discount += discInBase
      entry.txCount += 1
      if (r.originalAmount != null) entry.discountedTx += 1
      groups.set(k.id, entry)
    }

    return [...groups.entries()]
      .map(([id, g]) => ({
        groupId: id,
        groupLabel: g.label,
        accountIds: [...g.accountIds],
        originalTotal: g.original,
        actualTotal: g.actual,
        discountTotal: g.discount,
        discountRate: g.original > 0 ? (g.discount / g.original) * 100 : 0,
        transactionCount: g.txCount,
        discountedTxCount: g.discountedTx
      }))
      .sort((a, b) => b.actualTotal - a.actualTotal)
  },

  cardDiscountTimeSeries(input: CardDiscountSeriesInput): CardDiscountPoint[] {
    const db = getDb()

    // Resolve target card accounts
    const cardAccounts = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.type, 'credit_card'))
      .all()
    const targetIds =
      input.accountIds && input.accountIds.length > 0
        ? input.accountIds
        : cardAccounts.map((a) => a.id)

    if (targetIds.length === 0) return []

    const rows = db
      .select({
        occurredAt: transactions.occurredAt,
        amount: transactions.amount,
        originalAmount: transactions.originalAmount
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to)),
          inArray(transactions.accountId, targetIds)
        )
      )
      .all()

    const buckets = new Map<string, { original: number; actual: number; discount: number }>()
    for (const r of rows) {
      const key = bucketKey(r.occurredAt, input.granularity)
      const b = buckets.get(key) ?? { original: 0, actual: 0, discount: 0 }
      const effOriginal = r.originalAmount ?? r.amount
      const disc = r.originalAmount != null ? r.originalAmount - r.amount : 0
      b.original += effOriginal
      b.actual += r.amount
      b.discount += disc
      buckets.set(key, b)
    }

    // Fill gaps
    const out: CardDiscountPoint[] = []
    const cursor = startOf(new Date(input.from), input.granularity)
    const end = new Date(input.to)
    while (cursor <= end) {
      const key = bucketKey(cursor, input.granularity)
      const b = buckets.get(key) ?? { original: 0, actual: 0, discount: 0 }
      out.push({
        bucket: key,
        originalTotal: b.original,
        actualTotal: b.actual,
        discountTotal: b.discount
      })
      advance(cursor, input.granularity)
    }
    return out
  },

  topDiscountTransactions(input: TopDiscountInput): TopDiscountTxEntry[] {
    const db = getDb()
    const rows = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to)),
          sql`${transactions.originalAmount} IS NOT NULL`,
          input.accountIds && input.accountIds.length > 0
            ? inArray(transactions.accountId, input.accountIds)
            : sql`1=1`
        )
      )
      .all()

    const limit = input.limit ?? 10
    return rows
      .map((r) => {
        const original = r.originalAmount ?? r.amount
        const discount = original - r.amount
        return {
          id: r.id,
          occurredAt: r.occurredAt.toISOString(),
          amount: r.amount,
          originalAmount: original,
          discountAmount: discount,
          discountRate: original > 0 ? (discount / original) * 100 : 0,
          currency: r.currency,
          accountId: r.accountId,
          payee: r.payee,
          memo: r.memo,
          discountReason: r.discountReason
        }
      })
      .sort((a, b) => b.discountAmount - a.discountAmount)
      .slice(0, limit)
  },

  topTransactions(input: StatsFilter & { limit?: number }): TopTransactionEntry[] {
    const db = getDb()
    const where = buildWhere(input)
    if (!where) return []
    const pathMap = buildCategoryPathMap()
    const rows = db
      .select()
      .from(transactions)
      .where(
        and(
          where,
          inArray(
            transactions.type,
            input.types && input.types.length > 0 ? input.types : ['expense']
          )
        )
      )
      .all()

    const limit = input.limit ?? 10
    return rows
      .slice()
      .sort((a, b) => b.amountInBase - a.amountInBase)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        amount: r.amount,
        amountInBase: r.amountInBase,
        currency: r.currency,
        categoryPath: r.categoryId ? (pathMap.get(r.categoryId)?.path ?? null) : null,
        payee: r.payee,
        memo: r.memo
      }))
  },

  /* =========================================================================
   * Budget vs Actual (v2.1) — pace analysis + multi-currency
   * =========================================================================*/
  budgetVsActual(input: BudgetVsActualInput): BudgetVsActualEntry[] {
    validateYearMonth(input.year, input.month)
    const db = getDb()
    const baseCurrency = settingsRepo.getBaseCurrency()
    const { year, month } = input

    // 1. Period range (local time month boundaries)
    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const periodEnd = new Date(year, month, 1, 0, 0, 0, 0)
    const daysInPeriod = new Date(year, month, 0).getDate()

    // 2. Days passed (today vs period)
    const today = new Date()
    let daysPassed: number
    if (today < periodStart) {
      daysPassed = 0 // future month
    } else if (today >= periodEnd) {
      daysPassed = daysInPeriod // past month
    } else {
      daysPassed = today.getDate()
    }
    const daysRemaining = Math.max(0, daysInPeriod - daysPassed)
    const timeProgressPercent = (daysPassed / daysInPeriod) * 100

    // 3. Fetch budgets for this month
    const budgetRows = db
      .select()
      .from(budgets)
      .where(and(eq(budgets.periodYear, year), eq(budgets.periodMonth, month)))
      .all()

    // 4. Fetch all expense transactions for this month (transfer excluded by type filter)
    const txRows = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, periodStart),
          lt(transactions.occurredAt, periodEnd)
        )
      )
      .all()

    // 5. Category tree helpers
    const allCats = categoriesRepo.list(true)
    const childrenByParent = new Map<string, string[]>()
    for (const c of allCats) {
      if (c.parentId) {
        const arr = childrenByParent.get(c.parentId) ?? []
        arr.push(c.id)
        childrenByParent.set(c.parentId, arr)
      }
    }
    const collectDescendants = (rootId: string): Set<string> => {
      const out = new Set<string>([rootId])
      const walk = (id: string): void => {
        const kids = childrenByParent.get(id)
        if (!kids) return
        for (const k of kids) {
          if (!out.has(k)) {
            out.add(k)
            walk(k)
          }
        }
      }
      walk(rootId)
      return out
    }
    const pathMap = buildCategoryPathMap()

    // 6. Aggregate expense by categoryId.
    //
    //    Splits-aware: when a transaction has split rows, each split contributes
    //    to its own categoryId at split.amountInBase. The parent's category_id
    //    is ignored to avoid double-counting. Transactions without splits are
    //    aggregated as before.
    const splitRows = db
      .select()
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, periodStart),
          lt(transactions.occurredAt, periodEnd)
        )
      )
      .all()
    const splitsByTxId = new Map<string, typeof splitRows>()
    for (const sr of splitRows) {
      const txId = sr.transactions.id
      const arr = splitsByTxId.get(txId) ?? []
      arr.push(sr)
      splitsByTxId.set(txId, arr)
    }

    const actualByCategory = new Map<string, { sum: number; count: number }>()
    let allActualSum = 0
    let allActualCount = 0
    for (const tx of txRows) {
      const splits = splitsByTxId.get(tx.id)
      if (splits && splits.length > 0) {
        // Distribute the transaction across its splits. Tx counts as 1 transaction
        // even when split, so we increment count once per parent for the catch-all
        // total.
        for (const sr of splits) {
          const k = sr.transaction_splits.categoryId ?? '__null__'
          const cur = actualByCategory.get(k) ?? { sum: 0, count: 0 }
          cur.sum += sr.transaction_splits.amountInBase
          cur.count += 1
          actualByCategory.set(k, cur)
          allActualSum += sr.transaction_splits.amountInBase
        }
        allActualCount += 1
      } else {
        const k = tx.categoryId ?? '__null__'
        const cur = actualByCategory.get(k) ?? { sum: 0, count: 0 }
        cur.sum += tx.amountInBase
        cur.count += 1
        actualByCategory.set(k, cur)
        allActualSum += tx.amountInBase
        allActualCount += 1
      }
    }

    // 7. Build entries from budget rows
    const entries: BudgetVsActualEntry[] = []
    const todayDateStr = today.toISOString().slice(0, 10)

    // Pre-compute previous month's entries ONCE (for carryOver lookup) to avoid
    // re-running this O(N) function inside the per-budget loop, which would be O(N×M).
    // Only fetched when at least one budget enables carryOver.
    let prevMonthByCategoryId: Map<string | null, BudgetVsActualEntry> | null = null
    const anyCarry = budgetRows.some((b) => b.carryOver)
    if (anyCarry) {
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      // 1900-01의 carryOver 조회는 prevYear=1899로 validateYearMonth에서 throw.
      // 정상적인 사용에서는 발생할 일이 없지만 방어적으로 try/catch로 감싸 carryOver만
      // 비활성 폴백되도록 한다 (메인 화면 자체는 계속 표시).
      // 현재 input의 옵션을 그대로 전달해 includesDescendants 같은 옵션 차이로 잔액이
      // 어긋나지 않도록 한다.
      try {
        const prev = this.budgetVsActual({
          ...input,
          year: prevYear,
          month: prevMonth,
          includeUnsetCategories: false
        })
        prevMonthByCategoryId = new Map()
        for (const pe of prev) {
          if (!pe.isTotalRow) prevMonthByCategoryId.set(pe.categoryId, pe)
        }
      } catch {
        prevMonthByCategoryId = null
      }
    }

    for (const b of budgetRows) {
      // Compute actual for this budget's scope
      let actual = 0
      let txCount = 0
      if (b.categoryId == null) {
        actual = allActualSum
        txCount = allActualCount
      } else {
        const targetIds = b.includesDescendants ? collectDescendants(b.categoryId) : new Set([b.categoryId])
        for (const id of targetIds) {
          const v = actualByCategory.get(id)
          if (v) {
            actual += v.sum
            txCount += v.count
          }
        }
      }

      // Currency conversion (FX fallback)
      let conversionWarning: 'none' | 'no_rate' = 'none'
      let budgetInBase = b.amount
      if (b.currency !== baseCurrency) {
        const rate = currenciesRepo.getRateAsOf(b.currency, baseCurrency, todayDateStr)
        if (rate == null) {
          conversionWarning = 'no_rate'
          budgetInBase = b.amount // 1:1 fallback
        } else {
          budgetInBase = Math.round(b.amount * rate)
        }
      }

      // Carry-over from previous month (only positive surplus carries).
      // Lookup is O(1) thanks to the pre-computed map above.
      let carryOver = 0
      if (b.carryOver && prevMonthByCategoryId) {
        const prevMatching = prevMonthByCategoryId.get(b.categoryId)
        if (prevMatching && prevMatching.remaining > 0) {
          carryOver = prevMatching.remaining
        }
      }

      const effectiveBudget = budgetInBase + carryOver
      const remaining = effectiveBudget - actual
      const percentUsed = effectiveBudget > 0 ? (actual / effectiveBudget) * 100 : 0
      const status = computeBudgetStatus(percentUsed, effectiveBudget)

      // Pace
      const dailyPace = daysPassed > 0 ? actual / daysPassed : 0
      const projectedAtPeriodEnd = Math.round(dailyPace * daysInPeriod)
      const projectedRemaining = effectiveBudget - projectedAtPeriodEnd
      const paceStatus = computeBudgetPaceStatus(percentUsed, timeProgressPercent, daysPassed)
      const savingsAtCurrentPace = Math.max(0, projectedRemaining)

      entries.push({
        budgetId: b.id,
        categoryId: b.categoryId,
        categoryName: b.categoryId ? (pathMap.get(b.categoryId)?.path.split(' › ').pop() ?? null) : null,
        categoryPath: b.categoryId ? (pathMap.get(b.categoryId)?.path ?? null) : null,
        parentCategoryId: b.categoryId ? (pathMap.get(b.categoryId)?.parentId ?? null) : null,
        budget: b.amount,
        budgetInBase,
        carryOverFromPrev: carryOver,
        effectiveBudget,
        actual,
        remaining,
        percentUsed,
        status,
        transactionCount: txCount,
        isTotalRow: b.categoryId == null,
        daysInPeriod,
        daysPassed,
        daysRemaining,
        timeProgressPercent,
        dailyPace: Math.round(dailyPace),
        projectedAtPeriodEnd,
        projectedRemaining,
        paceStatus,
        savingsAtCurrentPace,
        conversionWarning
      })
    }

    // 8. Add unset categories (expenses without budget)
    if (input.includeUnsetCategories ?? true) {
      const budgetedCats = new Set(
        budgetRows.filter((b) => b.categoryId != null).map((b) => b.categoryId!)
      )
      // Also exclude descendants of budgets that include them
      for (const b of budgetRows) {
        if (b.categoryId && b.includesDescendants) {
          for (const d of collectDescendants(b.categoryId)) budgetedCats.add(d)
        }
      }
      for (const [catKey, val] of actualByCategory) {
        if (catKey === '__null__') continue
        if (budgetedCats.has(catKey)) continue
        const path = pathMap.get(catKey)
        entries.push({
          budgetId: null,
          categoryId: catKey,
          categoryName: path?.path.split(' › ').pop() ?? null,
          categoryPath: path?.path ?? null,
          parentCategoryId: path?.parentId ?? null,
          budget: 0,
          budgetInBase: 0,
          carryOverFromPrev: 0,
          effectiveBudget: 0,
          actual: val.sum,
          remaining: -val.sum,
          percentUsed: 0,
          status: 'unset',
          transactionCount: val.count,
          isTotalRow: false,
          daysInPeriod,
          daysPassed,
          daysRemaining,
          timeProgressPercent,
          dailyPace: daysPassed > 0 ? Math.round(val.sum / daysPassed) : 0,
          projectedAtPeriodEnd: daysPassed > 0 ? Math.round((val.sum / daysPassed) * daysInPeriod) : 0,
          projectedRemaining: 0,
          paceStatus: 'on_pace',
          savingsAtCurrentPace: 0,
          conversionWarning: 'none'
        })
      }
    }

    // 9. Sort: total row first, then percentUsed descending, then unset last
    return entries.sort((a, b) => {
      if (a.isTotalRow) return -1
      if (b.isTotalRow) return 1
      if (a.status === 'unset' && b.status !== 'unset') return 1
      if (b.status === 'unset' && a.status !== 'unset') return -1
      return b.percentUsed - a.percentUsed
    })
  },

  /* =========================================================================
   * Goal Progress (v2.1) — starting_balance correctly applied to fromAccounts only
   * =========================================================================*/
  goalProgress(goalId: string): GoalProgressDto {
    const goal = goalsRepo.get(goalId)
    if (!goal) throw new Error(`Goal ${goalId} not found`)
    return computeGoalProgress(goal)
  },

  goalProgressAll(filter: GoalProgressFilter = {}): GoalProgressDto[] {
    const goals = goalsRepo.list({ status: filter.status ?? ['active'] })
    return goals.map(computeGoalProgress)
  },

  /**
   * Account-level spending breakdown for the period.
   * Sums `expense` transactions per account (in base currency). Excludes archived accounts
   * and accounts with zero spending. Used by the dashboard "계좌별 지출" widget.
   */
  accountSpending(input: AccountSpendingInput): AccountSpendingResult {
    const db = getDb()
    const baseCurrency = settingsRepo.getBaseCurrency()

    const activeAccts = db
      .select()
      .from(accounts)
      .where(eq(accounts.isArchived, false))
      .all()
    if (activeAccts.length === 0) {
      return { baseCurrency, entries: [], totalSum: 0 }
    }

    const acctIds = activeAccts.map((a) => a.id)
    const rows = db
      .select({
        accountId: transactions.accountId,
        amountInBase: transactions.amountInBase
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to)),
          inArray(transactions.accountId, acctIds)
        )
      )
      .all()

    const sums = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      if (!r.accountId) continue
      const cur = sums.get(r.accountId) ?? { total: 0, count: 0 }
      cur.total += r.amountInBase
      cur.count += 1
      sums.set(r.accountId, cur)
    }

    const entries: AccountSpendingEntry[] = []
    let totalSum = 0
    for (const a of activeAccts) {
      const s = sums.get(a.id)
      if (!s || s.total <= 0) continue
      totalSum += s.total
      entries.push({
        accountId: a.id,
        name: a.name,
        icon: a.icon,
        color: a.color,
        accountType: a.type,
        currency: a.currency,
        creditLimit: a.creditLimit ?? null,
        total: s.total,
        txCount: s.count,
        percent: 0
      })
    }
    for (const e of entries) {
      e.percent = totalSum > 0 ? e.total / totalSum : 0
    }
    entries.sort((a, b) => b.total - a.total)

    return { baseCurrency, entries, totalSum }
  },

  /**
   * Savings + investment account balance summary.
   * - totalBalance: 모든 savings/investment 계좌의 현재 잔액 합 (accountsRepo.balances 기반)
   * - inflowInPeriod: 그 기간에 savings/investment 계좌로 들어온 transfer 합
   * - outflowInPeriod: 그 기간에 savings/investment 계좌에서 나간 transfer 합
   * - netInPeriod: inflow - outflow ("이번 달 실제로 모은 금액")
   *
   * 단일 통화 가정. 다통화 환산은 추후.
   */
  savingsBalance(input: SavingsBalanceInput): SavingsBalanceDto {
    const db = getDb()
    const baseCurrency = settingsRepo.getBaseCurrency()

    const savingsAccts = db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.isArchived, false),
          inArray(accounts.type, ['savings', 'investment'])
        )
      )
      .all()

    if (savingsAccts.length === 0) {
      return {
        baseCurrency,
        totalBalance: 0,
        inflowInPeriod: 0,
        outflowInPeriod: 0,
        netInPeriod: 0,
        savingsAccountIds: []
      }
    }

    const savingsAcctIds = savingsAccts.map((a) => a.id)
    const acctCurrencyById = new Map(savingsAccts.map((a) => [a.id, a.currency]))

    // Use accountsRepo.balances() — already reflects initial balance + all transactions.
    // balance is in the account's NATIVE currency, so we must FX-convert to base before summing.
    const allBalances = accountsRepo.balances()
    const todayDateStr = new Date().toISOString().slice(0, 10)
    let totalBalance = 0
    for (const b of allBalances) {
      if (!savingsAcctIds.includes(b.accountId)) continue
      const ccy = acctCurrencyById.get(b.accountId)
      if (!ccy) continue
      if (ccy === baseCurrency) {
        totalBalance += b.balance
      } else {
        const rate = currenciesRepo.getRateAsOf(ccy, baseCurrency, todayDateStr)
        // Fall back to 1:1 if no rate is on file — same convention budgetVsActual uses.
        totalBalance += rate == null ? b.balance : Math.round(b.balance * rate)
      }
    }

    // 모든 active 계좌 통화 매핑 (cross-currency transfer 환산용)
    const allAcctsForCcy = accountsRepo.list(true)
    const accountCurrencyById = new Map(allAcctsForCcy.map((a) => [a.id, a.currency]))

    // === 저축 정의 (v2) ===
    // 저축 = 예적금/투자 계좌가 관련된 모든 거래의 net 변화량
    //   - inflow:  income (이자/배당 등 — 계좌가 savings)
    //            + transfer in (외부 → savings, cross-currency 환산)
    //   - outflow: expense (계좌가 savings — 흔치 않지만 가능)
    //            + transfer out (savings → 외부)
    //   - 내부 이체 (savings A → savings B)는 양쪽 카운트되어 자연스럽게 상쇄(net 0)되므로
    //     transfer쪽에서 명시적으로 배제 (이중 계상 방지)

    // 1) income 거래 (계좌가 savings) — 이자/배당
    const incomeRows = db
      .select({ amountInBase: transactions.amountInBase })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'income'),
          inArray(transactions.accountId, savingsAcctIds),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to))
        )
      )
      .all()
    let inflowInPeriod = incomeRows.reduce((s, r) => s + r.amountInBase, 0)

    // 2) transfer in (외부 → savings, cross-currency 환산)
    const transferInRows = db
      .select({
        amountInBase: transactions.amountInBase,
        counterAmount: transactions.counterAmount,
        accountId: transactions.accountId,
        counterAccountId: transactions.counterAccountId
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'transfer'),
          inArray(transactions.counterAccountId, savingsAcctIds),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to))
        )
      )
      .all()
    for (const r of transferInRows) {
      // 내부 이체(savings → savings) 배제 — outflow 쪽에서도 같은 거래가 카운트되므로
      if (r.accountId && savingsAcctIds.includes(r.accountId)) continue
      let receivedInBase = r.amountInBase
      if (r.counterAmount != null && r.counterAccountId) {
        const counterCcy = accountCurrencyById.get(r.counterAccountId)
        if (counterCcy && counterCcy !== baseCurrency) {
          const rate = currenciesRepo.getRateAsOf(counterCcy, baseCurrency, todayDateStr)
          receivedInBase = rate != null ? Math.round(r.counterAmount * rate) : r.amountInBase
        } else if (counterCcy === baseCurrency) {
          receivedInBase = r.counterAmount
        }
      }
      inflowInPeriod += receivedInBase
    }

    // 3) expense 거래 (계좌가 savings) — 적금에서 직접 결제 등
    const expenseRows = db
      .select({ amountInBase: transactions.amountInBase })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'expense'),
          inArray(transactions.accountId, savingsAcctIds),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to))
        )
      )
      .all()
    let outflowInPeriod = expenseRows.reduce((s, r) => s + r.amountInBase, 0)

    // 4) transfer out (savings → 외부)
    const transferOutRows = db
      .select({
        amountInBase: transactions.amountInBase,
        counterAccountId: transactions.counterAccountId
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, 'transfer'),
          inArray(transactions.accountId, savingsAcctIds),
          gte(transactions.occurredAt, new Date(input.from)),
          lte(transactions.occurredAt, new Date(input.to))
        )
      )
      .all()
    outflowInPeriod += transferOutRows.reduce(
      (s, r) =>
        r.counterAccountId && savingsAcctIds.includes(r.counterAccountId)
          ? s
          : s + r.amountInBase,
      0
    )

    return {
      baseCurrency,
      totalBalance,
      inflowInPeriod,
      outflowInPeriod,
      netInPeriod: inflowInPeriod - outflowInPeriod,
      savingsAccountIds: savingsAcctIds
    }
  }
}

/* =========================================================================
 * Bucket helpers
 * =========================================================================*/

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function bucketKey(d: Date, g: TimeGranularity): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (g === 'day') return `${y}-${pad(m)}-${pad(day)}`
  if (g === 'month') return `${y}-${pad(m)}-01`
  // week: ISO week start (Monday) in local tz
  const dow = d.getDay() // 0=Sun..6=Sat
  const daysSinceMon = (dow + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - daysSinceMon)
  return `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`
}

function startOf(d: Date, g: TimeGranularity): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  if (g === 'month') out.setDate(1)
  if (g === 'week') {
    const dow = out.getDay()
    const daysSinceMon = (dow + 6) % 7
    out.setDate(out.getDate() - daysSinceMon)
  }
  return out
}

function advance(d: Date, g: TimeGranularity): void {
  if (g === 'day') d.setDate(d.getDate() + 1)
  else if (g === 'week') d.setDate(d.getDate() + 7)
  else if (g === 'month') d.setMonth(d.getMonth() + 1)
}

/* =========================================================================
 * sumIncomeExpense (shared between monthlySummary and future uses)
 * =========================================================================*/

function sumIncomeExpense(filter: StatsFilter): {
  income: number
  expense: number
  count: number
} {
  const db = getDb()
  const where = buildWhere(filter)
  if (!where) return { income: 0, expense: 0, count: 0 }

  // Tag pre-filter if specified
  let idList: string[] | null = null
  if (filter.tagIds && filter.tagIds.length > 0) {
    idList = db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
      .where(and(where, inArray(transactionTags.tagId, filter.tagIds)))
      .all()
      .map((r) => r.id)
    if (idList.length === 0) return { income: 0, expense: 0, count: 0 }
  }

  const baseWhere = idList ? inArray(transactions.id, idList) : where

  const summary = db
    .select({
      type: transactions.type,
      sum: sql<number>`COALESCE(SUM(${transactions.amountInBase}), 0)`,
      count: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .where(and(baseWhere, inArray(transactions.type, ['income', 'expense'])))
    .groupBy(transactions.type)
    .all()

  let income = 0
  let expense = 0
  let count = 0
  for (const r of summary) {
    if (r.type === 'income') income = r.sum
    if (r.type === 'expense') expense = r.sum
    count += r.count
  }
  return { income, expense, count }
}

// Unused import guard
void categories
void tags

/* =========================================================================
 * Budget helpers (v2.1)
 * =========================================================================*/

function computeBudgetStatus(percentUsed: number, effectiveBudget: number): BudgetStatus {
  if (effectiveBudget === 0) return 'unset'
  if (percentUsed <= 75) return 'safe'
  if (percentUsed <= 100) return 'warning'
  if (percentUsed <= 125) return 'over'
  return 'critical'
}

function computeBudgetPaceStatus(
  percentUsed: number,
  timeProgressPercent: number,
  daysPassed: number
): BudgetPaceStatus {
  if (percentUsed >= 100) return 'over'
  if (daysPassed === 0) return 'on_pace'
  if (timeProgressPercent === 0) return 'on_pace'
  const ratio = percentUsed / timeProgressPercent
  if (ratio < 0.9) return 'ahead'
  if (ratio > 1.1) return 'behind'
  return 'on_pace'
}

/* =========================================================================
 * Goal progress computation (v2.1)
 * =========================================================================*/

function computeGoalProgress(goal: NonNullable<ReturnType<typeof goalsRepo.get>>): GoalProgressDto {
  const db = getDb()
  const baseCurrency = settingsRepo.getBaseCurrency()
  const todayDateStr = new Date().toISOString().slice(0, 10)

  // ─── Method A: from accounts ─────────────────────────────────────
  let fromAccountsRaw = 0
  const accountContributions: GoalProgressDto['accountContributions'] = []
  if (goal.linkedAccountIds.length > 0) {
    const balances = accountsRepo.balances(goal.linkedAccountIds)
    const acctList = accountsRepo.list(true)
    const acctById = new Map(acctList.map((a) => [a.id, a]))
    for (const b of balances) {
      const acct = acctById.get(b.accountId)
      if (!acct) continue
      let converted = b.balance
      if (b.currency !== goal.currency) {
        const rate = currenciesRepo.getRateAsOf(b.currency, goal.currency, todayDateStr)
        converted = rate != null ? Math.round(b.balance * rate) : b.balance
      }
      fromAccountsRaw += converted
      accountContributions.push({
        accountId: b.accountId,
        accountName: acct.name,
        balance: converted,
        isStartingBalanceApplied: false
      })
    }
  }

  // starting_balance applies only to fromAccounts
  const startingBalanceOffset = goal.startingBalance
  const fromAccounts = Math.max(0, fromAccountsRaw - startingBalanceOffset)
  if (startingBalanceOffset > 0 && accountContributions.length > 0) {
    accountContributions[0].isStartingBalanceApplied = true
  }

  // ─── Method B: from tags (income + transfer_in) ──────────────────
  let fromTags = 0
  const tagContributions: GoalProgressDto['tagContributions'] = []

  if (goal.linkedTagIds.length > 0) {
    const includeIncome = goal.tagInclusionTypes.includes('income')
    const includeTransfer = goal.tagInclusionTypes.includes('transfer_in')
    const tagList = db.select().from(tags).where(inArray(tags.id, goal.linkedTagIds)).all()
    const tagNameById = new Map(tagList.map((t) => [t.id, t.name]))
    // counter account 통화 매핑 (transfer cross-currency 환산용)
    const allAccts = accountsRepo.list(true)
    const accountCurrencyById = new Map(allAccts.map((a) => [a.id, a.currency]))

    for (const tagId of goal.linkedTagIds) {
      let totalInBase = 0
      let incomeCount = 0
      let transferInCount = 0

      // 목표 기간(startDate ~ targetDate) 내 거래만 카운트.
      // targetDate가 null이면 무기한 목표로 간주, end cap 없음.
      const txWhere = goal.targetDate
        ? and(
            eq(transactionTags.tagId, tagId),
            gte(transactions.occurredAt, new Date(goal.startDate)),
            lte(transactions.occurredAt, new Date(`${goal.targetDate}T23:59:59.999Z`))
          )
        : and(
            eq(transactionTags.tagId, tagId),
            gte(transactions.occurredAt, new Date(goal.startDate))
          )
      const matchedTxRows = db
        .select({
          id: transactions.id,
          type: transactions.type,
          amountInBase: transactions.amountInBase,
          counterAmount: transactions.counterAmount,
          counterAccountId: transactions.counterAccountId
        })
        .from(transactions)
        .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
        .where(txWhere)
        .all()

      for (const tx of matchedTxRows) {
        if (tx.type === 'income' && includeIncome) {
          totalInBase += tx.amountInBase
          incomeCount++
        } else if (tx.type === 'transfer' && includeTransfer) {
          // 자산이 받은 base 가치 계산. 단위 일관성 위해:
          //  - counterAmount가 있으면(cross-currency) counter native → base 환산
          //  - 없으면(same-currency) amountInBase 그대로 (출금 측 base 가치 = 받은 양)
          let receivedInBase = tx.amountInBase
          if (tx.counterAmount != null && tx.counterAccountId) {
            const counterCcy = accountCurrencyById.get(tx.counterAccountId)
            if (counterCcy && counterCcy !== baseCurrency) {
              const r = currenciesRepo.getRateAsOf(counterCcy, baseCurrency, todayDateStr)
              receivedInBase = r != null ? Math.round(tx.counterAmount * r) : tx.amountInBase
            } else if (counterCcy === baseCurrency) {
              receivedInBase = tx.counterAmount
            }
          }
          totalInBase += receivedInBase
          transferInCount++
        }
      }

      // Convert to goal currency (base → goal.currency)
      let totalInGoalCurrency = totalInBase
      if (goal.currency !== baseCurrency) {
        const rate = currenciesRepo.getRateAsOf(baseCurrency, goal.currency, todayDateStr)
        totalInGoalCurrency = rate != null ? Math.round(totalInBase * rate) : totalInBase
      }
      fromTags += totalInGoalCurrency
      tagContributions.push({
        tagId,
        tagName: tagNameById.get(tagId) ?? '(unknown)',
        total: totalInGoalCurrency,
        txCount: incomeCount + transferInCount,
        incomeCount,
        transferInCount
      })
    }
  }

  // ─── Method D: manual ────────────────────────────────────────────
  const fromManual = goal.manualAmount ?? 0

  // ─── Total ───────────────────────────────────────────────────────
  const totalSaved = fromAccounts + fromTags + fromManual
  const remaining = goal.targetAmount - totalSaved
  const percent = goal.targetAmount > 0 ? (totalSaved / goal.targetAmount) * 100 : 0

  // ─── Time analysis ───────────────────────────────────────────────
  const today = new Date()
  const startDate = new Date(goal.startDate + 'T00:00:00')
  const daysElapsed = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000))
  const daysRemaining = goal.targetDate
    ? Math.floor(
        (new Date(goal.targetDate + 'T23:59:59').getTime() - today.getTime()) / 86400000
      )
    : null

  // ─── Pace ────────────────────────────────────────────────────────
  const monthsElapsed = Math.max(0.1, daysElapsed / 30.4375)
  const pacePerMonth = totalSaved / monthsElapsed
  let projectedAchievement: string | null = null
  if (pacePerMonth > 0 && remaining > 0) {
    const monthsToGo = remaining / pacePerMonth
    const projDate = new Date(today)
    projDate.setMonth(projDate.getMonth() + Math.ceil(monthsToGo))
    projectedAchievement = projDate.toISOString().slice(0, 10)
  }

  let onTrack: boolean | null = null
  if (
    goal.targetDate &&
    pacePerMonth > 0 &&
    daysRemaining !== null &&
    daysRemaining > 0 &&
    remaining > 0
  ) {
    const requiredPace = remaining / Math.max(0.1, daysRemaining / 30.4375)
    onTrack = pacePerMonth >= requiredPace
  } else if (remaining <= 0) {
    onTrack = true
  }

  // ─── Pace status ─────────────────────────────────────────────────
  const paceStatus: GoalPaceStatus =
    percent >= 100
      ? 'achieved'
      : daysRemaining !== null && daysRemaining < 0
        ? 'overdue'
        : percent >= 90
          ? 'near'
          : percent > 0
            ? 'in_progress'
            : 'not_started'

  // ─── Auto-mark achieved (one-time) ───────────────────────────────
  let justAchieved = false
  let effectiveStatus: GoalStatus = goal.status
  if (goal.status === 'active' && percent >= 100 && !goal.achievedAt) {
    goalsRepo._autoMarkAchieved(goal.id)
    justAchieved = true
    effectiveStatus = 'achieved'
  }

  return {
    goalId: goal.id,
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    status: effectiveStatus,
    targetAmount: goal.targetAmount,
    currency: goal.currency,
    fromAccountsRaw,
    startingBalanceOffset,
    fromAccounts,
    fromTags,
    fromManual,
    totalSaved,
    remaining,
    percent,
    paceStatus,
    startDate: goal.startDate,
    targetDate: goal.targetDate,
    daysElapsed,
    daysRemaining,
    pacePerMonth: Math.round(pacePerMonth),
    projectedAchievement,
    onTrack,
    accountContributions,
    tagContributions,
    justAchieved,
    computedAt: new Date().toISOString()
  }
}

// Suppress unused imports if any path slips through
void savingsGoals
void savingsGoalAccounts
void savingsGoalTags
void accounts
