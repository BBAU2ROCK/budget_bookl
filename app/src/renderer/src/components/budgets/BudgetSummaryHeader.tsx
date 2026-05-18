import type { BudgetVsActualEntry, CurrencyDto } from '../../../../shared/types'
import { formatInteger, formatMoney } from '../../lib/money'
import BudgetProgressBar from './BudgetProgressBar'
import InfoTip from '../InfoTip'

interface Props {
  /** 사용자가 직접 만든 "전체 예산" 행 (categoryId=null). 없으면 entries로부터 자동 합계 계산 */
  totalEntry: BudgetVsActualEntry | null
  /** 카테고리별 예산 entries (totalRow 제외) — 자동 합계용 */
  entries: BudgetVsActualEntry[]
  baseCurrency: string
  currencies: CurrencyDto[]
  year: number
  month: number
  /** Number of category-level budgets that fell back to 1:1 due to missing FX rate */
  noRateCategoryCount?: number
}

/**
 * 카테고리별 예산만 있을 때 가상의 "전체 합계" 행을 생성.
 * 사용자가 별도 전체 예산을 만들지 않아도 카테고리 합계가 자동 표시되도록.
 */
function buildAggregatedTotal(entries: BudgetVsActualEntry[]): BudgetVsActualEntry | null {
  const cats = entries.filter((e) => !e.isTotalRow)
  if (cats.length === 0) return null

  // 부모에 예산이 있는 자식은 합산에서 제외 (부모가 자식을 includesDescendants로 흡수).
  // 부모가 없거나 부모에 예산이 없는 경우엔 자식 단독 예산을 합산.
  // (식비 500K + 외식 200K → 외식 skip → 합 500K)
  // (외식 200K만, 식비 무 → 외식 포함 → 합 200K)
  const budgetedCatIds = new Set<string>()
  for (const c of cats) {
    if (c.categoryId && c.budgetId !== null) budgetedCatIds.add(c.categoryId)
  }

  let effectiveBudget = 0
  let actual = 0
  let txCount = 0
  let hasAnyBudget = false
  let conversionWarning: 'none' | 'no_rate' = 'none'
  for (const c of cats) {
    // 부모가 budgeted이면 자식의 예산/actual은 부모의 rolled-up에 포함되었으므로 skip.
    if (c.parentCategoryId && budgetedCatIds.has(c.parentCategoryId)) continue
    if (c.status !== 'unset') {
      effectiveBudget += c.effectiveBudget
      hasAnyBudget = true
    }
    actual += c.actual
    txCount += c.transactionCount
    if (c.conversionWarning === 'no_rate') conversionWarning = 'no_rate'
  }
  if (!hasAnyBudget) return null

  const remaining = effectiveBudget - actual
  const percentUsed = effectiveBudget > 0 ? (actual / effectiveBudget) * 100 : 0
  const status: BudgetVsActualEntry['status'] =
    percentUsed > 125
      ? 'critical'
      : percentUsed > 100
        ? 'over'
        : percentUsed > 75
          ? 'warning'
          : 'safe'

  // 시간 정보는 entries 어디든 동일 (같은 month 기준)
  const ref = cats[0]
  const daysInPeriod = ref.daysInPeriod
  const daysPassed = ref.daysPassed
  const timeProgressPercent = ref.timeProgressPercent
  const dailyPace = daysPassed > 0 ? actual / daysPassed : 0
  const projectedAtPeriodEnd = Math.round(dailyPace * daysInPeriod)

  return {
    budgetId: null,
    categoryId: null,
    categoryName: null,
    categoryPath: null,
    parentCategoryId: null,
    budget: effectiveBudget,
    budgetInBase: effectiveBudget,
    carryOverFromPrev: 0,
    effectiveBudget,
    actual,
    remaining,
    percentUsed,
    status,
    transactionCount: txCount,
    isTotalRow: true,
    daysInPeriod,
    daysPassed,
    daysRemaining: Math.max(0, daysInPeriod - daysPassed),
    timeProgressPercent,
    dailyPace: Math.round(dailyPace),
    projectedAtPeriodEnd,
    projectedRemaining: effectiveBudget - projectedAtPeriodEnd,
    paceStatus:
      percentUsed >= 100
        ? 'over'
        : daysPassed === 0
          ? 'on_pace'
          : timeProgressPercent === 0
            ? 'on_pace'
            : percentUsed / timeProgressPercent < 0.9
              ? 'ahead'
              : percentUsed / timeProgressPercent > 1.1
                ? 'behind'
                : 'on_pace',
    savingsAtCurrentPace: Math.max(0, effectiveBudget - projectedAtPeriodEnd),
    conversionWarning
  }
}

const STATUS_LABEL: Record<string, string> = {
  unset: '미설정',
  safe: '🟢 안전',
  warning: '🟡 주의',
  over: '🟠 초과 진입',
  critical: '🔴 위험'
}

export default function BudgetSummaryHeader({
  totalEntry,
  entries,
  baseCurrency,
  currencies,
  year,
  month,
  noRateCategoryCount = 0
}: Props): React.JSX.Element {
  // 사용자 직접 만든 전체 예산이 있으면 우선 사용. 없으면 카테고리별 합계로 자동 폴백.
  const e = totalEntry ?? buildAggregatedTotal(entries)
  const isAggregated = !totalEntry && e !== null

  if (!e) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-5 text-sm text-slate-400">
        {year}년 {month}월 예산이 아직 설정되지 않았어요. 카테고리별 예산을 만들면 여기에
        합계가 자동으로 표시됩니다.
        {noRateCategoryCount > 0 && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
            ⚠️ {noRateCategoryCount}개 카테고리 예산에서 환율 정보가 없어 1:1로 변환됩니다 ·
            합계 비교가 부정확할 수 있어요.
          </div>
        )}
      </div>
    )
  }
  const isOver = e.percentUsed > 100
  const remainingLabel = isOver
    ? `초과 ${formatMoney(Math.abs(e.remaining), baseCurrency, currencies)} ${baseCurrency}`
    : `남은 예산 ${formatMoney(Math.max(0, e.remaining), baseCurrency, currencies)} ${baseCurrency}`

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <div className="mb-1 flex items-center justify-between text-sm text-slate-400">
        <span className="flex items-center">
          {year}년 {month}월 {isAggregated ? '카테고리 예산 합계' : '진행'}
          <InfoTip side="bottom">
            {isAggregated ? (
              <>
                전체 예산을 따로 만들지 않아서, <b>카테고리별 예산을 모두 더한 값</b>을
                보여줍니다.
                <br />
                <br />
                <b>한도:</b> 예산이 잡힌 카테고리들의 한도 합
                <br />
                <b>사용:</b> 모든 카테고리(예산 없는 것 포함)에서 실제로 쓴 금액 합
                <br />
                <b>%:</b> 사용 ÷ 한도 × 100
              </>
            ) : (
              <>
                이번 달 <b>전체 예산 한 건</b>의 진행 상황입니다.
                <br />
                <br />
                <b>한도:</b> 사용자가 정한 이번 달 사용 가능 금액
                <br />
                <b>사용:</b> 그 카테고리(자식 포함) 거래 합계
                <br />
                <b>%:</b> 사용 ÷ 한도 × 100
              </>
            )}
          </InfoTip>
        </span>
        <span className="flex items-center font-mono">
          {formatInteger(e.daysPassed)}일 / {formatInteger(e.daysInPeriod)}일 ·{' '}
          {e.timeProgressPercent.toFixed(0)}%
          <InfoTip side="bottom">
            이번 달이 얼마나 지났는지(일수 기준)입니다.
            <br />
            <br />
            예: "10일 / 30일 · 33%"이면 한 달의 1/3이 지났다는 뜻.
            <br />
            <br />
            예산 사용률이 시간 진행률보다 빠르면 「페이스 빠름」으로 안내됩니다 (각 행의 작은
            툴팁에서 확인 가능).
          </InfoTip>
        </span>
      </div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-lg text-slate-200">
          {formatMoney(e.actual, baseCurrency, currencies)}{' '}
          <span className="text-slate-500">/</span>{' '}
          {formatMoney(e.effectiveBudget, baseCurrency, currencies)}{' '}
          <span className="text-slate-500">{baseCurrency}</span>
        </span>
        <span className="font-mono text-2xl font-bold text-slate-100">
          {e.percentUsed.toFixed(1)}%
        </span>
      </div>
      <BudgetProgressBar percent={e.percentUsed} status={e.status} height="lg" />
      {(e.conversionWarning === 'no_rate' || noRateCategoryCount > 0) && (
        <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
          ⚠️{' '}
          {e.conversionWarning === 'no_rate' && '전체 예산 통화의 환율 정보 없음 (1:1 변환). '}
          {noRateCategoryCount > 0 &&
            `${noRateCategoryCount}개 카테고리에서 환율 변환 폴백 적용 — 합계 정확성에 주의.`}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span className={isOver ? 'text-rose-300' : 'text-emerald-300'}>{remainingLabel}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-400">{STATUS_LABEL[e.status] ?? e.status}</span>
        {e.daysPassed > 0 && e.projectedAtPeriodEnd !== e.actual && (
          <>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">
              🌡️ 월말 예상{' '}
              {formatMoney(e.projectedAtPeriodEnd, baseCurrency, currencies)} {baseCurrency} (
              {e.effectiveBudget > 0
                ? ((e.projectedAtPeriodEnd / e.effectiveBudget) * 100).toFixed(0)
                : '0'}
              %)
            </span>
          </>
        )}
      </div>
    </div>
  )
}
