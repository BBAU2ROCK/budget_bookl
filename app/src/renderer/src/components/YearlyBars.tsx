import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { CurrencyDto, YearTotal } from '../../../shared/types'
import { formatMoney } from '../lib/money'
import InfoTip from './InfoTip'

interface Props {
  data: YearTotal[]
  currency: string
  currencies?: CurrencyDto[]
  title?: string
}

export default function YearlyBars({
  data,
  currency,
  currencies,
  title = '연도별 비교'
}: Props): React.JSX.Element {
  const chartData = data.map((y) => ({
    year: `${y.year}`,
    수입: y.income,
    지출: y.expense,
    순수익: y.net
  }))

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h3 className="mb-2 flex items-center text-sm font-semibold text-slate-200">
        {title}
        <InfoTip>
          최근 5년간 매년의 <b>총 수입·총 지출</b>을 비교합니다.
          <br />
          <br />
          연간 추세(점점 늘어나는지/줄어드는지)를 보는 용도.
        </InfoTip>
      </h3>
      <div className="flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                v === 0
                  ? '0'
                  : v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
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
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }} />
            <Bar dataKey="수입" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="지출" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="순수익" fill="#38bdf8" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
