import type { ReactNode } from 'react'
import type { CurrencyDto, PeriodComparisonAxis } from '../../../shared/types'
import { formatDeltaPct, formatInteger, formatMoney, formatSignedMoney } from '../lib/money'
import InfoTip from './InfoTip'

interface KpiCardProps {
  label: string
  amount: number
  currency: string
  comparison?: PeriodComparisonAxis
  comparisonLabel?: string
  tone?: 'income' | 'expense' | 'neutral'
  currencies?: CurrencyDto[]
  /** When true, render `amount` as a plain integer (no currency, no decimals). For counts. */
  isCount?: boolean
  /** Optional unit suffix in count mode (e.g., "건", "회"). */
  countSuffix?: string
  /** 의미·계산 방법 풀이. 라벨 옆 ⓘ 아이콘에 호버 시 표시. */
  info?: ReactNode
}

export default function KpiCard({
  label,
  amount,
  currency,
  comparison,
  comparisonLabel = '전월',
  tone = 'neutral',
  currencies,
  isCount,
  countSuffix,
  info
}: KpiCardProps): React.JSX.Element {
  const toneColors: Record<string, string> = {
    income: 'text-emerald-300',
    expense: 'text-rose-300',
    neutral: 'text-slate-100'
  }

  // For expenses, up is bad (red); for income/net, up is good (green)
  const deltaUp = comparison && comparison.deltaAbs > 0
  const isBad = deltaUp && tone === 'expense'
  const isGood = deltaUp && tone !== 'expense'
  const deltaColor = comparison
    ? comparison.deltaAbs === 0
      ? 'text-slate-500'
      : isBad
        ? 'text-rose-300'
        : isGood
          ? 'text-emerald-300'
          : deltaUp
            ? 'text-emerald-300'
            : 'text-rose-300'
    : 'text-slate-500'

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <div className="flex items-center text-xs uppercase tracking-wider text-slate-400">
        {label}
        {info && <InfoTip side="bottom">{info}</InfoTip>}
      </div>
      <div className={`mt-2 font-mono text-3xl font-bold ${toneColors[tone]}`}>
        {isCount
          ? formatInteger(Math.abs(amount))
          : formatMoney(Math.abs(amount), currency, currencies)}
        {isCount
          ? countSuffix && (
              <span className="ml-1 text-sm font-normal text-slate-500">{countSuffix}</span>
            )
          : currency && (
              <span className="ml-1 text-sm font-normal text-slate-500">{currency}</span>
            )}
      </div>
      {comparison && (
        <div className={`mt-2 flex items-center gap-2 text-xs ${deltaColor}`}>
          <span className="font-semibold">
            {comparison.deltaAbs === 0
              ? '—'
              : isCount
                ? `${comparison.deltaAbs > 0 ? '+' : '−'}${formatInteger(Math.abs(comparison.deltaAbs))}`
                : formatSignedMoney(comparison.deltaAbs, currency, currencies)}
          </span>
          <span>({formatDeltaPct(comparison.deltaPct)})</span>
          <span className="text-slate-500">vs {comparisonLabel}</span>
        </div>
      )}
    </div>
  )
}
