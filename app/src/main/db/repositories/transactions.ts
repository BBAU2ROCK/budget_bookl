import { and, asc, desc, eq, gte, lte, inArray, like, or, count } from 'drizzle-orm'
import { getDb, getSqlite } from '../client'
import { accounts, transactions, transactionSplits, transactionTags } from '../schema'
import { newId } from '../ids'
import { toSplitDto, toTransactionDto } from '../mappers'
import { settingsRepo } from './settings'
import { currenciesRepo } from './currencies'
import type {
  TransactionCreateInput,
  TransactionDto,
  TransactionFilter,
  TransactionListResult,
  TransactionSplitDto,
  TransactionSplitInput,
  TransactionUpdateInput
} from '../../../shared/types'

/**
 * For cross-currency transfers, compute counterAmount if not provided.
 * Returns null for same-currency transfers (implicit equivalence).
 */
function computeCounterAmount(input: {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  currency: string
  accountId?: string | null
  counterAccountId?: string | null
  providedCounterAmount?: number | null
  asOf: string
}): number | null {
  if (input.type !== 'transfer') return null
  if (!input.counterAccountId) return null
  if (input.providedCounterAmount !== undefined && input.providedCounterAmount !== null) {
    return input.providedCounterAmount
  }
  const db = getDb()
  const counter = db.select().from(accounts).where(eq(accounts.id, input.counterAccountId)).get()
  if (!counter) return null
  if (counter.currency === input.currency) return null // same currency → implicit

  // Different currency — auto-compute via FX
  const rate = currenciesRepo.getRateAsOf(input.currency, counter.currency, input.asOf)
  if (rate == null) {
    throw new Error(
      `Cross-currency transfer needs counterAmount or FX rate ${input.currency}→${counter.currency} on-or-before ${input.asOf}`
    )
  }
  return Math.round(input.amount * rate)
}

function computeFx(input: {
  amount: number
  currency: string
  baseCurrency: string
  asOf: string
  providedRate?: number
  providedAmountInBase?: number
}): { fxRate: number; amountInBase: number } {
  const { amount, currency, baseCurrency, asOf, providedRate, providedAmountInBase } = input
  if (currency === baseCurrency) return { fxRate: 1, amountInBase: amount }
  if (providedAmountInBase !== undefined && providedRate !== undefined) {
    return { fxRate: providedRate, amountInBase: providedAmountInBase }
  }
  if (providedAmountInBase !== undefined) {
    return { fxRate: providedAmountInBase / amount, amountInBase: providedAmountInBase }
  }
  if (providedRate !== undefined) {
    return { fxRate: providedRate, amountInBase: Math.round(amount * providedRate) }
  }
  const rate = currenciesRepo.getRateAsOf(currency, baseCurrency, asOf)
  if (rate == null) {
    throw new Error(
      `No exchange rate found for ${currency}→${baseCurrency} on-or-before ${asOf}. Provide fxRate or amountInBase explicitly, or add an exchange rate entry.`
    )
  }
  return { fxRate: rate, amountInBase: Math.round(amount * rate) }
}

/**
 * Sanitise a free-form user search string for FTS5's MATCH operator.
 *
 * - Strip FTS5 syntax characters (quotes, parens, NEAR, OR, AND, *) that would
 *   either error out or change the search semantics unexpectedly.
 * - Wrap each remaining token in double-quotes so spaces become AND between
 *   tokens (FTS5 default is OR — we want AND to better match user intent).
 * - Returns null when nothing meaningful remains, signalling the caller to
 *   fall back to a LIKE search.
 */
function buildFtsMatchQuery(raw: string): string | null {
  // Remove FTS5 reserved chars; collapse whitespace.
  const cleaned = raw.replace(/["()*:^]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2) return null
  // Quote each token so trigram tokenizer treats it as a phrase fragment.
  // (Trigram tokenizer requires ≥3 chars per token to match; for shorter
  // tokens FTS5 returns no rows, which is acceptable.)
  const tokens = cleaned.split(' ').filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `"${t}"`).join(' ')
}

/**
 * Look up transaction IDs whose searchable columns (payee/memo/payment_method/
 * discount_reason) contain the given query, using the trigram-tokenised FTS5
 * virtual table created in migration 0004.
 *
 * Falls back to null when the query is too short or whitespace-only — caller
 * should then degrade to a LIKE-based search.
 */
function searchTransactionIdsViaFts(query: string): string[] | null {
  const matchQuery = buildFtsMatchQuery(query)
  if (!matchQuery) return null
  try {
    const sqlite = getSqlite()
    const rows = sqlite
      .prepare(
        'SELECT transaction_id FROM transactions_fts WHERE transactions_fts MATCH ? LIMIT 5000'
      )
      .all(matchQuery) as Array<{ transaction_id: string }>
    return rows.map((r) => r.transaction_id)
  } catch {
    // FTS5 failure shouldn't break the list view — fall back to LIKE.
    return null
  }
}

/** Fetch tags for a set of transactions keyed by transactionId. */
function loadTagsMap(transactionIds: string[]): Map<string, string[]> {
  if (transactionIds.length === 0) return new Map()
  const db = getDb()
  const rows = db
    .select()
    .from(transactionTags)
    .where(inArray(transactionTags.transactionId, transactionIds))
    .all()
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const arr = map.get(r.transactionId) ?? []
    arr.push(r.tagId)
    map.set(r.transactionId, arr)
  }
  return map
}

/** Fetch splits for a set of transactions keyed by transactionId. */
function loadSplitsMap(transactionIds: string[]): Map<string, TransactionSplitDto[]> {
  if (transactionIds.length === 0) return new Map()
  const db = getDb()
  const rows = db
    .select()
    .from(transactionSplits)
    .where(inArray(transactionSplits.transactionId, transactionIds))
    .orderBy(asc(transactionSplits.displayOrder))
    .all()
  const map = new Map<string, TransactionSplitDto[]>()
  for (const r of rows) {
    const arr = map.get(r.transactionId) ?? []
    arr.push(toSplitDto(r))
    map.set(r.transactionId, arr)
  }
  return map
}

/**
 * Validate user-supplied splits against the parent's amount.
 * Returns sanitised inputs sorted by display order.
 * Throws on misconfiguration so the IPC layer surfaces a friendly error.
 */
function validateSplits(
  splits: TransactionSplitInput[],
  parentAmount: number,
  parentFxRate: number
): Array<{ id: string; categoryId: string | null; amount: number; amountInBase: number; memo: string | null; displayOrder: number }> {
  if (splits.length < 2) {
    throw new Error('분할 항목은 최소 2개 이상이어야 합니다.')
  }
  let total = 0
  for (const s of splits) {
    if (!Number.isFinite(s.amount) || s.amount <= 0) {
      throw new Error('각 분할 항목의 금액은 0보다 커야 합니다.')
    }
    total += s.amount
  }
  if (total !== parentAmount) {
    throw new Error(
      `분할 합계(${total.toLocaleString()})가 거래 금액(${parentAmount.toLocaleString()})과 일치해야 합니다.`
    )
  }
  return splits.map((s, i) => ({
    id: s.id ?? newId('sp'),
    categoryId: s.categoryId ?? null,
    amount: s.amount,
    /**
     * amount_in_base는 parent의 fx_rate로 환산.
     * 의도적 결정 — 분할이 만들어진 시점에 parent transaction이 어떤 환율로
     * 정규화됐는지를 유지하기 위함. 그래야 budgetVsActual / categoryBreakdown 등
     * base currency 합계가 parent.amount_in_base = sum(splits.amount_in_base)로 일치한다.
     * parent가 잘못된 fx_rate로 기록됐다면 splits도 같은 비율로 잘못되지만,
     * 해법은 parent를 수정하는 것이지 split별 fx 입력이 아님.
     */
    amountInBase: Math.round(s.amount * parentFxRate),
    memo: s.memo ?? null,
    displayOrder: i
  }))
}

export const transactionsRepo = {
  get(id: string): TransactionDto | null {
    const db = getDb()
    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()
    if (!row) return null
    const tagIds =
      db
        .select({ tagId: transactionTags.tagId })
        .from(transactionTags)
        .where(eq(transactionTags.transactionId, id))
        .all()
        .map((r) => r.tagId) ?? []
    const splits = db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, id))
      .orderBy(asc(transactionSplits.displayOrder))
      .all()
      .map(toSplitDto)
    return toTransactionDto(row, tagIds, splits)
  },

  list(filter: TransactionFilter = {}): TransactionListResult {
    const db = getDb()
    const conditions: ReturnType<typeof eq>[] = []

    if (filter.from) {
      conditions.push(gte(transactions.occurredAt, new Date(filter.from)))
    }
    if (filter.to) {
      conditions.push(lte(transactions.occurredAt, new Date(filter.to)))
    }
    if (filter.types && filter.types.length > 0) {
      conditions.push(inArray(transactions.type, filter.types))
    }
    if (filter.categoryIds && filter.categoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, filter.categoryIds))
    }
    if (filter.accountIds && filter.accountIds.length > 0) {
      conditions.push(
        or(
          inArray(transactions.accountId, filter.accountIds),
          inArray(transactions.counterAccountId, filter.accountIds)
        )!
      )
    }
    if (filter.search) {
      // Prefer FTS5 (trigram tokenizer — works for Korean & English) for any
      // query of meaningful length. Falls back to LIKE for very short queries
      // or when the FTS5 virtual table is unavailable.
      const ftsIds = searchTransactionIdsViaFts(filter.search)
      if (ftsIds !== null) {
        if (ftsIds.length === 0) {
          return { rows: [], total: 0 }
        }
        conditions.push(inArray(transactions.id, ftsIds))
      } else {
        const q = `%${filter.search}%`
        conditions.push(
          or(
            like(transactions.memo, q),
            like(transactions.payee, q),
            like(transactions.paymentMethod, q),
            like(transactions.discountReason, q)
          )!
        )
      }
    }

    // Tag filter is applied post-SQL via tag map — simpler than JOIN-based ALL matching.
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderCol =
      filter.orderBy === 'amountInBase'
        ? transactions.amountInBase
        : filter.orderBy === 'recordedAt'
          ? transactions.recordedAt
          : transactions.occurredAt
    const orderFn = filter.orderDir === 'asc' ? asc : desc

    let rows = where
      ? db.select().from(transactions).where(where).orderBy(orderFn(orderCol)).all()
      : db.select().from(transactions).orderBy(orderFn(orderCol)).all()

    // Tag filter
    if (filter.tagIds && filter.tagIds.length > 0) {
      const ids = rows.map((r) => r.id)
      const tagMap = loadTagsMap(ids)
      const mode = filter.tagsMatchMode ?? 'any'
      rows = rows.filter((r) => {
        const txTags = new Set(tagMap.get(r.id) ?? [])
        return mode === 'all'
          ? filter.tagIds!.every((t) => txTags.has(t))
          : filter.tagIds!.some((t) => txTags.has(t))
      })
    }

    const total = rows.length

    const offset = filter.offset ?? 0
    const limit = filter.limit ?? rows.length
    const paged = rows.slice(offset, offset + limit)

    const ids = paged.map((r) => r.id)
    const tagMap = loadTagsMap(ids)
    const splitMap = loadSplitsMap(ids)
    const dtos = paged.map((r) =>
      toTransactionDto(r, tagMap.get(r.id) ?? [], splitMap.get(r.id) ?? [])
    )

    return { rows: dtos, total }
  },

  count(filter: TransactionFilter = {}): number {
    const db = getDb()
    const conditions: ReturnType<typeof eq>[] = []
    if (filter.from) conditions.push(gte(transactions.occurredAt, new Date(filter.from)))
    if (filter.to) conditions.push(lte(transactions.occurredAt, new Date(filter.to)))
    if (filter.types && filter.types.length > 0)
      conditions.push(inArray(transactions.type, filter.types))

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const row = where
      ? db.select({ c: count() }).from(transactions).where(where).get()
      : db.select({ c: count() }).from(transactions).get()
    return row?.c ?? 0
  },

  create(input: TransactionCreateInput): TransactionDto {
    const db = getDb()
    // amount는 항상 양수여야 한다. 환불성 거래는 반대 방향(income)으로 별도 입력하는 게
    // 가계부 모델 일관성을 유지함. 음수 amount가 들어오면 모든 통계(carryOver/budget/cardSpend)
    // 가 부호 깨지므로 진입부에서 차단.
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(`거래 금액은 양수여야 합니다. (받은 값: ${input.amount})`)
    }
    const baseCurrency = settingsRepo.getBaseCurrency()
    const asOfDate = new Date(input.occurredAt).toISOString().slice(0, 10)
    const { fxRate, amountInBase } = computeFx({
      amount: input.amount,
      currency: input.currency,
      baseCurrency,
      asOf: asOfDate,
      providedRate: input.fxRate,
      providedAmountInBase: input.amountInBase
    })
    const counterAmount = computeCounterAmount({
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      accountId: input.accountId,
      counterAccountId: input.counterAccountId,
      providedCounterAmount: input.counterAmount,
      asOf: asOfDate
    })

    // Validate discount: originalAmount must be >= amount if provided
    const originalAmount = input.originalAmount ?? null
    if (originalAmount !== null && originalAmount < input.amount) {
      throw new Error(
        `할인 전 금액(${originalAmount})은 실결제 금액(${input.amount}) 이상이어야 합니다.`
      )
    }

    // Validate splits up-front so we don't insert a transaction we can't complete.
    const splitsToInsert =
      input.splits && input.splits.length > 0
        ? validateSplits(input.splits, input.amount, fxRate)
        : []

    const id = newId('tx')
    const occurredAt = new Date(input.occurredAt)

    db.transaction((tx) => {
      tx.insert(transactions)
        .values({
          id,
          type: input.type,
          occurredAt,
          amount: input.amount,
          currency: input.currency,
          amountInBase,
          baseCurrency,
          fxRate,
          categoryId: input.categoryId ?? null,
          accountId: input.accountId ?? null,
          counterAccountId: input.counterAccountId ?? null,
          counterAmount,
          originalAmount,
          discountReason: input.discountReason ?? null,
          payee: input.payee ?? null,
          memo: input.memo ?? null,
          paymentMethod: input.paymentMethod ?? null,
          recurringSeriesId: input.recurringSeriesId ?? null
        })
        .run()

      if (input.tagIds && input.tagIds.length > 0) {
        for (const tagId of input.tagIds) {
          tx.insert(transactionTags).values({ transactionId: id, tagId }).run()
        }
      }

      for (const sp of splitsToInsert) {
        tx.insert(transactionSplits)
          .values({
            id: sp.id,
            transactionId: id,
            categoryId: sp.categoryId,
            amount: sp.amount,
            amountInBase: sp.amountInBase,
            memo: sp.memo,
            displayOrder: sp.displayOrder
          })
          .run()
      }
    })

    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!
    const splitDtos = db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, id))
      .orderBy(asc(transactionSplits.displayOrder))
      .all()
      .map(toSplitDto)
    return toTransactionDto(row, input.tagIds ?? [], splitDtos)
  },

  update(input: TransactionUpdateInput): TransactionDto {
    const db = getDb()
    const { id, tagIds, splits: incomingSplits, ...rest } = input

    const existing = db.select().from(transactions).where(eq(transactions.id, id)).get()
    if (!existing) throw new Error(`Transaction ${id} not found`)

    if (rest.amount !== undefined && (!Number.isFinite(rest.amount) || rest.amount <= 0)) {
      throw new Error(`거래 금액은 양수여야 합니다. (받은 값: ${rest.amount})`)
    }

    // Recompute FX if amount / currency / occurredAt changed
    let fxRate = existing.fxRate
    let amountInBase = existing.amountInBase
    const newAmount = rest.amount ?? existing.amount
    const newCurrency = rest.currency ?? existing.currency
    const newOccurredAt = rest.occurredAt ? new Date(rest.occurredAt) : existing.occurredAt
    if (
      rest.amount !== undefined ||
      rest.currency !== undefined ||
      rest.occurredAt !== undefined ||
      rest.fxRate !== undefined ||
      rest.amountInBase !== undefined
    ) {
      const baseCurrency = existing.baseCurrency
      const asOfDate = newOccurredAt.toISOString().slice(0, 10)
      const fx = computeFx({
        amount: newAmount,
        currency: newCurrency,
        baseCurrency,
        asOf: asOfDate,
        providedRate: rest.fxRate,
        providedAmountInBase: rest.amountInBase
      })
      fxRate = fx.fxRate
      amountInBase = fx.amountInBase
    }

    // Recompute counter_amount when relevant fields change
    let counterAmount: number | null = existing.counterAmount
    if (
      rest.type !== undefined ||
      rest.amount !== undefined ||
      rest.currency !== undefined ||
      rest.counterAccountId !== undefined ||
      rest.counterAmount !== undefined
    ) {
      const asOfDate = newOccurredAt.toISOString().slice(0, 10)
      counterAmount = computeCounterAmount({
        type: (rest.type ?? existing.type) as 'expense' | 'income' | 'transfer',
        amount: newAmount,
        currency: newCurrency,
        accountId: rest.accountId ?? existing.accountId,
        counterAccountId: rest.counterAccountId ?? existing.counterAccountId,
        providedCounterAmount:
          rest.counterAmount !== undefined ? rest.counterAmount : existing.counterAmount,
        asOf: asOfDate
      })
    }

    // Validate discount: originalAmount (if provided or existing) must be >= new amount
    const effectiveOriginal =
      rest.originalAmount !== undefined ? rest.originalAmount : existing.originalAmount
    if (effectiveOriginal !== null && effectiveOriginal !== undefined && effectiveOriginal < newAmount) {
      throw new Error(
        `할인 전 금액(${effectiveOriginal})은 실결제 금액(${newAmount}) 이상이어야 합니다.`
      )
    }

    // If splits provided (or amount changes invalidate existing splits), validate
    // them up-front against the post-update amount + fxRate.
    let splitsToReplace: ReturnType<typeof validateSplits> | null = null
    if (incomingSplits !== undefined) {
      if (incomingSplits.length === 0) {
        // Empty array = remove existing splits.
        splitsToReplace = []
      } else {
        splitsToReplace = validateSplits(incomingSplits, newAmount, fxRate)
      }
    } else if (
      rest.amount !== undefined ||
      rest.fxRate !== undefined ||
      rest.amountInBase !== undefined ||
      rest.currency !== undefined
    ) {
      // amount/currency/fxRate 변경 시 기존 splits.amountInBase가 stale. 비율 보존하며
      // 재계산. drift는 마지막 split에 누적해 sum invariant 유지. (사용자가 splits 자체를
      // 다시 손보고 싶다면 UI에서 명시적으로 splits를 다시 보내야 함.)
      const existingSplits = db
        .select()
        .from(transactionSplits)
        .where(eq(transactionSplits.transactionId, id))
        .orderBy(transactionSplits.displayOrder)
        .all()
      if (existingSplits.length > 0) {
        const oldAmount = existing.amount
        const ratio = oldAmount > 0 ? newAmount / oldAmount : 1
        const recalced = existingSplits.map((es) => ({
          id: es.id,
          categoryId: es.categoryId,
          amount: Math.round(es.amount * ratio),
          amountInBase: Math.round(es.amount * ratio * fxRate),
          memo: es.memo,
          displayOrder: es.displayOrder
        }))
        const calcSum = recalced.reduce((s, sp) => s + sp.amount, 0)
        const drift = newAmount - calcSum
        if (drift !== 0) {
          const last = recalced[recalced.length - 1]
          last.amount += drift
          last.amountInBase = Math.round(last.amount * fxRate)
        }
        splitsToReplace = recalced
      }
    }

    db.transaction((tx) => {
      tx.update(transactions)
        .set({
          ...rest,
          occurredAt: rest.occurredAt ? newOccurredAt : undefined,
          fxRate,
          amountInBase,
          counterAmount,
          updatedAt: new Date()
        })
        .where(eq(transactions.id, id))
        .run()

      if (tagIds !== undefined) {
        tx.delete(transactionTags).where(eq(transactionTags.transactionId, id)).run()
        for (const tagId of tagIds) {
          tx.insert(transactionTags).values({ transactionId: id, tagId }).run()
        }
      }

      if (splitsToReplace !== null) {
        tx.delete(transactionSplits)
          .where(eq(transactionSplits.transactionId, id))
          .run()
        for (const sp of splitsToReplace) {
          tx.insert(transactionSplits)
            .values({
              id: sp.id,
              transactionId: id,
              categoryId: sp.categoryId,
              amount: sp.amount,
              amountInBase: sp.amountInBase,
              memo: sp.memo,
              displayOrder: sp.displayOrder
            })
            .run()
        }
      }
    })

    const row = db.select().from(transactions).where(eq(transactions.id, id)).get()!
    const finalTagIds =
      tagIds !== undefined
        ? tagIds
        : db
            .select({ tagId: transactionTags.tagId })
            .from(transactionTags)
            .where(eq(transactionTags.transactionId, id))
            .all()
            .map((r) => r.tagId)
    const finalSplits = db
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, id))
      .orderBy(asc(transactionSplits.displayOrder))
      .all()
      .map(toSplitDto)
    return toTransactionDto(row, finalTagIds, finalSplits)
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(transactions).where(eq(transactions.id, id)).run()
  },

  /** List distinct non-null discount_reason values — for autocomplete in the form. */
  distinctDiscountReasons(): string[] {
    const db = getDb()
    const rows = db
      .selectDistinct({ reason: transactions.discountReason })
      .from(transactions)
      .all()
    return rows
      .map((r) => r.reason)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .sort()
  }
}
