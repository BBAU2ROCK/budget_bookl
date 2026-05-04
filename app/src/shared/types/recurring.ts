import type { DateIso, DateTimeIso, MoneyAmount } from './common'

export interface RecurringSeriesDto {
  id: string
  name: string
  type: 'expense' | 'income'
  amount: MoneyAmount
  currency: string
  categoryId: string | null
  accountId: string | null
  payee: string | null
  memo: string | null
  paymentMethod: string | null
  rrule: string
  dtstart: DateIso
  until: DateIso | null
  count: number | null
  nextOccurrence: DateIso | null
  autoCreate: boolean
  isActive: boolean
  /** YYYY-MM-DD — temporarily suspend materialization until this date passes. null = active. */
  pausedUntil: DateIso | null
  tagIds: string[]
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface RecurringCreateInput {
  name: string
  type: 'expense' | 'income'
  amount: MoneyAmount
  currency: string
  categoryId?: string | null
  accountId?: string | null
  payee?: string | null
  memo?: string | null
  paymentMethod?: string | null
  rrule: string
  dtstart: DateIso
  until?: DateIso | null
  count?: number | null
  autoCreate?: boolean
  /** YYYY-MM-DD — pause until this date (inclusive). null = not paused. */
  pausedUntil?: DateIso | null
  tagIds?: string[]
}

export type RecurringUpdateInput = Partial<RecurringCreateInput> & {
  id: string
  isActive?: boolean
}

export interface RecurringPreviewInput {
  rrule: string
  dtstart: DateIso
  until?: DateIso | null
  count?: number | null
  /** How many upcoming occurrences to return (default 10) */
  limit?: number
}
