import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import { rrulestr, type RRule } from 'rrule'
import { getDb } from './client'
import { recurringSeries, recurringTags, transactions } from './schema'
import { transactionsRepo } from './repositories/transactions'

/**
 * Anchor recurring-occurrence timestamps at NOON UTC (12:00:00Z).
 *
 * Rationale: storing/comparing dates as midnight-UTC means a user in a
 * negative timezone (UTC-N) sees the date shift back by one (midnight UTC =
 * previous day local). 12:00 UTC keeps every timezone in [-11, +12] on the
 * same calendar date, which covers all real-world locales including KST.
 * BYMONTHDAY=31 / leap-year edge cases also become deterministic since
 * RRULE expansion is done in UTC space without DST drift.
 */
const OCCURRENCE_TIME = 'T12:00:00.000Z'

/**
 * For every active + autoCreate recurring series, materialize transactions
 * for each due occurrence up to `today`.
 * Idempotent: skips dates for which a transaction with the same series+date already exists.
 */
export function materializeDueRecurrings(today: Date = new Date()): {
  created: number
  skipped: number
  seriesProcessed: number
  errors: Array<{ seriesId: string; date: string; message: string }>
} {
  const db = getDb()
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const series = db
    .select()
    .from(recurringSeries)
    .where(and(eq(recurringSeries.isActive, true), eq(recurringSeries.autoCreate, true)))
    .all()

  let created = 0
  let skipped = 0
  const errors: Array<{ seriesId: string; date: string; message: string }> = []

  // Today's calendar date (UTC, matching how `dtstart` etc are stored)
  const todayStr = today.toISOString().slice(0, 10)

  // Bulk-load tags for ALL series once, instead of N+1 queries inside the loop.
  const tagsByseriesId = new Map<string, string[]>()
  if (series.length > 0) {
    const allTagRows = db
      .select()
      .from(recurringTags)
      .where(inArray(recurringTags.seriesId, series.map((s) => s.id)))
      .all()
    for (const s of series) tagsByseriesId.set(s.id, [])
    for (const row of allTagRows) {
      const arr = tagsByseriesId.get(row.seriesId)
      if (arr) arr.push(row.tagId)
    }
  }

  for (const s of series) {
    // Skip series that are currently paused (pausedUntil >= today).
    // Once today moves past the paused_until date, the series resumes
    // automatically without needing user action.
    // paused 상태에서도 nextOccurrence는 미리 계산해 UI(목록/상세)에서 정확한 다음 예정일을
    // 보여줄 수 있게 한다 (이전엔 paused 후 처음 머터리얼라이즈 될 때까지 stale).
    if (s.pausedUntil && s.pausedUntil >= todayStr) {
      const nextAfterToday = computeNextAfter(s.rrule, s.dtstart, s.until, today)
      db.update(recurringSeries)
        .set({ nextOccurrence: nextAfterToday, updatedAt: new Date() })
        .where(eq(recurringSeries.id, s.id))
        .run()
      continue
    }

    const dueDates = expandDueDates({
      rrule: s.rrule,
      dtstart: s.dtstart,
      until: s.until,
      countLimit: s.count,
      cursorFrom: s.nextOccurrence ?? s.dtstart,
      cursorTo: todayEnd
    })

    for (const dt of dueDates) {
      const occurredAt = new Date(`${dt}${OCCURRENCE_TIME}`)

      // Duplicate guard — compare by calendar date (YYYY-MM-DD), not exact
      // timestamp. Earlier versions stored at midnight-UTC; this keeps the
      // duplicate check correct across that legacy data + new noon-UTC rows.
      // dayEnd는 다음 날 자정으로 잡아 lt 비교 시 23:59:59.999까지 포함되도록 한다
      // (이전엔 23:59:59.999를 dayEnd로 잡고 lt 사용 → 그 시각의 거래는 포함 안 됨).
      const dayStart = new Date(`${dt}T00:00:00.000Z`)
      const nextDayStart = new Date(dayStart)
      nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1)
      const existing = db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.recurringSeriesId, s.id),
            gte(transactions.occurredAt, dayStart),
            lt(transactions.occurredAt, nextDayStart)
          )
        )
        .get()
      if (existing) {
        skipped++
        continue
      }

      // Tag copy-over (이미 bulk로 미리 로드됨)
      const tagIds = tagsByseriesId.get(s.id) ?? []

      try {
        transactionsRepo.create({
          type: s.type,
          occurredAt: occurredAt.toISOString(),
          amount: s.amount,
          currency: s.currency,
          categoryId: s.categoryId,
          accountId: s.accountId,
          payee: s.payee,
          memo: s.memo ?? null,
          paymentMethod: s.paymentMethod,
          tagIds,
          recurringSeriesId: s.id
        })
        created++
      } catch (err) {
        errors.push({
          seriesId: s.id,
          date: dt,
          message: (err as Error).message
        })
      }
    }

    // Recompute next occurrence after today
    const nextAfterToday = computeNextAfter(
      s.rrule,
      s.dtstart,
      s.until,
      today
    )
    db.update(recurringSeries)
      .set({ nextOccurrence: nextAfterToday, updatedAt: new Date() })
      .where(eq(recurringSeries.id, s.id))
      .run()
  }

  return { created, skipped, seriesProcessed: series.length, errors }
}

function asFullRule(rrule: string, dtstart: string): string {
  // Anchor DTSTART at noon UTC for the same timezone-safety reason described
  // at the top of this file.
  const dtstartUtc = new Date(`${dtstart}${OCCURRENCE_TIME}`)
  const dtstartLine = `DTSTART:${dtstartUtc.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
  const rruleLine = rrule.startsWith('RRULE:') ? rrule : `RRULE:${rrule}`
  return `${dtstartLine}\n${rruleLine}`
}

function expandDueDates(input: {
  rrule: string
  dtstart: string
  until: string | null
  countLimit: number | null
  cursorFrom: string // YYYY-MM-DD (inclusive)
  cursorTo: Date // inclusive
}): string[] {
  try {
    const rule = rrulestr(asFullRule(input.rrule, input.dtstart)) as RRule
    const fromDate = new Date(`${input.cursorFrom}${OCCURRENCE_TIME}`)
    const dates = rule.between(fromDate, input.cursorTo, true)
    const out: string[] = []
    for (const d of dates) {
      const ds = d.toISOString().slice(0, 10)
      if (input.until && ds > input.until) break
      if (input.countLimit != null && out.length >= input.countLimit) break
      out.push(ds)
    }
    return out
  } catch (err) {
    console.warn('[recurring-materializer] expand failed:', err)
    return []
  }
}

function computeNextAfter(
  rrule: string,
  dtstart: string,
  until: string | null,
  anchor: Date
): string | null {
  try {
    const rule = rrulestr(asFullRule(rrule, dtstart)) as RRule
    // anchor = today; next occurrence is strictly after today
    const tomorrow = new Date(anchor)
    tomorrow.setHours(23, 59, 59, 999)
    const next = rule.after(tomorrow, false)
    if (!next) return null
    const ds = next.toISOString().slice(0, 10)
    if (until && ds > until) return null
    return ds
  } catch {
    return null
  }
}
