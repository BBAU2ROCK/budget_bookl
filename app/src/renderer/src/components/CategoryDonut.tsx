import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryBreakdownEntry, CurrencyDto } from '../../../shared/types'
import { formatMoney } from '../lib/money'
import InfoTip from './InfoTip'

const PALETTE = [
  '#f97316',
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#6366f1',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#db2777',
  '#64748b'
]

interface Props {
  data: CategoryBreakdownEntry[]
  currency: string
  currencies?: CurrencyDto[]
  title?: string
}

export default function CategoryDonut({
  data,
  currency,
  currencies,
  title = '카테고리별 비중'
}: Props): React.JSX.Element {
  const filtered = data.filter((d) => d.total > 0).slice(0, 12)

  if (filtered.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
        <h3 className="mb-2 flex items-center text-sm font-semibold text-slate-200">
          {title}
          <InfoTip>
            그 기간의 「지출」을 카테고리(식비·교통 등)별로 묶어 <b>전체 중 비중</b>을 도넛으로
            표시합니다.
            <br />
            <br />
            <b>계산:</b> 같은 루트 카테고리(예: 「식비」 + 「식비/외식」 + 「식비/카페」를 모두 「식비」로)의 합계 ÷ 전체 지출
            <br />
            "기타"는 비중이 작은 항목들을 묶은 것입니다.
          </InfoTip>
        </h3>
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          데이터 없음
        </div>
      </div>
    )
  }

  const chartData = filtered.map((d, i) => ({
    name: d.categoryName ?? '(미분류)',
    path: d.categoryPath ?? '(미분류)',
    value: d.total,
    percent: d.percent,
    fill: PALETTE[i % PALETTE.length]
  }))

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      <div className="flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="#0f172a"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#e2e8f0'
              }}
              formatter={(value, _name, entry) => {
                const v = typeof value === 'number' ? value : Number(value ?? 0)
                const pct = entry?.payload?.percent?.toFixed(1) ?? '0'
                return [
                  `${formatMoney(v, currency, currencies)} ${currency} (${pct}%)`,
                  entry?.payload?.path ?? ''
                ]
              }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
