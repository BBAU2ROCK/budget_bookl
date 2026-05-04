import { memo, useEffect, useMemo, useState } from 'react'
import type {
  BudgetCreateInput,
  BudgetDto,
  CategoryTreeNode,
  CurrencyDto
} from '../../../../shared/types'
import Modal from '../Modal'
import { formatLiveInput, formatMoneyForInput, parseMoneyInput } from '../../lib/money-input'

interface CategoryOption {
  id: string
  name: string
  icon: string | null
  depth: number
  path: string
}

interface Props {
  open: boolean
  initial?: BudgetDto | null
  defaultCategoryId?: string | null
  defaultPeriod?: { year: number; month: number }
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

function BudgetForm({
  open,
  initial,
  defaultCategoryId,
  defaultPeriod,
  onClose,
  onSaved,
  onDeleted
}: Props): React.JSX.Element | null {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [periodYear, setPeriodYear] = useState<number>(new Date().getFullYear())
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1)
  const [amountStr, setAmountStr] = useState<string>('0')
  const [currency, setCurrency] = useState<string>('KRW')
  const [includesDescendants, setIncludesDescendants] = useState<boolean>(true)
  const [carryOver, setCarryOver] = useState<boolean>(false)
  const [notes, setNotes] = useState<string>('')

  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    Promise.all([window.api.categories.tree(), window.api.currencies.list()]).then(
      ([tree, ccy]) => {
        setCategoryTree(tree)
        setCurrencies(ccy)
      }
    )
    if (initial) {
      setCategoryId(initial.categoryId)
      setPeriodYear(initial.periodYear)
      setPeriodMonth(initial.periodMonth)
      setCurrency(initial.currency)
      setIncludesDescendants(initial.includesDescendants)
      setCarryOver(initial.carryOver)
      setNotes(initial.notes ?? '')
    } else {
      setCategoryId(defaultCategoryId ?? null)
      setPeriodYear(defaultPeriod?.year ?? new Date().getFullYear())
      setPeriodMonth(defaultPeriod?.month ?? new Date().getMonth() + 1)
      setAmountStr('0')
      setCurrency('KRW')
      setIncludesDescendants(true)
      setCarryOver(false)
      setNotes('')
    }
    setError(null)
  }, [open, initial, defaultCategoryId, defaultPeriod])

  useEffect(() => {
    if (!initial || currencies.length === 0) return
    setAmountStr(formatMoneyForInput(initial.amount, initial.currency, currencies))
  }, [initial, currencies])

  // Flatten the expense subtree, preserving traversal order with depth info.
  // Archived nodes (and their subtrees) are skipped so their depth labels
  // don't become misleading.
  const expenseCategoryOptions = useMemo<CategoryOption[]>(() => {
    const out: CategoryOption[] = []
    const walk = (n: CategoryTreeNode): void => {
      if (n.kind !== 'expense' || n.isArchived) return
      out.push({ id: n.id, name: n.name, icon: n.icon, depth: n.depth, path: n.path })
      n.children.forEach(walk)
    }
    categoryTree.forEach(walk)
    return out
  }, [categoryTree])

  async function handleSubmit(): Promise<void> {
    setError(null)
    setSubmitting(true)
    try {
      const amount = parseMoneyInput(amountStr, currency, currencies)
      if (amount < 0) throw new Error('예산 금액은 0 이상이어야 합니다.')

      const input: BudgetCreateInput = {
        categoryId,
        periodYear,
        periodMonth,
        amount,
        currency,
        includesDescendants,
        carryOver,
        notes: notes.trim() || null
      }
      if (initial) {
        await window.api.budgets.update({ id: initial.id, ...input })
      } else {
        await window.api.budgets.create(input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!initial) return
    if (!confirm('이 예산을 삭제하시겠습니까?')) return
    await window.api.budgets.delete(initial.id)
    onDeleted?.()
    onClose()
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '예산 편집' : '새 예산'}
      size="md"
      footer={
        <>
          {initial && (
            <button
              onClick={handleDelete}
              className="mr-auto rounded-md border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/25"
            >
              삭제
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-400">카테고리</label>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">(전체 예산)</option>
            {expenseCategoryOptions.map((c) => {
              // <option>은 일반 공백을 collapse하므로 NBSP(U+00A0) 3개 / 깊이로 들여쓰기.
              // 자식 노드에는 트리 코너 '└ ' 접두어.
              const indent = '   '.repeat(c.depth)
              const prefix = c.depth > 0 ? '└ ' : ''
              const icon = c.icon ? `${c.icon} ` : ''
              return (
                <option key={c.id} value={c.id} title={c.path}>
                  {`${indent}${prefix}${icon}${c.name}`}
                </option>
              )
            })}
          </select>
          <div className="mt-1 text-xs text-slate-500">
            전체 예산은 모든 카테고리의 합 한도. 카테고리 예산은 그 카테고리만.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">연도</label>
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={9999}
              value={periodYear}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                if (digits) setPeriodYear(parseInt(digits, 10))
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">월</label>
            <select
              value={periodMonth}
              onChange={(e) => setPeriodMonth(parseInt(e.target.value, 10))}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">예산 금액</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onFocus={() => {
                if (amountStr === '0') setAmountStr('')
              }}
              onBlur={() => {
                if (!amountStr) setAmountStr('0')
              }}
              onChange={(e) => setAmountStr(formatLiveInput(e.target.value))}
              placeholder="500,000"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {categoryId && (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={includesDescendants}
              onChange={(e) => setIncludesDescendants(e.target.checked)}
              className="h-4 w-4"
            />
            <span>하위 카테고리 거래도 합산</span>
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={carryOver}
            onChange={(e) => setCarryOver(e.target.checked)}
            className="h-4 w-4"
          />
          <span>다음 달로 미사용 잔액 이월</span>
        </label>

        <div>
          <label className="mb-1 block text-xs text-slate-400">메모 (선택)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default memo(BudgetForm)
