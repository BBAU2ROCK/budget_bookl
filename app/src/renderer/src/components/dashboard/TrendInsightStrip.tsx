import type { CurrencyDto, MonthlySummaryDto } from '../../../../shared/types'
import InfoTip from '../InfoTip'

/**
 * Compact horizontal strip of MoM/YoY headline movements.
 *
 * The dashboard already shows percentage comparisons inside the KPI cards,
 * but those are easy to skim past. This strip highlights only the *large*
 * (>±15%) movements so the user notices them at a glance — silent in
 * stable months.
 */
export default function TrendInsightStrip({
  summary
}: {
  summary: MonthlySummaryDto | null
  currencies: CurrencyDto[]
}): React.JSX.Element | null {
  if (!summary) return null

  type Insight = { key: string; label: string; pct: number; tone: 'up_bad' | 'up_good' | 'down_bad' | 'down_good' }
  const insights: Insight[] = []

  const addIfBig = (
    key: string,
    label: string,
    pct: number | null,
    raise: 'good' | 'bad'
  ): void => {
    if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 15) return
    insights.push({
      key,
      label,
      pct,
      tone:
        pct >= 0
          ? raise === 'good'
            ? 'up_good'
            : 'up_bad'
          : raise === 'good'
            ? 'down_bad'
            : 'down_good'
    })
  }

  // vsPrevMonth percentages (deltaPct null when previous = 0).
  const mom = summary.vsPrevMonth
  if (mom) {
    addIfBig('inc-mom', '수입 (전월)', mom.income.deltaPct, 'good')
    addIfBig('exp-mom', '지출 (전월)', mom.expense.deltaPct, 'bad')
    addIfBig('net-mom', '순수익 (전월)', mom.net.deltaPct, 'good')
  }
  const yoy = summary.vsPrevYear
  if (yoy) {
    addIfBig('exp-yoy', '지출 (전년 동월)', yoy.expense.deltaPct, 'bad')
  }

  if (insights.length === 0) return null

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3">
      <span className="flex items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
        주요 변동
        <InfoTip side="bottom">
          이번 달 수입·지출이 지난 달(또는 작년 같은 달)에 비해 <b>15% 이상</b> 변동됐을 때만
          여기에 표시됩니다.
          <br />
          <br />
          평소와 비슷한 달엔 안 보이고, 갑자기 늘거나 줄었을 때만 눈에 띄게 알립니다.
          <br />
          <br />
          🔺 빨강: 지출이 많이 늘어남 (주의)
          <br />
          📈 초록(상향): 수입이 많이 늘어남
          <br />
          🔻 주황: 지출이 줄어듦
          <br />
          ✅ 초록(체크): 좋은 변화
        </InfoTip>
      </span>
      {insights.map((i) => (
        <span key={i.key} className={`rounded-full px-3 py-1 text-xs ${TONE_CLASS[i.tone]}`}>
          {ARROW[i.tone]} {i.label} {i.pct >= 0 ? '+' : ''}
          {i.pct.toFixed(0)}%
        </span>
      ))}
    </section>
  )
}

const TONE_CLASS: Record<'up_bad' | 'up_good' | 'down_bad' | 'down_good', string> = {
  up_bad: 'bg-rose-500/15 text-rose-200 border border-rose-500/30',
  up_good: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  down_bad: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  down_good: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
}

const ARROW: Record<'up_bad' | 'up_good' | 'down_bad' | 'down_good', string> = {
  up_bad: '🔺',
  up_good: '📈',
  down_bad: '🔻',
  down_good: '✅'
}
