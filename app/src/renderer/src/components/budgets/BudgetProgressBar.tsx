import type { BudgetPaceStatus, BudgetStatus } from '../../../../shared/types'

interface Props {
  percent: number // 0~∞
  status: BudgetStatus
  paceStatus?: BudgetPaceStatus
  height?: 'sm' | 'md' | 'lg'
  /** 100% 초과 시 빨간 띠 펄스 */
  showOverflow?: boolean
}

const STATUS_COLOR: Record<BudgetStatus, string> = {
  unset: 'bg-slate-700',
  safe: 'bg-emerald-500',
  warning: 'bg-amber-500',
  over: 'bg-orange-500',
  critical: 'bg-rose-500'
}

const HEIGHT: Record<NonNullable<Props['height']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-3.5'
}

export default function BudgetProgressBar({
  percent,
  status,
  height = 'md',
  showOverflow = true
}: Props): React.JSX.Element {
  const fill = Math.min(percent, 100)
  const overflow = Math.max(0, percent - 100)

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-slate-800 ${HEIGHT[height]}`}
    >
      <div
        className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${STATUS_COLOR[status]}`}
        style={{ width: `${fill}%` }}
      />
      {showOverflow && overflow > 0 && (
        <div
          className="absolute inset-y-0 right-0 animate-pulse bg-rose-700/50"
          style={{ width: `${Math.min(overflow, 50)}%` }}
        />
      )}
    </div>
  )
}
