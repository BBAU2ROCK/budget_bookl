import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AccountDto,
  CategoryDto,
  CurrencyDto,
  TagDto,
  TransactionCreateInput,
  TransactionDto,
  TransactionListResult
} from '../../../shared/types'
import { formatInteger, formatMoney } from '../lib/money'
import TransactionForm from '../components/TransactionForm'
import { ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/toast/ToastContext'
import InfoTip from '../components/InfoTip'

/* ────────────────────────────────────────────────────────────────────── */
/* Constants                                                               */
/* ────────────────────────────────────────────────────────────────────── */

/** 한 번에 가져올 최대 거래 건수 (단일 월/필터 결과 기준) */
const TX_FETCH_LIMIT = 1000
/** 검색 입력 디바운스 (ms) */
const SEARCH_DEBOUNCE_MS = 300
/** 일괄 삭제 후 되돌리기 토스트 표시 시간 (ms) */
const UNDO_TOAST_DURATION_MS = 6000

interface AdvancedFilter {
  from: string
  to: string
  categoryIds: string[]
  accountIds: string[]
  tagIds: string[]
  minAmount: string
  maxAmount: string
}

const EMPTY_FILTER: AdvancedFilter = {
  from: '',
  to: '',
  categoryIds: [],
  accountIds: [],
  tagIds: [],
  minAmount: '',
  maxAmount: ''
}

/* ────────────────────────────────────────────────────────────────────── */
/* Date helpers                                                            */
/* ────────────────────────────────────────────────────────────────────── */

const pad2 = (n: number): string => String(n).padStart(2, '0')

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function shiftMonth(s: string, delta: number): string {
  const [y, m] = s.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function monthLabel(s: string): string {
  const [y, m] = s.split('-').map(Number)
  return `${y}년 ${m}월`
}

function monthBoundsIso(s: string): { fromIso: string; toIso: string } {
  const [y, m] = s.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999) // 마지막 날
  return { fromIso: start.toISOString(), toIso: end.toISOString() }
}

/**
 * 'YYYY-MM-DD' 문자열을 로컬 타임존 자정 ISO로 변환.
 * `new Date(s)`로 직접 파싱하면 UTC로 해석되어 KST에서 1일치 누락이 발생.
 */
function localDateStartIso(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
}

function localDateEndIso(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

interface FilterTotals {
  exp: number
  inc: number
  transferOut: number
  transferIn: number
  net: number
  count: number
}

/** visibleRows 기준 합산. transfer는 별도 집계 (계좌 필터 시 저축 net 계산용) */
function computeFilterTotals(rows: TransactionDto[]): FilterTotals {
  let exp = 0
  let inc = 0
  let transferOut = 0
  let transferIn = 0
  let count = 0
  for (const tx of rows) {
    if (tx.type === 'expense') exp += tx.amount
    else if (tx.type === 'income') inc += tx.amount
    else if (tx.type === 'transfer') {
      // 양쪽 모두 selected accounts에 들어있을 가능성 (내부 이체)에 무관하게
      // out과 in을 모두 합산. UI 측에서 net = in - out 표시.
      transferOut += tx.amount
      transferIn += tx.counterAmount ?? tx.amount
    }
    count += 1
  }
  return { exp, inc, transferOut, transferIn, net: inc - exp, count }
}

/** 부모 카테고리 ID 리스트를 입력하면 그 부모 + 모든 후손 ID 리스트를 반환 */
function expandToDescendants(parentIds: string[], categories: CategoryDto[]): string[] {
  if (parentIds.length === 0) return []
  const childrenOf = new Map<string, string[]>()
  for (const c of categories) {
    if (c.parentId) {
      const arr = childrenOf.get(c.parentId) ?? []
      arr.push(c.id)
      childrenOf.set(c.parentId, arr)
    }
  }
  const out = new Set<string>()
  const walk = (id: string): void => {
    if (out.has(id)) return
    out.add(id)
    for (const k of childrenOf.get(id) ?? []) walk(k)
  }
  for (const p of parentIds) walk(p)
  return Array.from(out)
}

function dateKeyLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wk = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${m}/${d} (${wk})`
}

/* ────────────────────────────────────────────────────────────────────── */
/* Day bucket                                                              */
/* ────────────────────────────────────────────────────────────────────── */

interface DayBucket {
  date: string
  expenses: TransactionDto[]
  incomes: TransactionDto[]
  transfers: TransactionDto[]
  expenseSum: number
  incomeSum: number
  count: number
}

function groupByDate(rows: TransactionDto[], dateOrder: string[] | null): DayBucket[] {
  const map = new Map<string, DayBucket>()
  if (dateOrder) {
    for (const date of dateOrder) {
      map.set(date, {
        date,
        expenses: [],
        incomes: [],
        transfers: [],
        expenseSum: 0,
        incomeSum: 0,
        count: 0
      })
    }
  }
  for (const tx of rows) {
    const k = dateKeyLocal(tx.occurredAt)
    let b = map.get(k)
    if (!b) {
      b = {
        date: k,
        expenses: [],
        incomes: [],
        transfers: [],
        expenseSum: 0,
        incomeSum: 0,
        count: 0
      }
      map.set(k, b)
    }
    if (tx.type === 'expense') {
      b.expenses.push(tx)
      b.expenseSum += tx.amount
    } else if (tx.type === 'income') {
      b.incomes.push(tx)
      b.incomeSum += tx.amount
    } else {
      b.transfers.push(tx)
    }
    b.count += 1
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

/* ────────────────────────────────────────────────────────────────────── */
/* Main                                                                    */
/* ────────────────────────────────────────────────────────────────────── */

export default function Transactions(): React.JSX.Element {
  const [list, setList] = useState<TransactionListResult | null>(null)
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tags, setTags] = useState<TagDto[]>([])
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])

  const [viewMonth, setViewMonth] = useState<string>(currentMonthStr())
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [advanced, setAdvanced] = useState<AdvancedFilter>(EMPTY_FILTER)
  const [filterOpen, setFilterOpen] = useState(false)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<TransactionDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  const toast = useToast()

  // Determines whether we're in "narrow filter" mode (search/filter active).
  // In that mode we hide empty days and auto-expand matching days.
  const isFiltering = useMemo(() => {
    if (debouncedSearch) return true
    if (advanced.from || advanced.to) return true
    if (advanced.categoryIds.length || advanced.accountIds.length || advanced.tagIds.length)
      return true
    if (advanced.minAmount || advanced.maxAmount) return true
    return false
  }, [debouncedSearch, advanced])

  const load = useCallback(async () => {
    // Default month bounds — overridden if user sets advanced.from/to.
    const { fromIso, toIso } = monthBoundsIso(viewMonth)
    const fromOverride = advanced.from
      ? localDateStartIso(advanced.from)
      : isFiltering
        ? undefined
        : fromIso
    const toOverride = advanced.to
      ? localDateEndIso(advanced.to)
      : isFiltering
        ? undefined
        : toIso

    // 카테고리/태그/계좌/통화를 먼저 받아 카테고리 트리로 후손 ID를 확장한 뒤
    // 트랜잭션 list를 호출. 사용자가 부모 카테고리만 선택해도 모든 자식 거래까지 잡힘.
    const [cats, tagList, acctList, ccy] = await Promise.all([
      window.api.categories.list(true),
      window.api.tags.list(true),
      window.api.accounts.list(true),
      window.api.currencies.list()
    ])
    const expandedCategoryIds = advanced.categoryIds.length
      ? expandToDescendants(advanced.categoryIds, cats)
      : []
    const txs = await window.api.transactions.list({
      limit: TX_FETCH_LIMIT,
      orderBy: 'occurredAt',
      orderDir: 'desc',
      search: debouncedSearch || undefined,
      from: fromOverride,
      to: toOverride,
      categoryIds: expandedCategoryIds.length ? expandedCategoryIds : undefined,
      accountIds: advanced.accountIds.length ? advanced.accountIds : undefined,
      tagIds: advanced.tagIds.length ? advanced.tagIds : undefined,
      tagsMatchMode: 'any'
    })
    setList(txs)
    setCategories(cats)
    setTags(tagList)
    setAccounts(acctList)
    setCurrencies(ccy)
    setSelected((prev) => {
      const next = new Set<string>()
      const visible = new Set(txs.rows.map((r) => r.id))
      for (const id of prev) if (visible.has(id)) next.add(id)
      return next
    })
  }, [viewMonth, debouncedSearch, advanced, isFiltering])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  // Min/max amount post-fetch.
  const visibleRows = useMemo(() => {
    if (!list) return []
    const min = advanced.minAmount ? parseAmountFilter(advanced.minAmount) : null
    const max = advanced.maxAmount ? parseAmountFilter(advanced.maxAmount) : null
    if (min == null && max == null) return list.rows
    return list.rows.filter((r) => {
      const a = Math.abs(r.amount)
      if (min != null && a < min) return false
      if (max != null && a > max) return false
      return true
    })
  }, [list, advanced.minAmount, advanced.maxAmount])

  // Build day buckets. Only days that actually have transactions are shown.
  const dayBuckets = useMemo<DayBucket[]>(() => {
    return groupByDate(visibleRows, null)
  }, [visibleRows])

  // Auto-expand matching days when filtering.
  useEffect(() => {
    if (isFiltering) {
      setExpanded(new Set(dayBuckets.map((b) => b.date)))
    } else {
      setExpanded(new Set()) // collapse all when returning to clean view
    }
  }, [isFiltering, dayBuckets])

  // Month-level totals.
  const monthTotals = useMemo(() => {
    let exp = 0
    let inc = 0
    let txCount = 0
    for (const b of dayBuckets) {
      exp += b.expenseSum
      inc += b.incomeSum
      txCount += b.count
    }
    return { exp, inc, net: inc - exp, count: txCount }
  }, [dayBuckets])

  // 필터 패널 안에서 보여줄 합산 (visibleRows 기준 — 다른 필터들도 적용된 결과).
  // 부모 카테고리 선택은 후손까지 자동 포함되어 이 합계도 후손 거래까지 반영됨.
  // 계좌 필터에도 동일한 패턴 — 사용자가 예적금/투자 등을 골랐을 때 합계를 바로 보고 싶을 것.
  // transferOut/transferIn은 amount(native) 기준으로 별도 표시.
  const categoryFilterTotals = useMemo(() => {
    if (advanced.categoryIds.length === 0) return null
    return computeFilterTotals(visibleRows)
  }, [visibleRows, advanced.categoryIds])

  const accountFilterTotals = useMemo(() => {
    if (advanced.accountIds.length === 0) return null
    return computeFilterTotals(visibleRows)
  }, [visibleRows, advanced.accountIds])

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (advanced.from) n++
    if (advanced.to) n++
    if (advanced.categoryIds.length) n++
    if (advanced.accountIds.length) n++
    if (advanced.tagIds.length) n++
    if (advanced.minAmount) n++
    if (advanced.maxAmount) n++
    return n
  }, [advanced])

  const allSelected = visibleRows.length > 0 && selected.size === visibleRows.length
  const partiallySelected = selected.size > 0 && !allSelected

  const toggleExpand = useCallback((date: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }, [])

  const toggleSelect = useCallback((id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function toggleSelectAll(): void {
    setSelected((prev) =>
      prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id))
    )
  }

  async function handleBulkDelete(): Promise<void> {
    if (selected.size === 0) return

    const ids = Array.from(selected)
    const snapshots = visibleRows.filter((r) => selected.has(r.id))

    await Promise.all(ids.map((id) => window.api.transactions.delete(id)))
    setSelected(new Set())
    await load()

    toast.show({
      tone: 'success',
      message: `${ids.length}건 삭제됨`,
      durationMs: UNDO_TOAST_DURATION_MS,
      action: {
        label: '되돌리기',
        onClick: async () => {
          for (const tx of snapshots) {
            const input: TransactionCreateInput = {
              type: tx.type,
              occurredAt: tx.occurredAt,
              amount: tx.amount,
              currency: tx.currency,
              categoryId: tx.categoryId,
              accountId: tx.accountId,
              counterAccountId: tx.counterAccountId,
              counterAmount: tx.counterAmount,
              originalAmount: tx.originalAmount,
              discountReason: tx.discountReason,
              payee: tx.payee,
              memo: tx.memo,
              paymentMethod: tx.paymentMethod,
              tagIds: tx.tagIds,
              fxRate: tx.fxRate,
              amountInBase: tx.amountInBase
            }
            try {
              await window.api.transactions.create(input)
            } catch (err) {
              toast.show({
                tone: 'error',
                message: `복구 중 오류: ${(err as Error).message}`
              })
            }
          }
          await load()
          toast.show({
            tone: 'info',
            message: `${snapshots.length}건 복구됨 (새 ID로 재생성)`
          })
        }
      }
    })
  }

  // Reset month nav goes to current month.
  function gotoCurrent(): void {
    setViewMonth(currentMonthStr())
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">거래 내역</h1>
          <p className="text-sm text-slate-400">
            {isFiltering
              ? `검색·필터 결과 ${formatInteger(visibleRows.length)}건`
              : `${monthLabel(viewMonth)} · 총 ${formatInteger(monthTotals.count)}건`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색 (지출처/메모/할인사유)"
            className="w-64 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          />
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activeFilterCount > 0
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            🔍 필터
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-sky-500/30 px-1.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 거래
          </button>
        </div>
      </header>

      {/* 컨텍스트(월 네비 또는 필터 정보) + 합계 띠 — 항상 표시 */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-3">
        {isFiltering ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
              🔍 필터 결과
            </span>
            <span className="text-slate-400">{formatInteger(monthTotals.count)}건</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
              aria-label="이전 달"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
            >
              ←
            </button>
            <input
              type="month"
              value={viewMonth}
              onChange={(e) => e.target.value && setViewMonth(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <button
              onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
              aria-label="다음 달"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300 hover:bg-slate-800"
            >
              →
            </button>
            <button
              onClick={gotoCurrent}
              className="ml-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            >
              오늘
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center">
            <Stat label="지출" value={monthTotals.exp} tone="rose" currencies={currencies} />
            <InfoTip side="bottom" width="w-72">
              현재 화면에 보이는 거래의 <b>지출 합계</b>입니다.
              <br />
              필터가 활성이면 그 결과의 합계, 아니면 그 달의 모든 지출 합계.
              <br />
              <br />
              💡 통장끼리 옮긴 돈(예: 적금 적립, 카드값 결제)은 「이체」 거래라 여기에 안
              잡힙니다.
            </InfoTip>
          </span>
          <span className="inline-flex items-center">
            <Stat label="수입" value={monthTotals.inc} tone="emerald" currencies={currencies} />
            <InfoTip side="bottom" width="w-72">
              현재 화면에 보이는 거래의 <b>수입 합계</b>입니다 (월급·이자·환급 등).
              <br />
              <br />
              💡 다른 통장에서 옮겨 받은 돈은 「이체」라 여기에 안 잡힙니다.
            </InfoTip>
          </span>
          <span className="inline-flex items-center">
            <Stat label="순흐름" value={monthTotals.net} tone="net" currencies={currencies} />
            <InfoTip side="bottom" width="w-64">
              <b>수입 − 지출</b> 입니다.
              <br />
              <br />
              양수(+)면 흑자, 음수(−)면 적자.
              <br />
              <br />
              실제로 통장에 모인 금액은 대시보드 「저축」 KPI를 참고하세요.
            </InfoTip>
          </span>
        </div>
      </section>

      {filterOpen && (
        <FilterPanel
          value={advanced}
          onChange={setAdvanced}
          categories={categories}
          accounts={accounts}
          tags={tags}
          currencies={currencies}
          categoryFilterTotals={categoryFilterTotals}
          accountFilterTotals={accountFilterTotals}
          onClear={() => setAdvanced(EMPTY_FILTER)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700/50 bg-slate-900/70 text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = partiallySelected
                  }}
                  onChange={toggleSelectAll}
                  aria-label="모두 선택"
                  className="h-4 w-4 cursor-pointer"
                />
              </th>
              <th className="px-4 py-2.5">
                <span className="inline-flex items-center">
                  날짜
                  <InfoTip side="bottom">
                    하루 단위로 묶어서 표시합니다. 거래가 있는 날만 표시되며, 행을 클릭하면 그
                    날의 모든 거래가 펼쳐집니다.
                  </InfoTip>
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">
                <span className="inline-flex items-center justify-end">
                  지출
                  <InfoTip side="bottom">
                    그 날 외부(가게·서비스)로 결제되어 빠져나간 돈의 합계.
                    <br />
                    <br />
                    💡 통장끼리 옮긴 돈(적금 적립·카드값 결제 등)은 「이체」 거래라 여기에 안
                    잡힙니다. 펼친 행 위에 ↔ 이체 띠로 따로 표시됩니다.
                  </InfoTip>
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">
                <span className="inline-flex items-center justify-end">
                  수입
                  <InfoTip side="bottom">
                    그 날 외부에서 통장으로 들어온 돈의 합계 (월급·이자 등).
                    <br />
                    <br />
                    💡 다른 통장에서 옮겨 받은 돈은 「이체」라 여기에 안 잡힙니다.
                  </InfoTip>
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">
                <span className="inline-flex items-center justify-end">
                  순흐름
                  <InfoTip side="bottom">그 날의 수입 − 지출. 그 날 흑자/적자 한눈에.</InfoTip>
                </span>
              </th>
              <th className="px-4 py-2.5 text-right">
                <span className="inline-flex items-center justify-end">
                  건수
                  <InfoTip side="bottom">
                    그 날 기록된 거래 건수(지출+수입+이체 모두 포함).
                  </InfoTip>
                </span>
              </th>
              <th className="w-9 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {dayBuckets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {(list?.total ?? 0) === 0 ? (
                    <>
                      거래가 없습니다.
                      <br />
                      상단의 <b>+ 새 거래</b> 버튼을 눌러 첫 거래를 기록해 보세요.
                    </>
                  ) : (
                    <>일치하는 거래가 없습니다.</>
                  )}
                </td>
              </tr>
            )}
            {dayBuckets.map((b) => (
              <DayRows
                key={b.date}
                bucket={b}
                expanded={expanded.has(b.date)}
                onToggle={() => toggleExpand(b.date)}
                catById={catById}
                acctById={acctById}
                tagById={tagById}
                currencies={currencies}
                selected={selected}
                onToggleSelect={toggleSelect}
                onClickTx={(tx) => setEditing(tx)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-slate-950/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-sm text-sky-200">
            <b>{selected.size}건</b> 선택됨
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              선택 해제
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="rounded-md border border-rose-500/60 bg-rose-500/20 px-3 py-1.5 text-sm font-medium text-rose-200 hover:bg-rose-500/30"
            >
              🗑 일괄 삭제
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={bulkDeleteConfirm}
        title="일괄 삭제"
        message={`선택한 ${selected.size}건의 거래를 삭제할까요?`}
        confirmLabel="삭제"
        danger
        onConfirm={() => {
          setBulkDeleteConfirm(false)
          handleBulkDelete()
        }}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      <TransactionForm open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <TransactionForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
        onDeleted={() => {
          load()
          toast.show({ tone: 'success', message: '거래가 삭제되었습니다.' })
        }}
      />
    </div>
  )
}

function parseAmountFilter(raw: string): number | null {
  const cleaned = raw.replace(/[\s,_]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/* ────────────────────────────────────────────────────────────────────── */
/* Day rows (header + expanded detail)                                     */
/* ────────────────────────────────────────────────────────────────────── */

function DayRows({
  bucket,
  expanded,
  onToggle,
  catById,
  acctById,
  tagById,
  currencies,
  selected,
  onToggleSelect,
  onClickTx
}: {
  bucket: DayBucket
  expanded: boolean
  onToggle: () => void
  catById: Map<string, CategoryDto>
  acctById: Map<string, AccountDto>
  tagById: Map<string, TagDto>
  currencies: CurrencyDto[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onClickTx: (tx: TransactionDto) => void
}): React.JSX.Element {
  const empty = bucket.count === 0
  const net = bucket.incomeSum - bucket.expenseSum
  const baseCcy = currencies[0]?.code ?? 'KRW' // for display fallback
  // Preferred currency = first transaction currency, else base.
  const ccy =
    bucket.expenses[0]?.currency ??
    bucket.incomes[0]?.currency ??
    bucket.transfers[0]?.currency ??
    baseCcy

  const allDayIds = useMemo(
    () => [...bucket.expenses, ...bucket.incomes, ...bucket.transfers].map((t) => t.id),
    [bucket]
  )
  const dayAllSelected = allDayIds.length > 0 && allDayIds.every((id) => selected.has(id))

  function toggleDayAll(): void {
    // If all selected, deselect all of this day. Else select all.
    if (dayAllSelected) {
      for (const id of allDayIds) onToggleSelect(id)
    } else {
      for (const id of allDayIds) if (!selected.has(id)) onToggleSelect(id)
    }
  }

  return (
    <>
      <tr
        onClick={empty ? undefined : onToggle}
        className={`border-b border-slate-800/50 transition ${
          empty
            ? 'text-slate-600'
            : `cursor-pointer ${expanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'}`
        }`}
      >
        <td className="px-3 py-2">
          {!empty && (
            <input
              type="checkbox"
              checked={dayAllSelected}
              onChange={toggleDayAll}
              onClick={(e) => e.stopPropagation()}
              aria-label="이 날 모두 선택"
              className="h-4 w-4 cursor-pointer"
            />
          )}
        </td>
        <td className="px-4 py-2 font-mono text-xs">
          <span className={empty ? 'text-slate-600' : 'text-slate-300'}>{dayLabel(bucket.date)}</span>
        </td>
        <td className="px-4 py-2 text-right font-mono">
          {bucket.expenseSum > 0 ? (
            <span className="text-rose-300">
              -{formatMoney(bucket.expenseSum, ccy, currencies)}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="px-4 py-2 text-right font-mono">
          {bucket.incomeSum > 0 ? (
            <span className="text-emerald-300">
              +{formatMoney(bucket.incomeSum, ccy, currencies)}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="px-4 py-2 text-right font-mono">
          {empty ? (
            <span className="text-slate-600">—</span>
          ) : net === 0 ? (
            <span className="text-slate-400">0</span>
          ) : (
            <span className={net > 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {net > 0 ? '+' : ''}
              {formatMoney(net, ccy, currencies)}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-right text-xs text-slate-400">
          {empty ? '' : `${bucket.count}건`}
        </td>
        <td className="px-3 py-2 text-center text-slate-500">
          {empty ? '' : expanded ? '▼' : '▶'}
        </td>
      </tr>

      {expanded && !empty && (
        <tr className="bg-slate-950/40">
          <td colSpan={7} className="px-3 py-3">
            <DayDetail
              bucket={bucket}
              catById={catById}
              acctById={acctById}
              tagById={tagById}
              currencies={currencies}
              selected={selected}
              onToggleSelect={onToggleSelect}
              onClickTx={onClickTx}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function DayDetail({
  bucket,
  catById,
  acctById,
  tagById,
  currencies,
  selected,
  onToggleSelect,
  onClickTx
}: {
  bucket: DayBucket
  catById: Map<string, CategoryDto>
  acctById: Map<string, AccountDto>
  tagById: Map<string, TagDto>
  currencies: CurrencyDto[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onClickTx: (tx: TransactionDto) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {/* Transfers strip */}
      {bucket.transfers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700/40 bg-slate-900/40 px-3 py-2">
          <span className="text-xs text-slate-400">↔ 이체</span>
          {bucket.transfers.map((tx) => (
            <button
              key={tx.id}
              onClick={() => onClickTx(tx)}
              className="rounded-md border border-slate-700/50 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800/60"
              title={tx.memo ?? ''}
            >
              {acctById.get(tx.accountId ?? '')?.name ?? '?'}
              {' → '}
              {acctById.get(tx.counterAccountId ?? '')?.name ?? '?'}
              {' · '}
              <span className="font-mono">
                {formatMoney(tx.amount, tx.currency, currencies)} {tx.currency}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Two-column grid: expenses ↔ incomes */}
      <div className="grid gap-3 md:grid-cols-2">
        <ColumnList
          title="💸 지출"
          tone="expense"
          rows={bucket.expenses}
          catById={catById}
          tagById={tagById}
          currencies={currencies}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onClickTx={onClickTx}
        />
        <ColumnList
          title="💰 수입"
          tone="income"
          rows={bucket.incomes}
          catById={catById}
          tagById={tagById}
          currencies={currencies}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onClickTx={onClickTx}
        />
      </div>
    </div>
  )
}

function ColumnList({
  title,
  tone,
  rows,
  catById,
  tagById,
  currencies,
  selected,
  onToggleSelect,
  onClickTx
}: {
  title: string
  tone: 'expense' | 'income'
  rows: TransactionDto[]
  catById: Map<string, CategoryDto>
  tagById: Map<string, TagDto>
  currencies: CurrencyDto[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onClickTx: (tx: TransactionDto) => void
}): React.JSX.Element {
  const headerColor = tone === 'expense' ? 'text-rose-300' : 'text-emerald-300'
  const sign = tone === 'expense' ? '-' : '+'
  const amtColor = tone === 'expense' ? 'text-rose-300' : 'text-emerald-300'
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const ccy = rows[0]?.currency ?? currencies[0]?.code ?? 'KRW'

  return (
    <div className="rounded-md border border-slate-700/40 bg-slate-900/40">
      <header
        className={`flex items-center justify-between border-b border-slate-700/40 px-3 py-1.5 text-xs ${headerColor}`}
      >
        <span className="font-medium">
          {title} <span className="text-slate-500">({rows.length})</span>
        </span>
        {rows.length > 0 && (
          <span className="font-mono">
            {sign}
            {formatMoney(total, ccy, currencies)}
          </span>
        )}
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-slate-600">없음</div>
      ) : (
        <ul className="divide-y divide-slate-800/40">
          {rows.map((tx) => {
            const isChecked = selected.has(tx.id)
            const catName = tx.categoryId ? (catById.get(tx.categoryId)?.name ?? null) : null
            const tagNames = tx.tagIds
              .map((id) => tagById.get(id)?.name ?? null)
              .filter((n): n is string => Boolean(n))
            const hasDiscount =
              tx.originalAmount != null && tx.originalAmount > tx.amount
            return (
              <li
                key={tx.id}
                onClick={() => onClickTx(tx)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
                  isChecked ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleSelect(tx.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="선택"
                  className="h-4 w-4 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-slate-200">
                      {tx.payee ?? tx.memo ?? catName ?? '—'}
                    </span>
                    {hasDiscount && <DiscountBadge tx={tx} currencies={currencies} compact />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    {catName && <span>{catName}</span>}
                    {tagNames.length > 0 && (
                      <>
                        <span className="text-slate-700">·</span>
                        {tagNames.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-400"
                          >
                            {t}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className={`whitespace-nowrap font-mono text-sm ${amtColor}`}>
                  {sign}
                  {formatMoney(tx.amount, tx.currency, currencies)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Stat (header pill)                                                      */
/* ────────────────────────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  tone,
  currencies
}: {
  label: string
  value: number
  tone: 'rose' | 'emerald' | 'net'
  currencies: CurrencyDto[]
}): React.JSX.Element {
  const ccy = currencies[0]?.code ?? 'KRW'
  let color = 'text-slate-200'
  if (tone === 'rose') color = 'text-rose-300'
  else if (tone === 'emerald') color = 'text-emerald-300'
  else if (tone === 'net') color = value < 0 ? 'text-rose-300' : value > 0 ? 'text-emerald-300' : 'text-slate-300'
  const sign = tone === 'rose' ? '-' : tone === 'emerald' ? '+' : value > 0 ? '+' : ''
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-mono text-sm ${color}`}>
        {value === 0 && tone === 'net' ? '0' : `${sign}${formatMoney(Math.abs(value), ccy, currencies)}`}
      </span>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────── */
/* Filter panel                                                            */
/* ────────────────────────────────────────────────────────────────────── */

function FilterPanel({
  value,
  onChange,
  categories,
  accounts,
  tags,
  currencies,
  categoryFilterTotals,
  accountFilterTotals,
  onClear
}: {
  value: AdvancedFilter
  onChange: (v: AdvancedFilter) => void
  categories: CategoryDto[]
  accounts: AccountDto[]
  tags: TagDto[]
  currencies: CurrencyDto[]
  categoryFilterTotals: FilterTotals | null
  accountFilterTotals: FilterTotals | null
  onClear: () => void
}): React.JSX.Element {
  const setField = <K extends keyof AdvancedFilter>(k: K, v: AdvancedFilter[K]): void =>
    onChange({ ...value, [k]: v })

  // 카테고리 후손 개수 미리 계산 (각 루트의 직접·간접 자식 개수)
  const descendantCountByRoot = useMemo(() => {
    const childrenOf = new Map<string, string[]>()
    for (const c of categories) {
      if (c.parentId) {
        const arr = childrenOf.get(c.parentId) ?? []
        arr.push(c.id)
        childrenOf.set(c.parentId, arr)
      }
    }
    const m = new Map<string, number>()
    const countDescendants = (rootId: string): number => {
      let n = 0
      const walk = (id: string): void => {
        const kids = childrenOf.get(id) ?? []
        n += kids.length
        for (const k of kids) walk(k)
      }
      walk(rootId)
      return n
    }
    for (const c of categories) {
      if (!c.parentId) m.set(c.id, countDescendants(c.id))
    }
    return m
  }, [categories])

  const baseCcy = currencies[0]?.code ?? 'KRW'

  return (
    <section className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
      <p className="flex items-center text-xs text-slate-500">
        💡 필터를 적용하면 월 선택과 무관하게 전체 기간에서 검색합니다.
        <InfoTip side="bottom">
          여러 조건을 동시에 적용하면 <b>모두 만족하는 거래</b>만 표시됩니다 (AND 조건).
          <br />
          <br />
          예: 「식비」 카테고리 + 「KB국민은행」 계좌 + 「3만원 이상」 → 세 조건 모두 만족하는
          거래만.
          <br />
          <br />
          태그는 여러 개 선택 시 <b>하나라도 일치</b>하는 거래(OR)로 처리됩니다.
        </InfoTip>
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="기간 — 시작일">
          <input
            type="date"
            value={value.from}
            onChange={(e) => setField('from', e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Field>
        <Field label="기간 — 종료일">
          <input
            type="date"
            value={value.to}
            onChange={(e) => setField('to', e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Field>
        <Field label="금액 (이상)">
          <input
            type="text"
            inputMode="numeric"
            value={value.minAmount}
            onChange={(e) => setField('minAmount', e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-right font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Field>
        <Field label="금액 (이하)">
          <input
            type="text"
            inputMode="numeric"
            value={value.maxAmount}
            onChange={(e) => setField('maxAmount', e.target.value.replace(/[^\d]/g, ''))}
            placeholder="제한 없음"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-right font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Field>
      </div>

      <Field
        label={`카테고리 (${value.categoryIds.length}개 선택 · 자식 카테고리는 자동 포함)`}
        info={
          <>
            <b>최상위 카테고리</b>(식비·교통·쇼핑 등)만 칩으로 표시됩니다.
            <br />
            <br />
            루트를 선택하면 그 아래 자식 카테고리(예: 「식비/외식」, 「식비/카페」)의 거래도
            자동으로 포함됩니다. <b>(+N)</b>은 그 루트의 자식 개수.
            <br />
            <br />
            <b>선택 합계</b>는 카테고리 + 다른 필터 모두 적용된 결과의 지출/수입/순흐름입니다.
          </>
        }
      >
        <ChipMultiSelect
          options={categories
            .filter((c) => !c.isArchived && !c.parentId)
            .map((c) => {
              const childCount = descendantCountByRoot.get(c.id) ?? 0
              return {
                id: c.id,
                label:
                  `${c.icon ? c.icon + ' ' : ''}${c.name}` +
                  (childCount > 0 ? ` (+${childCount})` : '')
              }
            })}
          selected={value.categoryIds}
          onChange={(ids) => setField('categoryIds', ids)}
        />
        {categoryFilterTotals && categoryFilterTotals.count > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-700/40 bg-slate-950/40 px-3 py-2 text-xs">
            <span className="text-slate-400">선택 합계 ({categoryFilterTotals.count}건)</span>
            <span className="text-slate-700">·</span>
            <span className="text-rose-300">
              지출 -{formatMoney(categoryFilterTotals.exp, baseCcy, currencies)}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-emerald-300">
              수입 +{formatMoney(categoryFilterTotals.inc, baseCcy, currencies)}
            </span>
            <span className="text-slate-700">·</span>
            <span
              className={
                categoryFilterTotals.net > 0
                  ? 'text-emerald-300'
                  : categoryFilterTotals.net < 0
                    ? 'text-rose-300'
                    : 'text-slate-300'
              }
            >
              순흐름 {categoryFilterTotals.net > 0 ? '+' : ''}
              {formatMoney(categoryFilterTotals.net, baseCcy, currencies)}
            </span>
          </div>
        )}
      </Field>

      <Field
        label={`계좌 (${value.accountIds.length}개 선택)`}
        info={
          <>
            선택한 통장과 관련된 거래만 표시합니다 (지출·수입·이체 모두 포함).
            <br />
            <br />
            💡 <b>예적금/투자 통장을 모두 선택</b>하면 <b>↔ 이체 net</b>이 대시보드 「저축 (이번
            달)」 KPI와 일치합니다 (단일 통화 기준).
          </>
        }
      >
        <ChipMultiSelect
          options={accounts
            .filter((a) => !a.isArchived)
            .map((a) => ({ id: a.id, label: `${a.icon ? a.icon + ' ' : ''}${a.name}` }))}
          selected={value.accountIds}
          onChange={(ids) => setField('accountIds', ids)}
        />
        {accountFilterTotals && accountFilterTotals.count > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-slate-700/40 bg-slate-950/40 px-3 py-2 text-xs">
            <span className="text-slate-400">선택 합계 ({accountFilterTotals.count}건)</span>
            <span className="text-slate-700">·</span>
            <span className="text-rose-300">
              지출 -{formatMoney(accountFilterTotals.exp, baseCcy, currencies)}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-emerald-300">
              수입 +{formatMoney(accountFilterTotals.inc, baseCcy, currencies)}
            </span>
            {(accountFilterTotals.transferIn > 0 || accountFilterTotals.transferOut > 0) && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-sky-300">
                  ↔ 이체 in {formatMoney(accountFilterTotals.transferIn, baseCcy, currencies)} /
                  out {formatMoney(accountFilterTotals.transferOut, baseCcy, currencies)} (net{' '}
                  {accountFilterTotals.transferIn - accountFilterTotals.transferOut > 0 ? '+' : ''}
                  {formatMoney(
                    accountFilterTotals.transferIn - accountFilterTotals.transferOut,
                    baseCcy,
                    currencies
                  )}
                  )
                </span>
              </>
            )}
          </div>
        )}
      </Field>

      <Field
        label={`태그 (${value.tagIds.length}개 선택)`}
        info={
          <>
            선택한 태그가 <b>하나라도 붙어 있는</b> 거래(OR 조건). 한 거래에 여러 태그가
            동시에 붙을 수 있어요 (#출장, #구독 등).
          </>
        }
      >
        <ChipMultiSelect
          options={tags
            .filter((t) => !t.isArchived)
            .map((t) => ({ id: t.id, label: t.name }))}
          selected={value.tagIds}
          onChange={(ids) => setField('tagIds', ids)}
        />
      </Field>

      <div className="flex justify-end">
        <button
          onClick={onClear}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          필터 초기화
        </button>
      </div>
    </section>
  )
}

function Field({
  label,
  children,
  info
}: {
  label: string
  children: React.ReactNode
  info?: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 flex items-center text-xs text-slate-400">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </label>
      {children}
    </div>
  )
}

function ChipMultiSelect({
  options,
  selected,
  onChange
}: {
  options: Array<{ id: string; label: string }>
  selected: string[]
  onChange: (ids: string[]) => void
}): React.JSX.Element {
  const sel = new Set(selected)
  return (
    <div className="flex max-h-36 flex-wrap gap-1 overflow-auto rounded-md border border-slate-700 bg-slate-950 p-2">
      {options.length === 0 ? (
        <span className="px-1 py-0.5 text-xs text-slate-500">옵션 없음</span>
      ) : (
        options.map((o) => {
          const active = sel.has(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() =>
                onChange(active ? selected.filter((id) => id !== o.id) : [...selected, o.id])
              }
              className={`rounded-full border px-2 py-0.5 text-xs transition ${
                active
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-100'
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {o.label}
            </button>
          )
        })
      )}
    </div>
  )
}


function DiscountBadge({
  tx,
  currencies,
  compact = false
}: {
  tx: TransactionDto
  currencies: CurrencyDto[]
  compact?: boolean
}): React.JSX.Element {
  const discount = (tx.originalAmount ?? 0) - tx.amount
  const rate = tx.originalAmount ? (discount / tx.originalAmount) * 100 : 0
  const title =
    `원가 ${formatMoney(tx.originalAmount ?? 0, tx.currency, currencies)} ${tx.currency} → ` +
    `실결제 ${formatMoney(tx.amount, tx.currency, currencies)} ${tx.currency}` +
    (tx.discountReason ? ` (${tx.discountReason})` : '')
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded bg-emerald-500/15 ${compact ? 'px-1 py-0' : 'px-1.5 py-0.5'} text-[10px] font-normal text-emerald-300`}
    >
      🔖 -{rate.toFixed(0)}%
    </span>
  )
}
