import { asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../client'
import { tags, transactionTags } from '../schema'
import { newId } from '../ids'
import { toTagDto } from '../mappers'
import type { TagCreateInput, TagDto, TagUpdateInput } from '../../../shared/types'

export const tagsRepo = {
  list(includeArchived = false): TagDto[] {
    const db = getDb()
    const rows = includeArchived
      ? db.select().from(tags).orderBy(asc(tags.name)).all()
      : db.select().from(tags).where(eq(tags.isArchived, false)).orderBy(asc(tags.name)).all()
    return rows.map(toTagDto)
  },

  create(input: TagCreateInput): TagDto {
    const db = getDb()
    const id = newId('t')
    db.insert(tags)
      .values({
        id,
        name: input.name,
        color: input.color ?? null,
        description: input.description ?? null,
        isArchived: false
      })
      .run()
    const row = db.select().from(tags).where(eq(tags.id, id)).get()!
    return toTagDto(row)
  },

  update(input: TagUpdateInput): TagDto {
    const db = getDb()
    const { id, ...rest } = input
    db.update(tags)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .run()
    const row = db.select().from(tags).where(eq(tags.id, id)).get()
    if (!row) throw new Error(`Tag ${id} not found`)
    return toTagDto(row)
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(tags).where(eq(tags.id, id)).run()
  },

  /** Count transactions referencing each tag id. */
  usageCounts(ids?: string[]): Record<string, number> {
    const db = getDb()
    const rows = ids && ids.length > 0
      ? db
          .select({
            tagId: transactionTags.tagId,
            n: sql<number>`COUNT(*)`
          })
          .from(transactionTags)
          .where(inArray(transactionTags.tagId, ids))
          .groupBy(transactionTags.tagId)
          .all()
      : db
          .select({
            tagId: transactionTags.tagId,
            n: sql<number>`COUNT(*)`
          })
          .from(transactionTags)
          .groupBy(transactionTags.tagId)
          .all()
    const out: Record<string, number> = {}
    for (const r of rows) out[r.tagId] = r.n
    return out
  },

  /** Merge source tag into target: transactions linked to source are re-linked to target, then source deleted. */
  merge(sourceId: string, targetId: string): { moved: number } {
    if (sourceId === targetId) return { moved: 0 }
    const db = getDb()
    let moved = 0
    db.transaction((tx) => {
      const txs = tx
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(eq(transactionTags.tagId, sourceId))
        .all()
      for (const row of txs) {
        // If target already on this transaction, just drop the source link; else rewrite
        const existsTarget = tx
          .select()
          .from(transactionTags)
          .where(
            sql`${transactionTags.transactionId} = ${row.transactionId} AND ${transactionTags.tagId} = ${targetId}`
          )
          .get()
        tx.delete(transactionTags)
          .where(
            sql`${transactionTags.transactionId} = ${row.transactionId} AND ${transactionTags.tagId} = ${sourceId}`
          )
          .run()
        if (!existsTarget) {
          tx.insert(transactionTags)
            .values({ transactionId: row.transactionId, tagId: targetId })
            .run()
        }
        moved++
      }
      tx.delete(tags).where(eq(tags.id, sourceId)).run()
    })
    return { moved }
  },

  /** Ensure each tag name exists; returns ID for each name. */
  ensureByNames(names: string[]): string[] {
    if (names.length === 0) return []
    const db = getDb()
    const ids: string[] = []
    db.transaction((tx) => {
      for (const name of names) {
        const existing = tx.select().from(tags).where(eq(tags.name, name)).get()
        if (existing) {
          ids.push(existing.id)
        } else {
          const id = newId('t')
          tx.insert(tags).values({ id, name, isArchived: false }).run()
          ids.push(id)
        }
      }
    })
    return ids
  }
}
