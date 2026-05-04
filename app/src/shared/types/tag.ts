import type { DateTimeIso } from './common'

export interface TagDto {
  id: string
  name: string
  color: string | null
  description: string | null
  isArchived: boolean
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface TagCreateInput {
  name: string
  color?: string | null
  description?: string | null
}

export type TagUpdateInput = Partial<TagCreateInput> & { id: string; isArchived?: boolean }
