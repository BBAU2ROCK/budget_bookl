import { useEffect, useMemo, useState } from 'react'
import type {
  BudgetVsActualEntry,
  CategoryDto,
  CurrencyDto,
  TransactionDto
} from '../../../../shared/types'
import { formatMoney } from '../../lib/money'

/**
 * 예산 화면의 메인 카테고리 표.
 *
 * - 최상위(루트) 카테고리만 기본 노출. 각 행에 펼침 토글 (▶/▼) 제공.
 *   펼치면 그 카테고리의 자식 카테고리 행이 들여쓰기로 표시됨 (재귀).
 * - 자식 카테고리에도 예산을 등록할 수 있음 (행 클릭 → 그 카테고리의 BudgetForm 진입).
 * - 정렬: 카테고리 displayOrder 고정. 사용률·상태에 따라 행이 위아래로 움직이지 않음.
 *
 * 표시 규칙:
 * - 예산 컬럼: 그 카테고리에 직접 잡힌 예산. 없으면 '—'.
 * - 지출 컬럼: 그 카테고리 서브트리(자기 자신 + 모든 자손)의 거래 합계.
 *   부모 행은 자식 거래를 자동 합산. 자식 행은 자기 서브트리만.
 * - 쓸수있는돈: 예산 - 지출. 예산 없으면 '—'. 음수면 빨강 + 행 옅은 빨강 배경.
 *
 * 데이터 소스:
 * - budgetVsActual: 카테고리별 예산 정보 (어느 카테고리에 예산이 있는지).
 * - transactions.list: 이번달 지출 거래 전수 → 클라이언트에서 categoryId별로 직접
 *   actual 집계 → 서브트리 재귀 합으로 부모·자식 actual 계산.
 *   백엔드 budgetVsActual은 자식 actual을 부모로 lump해주지만, 펼친 자식 행에서
 *   자체 actual을 보여주려면 카테고리별 직접 actual이 필요해서 transactions를 별도
 *   조회한다.
 *
 * ⚠️ 의도된 동작 차이:
 * - 백엔드 stats.ts의 budgetVsActual은 예산의 `includesDescendants=false` 플래그를
 *   존중해 부모 actual을 직접 거래로만 제한한다.
 * - 이 컴포넌트의 "지출" 컬럼은 항상 서브트리 합 (자식 포함). 폼 디폴트가 true이고
 *   사용자가 명시적으로 false를 선택하는 경우가 드물어, 표시 일관성을 우선.
 * - false 사용자는 백엔드의 정확한 비교와 화면 표시 사이에 약간의 차이가 보일 수 있음.
 */
interface Props {
  year: number
  month: number
  categories: CategoryDto[]
  currencies: CurrencyDto[]
  /** 거래·예산 변경 시 증가시키면 재조회 */
  dataVersion?: number
  /** 행 클릭 핸들러 (그 카테고리 예산 편집·등록 진입) */
  onCategoryClick?: (categoryId: string) => void
}

export default function BudgetSummaryTable({
  year,
  month,
  categories,
  currencies,
  dataVersion = 0,
  onCategoryClick
}: Props): React.JSX.Element {
  const [entries, setEntries] = useState<BudgetVsActualEntry[]>([])
  const [txs, setTxs] = useState<TransactionDto[]>([])
  const [loading, setLoading] = useState(false)
  const [baseCurrency, setBaseCurrency] = useState<string>('KRW')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    void window.api.settings.get('baseCurrency').then((v) => {
      if (v) setBaseCurrency(v)
    })
  }, [])

  // 펼침 상태는 월 바뀌면 초기화 (다른 달의 카테고리 펼침 상태가 남는 일 방지)
  useEffect(() => {
    setExpanded(new Set())
  }, [year, month])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString()
    const end = new Date(year, month, 0, 23, 59, 59, 999).toISOString()
    Promise.all([
      window.api.stats.budgetVsActual({ year, month }),
      window.api.transactions.list({
        from: start,
        to: end,
        types: ['expense'],
        limit: 10000,
        orderBy: 'occurredAt',
        orderDir: 'desc'
      })
    ])
      .then(([es, txRes]) => {
        if (cancelled) return
        setEntries(es)
        setTxs(txRes.rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [year, month, dataVersion])

  // categoryId → 직접 거래 합 (자식 제외, 그 카테고리 자체에 attach된 거래만)
  //
  // ⚠️ Splits-aware: 거래에 split이 있으면 split마다의 categoryId·amountInBase로 분배.
  // (백엔드 stats.ts의 actualByCategory와 동일한 규칙) split이 없으면 tx.categoryId에
  // tx.amountInBase 전액 가산.
  const directActualByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const tx of txs) {
      if (tx.splits && tx.splits.length > 0) {
        for (const sp of tx.splits) {
          if (!sp.categoryId) continue
          m.set(sp.categoryId, (m.get(sp.categoryId) ?? 0) + sp.amountInBase)
        }
      } else {
        if (!tx.categoryId) continue
        m.set(tx.categoryId, (m.get(tx.categoryId) ?? 0) + tx.amountInBase)
      }
    }
    return m
  }, [txs])

  // parent → 자식 카테고리 리스트 (displayOrder 정렬)
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, CategoryDto[]>()
    for (const c of categories) {
      if (c.kind !== 'expense' || c.isArchived) continue
      const k = c.parentId
      const arr = m.get(k) ?? []
      arr.push(c)
      m.set(k, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.displayOrder - b.displayOrder)
    }
    return m
  }, [categories])

  // 서브트리 actual 캐시 — 사이클 가드 포함.
  const subtreeActualByCategory = useMemo(() => {
    const cache = new Map<string, number>()
    function compute(catId: string, visited: Set<string>): number {
      const cached = cache.get(catId)
      if (cached !== undefined) return cached
      if (visited.has(catId)) return 0
      visited.add(catId)
      let total = directActualByCategory.get(catId) ?? 0
      const kids = childrenByParent.get(catId) ?? []
      for (const k of kids) total += compute(k.id, visited)
      cache.set(catId, total)
      return total
    }
    for (const c of categories) {
      if (c.kind === 'expense' && !c.isArchived) compute(c.id, new Set())
    }
    return cache
  }, [categories, childrenByParent, directActualByCategory])

  // categoryId → 그 카테고리에 직접 잡힌 예산 entry (있는 경우만)
  const budgetByCategory = useMemo(() => {
    const m = new Map<string, BudgetVsActualEntry>()
    for (const e of entries) {
      if (e.categoryId && e.budgetId !== null) m.set(e.categoryId, e)
    }
    return m
  }, [entries])

  const expenseRoots = useMemo(
    () => childrenByParent.get(null) ?? [],
    [childrenByParent]
  )

  function toggleExpand(catId: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  if (loading && entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
        불러오는 중…
      </div>
    )
  }

  if (expenseRoots.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
        표시할 지출 카테고리가 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
      <div className="border-b border-slate-700/50 bg-slate-900/70 px-4 py-2 text-xs text-slate-400">
        총 {expenseRoots.length}개 최상위 카테고리 · 정렬 고정 (카테고리 순서) · ▶ 펼치면 자식
        카테고리
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-900/40 text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-2.5 text-left">카테고리</th>
            <th className="px-4 py-2.5 text-right">예산</th>
            <th className="px-4 py-2.5 text-right">지출</th>
            <th className="px-4 py-2.5 text-right">쓸수있는돈</th>
          </tr>
        </thead>
        <tbody>
          {expenseRoots.flatMap((root) =>
            renderRows({
              cat: root,
              depth: 0,
              childrenByParent,
              subtreeActualByCategory,
              budgetByCategory,
              expanded,
              toggleExpand,
              onCategoryClick,
              baseCurrency,
              currencies
            })
          )}
        </tbody>
      </table>

      {onCategoryClick && (
        <div className="border-t border-slate-700/50 bg-slate-900/70 px-4 py-2 text-xs text-slate-500">
          💡 행 클릭 → 그 카테고리 예산 등록·편집 · ▶ 클릭 → 자식 카테고리 펼침
        </div>
      )}
    </div>
  )
}

/**
 * 한 카테고리의 행을 그리고, 펼침 상태면 자식까지 재귀로 그린다.
 * flatMap으로 평탄화되도록 배열을 반환.
 */
function renderRows(opts: {
  cat: CategoryDto
  depth: number
  childrenByParent: Map<string | null, CategoryDto[]>
  subtreeActualByCategory: Map<string, number>
  budgetByCategory: Map<string, BudgetVsActualEntry>
  expanded: Set<string>
  toggleExpand: (catId: string) => void
  onCategoryClick?: (catId: string) => void
  baseCurrency: string
  currencies: CurrencyDto[]
}): React.JSX.Element[] {
  const {
    cat,
    depth,
    childrenByParent,
    subtreeActualByCategory,
    budgetByCategory,
    expanded,
    toggleExpand,
    onCategoryClick,
    baseCurrency,
    currencies
  } = opts
  const kids = childrenByParent.get(cat.id) ?? []
  const hasChildren = kids.length > 0
  const isExpanded = expanded.has(cat.id)
  const actual = subtreeActualByCategory.get(cat.id) ?? 0
  const budgetEntry = budgetByCategory.get(cat.id)
  const hasBudget = !!budgetEntry
  const budget = budgetEntry?.effectiveBudget ?? 0
  const remaining = hasBudget ? budget - actual : 0
  const isOver = hasBudget && remaining < 0
  const isEmpty = !hasBudget && actual === 0

  const clickable = !!onCategoryClick
  const rows: React.JSX.Element[] = []

  rows.push(
    <tr
      key={cat.id}
      onClick={clickable ? () => onCategoryClick?.(cat.id) : undefined}
      className={`border-b border-slate-800/50 last:border-0 transition ${
        isOver ? 'bg-rose-500/10' : ''
      } ${clickable ? 'cursor-pointer hover:bg-slate-800/40' : ''} ${
        isEmpty ? 'opacity-60' : ''
      }`}
    >
      <td className="px-4 py-2.5 text-slate-200">
        <span className="inline-flex items-center gap-1.5">
          {/* depth 들여쓰기 — 각 단계 16px */}
          <span style={{ paddingLeft: `${depth * 16}px` }} className="inline-block" />
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(cat.id)
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-slate-400 hover:bg-slate-700/60 hover:text-slate-100"
              aria-label={isExpanded ? '접기' : '펼치기'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="inline-block w-5" />
          )}
          {cat.icon && <span className="text-base">{cat.icon}</span>}
          <span className={depth > 0 ? 'text-slate-300' : ''}>{cat.name}</span>
        </span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono">
        {hasBudget ? (
          <span className="text-slate-300">
            {formatMoney(budget, baseCurrency, currencies)}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-mono">
        {actual > 0 ? (
          <span className={isOver ? 'text-rose-200' : 'text-slate-200'}>
            {formatMoney(actual, baseCurrency, currencies)}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-mono">
        {hasBudget ? (
          isOver ? (
            <span className="font-semibold text-rose-300">
              -{formatMoney(Math.abs(remaining), baseCurrency, currencies)}
            </span>
          ) : (
            <span className="text-emerald-300">
              {formatMoney(remaining, baseCurrency, currencies)}
            </span>
          )
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
    </tr>
  )

  if (isExpanded) {
    for (const k of kids) {
      rows.push(
        ...renderRows({
          ...opts,
          cat: k,
          depth: depth + 1
        })
      )
    }
  }

  return rows
}
