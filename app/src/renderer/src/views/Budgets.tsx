import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BudgetVsActualEntry, CategoryDto, CurrencyDto } from '../../../shared/types'
import BudgetSummaryHeader from '../components/budgets/BudgetSummaryHeader'
import BudgetSummaryTable from '../components/budgets/BudgetSummaryTable'
import BudgetTopSummary from '../components/budgets/BudgetTopSummary'
import BudgetForm from '../components/budgets/BudgetForm'
import BudgetCopyDialog from '../components/budgets/BudgetCopyDialog'
import { useToast } from '../components/toast/ToastContext'

export default function Budgets(): React.JSX.Element {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [entries, setEntries] = useState<BudgetVsActualEntry[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [categoriesAll, setCategoriesAll] = useState<CategoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForCategory, setCreateForCategory] = useState<string | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  // 예산·거래 변경으로 entries가 갱신될 때마다 BudgetSummaryTable이 budgetVsActual을
  // 재조회하도록 트리거.
  const [dataVersion, setDataVersion] = useState(0)
  const globalToast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [es, ccy, cats] = await Promise.all([
        window.api.stats.budgetVsActual({ year, month }),
        window.api.currencies.list(),
        window.api.categories.list(true)
      ])
      setEntries(es)
      setCurrencies(ccy)
      setCategoriesAll(cats)
      setDataVersion((v) => v + 1)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const totalEntry = useMemo(() => entries.find((e) => e.isTotalRow) ?? null, [entries])
  // settings.baseCurrency가 main process 통계 계산과 일치하는 단일 출처.
  // currencies[0]에 의존하면 사용자가 displayOrder를 바꿨거나 base를 변경했을 때 어긋남.
  const [baseCurrency, setBaseCurrency] = useState<string>('KRW')
  useEffect(() => {
    void window.api.settings.get('baseCurrency').then((v) => {
      if (v) setBaseCurrency(v)
    })
  }, [])

  // Surface FX warnings: count category-level budgets that fell back to 1:1.
  // Aggregating these into the summary header lets users spot stale FX data
  // before they trust the totals.
  const noRateCategoryCount = useMemo(
    () => entries.filter((e) => !e.isTotalRow && e.conversionWarning === 'no_rate').length,
    [entries]
  )

  // 단일 표용: 모든 카테고리 (totalRow 제외). 정렬은 컴포넌트가 처리.
  const tableEntries = useMemo(
    () => entries.filter((e) => !e.isTotalRow),
    [entries]
  )

  // BudgetTopSummary에 전달할 예산 총액.
  // - 사용자가 만든 "전체 예산"(totalRow)이 있으면 그 effectiveBudget 사용.
  // - 없으면 카테고리 예산들의 effectiveBudget 합산.
  //
  // ⚠️ 중복 합산 회피 규칙: 부모에도 예산이 있는 자식은 합계에서 제외.
  // (식비 500K + 외식 200K → 외식은 식비 안의 sub-cap → 총합 500K)
  // 부모는 없고 자식만 예산이 있는 경우엔 자식이 합산됨 (사용자의 유효 cap).
  // 다단(루트→중간→리프) 중 중간만 예산 비어있는 skip-level 케이스는 1단계 부모만
  // 검사하므로 약간 과잉 합산될 수 있으나, 실 사용에선 드문 토폴로지.
  const totalBudget = useMemo(() => {
    if (totalEntry) return totalEntry.effectiveBudget
    const budgetedCatIds = new Set<string>()
    for (const e of tableEntries) {
      if (e.categoryId && e.budgetId !== null) budgetedCatIds.add(e.categoryId)
    }
    let sum = 0
    for (const e of tableEntries) {
      if (e.status === 'unset') continue
      if (e.parentCategoryId && budgetedCatIds.has(e.parentCategoryId)) continue
      sum += e.effectiveBudget
    }
    return sum
  }, [totalEntry, tableEntries])

  // BudgetForm에 넘기는 default period — 객체 리터럴을 매 렌더마다 새로 만들면
  // 폼 내부의 useEffect가 다시 호출돼 사용자 입력이 초기화될 위험이 있다.
  // useMemo로 (year, month)가 실제로 바뀔 때만 새 객체를 만든다.
  const defaultPeriod = useMemo(() => ({ year, month }), [year, month])

  const monthsForPicker = useMemo(() => {
    const arr: Array<{ year: number; month: number; label: string }> = []
    const cursor = new Date()
    cursor.setDate(1)
    for (let i = -3; i <= 12; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() + i, 1)
      arr.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`
      })
    }
    return arr
  }, [])

  const isEmpty = !loading && entries.filter((e) => !e.isTotalRow && e.status !== 'unset').length === 0

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">예산</h1>
          <p className="text-sm text-slate-400">
            카테고리별로 예산을 설정하고 진행률을 추적합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={`${year}-${month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              setYear(y)
              setMonth(m)
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            {monthsForPicker.map((o) => (
              <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCopyOpen(true)}
            className="rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/25"
          >
            📋 다른 달에서 복사
          </button>
          <button
            onClick={async () => {
              try {
                const r = await window.api.backup.exportBudgetXlsx({ year, month })
                if (!r) return
                globalToast.show({
                  tone: 'success',
                  message: `엑셀 저장 완료 (${r.rowCount}개 카테고리)`
                })
              } catch (e) {
                globalToast.show({
                  tone: 'error',
                  message: `엑셀 저장 실패: ${(e as Error).message}`
                })
              }
            }}
            className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/25"
            title="이번 달 예산·진행상황·카테고리별 상세를 엑셀(.xlsx) 파일로 저장"
          >
            📥 엑셀 다운로드
          </button>
          <button
            onClick={() => {
              setCreating(true)
              setCreateForCategory(null)
            }}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 예산
          </button>
        </div>
      </header>

      {loading && (
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
          로딩 중...
        </div>
      )}

      {/*
       * 4지표 전체 요약 — 예산 유무와 무관하게 표시 (수입·저축은 예산 없이도 의미 있는 정보).
       * isEmpty 조건 밖으로 빼서 빈 상태에서도 가계 흐름을 한눈에 볼 수 있도록.
       */}
      {!loading && (
        <BudgetTopSummary
          year={year}
          month={month}
          baseCurrency={baseCurrency}
          currencies={currencies}
          totalBudget={totalBudget}
          dataVersion={dataVersion}
        />
      )}

      {!loading && isEmpty && (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <div className="mb-3 text-3xl">📭</div>
          <h2 className="mb-2 text-lg font-semibold text-slate-200">
            이번 달 예산이 없어요
          </h2>
          <p className="mb-6 text-sm text-slate-400">
            카테고리별로 예산을 설정하면
            <br />
            "이번 달 얼마나 더 쓸 수 있는지" 알 수 있어요
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setCreating(true)}
              className="rounded-md border border-sky-500/60 bg-sky-500/20 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/30"
            >
              + 카테고리별 예산 만들기
            </button>
            <button
              onClick={() => setCopyOpen(true)}
              className="rounded-md border border-amber-500/60 bg-amber-500/15 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/25"
            >
              📋 다른 달에서 복사
            </button>
          </div>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          <BudgetSummaryHeader
            totalEntry={totalEntry}
            entries={tableEntries}
            baseCurrency={baseCurrency}
            currencies={currencies}
            year={year}
            month={month}
            noRateCategoryCount={noRateCategoryCount}
          />

          <BudgetSummaryTable
            year={year}
            month={month}
            categories={categoriesAll}
            currencies={currencies}
            dataVersion={dataVersion}
            onCategoryClick={(categoryId) => {
              // 클릭한 카테고리(루트 또는 자식)에 예산이 있으면 편집, 없으면 등록 모달.
              const matched = entries.find(
                (e) => e.categoryId === categoryId && e.budgetId !== null
              )
              if (matched && matched.budgetId) {
                setEditingId(matched.budgetId)
              } else {
                setCreateForCategory(categoryId)
                setCreating(true)
              }
            }}
          />
        </>
      )}

      {/* Modals */}
      {/*
       * key를 creating에 묶어 폼이 열릴 때마다 새 인스턴스로 마운트되도록 강제한다.
       * 이전 BudgetForm 인스턴스의 useState가 다음 열기까지 살아남으면서 상태(이전
       * 입력·이전 categoryTree·이전 currencies 등)가 누수되어 입력 칸이 비활성처럼
       * 보이는 회귀가 관측됨 → 매 open마다 깨끗한 mount로 그런 모든 누수를 차단.
       */}
      <BudgetForm
        key={creating ? 'create-open' : 'create-closed'}
        open={creating}
        defaultCategoryId={createForCategory}
        defaultPeriod={defaultPeriod}
        onClose={() => {
          setCreating(false)
          setCreateForCategory(null)
        }}
        onSaved={() => {
          load()
          globalToast.show({ tone: 'success', message: '예산이 저장되었습니다.' })
        }}
      />
      <BudgetEditFormLoader
        budgetId={editingId}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          load()
          globalToast.show({ tone: 'success', message: '예산이 수정되었습니다.' })
        }}
        onDeleted={() => {
          load()
          globalToast.show({ tone: 'success', message: '예산이 삭제되었습니다.' })
        }}
      />
      <BudgetCopyDialog
        open={copyOpen}
        toYear={year}
        toMonth={month}
        onClose={() => setCopyOpen(false)}
        onCompleted={(r) => {
          load()
          globalToast.show({
            tone: 'success',
            message: `복사 완료: ${r.copied}건 새로 생성, ${r.overwritten}건 덮어씀, ${r.skipped}건 건너뜀.`,
            durationMs: 5000
          })
        }}
      />

    </div>
  )
}

/**
 * Lightweight wrapper that fetches the full BudgetDto by ID and feeds BudgetForm.
 * Keeps Budgets view simple.
 */
function BudgetEditFormLoader({
  budgetId,
  onClose,
  onSaved,
  onDeleted
}: {
  budgetId: string | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}): React.JSX.Element | null {
  const [budget, setBudget] = useState<Awaited<ReturnType<typeof window.api.budgets.get>>>(null)

  useEffect(() => {
    if (!budgetId) {
      setBudget(null)
      return
    }
    window.api.budgets.get(budgetId).then(setBudget)
  }, [budgetId])

  if (!budgetId) return null

  return (
    <BudgetForm
      open={!!budget}
      initial={budget ?? undefined}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  )
}

