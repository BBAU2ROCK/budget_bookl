import { asc, eq, inArray } from 'drizzle-orm'
import { RRule, rrulestr } from 'rrule'
import { getDb } from '../client'
import { recurringSeries, recurringTags } from '../schema'
import { newId } from '../ids'
import { toRecurringDto } from '../mappers'
import type {
  RecurringCreateInput,
  RecurringPreviewInput,
  RecurringSeriesDto,
  RecurringUpdateInput
} from '../../../shared/types'

// Anchor RRULE expansions at noon UTC so timezone shifts of ±12h can't move the
// resulting calendar date by one day. Matches `recurring-materializer.ts`.
const OCCURRENCE_TIME = 'T12:00:00.000Z'

function computeNextOccurrence(
  rruleStr: string,
  dtstart: string,
  until: string | null
): string | null {
  try {
    const dtstartDate = new Date(`${dtstart}${OCCURRENCE_TIME}`)
    const fullRrule = rruleStr.startsWith('RRULE:') ? rruleStr : `RRULE:${rruleStr}`
    const dtstartLine = `DTSTART:${dtstartDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
    const rule = rrulestr(`${dtstartLine}\n${fullRrule}`) as RRule
    const now = new Date()
    const next = rule.after(now, true)
    if (!next) return null
    const nextStr = next.toISOString().slice(0, 10)
    if (until && nextStr > until) return null
    return nextStr
  } catch (err) {
    console.warn('[recurring] computeNextOccurrence failed:', err)
    return null
  }
}

function loadTagIds(seriesIds: string[]): Map<string, string[]> {
  if (seriesIds.length === 0) return new Map()
  const db = getDb()
  const map = new Map<string, string[]>()
  // 모든 series에 대한 태그를 한 번의 쿼리로 가져온 뒤 client에서 그룹핑.
  // 이전 N+1 패턴은 100 series = 100 쿼리 → 단일 inArray로 1회.
  const rows = db
    .select()
    .from(recurringTags)
    .where(inArray(recurringTags.seriesId, seriesIds))
    .all()
  for (const sid of seriesIds) map.set(sid, [])
  for (const row of rows) {
    const arr = map.get(row.seriesId)
    if (arr) arr.push(row.tagId)
  }
  return map
}

export const recurringRepo = {
  list(includeInactive = false): RecurringSeriesDto[] {
    const db = getDb()
    const rows = includeInactive
      ? db.select().from(recurringSeries).orderBy(asc(recurringSeries.name)).all()
      : db
          .select()
          .from(recurringSeries)
          .where(eq(recurringSeries.isActive, true))
          .orderBy(asc(recurringSeries.name))
          .all()
    const tagMap = loadTagIds(rows.map((r) => r.id))
    return rows.map((r) => toRecurringDto(r, tagMap.get(r.id) ?? []))
  },

  get(id: string): RecurringSeriesDto | null {
    const db = getDb()
    const row = db.select().from(recurringSeries).where(eq(recurringSeries.id, id)).get()
    if (!row) return null
    const tagIds =
      db
        .select({ tagId: recurringTags.tagId })
        .from(recurringTags)
        .where(eq(recurringTags.seriesId, id))
        .all()
        .map((r) => r.tagId) ?? []
    return toRecurringDto(row, tagIds)
  },

  create(input: RecurringCreateInput): RecurringSeriesDto {
    const db = getDb()
    const id = newId('rs')
    const nextOccurrence = computeNextOccurrence(
      input.rrule,
      input.dtstart,
      input.until ?? null
    )

    db.transaction((tx) => {
      tx.insert(recurringSeries)
        .values({
          id,
          name: input.name,
          type: input.type,
          amount: input.amount,
          currency: input.currency,
          categoryId: input.categoryId ?? null,
          accountId: input.accountId ?? null,
          payee: input.payee ?? null,
          memo: input.memo ?? null,
          paymentMethod: input.paymentMethod ?? null,
          rrule: input.rrule,
          dtstart: input.dtstart,
          until: input.until ?? null,
          count: input.count ?? null,
          nextOccurrence,
          autoCreate: input.autoCreate ?? true,
          isActive: true,
          pausedUntil: input.pausedUntil ?? null
        })
        .run()

      if (input.tagIds && input.tagIds.length > 0) {
        for (const tagId of input.tagIds) {
          tx.insert(recurringTags).values({ seriesId: id, tagId }).run()
        }
      }
    })

    return this.get(id)!
  },

  update(input: RecurringUpdateInput): RecurringSeriesDto {
    const db = getDb()
    const { id, tagIds, ...rest } = input
    const existing = db.select().from(recurringSeries).where(eq(recurringSeries.id, id)).get()
    if (!existing) throw new Error(`Recurring series ${id} not found`)

    const nextOccurrence =
      rest.rrule !== undefined || rest.dtstart !== undefined || rest.until !== undefined
        ? computeNextOccurrence(
            rest.rrule ?? existing.rrule,
            rest.dtstart ?? existing.dtstart,
            rest.until ?? existing.until ?? null
          )
        : existing.nextOccurrence

    db.transaction((tx) => {
      tx.update(recurringSeries)
        .set({ ...rest, nextOccurrence, updatedAt: new Date() })
        .where(eq(recurringSeries.id, id))
        .run()

      if (tagIds !== undefined) {
        tx.delete(recurringTags).where(eq(recurringTags.seriesId, id)).run()
        for (const tagId of tagIds) {
          tx.insert(recurringTags).values({ seriesId: id, tagId }).run()
        }
      }
    })

    return this.get(id)!
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(recurringSeries).where(eq(recurringSeries.id, id)).run()
  },

  /**
   * Preview upcoming occurrences for a given RRULE without persisting.
   * Returns ISO date strings (YYYY-MM-DD).
   */
  preview(input: RecurringPreviewInput): string[] {
    try {
      const dtstartDate = new Date(`${input.dtstart}${OCCURRENCE_TIME}`)
      const fullRrule = input.rrule.startsWith('RRULE:') ? input.rrule : `RRULE:${input.rrule}`
      const dtstartLine = `DTSTART:${dtstartDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
      const rule = rrulestr(`${dtstartLine}\n${fullRrule}`) as RRule
      const now = new Date()
      const limit = input.limit ?? 10
      const dates: Date[] = []
      let cursor = now
      for (let i = 0; i < limit; i++) {
        const next = rule.after(cursor, i === 0)
        if (!next) break
        if (input.until && next.toISOString().slice(0, 10) > input.until) break
        if (input.count && dates.length >= input.count) break
        dates.push(next)
        cursor = next
      }
      return dates.map((d) => d.toISOString().slice(0, 10))
    } catch (err) {
      throw new Error(`Invalid RRULE: ${(err as Error).message}`)
    }
  }
}
