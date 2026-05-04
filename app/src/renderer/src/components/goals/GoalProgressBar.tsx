import type { GoalPaceStatus } from '../../../../shared/types'

interface Props {
  percent: number
  paceStatus: GoalPaceStatus
  color?: string | null
  height?: 'sm' | 'md' | 'lg'
}

const PACE_BG: Record<GoalPaceStatus, string> = {
  not_started: 'bg-slate-600',
  in_progress: 'bg-sky-500',
  near: 'bg-emerald-500',
  achieved: 'bg-amber-400',
  overdue: 'bg-rose-500'
}

const HEIGHT: Record<NonNullable<Props['height']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-3.5'
}

export default function GoalProgressBar({
  percent,
  paceStatus,
  color,
  height = 'md'
}: Props): React.JSX.Element {
  const fill = Math.min(percent, 100)
  const overflow = Math.max(0, percent - 100)
  const useCustomColor = color && paceStatus !== 'achieved' && paceStatus !== 'overdue'

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-slate-800 ${HEIGHT[height]}`}
    >
      <div
        className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${
          useCustomColor ? '' : PACE_BG[paceStatus]
        }`}
        style={{ width: `${fill}%`, backgroundColor: useCustomColor ? color! : undefined }}
      />
      {overflow > 0 && (
        <div
          className="absolute inset-y-0 right-0 bg-amber-300/60"
          style={{ width: `${Math.min(overflow, 30)}%` }}
        />
      )}
    </div>
  )
}
