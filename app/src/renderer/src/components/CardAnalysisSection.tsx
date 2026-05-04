import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type {
  AccountDto,
  CardDiscountPoint,
  CardGroupBy,
  CardSpendEntry,
  CurrencyDto,
  TopDiscountTxEntry
} from '../../../shared/types'
import { formatInteger, formatMoney } from '../lib/money'
import InfoTip from './InfoTip'

type PeriodPreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'last12m' | 'custom'

function periodRange(preset: PeriodPreset, custom: { from: string; to: string }): {
  from: string
  to: string
  label: string
} {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  if (preset === 'thisMonth') {
    const from = new Date(y, m, 1, 0, 0, 0)
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString(), label: '이번 달' }
  }
  if (preset === 'lastMonth') {
    const from = new Date(y, m - 1, 1, 0, 0, 0)
    const to = new Date(y, m, 0, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString(), label: '지난 달' }
  }
  if (preset === 'thisYear') {
    const from = new Date(y, 0, 1, 0, 0, 0)
    const to = new Date(y, 11, 31, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString(), label: `${y}년` }
  }
  if (preset === 'last12m') {
    const from = new Date(y, m - 11, 1, 0, 0, 0)
    const to = new Date(y, m + 1, 0, 23, 59, 59, 999)
    return { from: from.toISOString(), to: to.toISOString(), label: '최근 12개월' }
  }
  // custom
  const from = new Date(custom.from + 'T00:00:00')
  const to = new Date(custom.to + 'T23:59:59.999')
  return { from: from.toISOString(), to: to.toISOString(), label: '사용자 지정' }
}

interface Props {
  cardAccounts: AccountDto[]
  currencies: CurrencyDto[]
}

export default function CardAnalysisSection({
  cardAccounts,
  currencies
}: Props): React.JSX.Element {
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth')
  const [custom, setCustom] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  })
  const [groupBy, setGroupBy] = useState<CardGroupBy>('account')

  const [spend, setSpend] = useState<CardSpendEntry[]>([])
  const [series, setSeries] = useState<CardDiscountPoint[]>([])
  const [topDiscounts, setTopDiscounts] = useState<TopDiscountTxEntry[]>([])

  const period = useMemo(() => periodRange(preset, custom), [preset, custom])
  // settings.baseCurrency가 main process 통계 계산(amount_in_base)과 일치하는 단일 출처
  const [baseCurrency, setBaseCurrency] = useState<string>('KRW')
  useEffect(() => {
    void window.api.settings.get('baseCurrency').then((v) => {
      if (v) setBaseCurrency(v)
    })
  }, [])

  const load = useCallback(async () => {
    if (cardAccounts.length === 0) return
    const cardIds = cardAccounts.map((a) => a.id)
    const [s, series, topD] = await Promise.all([
      window.api.stats.cardSpend({
        from: period.from,
        to: period.to,
        groupBy,
        accountIds: cardIds
      }),
      window.api.stats.cardDiscountSeries({
        from: period.from,
        to: period.to,
        granularity: 'month',
        accountIds: cardIds
      }),
      window.api.stats.topDiscountTransactions({
        from: period.from,
        to: period.to,
        accountIds: cardIds,
        limit: 10
      })
    ])
    setSpend(s)
    setSeries(series)
    setTopDiscounts(topD)
  }, [cardAccounts, period.from, period.to, groupBy])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const original = spend.reduce((a, e) => a + e.originalTotal, 0)
    const actual = spend.reduce((a, e) => a + e.actualTotal, 0)
    const discount = spend.reduce((a, e) => a + e.discountTotal, 0)
    const rate = original > 0 ? (discount / original) * 100 : 0
    const txCount = spend.reduce((a, e) => a + e.transactionCount, 0)
    const discountedTx = spend.reduce((a, e) => a + e.discountedTxCount, 0)
    return { original, actual, discount, rate, txCount, discountedTx }
  }, [spend])

  const accountById = new Map(cardAccounts.map((a) => [a.id, a]))

  if (cardAccounts.length === 0) return <></>

  return (
    <section className="space-y-4 rounded-xl border border-sky-500/30 bg-slate-900/50 p-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center text-base font-semibold text-sky-200">
            💳 카드 분석
            <InfoTip side="bottom">
              신용카드 통장의 「지출」 거래만 따로 분석합니다.
              <br />
              <br />
              <b>원가 합계</b>: 할인 전 금액의 합 (할인 정보가 없으면 실결제와 동일)
              <br />
              <b>실결제 합계</b>: 실제로 빠져나간 금액 합
              <br />
              <b>할인액</b>: 원가 − 실결제 (할인 정보가 입력된 거래만 차이 발생)
              <br />
              <b>할인율</b>: 할인액 ÷ 원가 × 100
              <br />
              <br />
              💡 <b>그룹화 — 계좌별</b>: 카드 한 장씩 / <b>발급사별</b>: 같은 카드사 카드를 묶어서
            </InfoTip>
          </h2>
          <p className="text-xs text-slate-500">
            {cardAccounts.length}개 카드 · {period.label} 기준
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="thisMonth">이번 달</option>
            <option value="lastMonth">지난 달</option>
            <option value="thisYear">올해</option>
            <option value="last12m">최근 12개월</option>
            <option value="custom">사용자 지정</option>
          </select>
          <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <ModeBtn active={groupBy === 'account'} onClick={() => setGroupBy('account')}>
              카드별
            </ModeBtn>
            <ModeBtn active={groupBy === 'issuer'} onClick={() => setGroupBy('issuer')}>
              카드사별
            </ModeBtn>
          </div>
        </div>
      </header>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={custom.from}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
          />
          <span className="text-slate-500">~</span>
          <input
            type="date"
            value={custom.to}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi
          label="총 할인액"
          value={`${formatMoney(totals.discount, baseCurrency, currencies)} ${baseCurrency}`}
          sub={`${formatInteger(totals.discountedTx)} / ${formatInteger(totals.txCount)}건에 할인 적용`}
          tone="emerald"
        />
        <Kpi
          label="평균 할인율"
          value={`${totals.rate.toFixed(1)}%`}
          sub={`원가 ${formatMoney(totals.original, baseCurrency, currencies)} → 실결제 ${formatMoney(totals.actual, baseCurrency, currencies)}`}
          tone="sky"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-700/70">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">{groupBy === 'account' ? '카드' : '카드사'}</th>
              <th className="px-3 py-2 text-right">원가 합계</th>
              <th className="px-3 py-2 text-right">실결제 합계</th>
              <th className="px-3 py-2 text-right">할인 합계</th>
              <th className="px-3 py-2 text-right">할인율</th>
              <th className="px-3 py-2 text-right">거래</th>
            </tr>
          </thead>
          <tbody>
            {spend.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  이 기간에 카드 거래가 없습니다.
                </td>
              </tr>
            )}
            {spend.map((e) => (
              <tr
                key={e.groupId}
                className="border-t border-slate-800/50 hover:bg-slate-800/30"
              >
                <td className="px-3 py-2 text-slate-200">
                  {e.groupLabel}
                  {groupBy === 'issuer' && (
                    <span className="ml-1.5 text-xs text-slate-500">
                      ({e.accountIds.length}개)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">
                  {formatMoney(e.originalTotal, baseCurrency, currencies)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-200">
                  {formatMoney(e.actualTotal, baseCurrency, currencies)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-emerald-300">
                  {e.discountTotal > 0 ? '-' : ''}
                  {formatMoney(e.discountTotal, baseCurrency, currencies)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-sky-300">
                  {e.discountRate.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">
                  {formatInteger(e.discountedTxCount)} / {formatInteger(e.transactionCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Credit limit usage bars (only when groupBy='account') */}
      {groupBy === 'account' && spend.some((e) => accountById.get(e.groupId)?.creditLimit) && (
        <div className="rounded-lg border border-slate-700/70 p-4">
          <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-200">
            한도 사용률 (이번 달 실결제)
            <InfoTip>
              각 카드의 <b>실결제 합 ÷ 한도 × 100</b>.
              <br />
              90% 이상이면 빨강, 70% 이상이면 주황으로 표시. 한도 초과 위험을 미리 알리는 용도.
            </InfoTip>
          </h3>
          <div className="space-y-2">
            {spend.map((e) => {
              const acct = accountById.get(e.groupId)
              if (!acct?.creditLimit) return null
              const pct = Math.min(100, (e.actualTotal / acct.creditLimit) * 100)
              const pctColor =
                pct >= 90
                  ? 'bg-rose-500'
                  : pct >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              return (
                <div key={e.groupId}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{acct.name}</span>
                    <span className="font-mono text-slate-400">
                      {formatMoney(e.actualTotal, baseCurrency, currencies)} /{' '}
                      {formatMoney(acct.creditLimit, baseCurrency, currencies)} (
                      {pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full ${pctColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Discount trend chart */}
      {series.length > 0 && (
        <div className="rounded-lg border border-slate-700/70 p-4" style={{ minHeight: 280 }}>
          <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-200">
            월별 할인액 추이
            <InfoTip>
              매달 <b>원가</b>(주황 막대)와 <b>실결제</b>(파랑 막대)를 비교합니다.
              <br />
              두 막대 사이 간격이 그달의 <b>총 할인액</b>입니다.
            </InfoTip>
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series.map((p) => ({ bucket: p.bucket.slice(0, 7), 할인액: p.discountTotal }))}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 11 }} />
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
                  return `${formatMoney(v, baseCurrency, currencies)} ${baseCurrency}`
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }} />
              <Bar dataKey="할인액" radius={[3, 3, 0, 0]}>
                {series.map((_, i) => (
                  <Cell key={i} fill="#10b981" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top discount transactions */}
      {topDiscounts.length > 0 && (
        <div className="rounded-lg border border-slate-700/70 p-4">
          <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-200">
            가장 많이 할인받은 거래 Top 10
            <InfoTip>
              한 번에 가장 많이 깎인 거래를 보여줍니다.
              <br />
              <br />
              할인 정보는 거래 입력 시 「할인 전 금액」 + 「할인 사유」를 채워야 잡힙니다.
            </InfoTip>
          </h3>
          <ol className="space-y-1 text-sm">
            {topDiscounts.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-800/40"
              >
                <span className="w-5 text-xs text-slate-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-200">{t.payee ?? t.memo ?? '—'}</div>
                  <div className="truncate text-xs text-slate-500">
                    {accountById.get(t.accountId ?? '')?.name ?? '카드 없음'} ·{' '}
                    {new Date(t.occurredAt).toLocaleDateString()}
                    {t.discountReason && ` · ${t.discountReason}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-emerald-300">
                    -{formatMoney(t.discountAmount, t.currency, currencies)} {t.currency}
                  </div>
                  <div className="text-xs text-slate-500">
                    원가 {formatMoney(t.originalAmount, t.currency, currencies)} (
                    {t.discountRate.toFixed(0)}%↓)
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function ModeBtn({
  children,
  active,
  onClick
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs transition ${
        active ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: string
  sub: string
  tone: 'emerald' | 'sky' | 'amber'
}): React.JSX.Element {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'sky'
        ? 'text-sky-300'
        : 'text-amber-300'
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  )
}
