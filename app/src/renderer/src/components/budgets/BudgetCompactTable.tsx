import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  BudgetVsActualEntry,
  CategoryDto,
  CurrencyDto,
  TransactionDto
} from '../../../../shared/types'
import { formatMoney } from '../../lib/money'
import InfoTip from '../InfoTip'

interface Props {
  entries: BudgetVsActualEntry[]
  categories: CategoryDto[]
  baseCurrency: string
  currencies: CurrencyDto[]
  /** 펼침 시 거래 조회 기간 */
  year: number
  month: number
  onEditBudget: (budgetId: string) => void
  onCreateBudgetForCategory: (categoryId: string) => void
}

const STATUS_PRIORITY: Record<string, number> = {
  critical: 0,
  over: 1,
  warning: 2,
  safe: 3,
  unset: 4
}

const STATUS_BAR_COLOR: Record<string, string> = {
  critical: 'bg-rose-500',
  over: 'bg-orange-500',
  warning: 'bg-amber-400',
  safe: 'bg-emerald-500',
  unset: 'bg-slate-600'
}

const STATUS_LABEL: Record<string, string> = {
  critical: '위험',
  over: '초과',
  warning: '주의',
  safe: '안전',
  unset: '미설정'
}

const PACE_LABEL: Record<string, string> = {
  ahead: '✅ 페이스 양호',
  on_pace: '⏱️ 정상 페이스',
  behind: '⚠️ 페이스 빠름',
  over: '🔴 예산 초과'
}

type ColumnId = 'limit' | 'actual' | 'remaining' | 'progress'

const ALL_COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'limit', label: '한도' },
  { id: 'actual', label: '사용' },
  { id: 'remaining', label: '잔액' },
  { id: 'progress', label: '진행 (바·%)' }
]

const COLUMN_STORAGE_KEY = 'budgets:compact:visibleColumns'
/** 펼침 패널의 거래 fetch 최대 건수 (한 카테고리+자식 트리 한 달 기준) */
const DRILLDOWN_TX_LIMIT = 500

type EntryWithDepth = BudgetVsActualEntry & { depth: number }

function buildTreeOrder(entries: BudgetVsActualEntry[]): EntryWithDepth[] {
  const byId = new Map<string, BudgetVsActualEntry>()
  for (const e of entries) {
    if (e.categoryId) byId.set(e.categoryId, e)
  }
  const childrenOf = new Map<string | null, BudgetVsActualEntry[]>()
  for (const e of entries) {
    const parent = e.parentCategoryId ?? null
    if (!childrenOf.has(parent)) childrenOf.set(parent, [])
    childrenOf.get(parent)!.push(e)
  }

  const roots: BudgetVsActualEntry[] = []
  for (const e of entries) {
    const p = e.parentCategoryId
    if (p == null || !byId.has(p)) roots.push(e)
  }
  roots.sort((a, b) => {
    const sa = STATUS_PRIORITY[a.status] ?? 99
    const sb = STATUS_PRIORITY[b.status] ?? 99
    if (sa !== sb) return sa - sb
    return b.percentUsed - a.percentUsed
  })

  const visited = new Set<string>()
  const result: EntryWithDepth[] = []

  function visit(entry: BudgetVsActualEntry, depth: number): void {
    if (entry.categoryId) {
      if (visited.has(entry.categoryId)) return
      visited.add(entry.categoryId)
    }
    result.push({ ...entry, depth })
    if (entry.categoryId) {
      const children = (childrenOf.get(entry.categoryId) ?? []).slice()
      children.sort((a, b) => b.percentUsed - a.percentUsed)
      for (const c of children) visit(c, depth + 1)
    }
  }
  for (const r of roots) visit(r, 0)
  for (const e of entries) {
    if (e.categoryId && !visited.has(e.categoryId)) {
      result.push({ ...e, depth: 0 })
    } else if (!e.categoryId) {
      result.push({ ...e, depth: 0 })
    }
  }
  return result
}

function loadVisibleColumns(): Set<ColumnId> {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ColumnId[]
      if (Array.isArray(arr)) return new Set(arr.filter((id) => ALL_COLUMNS.some((c) => c.id === id)))
    }
  } catch {
    /* ignore */
  }
  return new Set(['limit', 'actual', 'remaining', 'progress'])
}

/** 부모 ID → 자식 ID 리스트 맵을 한 번만 빌드 */
function buildChildrenByParent(allCategories: CategoryDto[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const c of allCategories) {
    if (c.parentId) {
      const arr = m.get(c.parentId) ?? []
      arr.push(c.id)
      m.set(c.parentId, arr)
    }
  }
  return m
}

/** 미리 빌드된 childrenByParent를 받아 한 노드의 모든 후손 ID 수집 (자기 자신 포함) */
function collectDescendantIds(
  rootId: string,
  childrenByParent: Map<string, string[]>
): string[] {
  const out = new Set<string>([rootId])
  const walk = (id: string): void => {
    const kids = childrenByParent.get(id)
    if (!kids) return
    for (const k of kids) {
      if (!out.has(k)) {
        out.add(k)
        walk(k)
      }
    }
  }
  walk(rootId)
  return Array.from(out)
}

export default function BudgetCompactTable({
  entries,
  categories,
  baseCurrency,
  currencies,
  year,
  month,
  onEditBudget,
  onCreateBudgetForCategory
}: Props): React.JSX.Element {
  const sorted = useMemo(() => buildTreeOrder(entries), [entries])
  // 카테고리 트리는 categories prop이 바뀔 때만 재구축. 행 펼침마다 재계산하지 않음.
  const childrenByParent = useMemo(() => buildChildrenByParent(categories), [categories])
  const catNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => loadVisibleColumns())
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const colMenuRef = useRef<HTMLDivElement>(null)

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!colMenuOpen) return
    const handle = (e: MouseEvent): void => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [colMenuOpen])

  // 월 바뀌면 펼침 초기화
  useEffect(() => {
    setExpanded(new Set())
  }, [year, month])

  const toggleColumn = (id: ColumnId): void => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const toggleExpand = (categoryId: string | null): void => {
    if (!categoryId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
        표시할 카테고리가 없습니다.
      </div>
    )
  }

  // 보이는 데이터 컬럼 수 (펼침 패널 colSpan 계산용)
  // [상태 바, 카테고리, ...visibleCols, 액션] = 3 + visibleCols.size
  const totalCols = 3 + visibleCols.size

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
      {/* 표 위 헤더 — 우측 ⚙ 컬럼 토글 */}
      <div className="flex items-center justify-between border-b border-slate-700/50 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-400">
        <span>총 {sorted.length}개 카테고리 · 부모 → 자식 순 · 행 클릭 시 거래 펼침</span>
        <div ref={colMenuRef} className="relative">
          <button
            onClick={() => setColMenuOpen((v) => !v)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            title="표시할 열 선택"
          >
            ⚙ 열
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-md border border-slate-700 bg-slate-900 p-2 shadow-lg">
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-slate-500">
                표시할 열
              </div>
              {ALL_COLUMNS.map((col) => {
                const checked = visibleCols.has(col.id)
                return (
                  <label
                    key={col.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col.id)}
                      className="h-3.5 w-3.5 cursor-pointer"
                    />
                    {col.label}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-slate-700/50 bg-slate-900/40 text-left text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="w-2 px-2 py-2.5"></th>
            <th className="px-3 py-2.5">
              <span className="inline-flex items-center">
                카테고리
                <InfoTip side="bottom">
                  부모(예: 식비) → 자식(예: 외식·카페) 순으로 들여쓰기 표시. 부모 행을 클릭하면
                  그 안의 거래 목록이 펼쳐집니다.
                  <br />
                  <br />
                  좌측 컬러 바: 위험·초과·주의·안전·미설정 한눈에.
                </InfoTip>
              </span>
            </th>
            {visibleCols.has('limit') && (
              <th className="px-3 py-2.5 text-right">
                <span className="inline-flex items-center">
                  한도
                  <InfoTip side="bottom">
                    내가 정한 <b>이번 달 사용 가능 금액</b>.
                    <br />
                    잔액 이월 옵션이 켜져 있으면 지난 달 남은 금액도 더해진 값입니다.
                  </InfoTip>
                </span>
              </th>
            )}
            {visibleCols.has('actual') && (
              <th className="px-3 py-2.5 text-right">
                <span className="inline-flex items-center">
                  사용
                  <InfoTip side="bottom">
                    이번 달 그 카테고리(<b>자식 카테고리 포함</b>)에서 실제로 쓴 금액의 합.
                    <br />
                    <br />
                    예: 「식비」 한도라면 「식비/외식」, 「식비/카페」 거래도 다 합산됩니다.
                  </InfoTip>
                </span>
              </th>
            )}
            {visibleCols.has('remaining') && (
              <th className="px-3 py-2.5 text-right">
                <span className="inline-flex items-center">
                  잔액
                  <InfoTip side="bottom">
                    한도 − 사용. <b>양수면 남은 금액</b>, <b>음수면 한도 초과 금액</b>입니다.
                  </InfoTip>
                </span>
              </th>
            )}
            {visibleCols.has('progress') && (
              <th className="w-48 px-3 py-2.5">
                <span className="inline-flex items-center">
                  진행
                  <InfoTip side="bottom">
                    사용률(사용 ÷ 한도 × 100)을 막대와 % 숫자로 표시.
                    <br />
                    <br />
                    🟢 0~75% 안전 / 🟡 75~100% 주의 / 🟠 100~125% 초과 / 🔴 125% 이상 위험
                  </InfoTip>
                </span>
              </th>
            )}
            <th className="w-12 px-2 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const isExpanded = e.categoryId ? expanded.has(e.categoryId) : false
            return (
              <Row
                key={e.budgetId ?? `unset-${e.categoryId ?? 'null'}`}
                entry={e}
                isExpanded={isExpanded}
                visibleCols={visibleCols}
                baseCurrency={baseCurrency}
                currencies={currencies}
                childrenByParent={childrenByParent}
                catNameById={catNameById}
                year={year}
                month={month}
                totalCols={totalCols}
                onToggleExpand={() => toggleExpand(e.categoryId)}
                onEdit={e.budgetId ? () => onEditBudget(e.budgetId!) : undefined}
                onCreateBudget={
                  e.budgetId === null && e.categoryId
                    ? () => onCreateBudgetForCategory(e.categoryId!)
                    : undefined
                }
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Row                                                                     */
/* ────────────────────────────────────────────────────────────────────── */

function Row({
  entry: e,
  isExpanded,
  visibleCols,
  baseCurrency,
  currencies,
  childrenByParent,
  catNameById,
  year,
  month,
  totalCols,
  onToggleExpand,
  onEdit,
  onCreateBudget
}: {
  entry: EntryWithDepth
  isExpanded: boolean
  visibleCols: Set<ColumnId>
  baseCurrency: string
  currencies: CurrencyDto[]
  childrenByParent: Map<string, string[]>
  catNameById: Map<string, string>
  year: number
  month: number
  totalCols: number
  onToggleExpand: () => void
  onEdit?: () => void
  onCreateBudget?: () => void
}): React.JSX.Element {
  const isUnset = e.status === 'unset'
  const isOver = e.percentUsed > 100

  // hover 툴팁
  const tooltipParts: string[] = []
  if (e.categoryPath && e.categoryPath !== e.categoryName) tooltipParts.push(e.categoryPath)
  tooltipParts.push(`상태: ${STATUS_LABEL[e.status] ?? e.status}`)
  if (!isUnset && e.daysPassed > 0) {
    const paceLabel = PACE_LABEL[e.paceStatus]
    if (paceLabel) tooltipParts.push(paceLabel)
    if (e.savingsAtCurrentPace > 0 && e.status === 'safe') {
      tooltipParts.push(
        `월말 잉여 +${formatMoney(e.savingsAtCurrentPace, baseCurrency, currencies)} 예상`
      )
    }
    if (e.paceStatus === 'behind') {
      tooltipParts.push(
        `월말 예상 ${formatMoney(e.projectedAtPeriodEnd, baseCurrency, currencies)}`
      )
    }
  }
  if (e.conversionWarning === 'no_rate') {
    tooltipParts.push('⚠️ 환율 정보 없음 (1:1 변환)')
  }
  const tooltip = tooltipParts.filter(Boolean).join('\n')

  const barWidth = Math.min(e.percentUsed, 100)
  const indent = '   '.repeat(e.depth)
  const treeMark = e.depth > 0 ? '└ ' : ''

  // 미설정 행은 펼침 의미 없음 — 클릭 = 새 예산 생성
  // 일반 행은 클릭 = 펼침 토글, 편집은 별도 ✎
  const rowClickable = e.categoryId != null
  const onRowClick = isUnset ? onCreateBudget : rowClickable ? onToggleExpand : undefined

  return (
    <>
      <tr
        onClick={onRowClick}
        title={tooltip}
        className={`border-b border-slate-800/50 transition ${
          onRowClick ? 'cursor-pointer hover:bg-slate-800/30' : ''
        } ${isExpanded ? 'bg-slate-800/40' : ''}`}
      >
        <td className="px-2 py-2">
          <span
            className={`block h-6 w-1 rounded-full ${STATUS_BAR_COLOR[e.status] ?? 'bg-slate-600'}`}
            aria-label={STATUS_LABEL[e.status]}
          />
        </td>
        <td className="px-3 py-2 text-slate-200">
          <span className="truncate">
            <span className="font-mono text-slate-500">{indent}</span>
            {treeMark && <span className="font-mono text-slate-500">{treeMark}</span>}
            {!isUnset && rowClickable && (
              <span className="mr-1 font-mono text-xs text-slate-500">
                {isExpanded ? '▼' : '▶'}
              </span>
            )}
            {e.categoryName ?? '미분류'}
          </span>
        </td>
        {visibleCols.has('limit') && (
          <td className="px-3 py-2 text-right font-mono">
            {isUnset ? (
              <span className="text-slate-600">—</span>
            ) : (
              <span className="text-slate-300">
                {formatMoney(e.effectiveBudget, baseCurrency, currencies)}
              </span>
            )}
          </td>
        )}
        {visibleCols.has('actual') && (
          <td className="px-3 py-2 text-right font-mono">
            <span className={isOver ? 'text-rose-300' : 'text-slate-200'}>
              {formatMoney(e.actual, baseCurrency, currencies)}
            </span>
          </td>
        )}
        {visibleCols.has('remaining') && (
          <td className="px-3 py-2 text-right font-mono">
            {isUnset ? (
              <span className="text-slate-600">—</span>
            ) : isOver ? (
              <span className="text-rose-300">
                -{formatMoney(Math.abs(e.remaining), baseCurrency, currencies)}
              </span>
            ) : (
              <span className="text-emerald-300">
                {formatMoney(e.remaining, baseCurrency, currencies)}
              </span>
            )}
          </td>
        )}
        {visibleCols.has('progress') && (
          <td className="px-3 py-2">
            {isUnset ? (
              <button
                onClick={(ev) => {
                  ev.stopPropagation()
                  onCreateBudget?.()
                }}
                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/20"
              >
                + 예산 설정
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full ${STATUS_BAR_COLOR[e.status] ?? 'bg-slate-500'} transition-all`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span
                  className={`whitespace-nowrap font-mono text-xs ${
                    isOver ? 'text-rose-300' : 'text-slate-300'
                  }`}
                >
                  {e.percentUsed.toFixed(0)}%
                </span>
              </div>
            )}
          </td>
        )}
        <td className="px-2 py-2 text-right">
          {!isUnset && onEdit && (
            <button
              onClick={(ev) => {
                ev.stopPropagation()
                onEdit()
              }}
              className="rounded p-1 text-xs text-slate-500 hover:bg-slate-700/50 hover:text-slate-200"
              title="예산 편집"
            >
              ✎
            </button>
          )}
        </td>
      </tr>

      {isExpanded && e.categoryId && (
        <tr className="border-b border-slate-800/50 bg-slate-950/30">
          <td colSpan={totalCols} className="px-3 py-3">
            <CategoryTransactionsPanel
              categoryId={e.categoryId}
              childrenByParent={childrenByParent}
              catNameById={catNameById}
              year={year}
              month={month}
              baseCurrency={baseCurrency}
              currencies={currencies}
              expectedTotal={e.actual}
            />
          </td>
        </tr>
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Drilldown panel: 그 카테고리(+후손)의 거래 목록                          */
/* ────────────────────────────────────────────────────────────────────── */

interface PanelGroup {
  categoryId: string
  categoryName: string
  total: number
  txs: TransactionDto[]
}

function CategoryTransactionsPanel({
  categoryId,
  childrenByParent,
  catNameById,
  year,
  month,
  baseCurrency,
  currencies,
  expectedTotal
}: {
  categoryId: string
  childrenByParent: Map<string, string[]>
  catNameById: Map<string, string>
  year: number
  month: number
  baseCurrency: string
  currencies: CurrencyDto[]
  expectedTotal: number
}): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<PanelGroup[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // ref로 들고 있어 useEffect deps에서 빼면 categoryId/year/month 변경에만 반응.
  // childrenByParent / catNameById는 부모에서 useMemo로 안정화되긴 했지만 컴포넌트 자체가
  // 언제든 새 ref를 받을 수 있어 stale fetch 재실행 위험 차단.
  const childrenByParentRef = useRef(childrenByParent)
  const catNameByIdRef = useRef(catNameById)
  childrenByParentRef.current = childrenByParent
  catNameByIdRef.current = catNameById

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const descendantIds = collectDescendantIds(categoryId, childrenByParentRef.current)
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString()
    const to = new Date(year, month, 0, 23, 59, 59, 999).toISOString()
    window.api.transactions
      .list({
        from,
        to,
        types: ['expense'],
        categoryIds: descendantIds,
        limit: DRILLDOWN_TX_LIMIT,
        orderBy: 'occurredAt',
        orderDir: 'desc'
      })
      .then((res) => {
        if (!alive) return
        const groupMap = new Map<string, PanelGroup>()
        let total = 0
        for (const tx of res.rows) {
          const cid = tx.categoryId ?? '__null__'
          const cname = tx.categoryId
            ? (catNameByIdRef.current.get(tx.categoryId) ?? '(알 수 없음)')
            : '(분류 없음)'
          const g = groupMap.get(cid) ?? {
            categoryId: cid,
            categoryName: cname,
            total: 0,
            txs: []
          }
          g.txs.push(tx)
          g.total += tx.amountInBase
          total += tx.amountInBase
          groupMap.set(cid, g)
        }
        // 부모 카테고리(클릭한 것)를 위로, 그 다음 합계 큰 순
        const list = Array.from(groupMap.values())
        list.sort((a, b) => {
          if (a.categoryId === categoryId) return -1
          if (b.categoryId === categoryId) return 1
          return b.total - a.total
        })
        setGroups(list)
        setGrandTotal(total)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        // eslint-disable-next-line no-console
        console.warn('drilldown fetch failed:', err)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [categoryId, year, month])

  if (loading) {
    return <div className="py-3 text-center text-xs text-slate-500">불러오는 중...</div>
  }

  if (error) {
    return (
      <div className="py-3 text-center text-xs text-rose-300">
        거래 목록을 불러오지 못했습니다: {error}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-slate-500">
        이 기간 내 이 카테고리에 속한 거래가 없습니다.
      </div>
    )
  }

  const mismatch = Math.abs(grandTotal - expectedTotal) > 1

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-400">
          이 카테고리(+자식 카테고리) 거래{' '}
          <span className="font-medium text-slate-200">
            {groups.reduce((s, g) => s + g.txs.length, 0)}건
          </span>
        </span>
        <span className="font-mono text-slate-300">
          합계 -{formatMoney(grandTotal, baseCurrency, currencies)}
          {mismatch && (
            <span className="ml-2 text-amber-300" title="예산 표 사용액과 미세 차이">
              ⚠️ 표와 다름
            </span>
          )}
        </span>
      </div>

      {groups.map((g) => (
        <div
          key={g.categoryId}
          className="overflow-hidden rounded-md border border-slate-700/40 bg-slate-900/30"
        >
          <div className="flex items-baseline justify-between border-b border-slate-700/40 bg-slate-900/40 px-3 py-1.5 text-xs">
            <span className="font-medium text-slate-200">
              {g.categoryName}{' '}
              <span className="font-normal text-slate-500">({g.txs.length})</span>
            </span>
            <span className="font-mono text-slate-400">
              -{formatMoney(g.total, baseCurrency, currencies)}
            </span>
          </div>
          <ul className="divide-y divide-slate-800/40 text-xs">
            {g.txs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/30"
              >
                <span className="w-16 shrink-0 font-mono text-slate-500">
                  {formatDateShort(tx.occurredAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-200">
                  {tx.payee ?? tx.memo ?? '—'}
                </span>
                <span className="whitespace-nowrap font-mono text-rose-300">
                  -{formatMoney(tx.amount, tx.currency, currencies)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
