import { useEffect, useMemo, useState } from 'react'
import type { BudgetVsActualEntry, CategoryDto, CurrencyDto } from '../../../../shared/types'
import { formatMoney } from '../../lib/money'

/**
 * 거래내역 화면 우측에 슬라이드로 표시되는 예산 현황 패널.
 * - 최상위(루트) 지출 카테고리만 노출. 자식 거래는 루트로 자동 합산.
 * - 예산이 잡힌 루트: 백엔드의 includesDescendants 로직으로 자식 거래가 이미 actual에 포함.
 * - 예산 없는 루트: 자식들의 unset entry actual을 클라이언트에서 합산해 roll-up.
 * - 행 클릭 → 부모 onCategoryClick 콜백으로 거래내역 필터 연동 가능.
 *
 * 모달이 아니라 drawer 패턴(backdrop 없음). 패널이 열려있어도 거래내역 입력·필터 가능.
 */
interface Props {
  open: boolean
  onClose: () => void
  year: number
  month: number
  categories: CategoryDto[]
  currencies: CurrencyDto[]
  /** 거래 추가/수정/삭제 등으로 데이터가 변경됐을 때 증가시키면 패널이 재조회 */
  dataVersion?: number
  /** 행 클릭 → 그 루트 카테고리(+자식)로 거래 필터 */
  onCategoryClick?: (rootCategoryId: string) => void
}

interface RootBucket {
  categoryId: string
  categoryName: string
  icon: string | null
  budget: number
  actual: number
  hasBudget: boolean
  /** 정렬을 위해 보존 */
  displayOrder: number
}

/** categoryId → root categoryId 매핑 빌드 (사이클 가드 포함). */
function buildRootMap(categories: CategoryDto[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rootMap = new Map<string, string>()
  function findRoot(id: string, visited: Set<string>): string {
    const cached = rootMap.get(id)
    if (cached) return cached
    if (visited.has(id)) return id
    visited.add(id)
    const cat = byId.get(id)
    if (!cat || !cat.parentId) {
      rootMap.set(id, id)
      return id
    }
    const root = findRoot(cat.parentId, visited)
    rootMap.set(id, root)
    return root
  }
  for (const c of categories) findRoot(c.id, new Set())
  return rootMap
}

export default function TransactionsBudgetPanel({
  open,
  onClose,
  year,
  month,
  categories,
  currencies,
  dataVersion = 0,
  onCategoryClick
}: Props): React.JSX.Element {
  const [entries, setEntries] = useState<BudgetVsActualEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [baseCurrency, setBaseCurrency] = useState<string>('KRW')

  // baseCurrency는 한 번만 로드 (사용 중 변경 가능성 낮음)
  useEffect(() => {
    void window.api.settings.get('baseCurrency').then((v) => {
      if (v) setBaseCurrency(v)
    })
  }, [])

  // 패널 열림 + 기간 + dataVersion 변경 시 재조회.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    window.api.stats
      .budgetVsActual({ year, month })
      .then((es) => {
        if (cancelled) return
        setEntries(es)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return (): void => {
      cancelled = true
    }
  }, [open, year, month, dataVersion])

  const rootMap = useMemo(() => buildRootMap(categories), [categories])

  /**
   * 루트 카테고리별 집계 결과.
   *
   * 동작 원리:
   * 1. expense·루트·non-archived 카테고리들을 0으로 초기화.
   * 2. budgetVsActual의 모든 entry를 순회.
   *    - entry.categoryId === root && entry.budgetId !== null: 루트 자체에 예산이 잡혀 있는 경우.
   *      → entry.effectiveBudget = 예산, entry.actual = 자식까지 합산된 실제 사용액 (백엔드의
   *        includesDescendants 처리로 이미 rollup됨). bucket을 이 값으로 SET (덮어쓰기).
   *    - 그 외 (예산 없는 루트의 자식 등): bucket.actual에 ADD.
   *      단, bucket.hasBudget이 이미 true면 SKIP (중복 합산 방지 — 자식 actual이 이미
   *      루트 entry.actual에 포함되어 있을 수 있음).
   */
  const rootBuckets = useMemo<RootBucket[]>(() => {
    const expenseRoots = categories
      .filter((c) => c.kind === 'expense' && !c.parentId && !c.isArchived)
      .sort((a, b) => a.displayOrder - b.displayOrder)

    const buckets = new Map<string, RootBucket>()
    for (const r of expenseRoots) {
      buckets.set(r.id, {
        categoryId: r.id,
        categoryName: r.name,
        icon: r.icon,
        budget: 0,
        actual: 0,
        hasBudget: false,
        displayOrder: r.displayOrder
      })
    }

    for (const e of entries) {
      if (e.isTotalRow) continue
      if (!e.categoryId) continue
      const rootId = rootMap.get(e.categoryId)
      if (!rootId) continue
      const bucket = buckets.get(rootId)
      if (!bucket) continue

      if (e.categoryId === rootId && e.budgetId !== null) {
        bucket.budget = e.effectiveBudget
        bucket.actual = e.actual
        bucket.hasBudget = true
      } else if (!bucket.hasBudget) {
        bucket.actual += e.actual
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.displayOrder - b.displayOrder)
  }, [entries, categories, rootMap])

  const total = useMemo(() => {
    let budget = 0
    let actual = 0
    for (const b of rootBuckets) {
      if (b.hasBudget) budget += b.budget
      actual += b.actual
    }
    return { budget, actual, remaining: budget - actual }
  }, [rootBuckets])

  const totalIsOver = total.budget > 0 && total.remaining < 0

  return (
    <aside
      className={`fixed right-0 top-0 z-30 flex h-full w-full max-w-[400px] flex-col border-l border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur transition-transform duration-200 ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-700 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            📊 {year}년 {month}월 예산 현황
          </h2>
          <p className="mt-0.5 text-[10px] text-slate-500">
            최상위 카테고리 기준 · 자식 거래 자동 합산
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 이번달 예산 요약 */}
      <div
        className={`border-b border-slate-700/50 px-4 py-3 ${
          totalIsOver ? 'bg-rose-500/10' : 'bg-slate-900/70'
        }`}
      >
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-200">이번달 예산</span>
          {totalIsOver && (
            <span className="text-[10px] font-medium text-rose-300">🔴 한도 초과</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-right font-mono text-xs">
          <div>
            <div className="text-[10px] text-slate-500">예산</div>
            <div className="text-slate-200">
              {total.budget > 0
                ? formatMoney(total.budget, baseCurrency, currencies)
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">지출</div>
            <div className="text-slate-200">
              {formatMoney(total.actual, baseCurrency, currencies)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500">쓸수있는돈</div>
            <div
              className={
                total.budget === 0
                  ? 'text-slate-600'
                  : totalIsOver
                    ? 'font-semibold text-rose-300'
                    : 'text-emerald-300'
              }
            >
              {total.budget === 0
                ? '—'
                : totalIsOver
                  ? `-${formatMoney(Math.abs(total.remaining), baseCurrency, currencies)}`
                  : formatMoney(total.remaining, baseCurrency, currencies)}
            </div>
          </div>
        </div>
      </div>

      {/* 카테고리별 표 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500">불러오는 중…</div>
        ) : rootBuckets.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            지출 카테고리가 없습니다.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
              <tr className="border-b border-slate-700/70 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left font-medium">카테고리</th>
                <th className="px-2 py-2 text-right font-medium">예산</th>
                <th className="px-2 py-2 text-right font-medium">지출</th>
                <th className="px-2 py-2 text-right font-medium">쓸수있는돈</th>
              </tr>
            </thead>
            <tbody>
              {rootBuckets.map((b) => {
                const remaining = b.hasBudget ? b.budget - b.actual : 0
                const isOver = b.hasBudget && remaining < 0
                const isEmpty = !b.hasBudget && b.actual === 0
                const clickable = !!onCategoryClick && !isEmpty
                return (
                  <tr
                    key={b.categoryId}
                    onClick={clickable ? () => onCategoryClick?.(b.categoryId) : undefined}
                    className={`border-b border-slate-800/40 ${
                      isOver ? 'bg-rose-500/10' : ''
                    } ${clickable ? 'cursor-pointer hover:bg-slate-800/40' : ''} ${
                      isEmpty ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        {b.icon && <span className="text-sm">{b.icon}</span>}
                        <span className="truncate">{b.categoryName}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.hasBudget ? (
                        <span className="text-slate-300">
                          {formatMoney(b.budget, baseCurrency, currencies)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.actual > 0 ? (
                        <span className={isOver ? 'text-rose-200' : 'text-slate-200'}>
                          {formatMoney(b.actual, baseCurrency, currencies)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.hasBudget ? (
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
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer hint */}
      {onCategoryClick && (
        <div className="border-t border-slate-700/50 bg-slate-900/70 px-4 py-2 text-[10px] text-slate-500">
          💡 행을 클릭하면 그 카테고리(자식 포함) 거래만 필터링됩니다.
        </div>
      )}
    </aside>
  )
}
