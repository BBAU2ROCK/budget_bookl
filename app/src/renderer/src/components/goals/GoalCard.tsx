import { useState } from 'react'
import type { CurrencyDto, GoalProgressDto, SavingsGoalDto } from '../../../../shared/types'
import { formatInteger, formatMoney } from '../../lib/money'
import GoalProgressBar from './GoalProgressBar'
import GoalSourceBreakdown from './GoalSourceBreakdown'
import GoalPaceInfo from './GoalPaceInfo'

interface Props {
  goal: SavingsGoalDto
  progress: GoalProgressDto
  currencies: CurrencyDto[]
  onEdit: () => void
  onChangeStatus: (next: 'achieved' | 'cancelled' | 'active') => void
  onDelete: () => void
}

const PACE_LABEL: Record<string, string> = {
  not_started: '⚪ 시작 전',
  in_progress: '🟦 진행 중',
  near: '🟢 임박',
  achieved: '✨ 달성',
  overdue: '🔴 마감 초과'
}

export default function GoalCard({
  goal,
  progress,
  currencies,
  onEdit,
  onChangeStatus,
  onDelete
}: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const c = goal.currency
  const isAchieved = progress.percent >= 100
  const isOverdue = progress.paceStatus === 'overdue'
  const remainingLabel =
    progress.remaining > 0
      ? `잔여 ${formatMoney(progress.remaining, c, currencies)} ${c}`
      : `초과 +${formatMoney(Math.abs(progress.remaining), c, currencies)} ${c}`

  // D-day display
  let dDay = ''
  if (progress.daysRemaining !== null) {
    if (progress.daysRemaining > 0) dDay = `D-${formatInteger(progress.daysRemaining)}일`
    else if (progress.daysRemaining === 0) dDay = 'D-day'
    else dDay = `${formatInteger(Math.abs(progress.daysRemaining))}일 초과`
  } else {
    dDay = '마감 미설정'
  }

  return (
    <div
      className={`rounded-xl border bg-slate-900/40 p-4 ${
        isAchieved
          ? 'border-amber-400/40'
          : isOverdue
            ? 'border-rose-500/40'
            : 'border-slate-700/70'
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {goal.icon && <span className="text-xl">{goal.icon}</span>}
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-100">{goal.name}</div>
            <div className="truncate text-xs text-slate-500">
              {PACE_LABEL[progress.paceStatus] ?? ''} · {dDay}
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          {expanded ? '접기 ▲' : '펼치기 ▼'}
        </button>
      </div>

      {/* Progress bar */}
      <GoalProgressBar
        percent={progress.percent}
        paceStatus={progress.paceStatus}
        color={goal.color}
        height="lg"
      />

      {/* Amount summary */}
      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-mono">
          <span className="font-bold text-slate-100">
            {formatMoney(progress.totalSaved, c, currencies)}
          </span>{' '}
          <span className="text-slate-500">/</span>{' '}
          <span className="text-slate-300">
            {formatMoney(progress.targetAmount, c, currencies)}
          </span>{' '}
          <span className="text-slate-500">{c}</span>
        </span>
        <span className="font-mono text-xl font-bold">{progress.percent.toFixed(1)}%</span>
      </div>
      <div className="text-right text-xs">
        <span
          className={
            progress.remaining > 0
              ? 'text-slate-400'
              : isAchieved
                ? 'text-amber-300'
                : 'text-emerald-300'
          }
        >
          {isAchieved && progress.remaining < 0 ? '✨ ' : ''}
          {remainingLabel}
        </span>
      </div>

      {/* Description */}
      {goal.description && (
        <div className="mt-2 text-xs text-slate-400">{goal.description}</div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2">
          <GoalSourceBreakdown progress={progress} currencies={currencies} />
          <GoalPaceInfo progress={progress} currencies={currencies} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onEdit}
          className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          편집
        </button>
        {goal.status === 'active' && progress.percent >= 100 && (
          <button
            onClick={() => onChangeStatus('achieved')}
            className="rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/25"
          >
            ✨ 달성 처리
          </button>
        )}
        {goal.status === 'active' && (
          <button
            onClick={() => {
              if (!confirm('이 목표를 취소하시겠습니까?')) return
              onChangeStatus('cancelled')
            }}
            className="rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1 text-xs text-slate-400 hover:bg-slate-700"
          >
            취소
          </button>
        )}
        {(goal.status === 'achieved' || goal.status === 'cancelled') && (
          <button
            onClick={() => onChangeStatus('active')}
            className="rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1 text-xs text-sky-200 hover:bg-sky-500/25"
          >
            🔄 재개
          </button>
        )}
        <button
          onClick={() => {
            if (!confirm('이 목표를 영구 삭제하시겠습니까?')) return
            onDelete()
          }}
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
        >
          🗑
        </button>
      </div>
    </div>
  )
}
