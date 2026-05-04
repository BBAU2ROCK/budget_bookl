import type { DateIso, DateTimeIso, MoneyAmount } from './common'

/** v2: simplified to 3 states (paused removed) */
export type GoalStatus = 'active' | 'achieved' | 'cancelled'

export type GoalPaceStatus =
  | 'not_started' // progress = 0%
  | 'in_progress' // 0% < progress < 90%
  | 'near' // 90% ≤ progress < 100%
  | 'achieved' // progress ≥ 100%
  | 'overdue' // targetDate passed and progress < 100%

/** Which transaction types are summed when matching goal tags */
export type GoalTagInclusionType = 'income' | 'transfer_in'

export interface SavingsGoalDto {
  id: string
  name: string
  description: string | null
  targetAmount: MoneyAmount
  currency: string

  startDate: DateIso
  targetDate: DateIso | null

  status: GoalStatus
  achievedAt: DateTimeIso | null

  /**
   * Starting balance to subtract from the linked accounts' balance
   * (i.e. amount that was already in the linked account when this goal began).
   * Only applied to the `fromAccounts` source.
   */
  startingBalance: MoneyAmount

  manualAmount: MoneyAmount | null

  /** Which transaction types contribute when matching goal tags */
  tagInclusionTypes: GoalTagInclusionType[]

  icon: string | null
  color: string | null
  displayOrder: number
  notes: string | null

  // Resolved from M:N junction tables
  linkedAccountIds: string[]
  linkedTagIds: string[]

  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface SavingsGoalCreateInput {
  name: string
  description?: string | null
  targetAmount: MoneyAmount
  currency?: string
  startDate: DateIso
  targetDate?: DateIso | null
  startingBalance?: MoneyAmount
  manualAmount?: MoneyAmount | null
  tagInclusionTypes?: GoalTagInclusionType[]
  icon?: string | null
  color?: string | null
  notes?: string | null
  linkedAccountIds?: string[]
  linkedTagIds?: string[]
}

export type SavingsGoalUpdateInput = Partial<SavingsGoalCreateInput> & {
  id: string
  status?: GoalStatus
  displayOrder?: number
  achievedAt?: DateTimeIso | null
}

export interface SavingsGoalListFilter {
  status?: GoalStatus[]
}

/* =========================================================================
 * Goal Progress (v2.1: starting_balance only applies to fromAccounts)
 * =========================================================================*/

export interface GoalProgressDto {
  goalId: string
  name: string
  icon: string | null
  color: string | null
  status: GoalStatus

  targetAmount: MoneyAmount
  currency: string

  // Sources (v2.1)
  /** Sum of linked accounts' balances (raw, before starting_balance offset) */
  fromAccountsRaw: MoneyAmount
  startingBalanceOffset: MoneyAmount
  /** = max(0, fromAccountsRaw − startingBalance) */
  fromAccounts: MoneyAmount
  /** Sum of tag-matched transactions (income + transfer_in by default) */
  fromTags: MoneyAmount
  fromManual: MoneyAmount
  /** = fromAccounts + fromTags + fromManual */
  totalSaved: MoneyAmount

  remaining: MoneyAmount
  percent: number
  paceStatus: GoalPaceStatus

  startDate: DateIso
  targetDate: DateIso | null
  daysElapsed: number
  daysRemaining: number | null

  pacePerMonth: MoneyAmount
  projectedAchievement: DateIso | null
  onTrack: boolean | null

  accountContributions: Array<{
    accountId: string
    accountName: string
    balance: MoneyAmount
    isStartingBalanceApplied: boolean
  }>
  tagContributions: Array<{
    tagId: string
    tagName: string
    total: MoneyAmount
    txCount: number
    incomeCount: number
    transferInCount: number
  }>

  /** True only on the call that first observes percent ≥ 100% (auto-achieve trigger) */
  justAchieved: boolean

  computedAt: DateTimeIso
}

export interface GoalProgressFilter {
  status?: GoalStatus[]
}

/* =========================================================================
 * Goal templates (suggestion after achievement)
 * =========================================================================*/

export interface GoalTemplate {
  templateId:
    | 'travel'
    | 'emergency'
    | 'wedding'
    | 'home'
    | 'retirement'
    | 'education'
    | 'custom'
  name: string
  icon: string
  color: string
  suggestedAmount: MoneyAmount
  description: string
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    templateId: 'travel',
    name: '여행 자금',
    icon: '✈️',
    color: '#0ea5e9',
    suggestedAmount: 3000000,
    description: '국내·해외 여행 비용'
  },
  {
    templateId: 'emergency',
    name: '비상금',
    icon: '🛟',
    color: '#10b981',
    suggestedAmount: 5000000,
    description: '3~6개월 생활비'
  },
  {
    templateId: 'wedding',
    name: '결혼 자금',
    icon: '💍',
    color: '#ec4899',
    suggestedAmount: 50000000,
    description: '예식·신혼여행·신혼집'
  },
  {
    templateId: 'home',
    name: '주거 자금',
    icon: '🏠',
    color: '#8b5cf6',
    suggestedAmount: 100000000,
    description: '전세금·내집 마련'
  },
  {
    templateId: 'retirement',
    name: '노후 준비',
    icon: '🏖️',
    color: '#f59e0b',
    suggestedAmount: 300000000,
    description: '은퇴 후 생활'
  },
  {
    templateId: 'education',
    name: '교육 자금',
    icon: '📚',
    color: '#6366f1',
    suggestedAmount: 20000000,
    description: '본인·자녀 교육'
  }
]
