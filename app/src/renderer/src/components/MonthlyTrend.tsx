import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { CurrencyDto, TimeSeriesPoint } from '../../../shared/types'
import { formatMoney } from '../lib/money'
import InfoTip from './InfoTip'

interface Props {
  currentMonth: TimeSeriesPoint[]
  previousMonth: TimeSeriesPoint[]
  currency: string
  currencies?: CurrencyDto[]
  title?: string
}

/**
 * Overlay: current-month cumulative spend vs previous-month cumulative spend,
 * aligned to "day-of-month" so they can be compared side-by-side.
 */
export default function MonthlyTrend({
  currentMonth,
  previousMonth,
  currency,
  currencies,
  title = '이번 달 vs 지난 달 누적 지출'
}: Props): React.JSX.Element {
  // Align by day-of-month
  const byDay = new Map<number, { curr?: number; prev?: number }>()
  for (const p of currentMonth) {
    const day = Number(p.bucket.slice(-2))
    const entry = byDay.get(day) ?? {}
    entry.curr = p.expense
    byDay.set(day, entry)
  }
  for (const p of previousMonth) {
    const day = Number(p.bucket.slice(-2))
    const entry = byDay.get(day) ?? {}
    entry.prev = p.expense
    byDay.set(day, entry)
  }
  const rows = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, v]) => ({ day, 이번달: v.curr ?? null, 지난달: v.prev ?? null }))

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h3 className="mb-2 flex items-center text-sm font-semibold text-slate-200">
        {title}
        <InfoTip>
          이번 달과 지난 달의 <b>누적 지출(매일 더해진 합)</b>을 같은 일자에 나란히 그립니다.
          <br />
          <br />
          <b>이번 달 선이 지난 달보다 위</b>에 있으면 같은 시점에 더 많이 쓴 셈.
          <br />
          <br />
          예: 15일 시점에 이번 달 선이 80만, 지난 달 선이 60만이면 이번 달이 20만원 더 빠릅니다.
        </InfoTip>
      </h3>
      <div className="flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(d) => `${d}일`}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                v === 0
                  ? '0'
                  : v > 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v > 1000
                      ? `${(v / 1000).toFixed(0)}K`
                      : `${v}`
              }
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#e2e8f0'
              }}
              formatter={(value) => {
                const v = typeof value === 'number' ? value : Number(value ?? 0)
                return `${formatMoney(v, currency, currencies)} ${currency}`
              }}
              labelFormatter={(d) => `${d}일`}
            />
            <Line
              type="monotone"
              dataKey="지난달"
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="이번달"
              stroke="#38bdf8"
              strokeWidth={2.5}
              dot={{ fill: '#38bdf8', r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
