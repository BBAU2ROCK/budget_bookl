import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../client'
import { savingsGoals, savingsGoalAccounts, savingsGoalTags } from '../schema'
import { newId } from '../ids'
import { toSavingsGoalDto } from '../mappers'
import { settingsRepo } from './settings'
import type {
  GoalStatus,
  GoalTagInclusionType,
  SavingsGoalCreateInput,
  SavingsGoalDto,
  SavingsGoalListFilter,
  SavingsGoalUpdateInput
} from '../../../shared/types'

function validateInput(input: SavingsGoalCreateInput | SavingsGoalUpdateInput): void {
  if ('targetAmount' in input && input.targetAmount !== undefined) {
    if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) {
      throw new Error('목표 금액은 0보다 커야 합니다.')
    }
  }
  if (input.startDate && input.targetDate && input.targetDate < input.startDate) {
    throw new Error('마감일이 시작일 이전일 수 없습니다.')
  }
  if (input.tagInclusionTypes && input.tagInclusionTypes.length === 0) {
    throw new Error('태그 합산 시 최소 1개의 거래 타입을 선택해야 합니다.')
  }
}

function getNextDisplayOrder(): number {
  const db = getDb()
  const rows = db
    .select({ max: savingsGoals.displayOrder })
    .from(savingsGoals)
    .all()
  let max = 0
  for (const r of rows) {
    if (r.max != null && r.max > max) max = r.max
  }
  return max + 1
}

function loadLinks(goalId: string): { accountIds: string[]; tagIds: string[] } {
  const db = getDb()
  const accountRows = db
    .select({ accountId: savingsGoalAccounts.accountId })
    .from(savingsGoalAccounts)
    .where(eq(savingsGoalAccounts.goalId, goalId))
    .all()
  const tagRows = db
    .select({ tagId: savingsGoalTags.tagId })
    .from(savingsGoalTags)
    .where(eq(savingsGoalTags.goalId, goalId))
    .all()
  return {
    accountIds: accountRows.map((r) => r.accountId),
    tagIds: tagRows.map((r) => r.tagId)
  }
}

export const goalsRepo = {
  list(filter: SavingsGoalListFilter = {}): SavingsGoalDto[] {
    const db = getDb()
    const conds: ReturnType<typeof eq>[] = []
    const statuses = filter.status ?? ['active']
    if (statuses.length > 0) {
      conds.push(inArray(savingsGoals.status, statuses))
    }
    const rows = db
      .select()
      .from(savingsGoals)
      .where(conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds))
      .orderBy(asc(savingsGoals.displayOrder), asc(savingsGoals.createdAt))
      .all()

    if (rows.length === 0) return []

    // Bulk-load all link rows for these goal IDs
    const goalIds = rows.map((r) => r.id)
    const accountLinks = db
      .select()
      .from(savingsGoalAccounts)
      .where(inArray(savingsGoalAccounts.goalId, goalIds))
      .all()
    const tagLinks = db
      .select()
      .from(savingsGoalTags)
      .where(inArray(savingsGoalTags.goalId, goalIds))
      .all()

    const accountsByGoal = new Map<string, string[]>()
    for (const l of accountLinks) {
      const arr = accountsByGoal.get(l.goalId) ?? []
      arr.push(l.accountId)
      accountsByGoal.set(l.goalId, arr)
    }
    const tagsByGoal = new Map<string, string[]>()
    for (const l of tagLinks) {
      const arr = tagsByGoal.get(l.goalId) ?? []
      arr.push(l.tagId)
      tagsByGoal.set(l.goalId, arr)
    }

    return rows.map((r) =>
      toSavingsGoalDto(r, accountsByGoal.get(r.id) ?? [], tagsByGoal.get(r.id) ?? [])
    )
  },

  get(id: string): SavingsGoalDto | null {
    const db = getDb()
    const row = db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get()
    if (!row) return null
    const links = loadLinks(id)
    return toSavingsGoalDto(row, links.accountIds, links.tagIds)
  },

  create(input: SavingsGoalCreateInput): SavingsGoalDto {
    validateInput(input)

    const db = getDb()
    const id = newId('sg')
    const baseCurrency = settingsRepo.getBaseCurrency()
    const currency = input.currency ?? baseCurrency
    const tagInclusionTypes: GoalTagInclusionType[] = input.tagInclusionTypes ?? [
      'income',
      'transfer_in'
    ]

    db.transaction((tx) => {
      tx.insert(savingsGoals)
        .values({
          id,
          name: input.name.trim(),
          description: input.description ?? null,
          targetAmount: input.targetAmount,
          currency,
          startDate: input.startDate,
          targetDate: input.targetDate ?? null,
          status: 'active',
          startingBalance: input.startingBalance ?? 0,
          manualAmount: input.manualAmount ?? null,
          tagInclusionTypes: JSON.stringify(tagInclusionTypes),
          icon: input.icon ?? null,
          color: input.color ?? null,
          displayOrder: getNextDisplayOrder(),
          notes: input.notes ?? null
        })
        .run()

      if (input.linkedAccountIds && input.linkedAccountIds.length > 0) {
        for (const aid of input.linkedAccountIds) {
          tx.insert(savingsGoalAccounts).values({ goalId: id, accountId: aid }).run()
        }
      }
      if (input.linkedTagIds && input.linkedTagIds.length > 0) {
        for (const tid of input.linkedTagIds) {
          tx.insert(savingsGoalTags).values({ goalId: id, tagId: tid }).run()
        }
      }
    })

    return this.get(id)!
  },

  update(input: SavingsGoalUpdateInput): SavingsGoalDto {
    validateInput(input)

    const db = getDb()
    const { id, linkedAccountIds, linkedTagIds, tagInclusionTypes, ...rest } = input
    const existing = db.select().from(savingsGoals).where(eq(savingsGoals.id, id)).get()
    if (!existing) throw new Error(`Savings goal ${id} not found`)

    db.transaction((tx) => {
      const setObj: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date()
      }
      if (input.achievedAt !== undefined) {
        setObj.achievedAt = input.achievedAt ? new Date(input.achievedAt) : null
      }
      if (tagInclusionTypes !== undefined) {
        setObj.tagInclusionTypes = JSON.stringify(tagInclusionTypes)
      }
      tx.update(savingsGoals).set(setObj).where(eq(savingsGoals.id, id)).run()

      if (linkedAccountIds !== undefined) {
        tx.delete(savingsGoalAccounts).where(eq(savingsGoalAccounts.goalId, id)).run()
        for (const aid of linkedAccountIds) {
          tx.insert(savingsGoalAccounts).values({ goalId: id, accountId: aid }).run()
        }
      }
      if (linkedTagIds !== undefined) {
        tx.delete(savingsGoalTags).where(eq(savingsGoalTags.goalId, id)).run()
        for (const tid of linkedTagIds) {
          tx.insert(savingsGoalTags).values({ goalId: id, tagId: tid }).run()
        }
      }
    })

    return this.get(id)!
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(savingsGoals).where(eq(savingsGoals.id, id)).run()
  },

  markAchieved(id: string): SavingsGoalDto {
    return this.update({ id, status: 'achieved', achievedAt: new Date().toISOString() })
  },

  cancel(id: string): SavingsGoalDto {
    return this.update({ id, status: 'cancelled' })
  },

  reopen(id: string): SavingsGoalDto {
    return this.update({ id, status: 'active' })
  },

  setAccountLinks(goalId: string, accountIds: string[]): void {
    const db = getDb()
    db.transaction((tx) => {
      tx.delete(savingsGoalAccounts).where(eq(savingsGoalAccounts.goalId, goalId)).run()
      for (const aid of accountIds) {
        tx.insert(savingsGoalAccounts).values({ goalId, accountId: aid }).run()
      }
      tx.update(savingsGoals)
        .set({ updatedAt: new Date() })
        .where(eq(savingsGoals.id, goalId))
        .run()
    })
  },

  setTagLinks(goalId: string, tagIds: string[]): void {
    const db = getDb()
    db.transaction((tx) => {
      tx.delete(savingsGoalTags).where(eq(savingsGoalTags.goalId, goalId)).run()
      for (const tid of tagIds) {
        tx.insert(savingsGoalTags).values({ goalId, tagId: tid }).run()
      }
      tx.update(savingsGoals)
        .set({ updatedAt: new Date() })
        .where(eq(savingsGoals.id, goalId))
        .run()
    })
  },

  reorder(goalIds: string[]): void {
    const db = getDb()
    db.transaction((tx) => {
      for (let i = 0; i < goalIds.length; i++) {
        tx.update(savingsGoals)
          .set({ displayOrder: i, updatedAt: new Date() })
          .where(eq(savingsGoals.id, goalIds[i]))
          .run()
      }
    })
  },

  /** Internal helper used by stats: auto-mark goal achieved (avoid circular import). */
  _autoMarkAchieved(id: string): void {
    const db = getDb()
    db.update(savingsGoals)
      .set({ status: 'achieved' as GoalStatus, achievedAt: new Date(), updatedAt: new Date() })
      .where(eq(savingsGoals.id, id))
      .run()
  }
}
