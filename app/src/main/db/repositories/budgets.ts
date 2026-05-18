import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../client'
import { budgets } from '../schema'
import { newId } from '../ids'
import { toBudgetDto } from '../mappers'
import { settingsRepo } from './settings'
import type {
  BudgetBulkUpsertInput,
  BudgetBulkUpsertResult,
  BudgetCopyInput,
  BudgetCopyResult,
  BudgetCreateInput,
  BudgetDto,
  BudgetListFilter,
  BudgetUpdateInput
} from '../../../shared/types'

function validateAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('예산 금액은 0 이상의 숫자여야 합니다.')
  }
}

function validateMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`연도가 유효하지 않습니다: ${year}`)
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`월은 1~12 사이여야 합니다: ${month}`)
  }
}

export const budgetsRepo = {
  list(filter: BudgetListFilter = {}): BudgetDto[] {
    const db = getDb()
    const conds: ReturnType<typeof eq>[] = []
    if (filter.year !== undefined) conds.push(eq(budgets.periodYear, filter.year))
    if (filter.month !== undefined) conds.push(eq(budgets.periodMonth, filter.month))
    if (filter.categoryId !== undefined) {
      // null = "전체 예산" 행만, 명시값 = 그 카테고리만
      if (filter.categoryId === null) {
        // categoryId IS NULL — Drizzle isNull 사용
        // 단순화: SQL 직접
        const rows = db
          .select()
          .from(budgets)
          .where(
            conds.length === 0
              ? undefined
              : conds.length === 1
                ? conds[0]
                : and(...conds)
          )
          .orderBy(asc(budgets.periodYear), asc(budgets.periodMonth))
          .all()
        return rows
          .filter((r) => r.categoryId === null)
          .map(toBudgetDto)
      }
      conds.push(eq(budgets.categoryId, filter.categoryId))
    }
    const rows = db
      .select()
      .from(budgets)
      .where(
        conds.length === 0
          ? undefined
          : conds.length === 1
            ? conds[0]
            : and(...conds)
      )
      .orderBy(asc(budgets.periodYear), asc(budgets.periodMonth))
      .all()
    return rows.map(toBudgetDto)
  },

  get(id: string): BudgetDto | null {
    const db = getDb()
    const row = db.select().from(budgets).where(eq(budgets.id, id)).get()
    return row ? toBudgetDto(row) : null
  },

  create(input: BudgetCreateInput): BudgetDto {
    validateAmount(input.amount)
    validateMonth(input.periodYear, input.periodMonth)

    const db = getDb()
    const id = newId('bg')
    const baseCurrency = settingsRepo.getBaseCurrency()
    const currency = input.currency ?? baseCurrency

    // 중복 체크 (동일 카테고리 + 동일 월)
    const existingRows = db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.periodYear, input.periodYear),
          eq(budgets.periodMonth, input.periodMonth)
        )
      )
      .all()
    const dup = existingRows.find((r) => (r.categoryId ?? null) === (input.categoryId ?? null))
    if (dup) {
      throw new Error(
        `${input.periodYear}년 ${input.periodMonth}월에 이미 같은 카테고리의 예산이 있습니다.`
      )
    }

    db.insert(budgets)
      .values({
        id,
        categoryId: input.categoryId ?? null,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        amount: input.amount,
        currency,
        includesDescendants: input.includesDescendants ?? true,
        carryOver: input.carryOver ?? false,
        notes: input.notes ?? null
      })
      .run()

    return this.get(id)!
  },

  update(input: BudgetUpdateInput): BudgetDto {
    const db = getDb()
    const { id, ...rest } = input
    if (rest.amount !== undefined) validateAmount(rest.amount)
    if (rest.periodYear !== undefined && rest.periodMonth !== undefined) {
      validateMonth(rest.periodYear, rest.periodMonth)
    }

    // categoryId 또는 period가 바뀐다면, 같은 (categoryId, year, month) 조합이 이미
    // 다른 행에 있으면 중복이 만들어진다. 테이블에 UNIQUE 제약이 없어서 DB 레벨로는
    // 막히지 않으므로 앱 레벨에서 사전 검사한다.
    const current = db.select().from(budgets).where(eq(budgets.id, id)).get()
    if (!current) throw new Error(`Budget ${id} not found`)
    const newCategoryId = rest.categoryId === undefined ? current.categoryId : (rest.categoryId ?? null)
    const newYear = rest.periodYear ?? current.periodYear
    const newMonth = rest.periodMonth ?? current.periodMonth
    const movedToDifferentSlot =
      newCategoryId !== current.categoryId ||
      newYear !== current.periodYear ||
      newMonth !== current.periodMonth
    if (movedToDifferentSlot) {
      const candidates = db
        .select()
        .from(budgets)
        .where(and(eq(budgets.periodYear, newYear), eq(budgets.periodMonth, newMonth)))
        .all()
      const dup = candidates.find(
        (r) => r.id !== id && (r.categoryId ?? null) === newCategoryId
      )
      if (dup) {
        throw new Error(
          `${newYear}년 ${newMonth}월에 이미 같은 카테고리의 예산이 있습니다.`
        )
      }
    }

    db.update(budgets)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(budgets.id, id))
      .run()

    const updated = this.get(id)
    if (!updated) throw new Error(`Budget ${id} not found`)
    return updated
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(budgets).where(eq(budgets.id, id)).run()
  },

  /**
   * Copy all budgets from one month to another.
   * @returns { copied, skipped, overwritten }
   */
  copyMonth(input: BudgetCopyInput): BudgetCopyResult {
    validateMonth(input.fromYear, input.fromMonth)
    validateMonth(input.toYear, input.toMonth)

    const db = getDb()
    const sourceList = this.list({ year: input.fromYear, month: input.fromMonth })
    const targetList = this.list({ year: input.toYear, month: input.toMonth })

    const targetByCategory = new Map<string, BudgetDto>()
    for (const t of targetList) {
      const key = t.categoryId ?? '__total__'
      targetByCategory.set(key, t)
    }

    let copied = 0
    let skipped = 0
    let overwritten = 0

    db.transaction((tx) => {
      for (const src of sourceList) {
        const key = src.categoryId ?? '__total__'
        const existing = targetByCategory.get(key)

        if (existing && !input.overwrite) {
          skipped++
          continue
        }
        if (existing && input.overwrite) {
          tx.update(budgets)
            .set({
              amount: src.amount,
              currency: src.currency,
              includesDescendants: src.includesDescendants,
              carryOver: src.carryOver,
              notes: src.notes,
              updatedAt: new Date()
            })
            .where(eq(budgets.id, existing.id))
            .run()
          overwritten++
          continue
        }

        tx.insert(budgets)
          .values({
            id: newId('bg'),
            categoryId: src.categoryId,
            periodYear: input.toYear,
            periodMonth: input.toMonth,
            amount: src.amount,
            currency: src.currency,
            includesDescendants: src.includesDescendants,
            carryOver: src.carryOver,
            notes: src.notes
          })
          .run()
        copied++
      }
    })

    return { copied, skipped, overwritten }
  },

  /**
   * Bulk insert/update budgets — used by Excel matrix import.
   * For each input row, upsert based on (categoryId, periodYear, periodMonth).
   */
  bulkUpsert(input: BudgetBulkUpsertInput): BudgetBulkUpsertResult {
    const db = getDb()
    const baseCurrency = settingsRepo.getBaseCurrency()

    let created = 0
    let updated = 0
    const errors: Array<{ index: number; message: string }> = []

    db.transaction((tx) => {
      for (let i = 0; i < input.budgets.length; i++) {
        const b = input.budgets[i]
        try {
          validateAmount(b.amount)
          validateMonth(b.periodYear, b.periodMonth)

          const existing = tx
            .select()
            .from(budgets)
            .where(
              and(
                eq(budgets.periodYear, b.periodYear),
                eq(budgets.periodMonth, b.periodMonth)
              )
            )
            .all()
          const dup = existing.find((r) => (r.categoryId ?? null) === (b.categoryId ?? null))

          if (dup) {
            tx.update(budgets)
              .set({
                amount: b.amount,
                currency: b.currency ?? dup.currency,
                includesDescendants: b.includesDescendants ?? dup.includesDescendants,
                carryOver: b.carryOver ?? dup.carryOver,
                notes: b.notes ?? dup.notes,
                updatedAt: new Date()
              })
              .where(eq(budgets.id, dup.id))
              .run()
            updated++
          } else {
            tx.insert(budgets)
              .values({
                id: newId('bg'),
                categoryId: b.categoryId ?? null,
                periodYear: b.periodYear,
                periodMonth: b.periodMonth,
                amount: b.amount,
                currency: b.currency ?? baseCurrency,
                includesDescendants: b.includesDescendants ?? true,
                carryOver: b.carryOver ?? false,
                notes: b.notes ?? null
              })
              .run()
            created++
          }
        } catch (err) {
          errors.push({ index: i, message: (err as Error).message })
        }
      }
    })

    return { created, updated, errors }
  }
}
