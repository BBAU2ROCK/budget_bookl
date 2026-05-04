import { useEffect, useState } from 'react'
import type { CurrencyDto, TagBreakdownEntry } from '../../../../shared/types'
import { formatInteger, formatMoney } from '../../lib/money'
import InfoTip from '../InfoTip'

/**
 * Compact "어떤 태그에 가장 많이 썼는지" widget for the dashboard.
 *
 * Categories already have a donut chart; tags didn't have any equivalent
 * visibility outside the Tags tab. This widget surfaces the top-N tags
 * by expense within the period.
 */
export default function TagUsageWidget({
  from,
  to,
  currencies,
  baseCurrency,
  limit = 8
}: {
  from: string
  to: string
  currencies: CurrencyDto[]
  baseCurrency: string
  limit?: number
}): React.JSX.Element | null {
  const [entries, setEntries] = useState<TagBreakdownEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.stats
      .tagBreakdown({ from, to, types: ['expense'] })
      .then((res) => {
        if (!cancelled) setEntries(res.slice(0, limit))
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [from, to, limit])

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4 text-sm text-slate-500">
        태그 사용 분석 로딩...
      </div>
    )
  }

  if (entries.length === 0) {
    return null
  }

  const max = entries[0].total

  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center text-sm font-semibold text-slate-200">
          🏷️ 태그별 지출 Top {entries.length}
          <InfoTip>
            거래에 붙인 <b>태그(예: #출장, #구독, #자녀)</b>별로 지출 합계가 큰 순으로 보여줍니다.
            <br />
            <br />
            카테고리는 <b>한 거래당 하나</b>만 고를 수 있지만, 태그는 <b>여러 개</b>를 동시에
            붙일 수 있어요. 이 위젯은 한 거래에 여러 태그가 있으면 각 태그에 모두 합산됩니다.
          </InfoTip>
        </h3>
        <span className="text-xs text-slate-500">기간 합산</span>
      </header>
      <ul className="space-y-1.5">
        {entries.map((e) => {
          const pct = max > 0 ? (e.total / max) * 100 : 0
          return (
            <li key={e.tagId} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-slate-200">
                  {e.color && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: e.color }}
                    />
                  )}
                  {e.tagName}
                  <span className="ml-1 text-slate-500">· {formatInteger(e.count)}건</span>
                </span>
                <span className="font-mono text-slate-300">
                  {formatMoney(e.total, baseCurrency, currencies)} {baseCurrency}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-sky-500/60 to-indigo-500/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
