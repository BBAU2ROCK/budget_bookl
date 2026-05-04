import type { CategoryKind, DateTimeIso } from './common'

export interface CategoryDto {
  id: string
  name: string
  parentId: string | null
  kind: CategoryKind
  color: string | null
  icon: string | null
  displayOrder: number
  isArchived: boolean
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface CategoryTreeNode extends CategoryDto {
  children: CategoryTreeNode[]
  /** Full path from root, e.g. "지출 › 식비 › 외식" */
  path: string
  /** Depth from root (0-based) */
  depth: number
}

export interface CategoryCreateInput {
  name: string
  parentId?: string | null
  kind: CategoryKind
  color?: string | null
  icon?: string | null
  displayOrder?: number
}

export type CategoryUpdateInput = Partial<CategoryCreateInput> & {
  id: string
  isArchived?: boolean
}

export interface CategoryReorderInput {
  /** Array of {id, parentId, displayOrder} to update in one pass */
  updates: Array<{ id: string; parentId: string | null; displayOrder: number }>
}
