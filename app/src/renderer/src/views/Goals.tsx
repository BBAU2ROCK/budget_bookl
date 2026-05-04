import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CurrencyDto,
  GoalProgressDto,
  GoalStatus,
  GoalTemplate,
  SavingsGoalDto
} from '../../../shared/types'
import GoalCard from '../components/goals/GoalCard'
import GoalForm from '../components/goals/GoalForm'
import GoalTemplateGrid from '../components/goals/GoalTemplateGrid'
import GoalAchievementModal from '../components/goals/GoalAchievementModal'
import InfoTip from '../components/InfoTip'

type FilterMode = 'all' | 'active' | 'achieved' | 'cancelled'

export default function Goals(): React.JSX.Element {
  const [filter, setFilter] = useState<FilterMode>('active')
  const [goals, setGoals] = useState<SavingsGoalDto[]>([])
  const [progresses, setProgresses] = useState<GoalProgressDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SavingsGoalDto | null>(null)
  const [pickedTemplate, setPickedTemplate] = useState<GoalTemplate | null>(null)
  const [achievement, setAchievement] = useState<{
    goal: SavingsGoalDto
    progress: GoalProgressDto
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const statusFilter: GoalStatus[] | undefined =
    filter === 'all' ? undefined : [filter]

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, p, c] = await Promise.all([
        window.api.goals.list({ status: statusFilter }),
        window.api.stats.goalProgressAll({ status: statusFilter }),
        window.api.currencies.list()
      ])
      setGoals(g)
      setProgresses(p)
      setCurrencies(c)

      // Show achievement modal for any goal that just achieved
      const justAchievedProgress = p.find((x) => x.justAchieved)
      if (justAchievedProgress) {
        const matchingGoal = g.find((gg) => gg.id === justAchievedProgress.goalId)
        if (matchingGoal) {
          setAchievement({ goal: matchingGoal, progress: justAchievedProgress })
        }
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    return {
      active: goals.filter((g) => g.status === 'active').length,
      achieved: goals.filter((g) => g.status === 'achieved').length,
      cancelled: goals.filter((g) => g.status === 'cancelled').length
    }
  }, [goals])

  const progressById = useMemo(() => {
    const m = new Map<string, GoalProgressDto>()
    for (const p of progresses) m.set(p.goalId, p)
    return m
  }, [progresses])

  async function handleStatusChange(
    goalId: string,
    next: 'achieved' | 'cancelled' | 'active'
  ): Promise<void> {
    if (next === 'achieved') {
      await window.api.goals.markAchieved(goalId)
    } else if (next === 'cancelled') {
      await window.api.goals.cancel(goalId)
    } else {
      await window.api.goals.reopen(goalId)
    }
    await load()
    setToast('상태가 변경되었습니다.')
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(goalId: string): Promise<void> {
    await window.api.goals.delete(goalId)
    await load()
    setToast('목표가 삭제되었습니다.')
    setTimeout(() => setToast(null), 3000)
  }

  function handleSelectTemplate(t: GoalTemplate): void {
    setPickedTemplate(t)
    setCreating(true)
  }

  function handleCreateCustom(): void {
    setPickedTemplate(null)
    setCreating(true)
  }

  const isEmpty = !loading && goals.length === 0

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-100">
            자산 목표
            <InfoTip side="bottom">
              <b>특정 통장(예적금/투자) 또는 태그</b>로 모으는 돈을 추적하는 기능입니다.
              <br />
              <br />
              <b>진행률 = 현재 모은 금액 ÷ 목표 금액 × 100</b>
              <br />
              100%를 넘으면 자동으로 「달성」 상태가 됩니다.
              <br />
              <br />
              <b>3가지 추적 방식:</b>
              <br />
              · <b>계좌 연결</b>: 선택한 통장들의 잔액 합 − 시작 잔액
              <br />
              · <b>태그 연결</b>: 그 태그가 붙은 거래(수입+이체 in)의 합
              <br />
              · <b>수동 입력</b>: 직접 누적 금액 입력
              <br />
              <br />
              <b>시작 잔액</b>: 목표 시작 시점의 잔액. 이전부터 있던 돈은 진행에서 자동 제외돼,
              "이 목표를 위해 새로 모은 돈"만 진행으로 잡힙니다.
            </InfoTip>
          </h1>
          <p className="text-sm text-slate-400">
            가계부를 "반성"이 아닌 "동기부여"의 도구로
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>
              전체
            </FilterBtn>
            <FilterBtn active={filter === 'active'} onClick={() => setFilter('active')}>
              진행중 {counts.active > 0 && `(${counts.active})`}
            </FilterBtn>
            <FilterBtn active={filter === 'achieved'} onClick={() => setFilter('achieved')}>
              달성 {counts.achieved > 0 && `(${counts.achieved})`}
            </FilterBtn>
            <FilterBtn active={filter === 'cancelled'} onClick={() => setFilter('cancelled')}>
              취소
            </FilterBtn>
          </div>
          <button
            onClick={handleCreateCustom}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 목표
          </button>
        </div>
      </header>

      {toast && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {toast}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
          로딩 중...
        </div>
      )}

      {!loading && isEmpty && filter === 'active' && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10">
          <div className="mb-4 text-center">
            <div className="mb-2 text-3xl">🎯</div>
            <h2 className="mb-2 text-lg font-semibold text-slate-200">
              첫 자산 목표를 만들어 보세요
            </h2>
            <p className="text-sm text-slate-400">
              여행, 비상금, 결혼, 주거 등 — 모으고 싶은 것을 선택하세요
            </p>
          </div>
          <GoalTemplateGrid
            currencies={currencies}
            onSelect={handleSelectTemplate}
            onCreateCustom={handleCreateCustom}
          />
        </div>
      )}

      {!loading && isEmpty && filter !== 'active' && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <p className="text-sm text-slate-400">
            {filter === 'achieved' && '달성한 목표가 아직 없어요.'}
            {filter === 'cancelled' && '취소된 목표가 없어요.'}
            {filter === 'all' && '목표가 없어요.'}
          </p>
        </div>
      )}

      {!loading && goals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals.map((g) => {
            const p = progressById.get(g.id)
            if (!p) return null
            return (
              <GoalCard
                key={g.id}
                goal={g}
                progress={p}
                currencies={currencies}
                onEdit={() => setEditing(g)}
                onChangeStatus={(next) => handleStatusChange(g.id, next)}
                onDelete={() => handleDelete(g.id)}
              />
            )
          })}
        </div>
      )}

      {/* Modals */}
      <GoalForm
        open={creating}
        template={pickedTemplate}
        onClose={() => {
          setCreating(false)
          setPickedTemplate(null)
        }}
        onSaved={() => {
          load()
          setToast('새 목표가 추가되었습니다.')
          setTimeout(() => setToast(null), 3000)
        }}
      />
      <GoalForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          load()
          setToast('목표가 수정되었습니다.')
          setTimeout(() => setToast(null), 3000)
        }}
        onDeleted={() => {
          load()
          setToast('목표가 삭제되었습니다.')
          setTimeout(() => setToast(null), 3000)
        }}
      />
      <GoalAchievementModal
        open={!!achievement}
        goal={achievement?.goal ?? null}
        progress={achievement?.progress ?? null}
        currencies={currencies}
        onClose={() => setAchievement(null)}
        onCreateNext={(t) => {
          setAchievement(null)
          handleSelectTemplate(t)
        }}
        onCreateCustom={() => {
          setAchievement(null)
          handleCreateCustom()
        }}
      />
    </div>
  )
}

function FilterBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 transition ${
        active ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
