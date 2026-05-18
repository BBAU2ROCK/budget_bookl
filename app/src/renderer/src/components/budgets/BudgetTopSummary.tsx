import { useEffect, useState } from 'react'
import type { CurrencyDto } from '../../../../shared/types'
import { formatMoney } from '../../lib/money'
import InfoTip from '../InfoTip'

/**
 * 예산 화면 상단의 4지표 요약 카드.
 *
 * 사용자 요청 이미지(엑셀 스타일 4컬럼 라벨 + 큰 숫자) 형태를 재현.
 *
 * 4지표 의미·산식:
 * - 수입: 이번달 수입 거래의 합 (base currency)
 *   · 출처: window.api.stats.monthlySummary.income
 * - 수입-예산: 수입에서 예산 총액을 뺀 값 — "예산 한도를 다 써도 남는 여유"
 *   · 양수면 예산 안에서 흑자 가능 (안전 마진)
 *   · 음수면 예산 자체가 수입 초과 (예산 재조정 필요 신호)
 * - 수입-지출: 수입에서 실제 지출을 뺀 값 — "이번달 실제 흑자/적자"
 *   · 양수면 흑자, 음수면 적자
 * - 금융비용: 이번달 저축·투자 계좌로 들어온 net 금액 (inflow - outflow)
 *   · 출처: window.api.stats.savingsBalance.netInPeriod
 *   · 부가표시: 수입 대비 비율(%) — 저축률 핵심 지표
 *
 * 동기화: `dataVersion`이 증가하면 (부모 load() 호출 후) 두 endpoint 재조회.
 */
interface Props {
  year: number
  month: number
  baseCurrency: string
  currencies: CurrencyDto[]
  /** 예산 총액 (전체예산 + 카테고리 예산 합산). 없으면 0. 부모에서 계산해 전달 */
  totalBudget: number
  /** 변경 시 재조회 트리거 */
  dataVersion?: number
}

export default function BudgetTopSummary({
  year,
  month,
  baseCurrency,
  currencies,
  totalBudget,
  dataVersion = 0
}: Props): React.JSX.Element {
  const [income, setIncome] = useState(0)
  const [expense, setExpense] = useState(0)
  const [savingsNet, setSavingsNet] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString()
    const end = new Date(year, month, 0, 23, 59, 59, 999).toISOString()
    Promise.all([
      window.api.stats.monthlySummary({ year, month }),
      window.api.stats.savingsBalance({ from: start, to: end })
    ])
      .then(([s, sav]) => {
        if (cancelled) return
        setIncome(s.income)
        setExpense(s.expense)
        setSavingsNet(sav.netInPeriod)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [year, month, dataVersion])

  const incomeMinusBudget = income - totalBudget
  const incomeMinusExpense = income - expense
  // 수입 0일 때 NaN 회피. 정수 백분율로 반올림.
  const savingsPercent = income > 0 ? Math.round((savingsNet / income) * 100) : 0

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-5 py-4">
      <div className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-400">
        {year}년 {month}월 전체 요약
        <InfoTip side="bottom" width="w-80">
          이번달 가계 흐름을 4개 지표로 압축한 카드입니다.
          <br />
          <br />
          <b>수입</b>: 이번달 들어온 모든 돈의 합.
          <br />
          <br />
          <b>수입-예산</b>: 수입에서 「내가 정한 예산 한도 합」을 뺀 값. 양수면 예산을 다 써도
          남을 여유, 음수면 예산 자체가 수입보다 커서 재조정 필요.
          <br />
          <br />
          <b>수입-지출</b>: 수입에서 「이번달 실제 지출」을 뺀 값. 양수=흑자, 음수=적자.
          <br />
          <br />
          <b>금융비용</b>: 이번달 저축·투자 계좌로 들어온 net 금액(인플로우 - 아웃플로우). 옆의
          % 는 수입 대비 저축률입니다.
        </InfoTip>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatBox label="수입" value={income} currencies={currencies} baseCurrency={baseCurrency} loading={loading} />
        <StatBox
          label="수입-예산"
          value={incomeMinusBudget}
          currencies={currencies}
          baseCurrency={baseCurrency}
          loading={loading}
          colorBy="signed"
        />
        <StatBox
          label="수입-지출"
          value={incomeMinusExpense}
          currencies={currencies}
          baseCurrency={baseCurrency}
          loading={loading}
          colorBy="signed"
        />
        <StatBox
          label="금융비용"
          value={savingsNet}
          currencies={currencies}
          baseCurrency={baseCurrency}
          loading={loading}
          colorBy="savings"
          extra={income > 0 ? `${savingsPercent}%` : undefined}
        />
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  currencies,
  baseCurrency,
  loading,
  colorBy,
  extra
}: {
  label: string
  value: number
  currencies: CurrencyDto[]
  baseCurrency: string
  loading: boolean
  /**
   * 색상 규칙:
   * - undefined: 중립 (slate)
   * - 'signed': 양수=emerald, 음수=rose
   * - 'savings': 양수=sky, 음수=rose(저축에서 돈이 빠져나간 경우 — 드물지만 표시)
   */
  colorBy?: 'signed' | 'savings'
  /** 보조 표시 (예: 비율 %) */
  extra?: string
}): React.JSX.Element {
  const isNegative = value < 0
  let valueClass = 'text-slate-100'
  if (colorBy === 'signed') {
    valueClass = isNegative ? 'text-rose-300' : 'text-emerald-300'
  } else if (colorBy === 'savings') {
    valueClass = isNegative ? 'text-rose-300' : 'text-sky-300'
  }

  return (
    <div className="text-center">
      <div className="mb-0.5 text-xs font-medium text-slate-400 underline decoration-slate-600 underline-offset-4">
        {label}
      </div>
      <div className={`font-mono text-base font-semibold tabular-nums ${valueClass}`}>
        {loading ? (
          <span className="text-slate-600">…</span>
        ) : isNegative ? (
          `-${formatMoney(Math.abs(value), baseCurrency, currencies)}`
        ) : (
          formatMoney(value, baseCurrency, currencies)
        )}
      </div>
      {extra && <div className="mt-0.5 font-mono text-xs text-slate-400">{extra}</div>}
    </div>
  )
}
