import { asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../client'
import { categories } from '../schema'
import { newId } from '../ids'
import { toCategoryDto } from '../mappers'
import type {
  CategoryCreateInput,
  CategoryDto,
  CategoryReorderInput,
  CategoryTreeNode,
  CategoryUpdateInput
} from '../../../shared/types'

function buildTree(rows: CategoryDto[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>()
  rows.forEach((r) => {
    byId.set(r.id, { ...r, children: [], path: r.name, depth: 0 })
  })

  const roots: CategoryTreeNode[] = []
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const assign = (node: CategoryTreeNode, parentPath: string | null, depth: number): void => {
    node.depth = depth
    node.path = parentPath ? `${parentPath} › ${node.name}` : node.name
    node.children
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .forEach((c) => assign(c, node.path, depth + 1))
  }
  roots.sort((a, b) => a.displayOrder - b.displayOrder).forEach((r) => assign(r, null, 0))

  return roots
}

export const categoriesRepo = {
  list(includeArchived = false): CategoryDto[] {
    const db = getDb()
    const rows = includeArchived
      ? db.select().from(categories).orderBy(asc(categories.displayOrder)).all()
      : db
          .select()
          .from(categories)
          .where(eq(categories.isArchived, false))
          .orderBy(asc(categories.displayOrder))
          .all()
    return rows.map(toCategoryDto)
  },

  tree(includeArchived = false): CategoryTreeNode[] {
    return buildTree(this.list(includeArchived))
  },

  create(input: CategoryCreateInput): CategoryDto {
    const db = getDb()
    const id = newId('c')
    db.insert(categories)
      .values({
        id,
        name: input.name,
        parentId: input.parentId ?? null,
        kind: input.kind,
        color: input.color ?? null,
        icon: input.icon ?? null,
        displayOrder: input.displayOrder ?? 0,
        isArchived: false
      })
      .run()
    const row = db.select().from(categories).where(eq(categories.id, id)).get()!
    return toCategoryDto(row)
  },

  update(input: CategoryUpdateInput): CategoryDto {
    const db = getDb()
    const { id, ...rest } = input
    // Prevent setting parentId to self or a descendant (simple self-check)
    if (rest.parentId === id) throw new Error('Category cannot be its own parent')

    db.update(categories)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .run()
    const row = db.select().from(categories).where(eq(categories.id, id)).get()
    if (!row) throw new Error(`Category ${id} not found`)
    return toCategoryDto(row)
  },

  delete(id: string): void {
    const db = getDb()
    // Children become top-level (parent_id set to null via FK onDelete: set null)
    db.delete(categories).where(eq(categories.id, id)).run()
  },

  reorder(input: CategoryReorderInput): void {
    const db = getDb()
    db.transaction((tx) => {
      for (const u of input.updates) {
        tx.update(categories)
          .set({ parentId: u.parentId, displayOrder: u.displayOrder, updatedAt: new Date() })
          .where(eq(categories.id, u.id))
          .run()
      }
    })
  },

  findByIds(ids: string[]): CategoryDto[] {
    if (ids.length === 0) return []
    const db = getDb()
    const rows = db.select().from(categories).where(inArray(categories.id, ids)).all()
    return rows.map(toCategoryDto)
  }
}
