import { useState } from 'react'
import type {
  CurrencyDto,
  GoalProgressDto,
  GoalTemplate,
  SavingsGoalDto
} from '../../../../shared/types'
import { GOAL_TEMPLATES } from '../../../../shared/types'
import Modal from '../Modal'
import { formatInteger, formatMoney } from '../../lib/money'

interface Props {
  open: boolean
  goal: SavingsGoalDto | null
  progress: GoalProgressDto | null
  currencies: CurrencyDto[]
  onClose: () => void
  onCreateNext: (template: GoalTemplate) => void
  onCreateCustom: () => void
}

export default function GoalAchievementModal({
  open,
  goal,
  progress,
  currencies,
  onClose,
  onCreateNext,
  onCreateCustom
}: Props): React.JSX.Element | null {
  const [showTemplates, setShowTemplates] = useState(false)

  if (!open || !goal || !progress) return null

  const c = goal.currency
  const isExceeded = progress.percent > 100
  const monthsElapsed = Math.max(1, Math.round(progress.daysElapsed / 30))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✨ 축하합니다!"
      size="md"
      footer={
        showTemplates ? (
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            나중에
          </button>
        ) : (
          <>
            <button
              onClick={onClose}
              className="mr-auto rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
            >
              닫기
            </button>
            <button
              onClick={() => setShowTemplates(true)}
              className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
            >
              🎊 다음 목표 만들기
            </button>
          </>
        )
      }
    >
      {!showTemplates && (
        <div className="space-y-4 text-center">
          <div className="text-5xl">{goal.icon ?? '🎉'}</div>
          <div className="text-2xl font-bold text-amber-300">{goal.name} 달성!</div>
          <div className="font-mono text-sm text-slate-300">
            {formatMoney(progress.totalSaved, c, currencies)} / {formatMoney(goal.targetAmount, c, currencies)} {c}
            {isExceeded && (
              <span className="ml-2 text-emerald-300">
                (+{formatMoney(progress.totalSaved - goal.targetAmount, c, currencies)} 초과)
              </span>
            )}
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-slate-300">
            <div>시작: {goal.startDate}</div>
            <div>달성: {progress.computedAt.slice(0, 10)}</div>
            <div>
              경과: {formatInteger(progress.daysElapsed)}일 ({formatInteger(monthsElapsed)}개월)
            </div>
            <div>월 평균 저축: {formatMoney(progress.pacePerMonth, c, currencies)} {c}</div>
          </div>
        </div>
      )}

      {showTemplates && (
        <div>
          <div className="mb-3 text-center text-sm text-slate-300">
            🎊 다음 도전을 어떻게 할까요?
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GOAL_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.templateId}
                onClick={() => onCreateNext(tmpl)}
                className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3 text-left transition hover:border-sky-500/60 hover:bg-sky-500/10"
              >
                <div className="text-xl">{tmpl.icon}</div>
                <div className="mt-1 text-xs font-semibold text-slate-100">{tmpl.name}</div>
                <div className="mt-0.5 text-[10px] text-slate-500">{tmpl.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 text-center">
            <button
              onClick={onCreateCustom}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              + 내가 직접 만들기
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
