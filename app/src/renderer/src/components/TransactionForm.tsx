import { memo, useEffect, useMemo, useState } from 'react'
import type {
  AccountDto,
  CategoryDto,
  CurrencyDto,
  TransactionCreateInput,
  TransactionDto,
  TransactionSplitInput,
  TransactionType
} from '../../../shared/types'
import Modal, { ConfirmDialog } from './Modal'
import CategoryPicker from './CategoryPicker'
import TagMultiSelect from './TagMultiSelect'
import { formatMoneyForInput, parseMoneyInput, formatLiveInput } from '../lib/money-input'

interface SplitDraft {
  /** Stable key for React; not the persisted id (server mints those). */
  uiKey: string
  categoryId: string | null
  amountStr: string
  memo: string
}

let _splitKeyCounter = 0
function nextSplitKey(): string {
  _splitKeyCounter += 1
  return `s${_splitKeyCounter}`
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
  initial?: TransactionDto | null
}

const TYPE_OPTIONS: Array<{ key: TransactionType; label: string; tone: string }> = [
  { key: 'expense', label: '지출', tone: 'bg-rose-500/20 text-rose-200 border-rose-500/60' },
  { key: 'income', label: '수입', tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/60' },
  { key: 'transfer', label: '이체', tone: 'bg-slate-500/20 text-slate-200 border-slate-500/60' }
]

export default function TransactionForm({
  open,
  onClose,
  onSaved,
  onDeleted,
  initial
}: Props): React.JSX.Element | null {
  const [type, setType] = useState<TransactionType>('expense')
  const [occurredAt, setOccurredAt] = useState<string>(new Date().toISOString().slice(0, 10))
  const [amountStr, setAmountStr] = useState<string>('0')
  const [currency, setCurrency] = useState<string>('KRW')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [counterAccountId, setCounterAccountId] = useState<string | null>(null)
  const [counterAmountStr, setCounterAmountStr] = useState<string>('')
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  // Discount state
  const [originalAmountStr, setOriginalAmountStr] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [discountReasonSuggestions, setDiscountReasonSuggestions] = useState<string[]>([])
  const [discountReasonFocus, setDiscountReasonFocus] = useState(false)

  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [accounts, setAccounts] = useState<AccountDto[]>([])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Split state — when enabled, the parent's category is ignored and each
  // split contributes to its own category for breakdowns/budgets.
  const [useSplits, setUseSplits] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [splits, setSplits] = useState<SplitDraft[]>([])
  // Picker context: when set to a uiKey, the next CategoryPicker pick goes
  // to that split row instead of the parent category.
  const [splitPickerKey, setSplitPickerKey] = useState<string | null>(null)

  // Load reference data & seed form
  useEffect(() => {
    if (!open) return
    Promise.all([
      window.api.currencies.list(),
      window.api.categories.list(),
      window.api.accounts.list(),
      window.api.transactions.distinctDiscountReasons()
    ]).then(([c, cat, a, reasons]) => {
      setCurrencies(c)
      setCategories(cat)
      setAccounts(a)
      setDiscountReasonSuggestions(reasons)
    })

    if (initial) {
      setType(initial.type)
      setOccurredAt(initial.occurredAt.slice(0, 10))
      setCurrency(initial.currency)
      setCategoryId(initial.categoryId)
      setAccountId(initial.accountId)
      setCounterAccountId(initial.counterAccountId)
      setPayee(initial.payee ?? '')
      setMemo(initial.memo ?? '')
      setPaymentMethod(initial.paymentMethod ?? '')
      setTagIds(initial.tagIds)
      setDiscountReason(initial.discountReason ?? '')
      // Splits — seed only if existing
      if (initial.splits && initial.splits.length > 0) {
        setUseSplits(true)
        // amount strings are populated after currencies load (next effect)
        setSplits(
          initial.splits.map((sp) => ({
            uiKey: nextSplitKey(),
            categoryId: sp.categoryId,
            amountStr: '0',
            memo: sp.memo ?? ''
          }))
        )
      } else {
        setUseSplits(false)
        setSplits([])
      }
      // Amount conversions deferred until currencies list loaded
    } else {
      setType('expense')
      setOccurredAt(new Date().toISOString().slice(0, 10))
      setAmountStr('0')
      setCurrency('KRW')
      setCategoryId(null)
      setAccountId(null)
      setCounterAccountId(null)
      setCounterAmountStr('')
      setOriginalAmountStr('')
      setDiscountReason('')
      setPayee('')
      setMemo('')
      setPaymentMethod('')
      setTagIds([])
      setUseSplits(false)
      setSplits([])
    }
    setError(null)
  }, [open, initial])

  // Once currencies are loaded, convert initial amount to display string
  useEffect(() => {
    if (!initial || currencies.length === 0) return
    setAmountStr(formatMoneyForInput(initial.amount, initial.currency, currencies))
    if (initial.counterAmount != null) {
      // counter_amount is in counter account's currency
      const counterCcy = accounts.find((a) => a.id === initial.counterAccountId)?.currency
      if (counterCcy) {
        setCounterAmountStr(formatMoneyForInput(initial.counterAmount, counterCcy, currencies))
      }
    }
    setOriginalAmountStr(
      initial.originalAmount != null
        ? formatMoneyForInput(initial.originalAmount, initial.currency, currencies)
        : ''
    )
    // Convert split amounts into display strings using parent's currency.
    if (initial.splits && initial.splits.length > 0) {
      setSplits(
        initial.splits.map((sp) => ({
          uiKey: nextSplitKey(),
          categoryId: sp.categoryId,
          amountStr: formatMoneyForInput(sp.amount, initial.currency, currencies),
          memo: sp.memo ?? ''
        }))
      )
    }
  }, [initial, currencies, accounts])

  const categoryLabel = useMemo(() => {
    if (!categoryId) return '카테고리 선택 (선택)'
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return '선택 안됨'
    // Walk up for path
    const parts = [cat.name]
    let cur = cat
    while (cur.parentId) {
      const p = categories.find((x) => x.id === cur.parentId)
      if (!p) break
      parts.unshift(p.name)
      cur = p
    }
    return `${cat.icon ? cat.icon + ' ' : ''}${parts.join(' › ')}`
  }, [categoryId, categories])

  const sourceAccount = accounts.find((a) => a.id === accountId)
  const counterAccount = accounts.find((a) => a.id === counterAccountId)
  const isCrossCurrency =
    type === 'transfer' &&
    !!sourceAccount &&
    !!counterAccount &&
    sourceAccount.currency !== counterAccount.currency

  async function handleSubmit(): Promise<void> {
    setError(null)
    setSubmitting(true)
    try {
      const amount = parseMoneyInput(amountStr, currency, currencies)
      if (amount <= 0) throw new Error('금액을 입력해 주세요.')
      if (type === 'transfer' && !accountId) throw new Error('이체는 출금 계좌가 필요합니다.')
      if (type === 'transfer' && !counterAccountId)
        throw new Error('이체는 입금 계좌가 필요합니다.')
      if (type === 'transfer' && accountId === counterAccountId)
        throw new Error('출금 계좌와 입금 계좌가 달라야 합니다.')

      let counterAmount: number | null = null
      if (isCrossCurrency && counterAccount) {
        const parsed = parseMoneyInput(counterAmountStr, counterAccount.currency, currencies)
        counterAmount = parsed > 0 ? parsed : null // null → auto-compute by FX
      }

      // Parse original amount (discount field)
      let originalAmount: number | null = null
      if (type !== 'transfer' && originalAmountStr.trim()) {
        const parsed = parseMoneyInput(originalAmountStr, currency, currencies)
        if (parsed <= 0) {
          originalAmount = null // treat 0/negative as "no discount"
        } else if (parsed < amount) {
          throw new Error('할인 전 금액은 실결제 금액 이상이어야 합니다.')
        } else {
          originalAmount = parsed
        }
      }

      // Build splits if enabled. Validation mirrors the repo's checks so errors
      // surface before hitting IPC.
      let splitsInput: TransactionSplitInput[] | undefined
      if (useSplits && type !== 'transfer') {
        if (splits.length < 2) {
          throw new Error('분할은 최소 2개 항목이 필요합니다.')
        }
        let total = 0
        const parsed: TransactionSplitInput[] = []
        for (const sp of splits) {
          const v = parseMoneyInput(sp.amountStr, currency, currencies)
          if (!Number.isFinite(v) || v <= 0) {
            throw new Error('각 분할 항목의 금액을 입력해 주세요.')
          }
          total += v
          parsed.push({
            categoryId: sp.categoryId,
            amount: v,
            memo: sp.memo.trim() || null
          })
        }
        if (total !== amount) {
          throw new Error(
            `분할 합계(${total.toLocaleString()})가 거래 금액(${amount.toLocaleString()})과 일치해야 합니다.`
          )
        }
        splitsInput = parsed
      }

      const input: TransactionCreateInput = {
        type,
        occurredAt: new Date(occurredAt).toISOString(),
        amount,
        currency: type === 'transfer' && sourceAccount ? sourceAccount.currency : currency,
        categoryId: type === 'transfer' ? null : categoryId,
        accountId,
        counterAccountId: type === 'transfer' ? counterAccountId : null,
        counterAmount,
        originalAmount,
        discountReason:
          type !== 'transfer' && discountReason.trim() && originalAmount !== null
            ? discountReason.trim()
            : null,
        payee: payee.trim() || null,
        memo: memo.trim() || null,
        paymentMethod: paymentMethod.trim() || null,
        tagIds,
        splits: splitsInput,
        // When splits exist on edit but the user disabled them, send empty array
        // to clear server-side splits (the repo treats `[]` as "remove all").
        ...(initial && initial.splits.length > 0 && !useSplits
          ? { splits: [] as TransactionSplitInput[] }
          : {})
      }

      if (initial) {
        await window.api.transactions.update({ id: initial.id, ...input })
      } else {
        await window.api.transactions.create(input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Split helpers ───────────────────────────────────────────────────────
  const splitTotal = useMemo(() => {
    if (!useSplits) return 0
    return splits.reduce((acc, sp) => {
      const v = parseMoneyInput(sp.amountStr, currency, currencies)
      return Number.isFinite(v) && v > 0 ? acc + v : acc
    }, 0)
  }, [splits, useSplits, currency, currencies])

  const parsedAmount = useMemo(
    () => parseMoneyInput(amountStr, currency, currencies),
    [amountStr, currency, currencies]
  )
  const splitDiff = parsedAmount - splitTotal

  function addSplit(): void {
    setSplits((prev) => [
      ...prev,
      { uiKey: nextSplitKey(), categoryId: null, amountStr: '', memo: '' }
    ])
  }

  function removeSplit(uiKey: string): void {
    setSplits((prev) => prev.filter((s) => s.uiKey !== uiKey))
  }

  function patchSplit(uiKey: string, patch: Partial<SplitDraft>): void {
    setSplits((prev) => prev.map((s) => (s.uiKey === uiKey ? { ...s, ...patch } : s)))
  }

  function categoryDisplayLabel(catId: string | null): string {
    if (!catId) return '카테고리 선택'
    const cat = categories.find((c) => c.id === catId)
    if (!cat) return '선택 안됨'
    return `${cat.icon ? cat.icon + ' ' : ''}${cat.name}`
  }

  async function performDelete(): Promise<void> {
    if (!initial) return
    await window.api.transactions.delete(initial.id)
    onDeleted?.()
    onClose()
  }

  if (!open) return null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={initial ? '거래 편집' : '새 거래 입력'}
        size="md"
        footer={
          <>
            {initial && (
              <button
                onClick={() => setDeleteConfirm(true)}
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
        {/* Type selector */}
        <div className="mb-4 flex gap-2">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setType(opt.key)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                type === opt.key
                  ? opt.tone
                  : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-sm">
          <Row label="날짜">
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </Row>

          <Row label="금액">
            <div className="flex gap-2">
                <input
                  type="text"
                  value={amountStr}
                  onFocus={() => {
                    if (amountStr === '0') setAmountStr('')
                  }}
                  onBlur={() => {
                    if (!amountStr) setAmountStr('0')
                  }}
                  onChange={(e) => setAmountStr(formatLiveInput(e.target.value))}
                  placeholder="0"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={type === 'transfer' && !!sourceAccount}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-60"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>
            {type === 'transfer' && sourceAccount && (
              <div className="mt-1 text-xs text-slate-500">
                이체는 출금 계좌의 통화({sourceAccount.currency})로 기록됩니다.
              </div>
            )}
          </Row>

          {type !== 'transfer' && !useSplits && (
            <Row label="카테고리">
              <button
                type="button"
                onClick={() => {
                  setSplitPickerKey(null)
                  setPickerOpen(true)
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-slate-200 hover:border-slate-600"
              >
                {categoryLabel}
              </button>
            </Row>
          )}

          {type !== 'transfer' && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={useSplits}
                  onChange={(e) => {
                    const next = e.target.checked
                    setUseSplits(next)
                    if (next && splits.length === 0) {
                      // Seed two empty rows the user can fill in.
                      setSplits([
                        { uiKey: nextSplitKey(), categoryId: null, amountStr: '', memo: '' },
                        { uiKey: nextSplitKey(), categoryId: null, amountStr: '', memo: '' }
                      ])
                    }
                  }}
                  className="h-4 w-4"
                />
                <span>
                  <b>여러 카테고리로 분할</b> — 한 거래를 카테고리별로 나눠 기록
                </span>
              </label>

              {useSplits && (
                <div className="mt-3 space-y-2">
                  {splits.map((sp) => (
                    <div
                      key={sp.uiKey}
                      className="flex flex-wrap items-start gap-2 rounded-md border border-slate-700 bg-slate-950 p-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSplitPickerKey(sp.uiKey)
                          setPickerOpen(true)
                        }}
                        className="min-w-[8rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-left text-xs text-slate-200 hover:border-slate-600"
                      >
                        {categoryDisplayLabel(sp.categoryId)}
                      </button>
                      <input
                        type="text"
                        value={sp.amountStr}
                        onChange={(e) =>
                          patchSplit(sp.uiKey, { amountStr: formatLiveInput(e.target.value) })
                        }
                        placeholder="금액"
                        className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={sp.memo}
                        onChange={(e) => patchSplit(sp.uiKey, { memo: e.target.value })}
                        placeholder="메모 (선택)"
                        className="min-w-[6rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeSplit(sp.uiKey)}
                        title="이 분할 제거"
                        className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:border-rose-500/60 hover:text-rose-300"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 pt-1 text-xs">
                    <button
                      type="button"
                      onClick={addSplit}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 hover:border-sky-500/60 hover:text-sky-200"
                    >
                      + 분할 추가
                    </button>
                    <div className="font-mono">
                      <span className="text-slate-500">합계 </span>
                      <span
                        className={
                          splitDiff === 0
                            ? 'text-emerald-300'
                            : splitDiff > 0
                              ? 'text-amber-300'
                              : 'text-rose-300'
                        }
                      >
                        {splitTotal.toLocaleString()} / {parsedAmount.toLocaleString()} {currency}
                      </span>
                      {splitDiff !== 0 && (
                        <span className="ml-2 text-slate-500">
                          ({splitDiff > 0 ? '부족' : '초과'}{' '}
                          {Math.abs(splitDiff).toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {type === 'transfer' ? (
            <>
              <Row label="출금 계좌">
                <AccountSelect
                  value={accountId}
                  onChange={setAccountId}
                  accounts={accounts}
                  placeholder="출금 계좌 선택"
                />
              </Row>
              <Row label="입금 계좌">
                <AccountSelect
                  value={counterAccountId}
                  onChange={setCounterAccountId}
                  accounts={accounts}
                  placeholder="입금 계좌 선택"
                />
              </Row>
              {isCrossCurrency && counterAccount && (
                <Row label={`입금액 (${counterAccount.currency})`}>
                  <input
                    type="text"
                    value={counterAmountStr}
                    onChange={(e) => setCounterAmountStr(e.target.value)}
                    placeholder="비어있으면 환율로 자동 계산"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  <div className="mt-1 text-xs text-slate-500">
                    cross-currency 이체: 실제 수신한 금액을 입력하거나, 비워두면 환율(exchange_rates) 기준 자동 환산.
                  </div>
                </Row>
              )}
            </>
          ) : (
            accounts.length > 0 && (
              <Row label="계좌 (선택)">
                <AccountSelect
                  value={accountId}
                  onChange={setAccountId}
                  accounts={accounts}
                  placeholder="계좌 연결 안함"
                  allowClear
                />
              </Row>
            )
          )}

          <Row label="지출처">
            <input
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="예: 스타벅스"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </Row>

          <Row label="결제 수단 (선택)">
            <input
              type="text"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="예: 신한카드"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </Row>

          {/* Discount section (only for expense/income, not transfer) */}
          {type !== 'transfer' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="mb-2 text-xs font-semibold text-amber-200">
                🔖 할인 정보 (선택)
              </div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    할인 전 금액 (비우면 할인 없음)
                  </label>
                  <input
                    type="text"
                    value={originalAmountStr}
                    onFocus={() => {
                      if (originalAmountStr === '0') setOriginalAmountStr('')
                    }}
                    onBlur={() => {
                      if (!originalAmountStr) setOriginalAmountStr('')
                    }}
                    onChange={(e) => setOriginalAmountStr(formatLiveInput(e.target.value))}
                    placeholder={`0 (실결제 ${amountStr || '0'} ${currency})`}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                  <MemoizedDiscountPreview
                    amountStr={amountStr}
                    originalAmountStr={originalAmountStr}
                    currency={currency}
                    currencies={currencies}
                  />
                <div className="relative">
                  <label className="mb-1 block text-xs text-slate-400">할인 사유 (선택)</label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    onFocus={() => setDiscountReasonFocus(true)}
                    onBlur={() => setTimeout(() => setDiscountReasonFocus(false), 150)}
                    placeholder="예: 통신사 제휴 10%, 캐시백, 무이자 할부"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  {discountReasonFocus && discountReasonSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-40 overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                      {discountReasonSuggestions
                        .filter(
                          (r) =>
                            !discountReason.trim() ||
                            r.toLowerCase().includes(discountReason.trim().toLowerCase())
                        )
                        .slice(0, 6)
                        .map((r) => (
                          <button
                            key={r}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setDiscountReason(r)
                              setDiscountReasonFocus(false)
                            }}
                            className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                          >
                            {r}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Row label="메모 (선택)">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </Row>

          <Row label="태그 (선택)">
            <TagMultiSelect value={tagIds} onChange={setTagIds} />
          </Row>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>
      </Modal>

      <CategoryPicker
        open={pickerOpen}
        kind={type === 'income' ? 'income' : 'expense'}
        selectedId={
          splitPickerKey
            ? (splits.find((s) => s.uiKey === splitPickerKey)?.categoryId ?? null)
            : categoryId
        }
        onPick={(picked) => {
          if (splitPickerKey) {
            patchSplit(splitPickerKey, { categoryId: picked })
          } else {
            setCategoryId(picked)
          }
        }}
        onClose={() => {
          setPickerOpen(false)
          setSplitPickerKey(null)
        }}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="거래 삭제"
        message="이 거래를 삭제하시겠습니까? 되돌릴 수 없습니다."
        confirmLabel="삭제"
        danger
        onConfirm={() => {
          setDeleteConfirm(false)
          performDelete()
        }}
        onCancel={() => setDeleteConfirm(false)}
      />
    </>
  )
}

function Row({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function DiscountPreview({
  amountStr,
  originalAmountStr,
  currency,
  currencies
}: {
  amountStr: string
  originalAmountStr: string
  currency: string
  currencies: CurrencyDto[]
}): React.JSX.Element | null {
  if (!originalAmountStr.trim()) return null
  const amount = parseMoneyInput(amountStr, currency, currencies)
  const original = parseMoneyInput(originalAmountStr, currency, currencies)
  if (original <= 0) return null
  if (original < amount) {
    return (
      <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
        할인 전 금액은 실결제 금액 이상이어야 합니다.
      </div>
    )
  }
  if (original === amount) {
    return (
      <div className="rounded-md bg-slate-800/60 px-2 py-1 text-xs text-slate-400">
        할인 없음 (할인 전 금액 = 실결제 금액)
      </div>
    )
  }
  const discount = original - amount
  const rate = (discount / original) * 100
  const decimals = currencies.find((c) => c.code === currency)?.decimalPlaces ?? 2
  const displayDiscount =
    decimals === 0 ? discount.toLocaleString() : (discount / 10 ** decimals).toFixed(decimals)
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
      할인 {displayDiscount} {currency} ({rate.toFixed(1)}%) 적용됨
    </div>
  )
}

function AccountSelect({
  value,
  onChange,
  accounts,
  placeholder,
  allowClear
}: {
  value: string | null
  onChange: (id: string | null) => void
  accounts: AccountDto[]
  placeholder: string
  allowClear?: boolean
}): React.JSX.Element {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
    >
      <option value="">{allowClear ? '(연결 안함)' : placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.icon ? `${a.icon} ` : ''}
          {a.name} ({a.currency})
        </option>
      ))}
    </select>
  )
}
const MemoizedDiscountPreview = memo(DiscountPreview)
