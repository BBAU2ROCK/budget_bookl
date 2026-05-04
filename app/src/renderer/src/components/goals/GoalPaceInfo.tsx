import type { CurrencyDto, GoalProgressDto } from '../../../../shared/types'
import { formatInteger, formatMoney } from '../../lib/money'

interface Props {
  progress: GoalProgressDto
  currencies: CurrencyDto[]
}

export default function GoalPaceInfo({ progress, currencies }: Props): React.JSX.Element {
  const c = progress.currency
  return (
    <div className="rounded-md border border-slate-700/40 bg-slate-950/40 p-3 text-xs">
      <div className="mb-1.5 font-semibold text-slate-300">📈 페이스 분석</div>
      <ul className="space-y-0.5 font-mono text-[11px] text-slate-400">
        <li>
          <span className="text-slate-500">월 평균 저축:</span>{' '}
          <span className="text-slate-200">
            {formatMoney(progress.pacePerMonth, c, currencies)} {c}
          </span>
        </li>
        {progress.projectedAchievement && (
          <li>
            <span className="text-slate-500">예상 달성일:</span>{' '}
            <span className="text-slate-200">{progress.projectedAchievement}</span>
            {progress.onTrack === true && (
              <span className="ml-1 text-emerald-300">✅ on track</span>
            )}
            {progress.onTrack === false && (
              <span className="ml-1 text-amber-300">⚠️ 페이스 부족</span>
            )}
          </li>
        )}
        <li>
          <span className="text-slate-500">시작:</span>{' '}
          <span className="text-slate-300">{progress.startDate}</span>{' '}
          <span className="text-slate-500">
            ({formatInteger(progress.daysElapsed)}일 경과)
          </span>
        </li>
        {progress.targetDate && (
          <li>
            <span className="text-slate-500">마감:</span>{' '}
            <span className="text-slate-300">{progress.targetDate}</span>{' '}
            {progress.daysRemaining !== null && progress.daysRemaining >= 0 && (
              <span className="text-slate-500">
                (D-{formatInteger(progress.daysRemaining)})
              </span>
            )}
            {progress.daysRemaining !== null && progress.daysRemaining < 0 && (
              <span className="text-rose-300">
                ({formatInteger(Math.abs(progress.daysRemaining))}일 초과)
              </span>
            )}
          </li>
        )}
      </ul>
    </div>
  )
}
