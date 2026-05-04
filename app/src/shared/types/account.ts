import type { AccountType, DateTimeIso, MoneyAmount } from './common'

export interface AccountDto {
  id: string
  name: string
  type: AccountType
  currency: string
  initialBalance: MoneyAmount
  color: string | null
  icon: string | null
  notes: string | null
  displayOrder: number
  isArchived: boolean

  // Credit card-specific metadata (null for non-card accounts)
  issuer: string | null
  cardLast4: string | null
  billingDay: number | null
  statementClosing: number | null
  creditLimit: MoneyAmount | null
  annualFee: MoneyAmount | null
  benefitsSummary: string | null

  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface AccountCreateInput {
  name: string
  type: AccountType
  currency: string
  initialBalance?: MoneyAmount
  color?: string | null
  icon?: string | null
  notes?: string | null
  displayOrder?: number

  // Credit card fields
  issuer?: string | null
  cardLast4?: string | null
  billingDay?: number | null
  statementClosing?: number | null
  creditLimit?: MoneyAmount | null
  annualFee?: MoneyAmount | null
  benefitsSummary?: string | null
}

export type AccountUpdateInput = Partial<AccountCreateInput> & { id: string; isArchived?: boolean }

export interface AccountBalanceDto {
  accountId: string
  currency: string
  balance: MoneyAmount
  /** Net flow since account creation (income - expense - transferOut + transferIn) */
  netFlow: MoneyAmount
}
