import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CategoryBreakdownEntry,
  CurrencyDto,
  MonthlySummaryDto,
  MultiYearComparisonDto,
  SavingsBalanceDto,
  TimeSeriesPoint,
  TopPayeeEntry,
  TopTransactionEntry,
  YearlySummaryDto
} from '../../../shared/types'
import KpiCard from '../components/KpiCard'
import CategoryDonut from '../components/CategoryDonut'
import MonthlyTrend from '../components/MonthlyTrend'
import MonthlyBars from '../components/MonthlyBars'
import YearlyBars from '../components/YearlyBars'
import { TopPayees, TopTransactions } from '../components/TopList'
import AccountSpendingWidget from '../components/dashboard/AccountSpendingWidget'
import TrendInsightStrip from '../components/dashboard/TrendInsightStrip'
import TagUsageWidget from '../components/dashboard/TagUsageWidget'

type Mode = 'month' | 'year'

export default function Dashboard(): React.JSX.Element {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">대시보드</h1>
          <p className="text-sm text-slate-400">
            {mode === 'month' ? `${year}년 ${month}월 요약` : `${year}년 요약`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <ModeBtn active={mode === 'month'} onClick={() => setMode('month')}>
              월별
            </ModeBtn>
            <ModeBtn active={mode === 'year'} onClick={() => setMode('year')}>
              연별
            </ModeBtn>
          </div>
          {mode === 'month' ? (
            <MonthPicker
              year={year}
              month={month}
              onChange={(y, m) => {
                setYear(y)
                setMonth(m)
              }}
            />
          ) : (
            <YearPicker year={year} onChange={setYear} />
          )}
        </div>
      </header>

      {mode === 'month' ? (
        <MonthlyView year={year} month={month} />
      ) : (
        <YearlyView year={year} />
      )}
    </div>
  )
}

/* ==========================================================================
 * Month mode
 * ==========================================================================*/

function MonthlyView({ year, month }: { year: number; month: number }): React.JSX.Element {
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [summary, setSummary] = useState<MonthlySummaryDto | null>(null)
  const [catBreakdown, setCatBreakdown] = useState<CategoryBreakdownEntry[]>([])
  const [currentSeries, setCurrentSeries] = useState<TimeSeriesPoint[]>([])
  const [prevSeries, setPrevSeries] = useState<TimeSeriesPoint[]>([])
  const [topPayees, setTopPayees] = useState<TopPayeeEntry[]>([])
  const [topTx, setTopTx] = useState<TopTransactionEntry[]>([])
  const [savings, setSavings] = useState<SavingsBalanceDto | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const prev = prevMonth(year, month)
      const cur = monthBoundaries(year, month)
      const pre = monthBoundaries(prev.year, prev.month)

      const [ccy, s, cats, cSeries, pSeries, payees, txTop, sav] = await Promise.all([
        window.api.currencies.list(),
        window.api.stats.monthlySummary({ year, month }),
        window.api.stats.categoryBreakdown({
          from: cur.from,
          to: cur.to,
          kind: 'expense',
          rollupToRoot: true
        }),
        window.api.stats.timeSeries({
          from: cur.from,
          to: cur.to,
          granularity: 'day',
          cumulative: true
        }),
        window.api.stats.timeSeries({
          from: pre.from,
          to: pre.to,
          granularity: 'day',
          cumulative: true
        }),
        window.api.stats.topPayees({
          from: cur.from,
          to: cur.to,
          types: ['expense'],
          limit: 10
        }),
        window.api.stats.topTransactions({
          from: cur.from,
          to: cur.to,
          types: ['expense'],
          limit: 10
        }),
        window.api.stats.savingsBalance({ from: cur.from, to: cur.to })
      ])

      setCurrencies(ccy)
      setSummary(s)
      setCatBreakdown(cats)
      setCurrentSeries(cSeries)
      setPrevSeries(pSeries)
      setTopPayees(payees)
      setTopTx(txTop)
      setSavings(sav)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const baseCurrency = summary?.baseCurrency ?? 'KRW'

  const monthRange = monthBoundaries(year, month)

  return (
    <>
      <TrendInsightStrip summary={summary} currencies={currencies} />

      {/* 지출 강조 — 첫 카드, 좌측. 4카드 한 행 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="지출"
          tone="expense"
          amount={summary?.expense ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevMonth.expense}
          info={
            <>
              이번 달에 카드·현금·통장에서 <b>외부(가게·서비스)로 결제되어 빠져나간 돈</b>의
              합계입니다.
              <br />
              <br />
              <b>계산:</b> 이번 달 「지출」 거래 금액의 합
              <br />
              <b>비교:</b> 지난 달 같은 기간과 비교
              <br />
              <br />
              💡 <b>통장끼리 돈을 옮긴 것</b>(예: 입출금 → 적금, 카드값 결제, 환전)은
              「지출」이 아니라 <b>「이체」</b> 거래로 입력해야 합니다. 이체는 여기에 안 잡힙니다.
            </>
          }
        />
        <KpiCard
          label="수입"
          tone="income"
          amount={summary?.income ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevMonth.income}
          info={
            <>
              이번 달에 <b>외부에서 통장으로 들어온 돈</b>의 합계입니다 (월급·이자·환급 등).
              <br />
              <br />
              <b>계산:</b> 이번 달 「수입」 거래 금액의 합
              <br />
              <br />
              💡 <b>다른 통장에서 옮겨 받은 돈</b>(예: 적금에서 입출금으로 빼낸 것)은
              「수입」이 아니라 <b>「이체」</b>입니다. 이체는 여기에 안 잡힙니다.
            </>
          }
        />
        <KpiCard
          label="순흐름"
          tone="neutral"
          amount={summary?.net ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevMonth.net}
          info={
            <>
              이번 달 장부상 흑자/적자입니다.
              <br />
              <br />
              <b>계산:</b> 수입 − 지출
              <br />
              <br />
              <b>주의:</b> "순흐름"은 단순 차감이라, 실제로 모은 돈과는 다를 수 있어요. 흑자라도
              그 돈을 그대로 통장에 남겼는지 다른 데 썼는지에 따라 「저축」과 차이가 납니다.
            </>
          }
        />
        <KpiCard
          label="저축 (예적금 + 투자)"
          tone="income"
          amount={savings?.totalBalance ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={savingsComparison(savings)}
          comparisonLabel="이번 달"
          info={
            <>
              <b>큰 숫자:</b> 예적금/투자 통장에 지금 쌓여 있는 돈의 총액입니다.
              <br />
              <br />
              <b>아래 작은 숫자(이번 달):</b> 이번 달에 그 통장들에서 늘어난(또는 줄어든) 금액
              <br />
              = 이자수익 + 다른 통장에서 옮겨 받은 돈 − 빠져나간 돈
              <br />
              <br />
              💡 <b>적금/투자에 적립</b>하려면 거래 종류를 <b>「이체」</b>로 입력하세요
              (출금: 입출금 통장 / 입금: 적금 통장). 「지출」로 입력하면 적금에서 결제된 것으로
              해석돼 잔액이 오히려 줄어듭니다.
              <br />
              <br />
              두 적금/투자 통장끼리 옮긴 건 합산에서 자동으로 빠집니다.
            </>
          }
        />
      </section>

      {summary && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard
            label="지출 (전년 동월 대비)"
            tone="expense"
            amount={summary.expense}
            currency={baseCurrency}
            currencies={currencies}
            comparison={summary.vsPrevYear.expense}
            comparisonLabel="전년 동월"
            info={
              <>
                위 「지출」과 같은 금액이지만, 비교 대상이 <b>1년 전 같은 달</b>입니다.
                <br />
                계절이나 연중 패턴(예: 명절·휴가)을 함께 보면 좋아요.
              </>
            }
          />
          <KpiCard
            label="수입 (전년 동월 대비)"
            tone="income"
            amount={summary.income}
            currency={baseCurrency}
            currencies={currencies}
            comparison={summary.vsPrevYear.income}
            comparisonLabel="전년 동월"
            info={
              <>
                위 「수입」과 같은 금액이지만, 비교 대상이 <b>1년 전 같은 달</b>입니다.
              </>
            }
          />
        </section>
      )}

      {/* 계좌별 지출 + 카테고리별 지출 (지출 분포 짝) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountSpendingWidget
          from={monthRange.from}
          to={monthRange.to}
          currencies={currencies}
          baseCurrency={baseCurrency}
        />
        <CategoryDonut
          data={catBreakdown}
          currency={baseCurrency}
          currencies={currencies}
          title="카테고리별 지출 비중 (루트 기준)"
        />
      </section>

      {/* 일자별 지출 추이 (풀폭) */}
      <section>
        <MonthlyTrend
          currentMonth={currentSeries}
          previousMonth={prevSeries}
          currency={baseCurrency}
          currencies={currencies}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopPayees data={topPayees} currency={baseCurrency} currencies={currencies} />
        <TopTransactions data={topTx} currency={baseCurrency} currencies={currencies} />
      </section>

      <section>
        <TagUsageWidget
          from={monthRange.from}
          to={monthRange.to}
          currencies={currencies}
          baseCurrency={baseCurrency}
        />
      </section>

      {loading && <div className="text-center text-sm text-slate-500">로딩 중...</div>}
    </>
  )
}

/* ==========================================================================
 * Year mode
 * ==========================================================================*/

function YearlyView({ year }: { year: number }): React.JSX.Element {
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [summary, setSummary] = useState<YearlySummaryDto | null>(null)
  const [catBreakdown, setCatBreakdown] = useState<CategoryBreakdownEntry[]>([])
  const [multiYear, setMultiYear] = useState<MultiYearComparisonDto | null>(null)
  const [topPayees, setTopPayees] = useState<TopPayeeEntry[]>([])
  const [topTx, setTopTx] = useState<TopTransactionEntry[]>([])
  const [savings, setSavings] = useState<SavingsBalanceDto | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const yr = yearBoundaries(year)
      const [ccy, s, cats, my, payees, txTop, sav] = await Promise.all([
        window.api.currencies.list(),
        window.api.stats.yearlySummary({ year }),
        window.api.stats.categoryBreakdown({
          from: yr.from,
          to: yr.to,
          kind: 'expense',
          rollupToRoot: true
        }),
        window.api.stats.multiYearComparison({ referenceYear: year, yearsBack: 4 }),
        window.api.stats.topPayees({
          from: yr.from,
          to: yr.to,
          types: ['expense'],
          limit: 10
        }),
        window.api.stats.topTransactions({
          from: yr.from,
          to: yr.to,
          types: ['expense'],
          limit: 10
        }),
        window.api.stats.savingsBalance({ from: yr.from, to: yr.to })
      ])

      setCurrencies(ccy)
      setSummary(s)
      setCatBreakdown(cats)
      setMultiYear(my)
      setTopPayees(payees)
      setTopTx(txTop)
      setSavings(sav)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const baseCurrency = summary?.baseCurrency ?? 'KRW'
  const yearRange = yearBoundaries(year)

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`${year}년 지출`}
          tone="expense"
          amount={summary?.expense ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevYear.expense}
          comparisonLabel="전년"
          info={
            <>
              {year}년 한 해 동안 외부(가게·서비스)로 결제되어 빠져나간 모든 돈의 합계입니다.
              <br />
              <b>비교:</b> 작년 한 해와 비교
              <br />
              <br />
              💡 통장끼리 옮긴 것(적금 적립·카드값 결제·환전)은 「이체」 거래라 여기에 안
              잡힙니다.
            </>
          }
        />
        <KpiCard
          label={`${year}년 수입`}
          tone="income"
          amount={summary?.income ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevYear.income}
          comparisonLabel="전년"
          info={
            <>
              {year}년 한 해 동안 외부에서 통장으로 들어온 돈의 합계 (월급·이자·환급 등).
              <br />
              <br />
              💡 다른 통장에서 옮겨 받은 돈은 「이체」라 여기에 안 잡힙니다.
            </>
          }
        />
        <KpiCard
          label="순흐름"
          tone="neutral"
          amount={summary?.net ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={summary?.vsPrevYear.net}
          comparisonLabel="전년"
          info={
            <>
              한 해 장부상 흑자/적자입니다.
              <br />
              <b>계산:</b> 수입 − 지출
              <br />
              실제로 모은 돈은 옆의 「저축」에서 확인하세요.
            </>
          }
        />
        <KpiCard
          label="저축 (예적금 + 투자)"
          tone="income"
          amount={savings?.totalBalance ?? 0}
          currency={baseCurrency}
          currencies={currencies}
          comparison={savingsComparison(savings)}
          comparisonLabel={`${year}년 신규`}
          info={
            <>
              <b>큰 숫자:</b> 예적금/투자 통장에 지금 쌓여 있는 돈의 총액
              <br />
              <b>아래(올해 신규):</b> {year}년 한 해 동안 그 통장들에 늘어난(또는 줄어든) 금액
              <br />
              = 이자수익 + 다른 통장에서 옮겨 받은 돈 − 빠져나간 돈
              <br />
              <br />
              💡 적금/투자에 적립할 땐 거래 종류를 <b>「이체」</b>로 입력하세요.
              「지출」로 잘못 입력하면 적금에서 빠져나간 것으로 잡혀 잔액이 줄어듭니다.
            </>
          }
        />
      </section>

      {/* 계좌별 지출 + 카테고리별 지출 (지출 분포 짝) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountSpendingWidget
          from={yearRange.from}
          to={yearRange.to}
          currencies={currencies}
          baseCurrency={baseCurrency}
          title={`${year}년 계좌별 지출`}
        />
        <CategoryDonut
          data={catBreakdown}
          currency={baseCurrency}
          currencies={currencies}
          title={`${year}년 카테고리별 지출 비중`}
        />
      </section>

      {summary && (
        <section>
          <MonthlyBars
            data={summary.monthlyBreakdown}
            currency={baseCurrency}
            currencies={currencies}
            title={`${year}년 월별 수입/지출`}
          />
        </section>
      )}

      <section>
        {multiYear && (
          <YearlyBars
            data={multiYear.years}
            currency={baseCurrency}
            currencies={currencies}
            title="연도별 비교 (최근 5년)"
          />
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopPayees data={topPayees} currency={baseCurrency} currencies={currencies} />
        <TopTransactions data={topTx} currency={baseCurrency} currencies={currencies} />
      </section>

      {loading && <div className="text-center text-sm text-slate-500">로딩 중...</div>}
    </>
  )
}

/* ==========================================================================
 * Helpers
 * ==========================================================================*/

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
      className={`rounded px-3 py-1 transition ${
        active ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function MonthPicker({
  year,
  month,
  onChange
}: {
  year: number
  month: number
  onChange: (y: number, m: number) => void
}): React.JSX.Element {
  const months = useMemo(() => {
    const arr: Array<{ year: number; month: number; label: string }> = []
    const cursor = new Date()
    cursor.setDate(1)
    for (let i = 0; i < 24; i++) {
      arr.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1,
        label: `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`
      })
      cursor.setMonth(cursor.getMonth() - 1)
    }
    return arr
  }, [])
  return (
    <select
      value={`${year}-${month}`}
      onChange={(e) => {
        const [y, m] = e.target.value.split('-').map(Number)
        onChange(y, m)
      }}
      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
    >
      {months.map((o) => (
        <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function YearPicker({
  year,
  onChange
}: {
  year: number
  onChange: (y: number) => void
}): React.JSX.Element {
  const years = useMemo(() => {
    const cur = new Date().getFullYear()
    const arr: number[] = []
    for (let y = cur; y >= cur - 10; y--) arr.push(y)
    return arr
  }, [])
  return (
    <select
      value={year}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}년
        </option>
      ))}
    </select>
  )
}

function monthBoundaries(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const to = new Date(year, month, 0, 23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

function yearBoundaries(year: number): { from: string; to: string } {
  const from = new Date(year, 0, 1, 0, 0, 0, 0)
  const to = new Date(year, 11, 31, 23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/**
 * Build a comparison shape for the 저축 KPI card.
 * Guards against negative or zero `previous` (which would invert the sign of
 * deltaPct and show "전월 -200%" when savings actually grew).
 */
function savingsComparison(
  s: SavingsBalanceDto | null
): { current: number; previous: number; deltaAbs: number; deltaPct: number | null } | undefined {
  if (!s) return undefined
  const previous = s.totalBalance - s.netInPeriod
  return {
    current: s.totalBalance,
    previous,
    deltaAbs: s.netInPeriod,
    deltaPct: previous > 0 ? (s.netInPeriod / previous) * 100 : null
  }
}
