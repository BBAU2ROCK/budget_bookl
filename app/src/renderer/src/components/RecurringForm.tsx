import { memo, useEffect, useMemo, useState } from 'react'
import type {
  AccountDto,
  CategoryDto,
  CurrencyDto,
  RecurringCreateInput,
  RecurringSeriesDto
} from '../../../shared/types'
import Modal, { ConfirmDialog } from './Modal'
import CategoryPicker from './CategoryPicker'
import TagMultiSelect from './TagMultiSelect'
import { formatMoneyForInput, parseMoneyInput, formatLiveInput } from '../lib/money-input'

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토'] as const
const BYDAY_CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
  initial?: RecurringSeriesDto | null
}

function RecurringForm({
  open,
  onClose,
  onSaved,
  onDeleted,
  initial
}: Props): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amountStr, setAmountStr] = useState('0')
  const [currency, setCurrency] = useState('KRW')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [autoCreate, setAutoCreate] = useState(true)
  const [pausedUntil, setPausedUntil] = useState<string>('')

  // RRULE builder state
  const [freq, setFreq] = useState<Frequency>('MONTHLY')
  const [interval, setInterval] = useState(1)
  const [byDays, setByDays] = useState<number[]>([])
  const [byMonthDay, setByMonthDay] = useState(1)
  const [dtstart, setDtstart] = useState(new Date().toISOString().slice(0, 10))
  const [until, setUntil] = useState<string>('')
  const [countLimit, setCountLimit] = useState<number | ''>('')

  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewDates, setPreviewDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // window.confirm() 대신 React 모달 — Electron webContents 입력 차단 회귀 회피.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([
      window.api.currencies.list(),
      window.api.categories.list(),
      window.api.accounts.list()
    ]).then(([c, cat, a]) => {
      setCurrencies(c)
      setCategories(cat)
      setAccounts(a)
    })

    if (initial) {
      setName(initial.name)
      setType(initial.type)
      setCurrency(initial.currency)
      setCategoryId(initial.categoryId)
      setAccountId(initial.accountId)
      setPayee(initial.payee ?? '')
      setMemo(initial.memo ?? '')
      setTagIds(initial.tagIds)
      setAutoCreate(initial.autoCreate)
      setPausedUntil(initial.pausedUntil ?? '')
      setDtstart(initial.dtstart)
      setUntil(initial.until ?? '')
      setCountLimit(initial.count ?? '')
      parseRrule(initial.rrule)
    } else {
      setName('')
      setType('expense')
      setAmountStr('0')
      setCurrency('KRW')
      setCategoryId(null)
      setAccountId(null)
      setPayee('')
      setMemo('')
      setTagIds([])
      setAutoCreate(true)
      setPausedUntil('')
      setFreq('MONTHLY')
      setInterval(1)
      setByDays([])
      setByMonthDay(1)
      setDtstart(new Date().toISOString().slice(0, 10))
      setUntil('')
      setCountLimit('')
    }
    setError(null)
  }, [open, initial])

  useEffect(() => {
    if (!initial || currencies.length === 0) return
    setAmountStr(formatMoneyForInput(initial.amount, initial.currency, currencies))
  }, [initial, currencies])

  function parseRrule(rr: string): void {
    // Simple parser for the patterns we generate
    const body = rr.replace(/^RRULE:/, '')
    const parts = Object.fromEntries(body.split(';').map((p) => p.split('=') as [string, string]))
    if (parts.FREQ) setFreq(parts.FREQ as Frequency)
    if (parts.INTERVAL) setInterval(Number(parts.INTERVAL))
    if (parts.BYDAY) {
      setByDays(parts.BYDAY.split(',').map((code) => BYDAY_CODE.indexOf(code)))
    }
    if (parts.BYMONTHDAY) setByMonthDay(Number(parts.BYMONTHDAY))
  }

  const builtRrule = useMemo(() => {
    const parts: string[] = [`FREQ=${freq}`]
    if (interval > 1) parts.push(`INTERVAL=${interval}`)
    if (freq === 'WEEKLY' && byDays.length > 0) {
      parts.push(`BYDAY=${byDays.map((d) => BYDAY_CODE[d]).join(',')}`)
    }
    if (freq === 'MONTHLY' && byMonthDay > 0) {
      parts.push(`BYMONTHDAY=${byMonthDay}`)
    }
    return parts.join(';')
  }, [freq, interval, byDays, byMonthDay])

  const humanReadable = useMemo(() => {
    const parts: string[] = []
    if (interval === 1) {
      parts.push(
        freq === 'DAILY' ? '매일' : freq === 'WEEKLY' ? '매주' : freq === 'MONTHLY' ? '매월' : '매년'
      )
    } else {
      parts.push(
        `${interval}${freq === 'DAILY' ? '일' : freq === 'WEEKLY' ? '주' : freq === 'MONTHLY' ? '개월' : '년'}마다`
      )
    }
    if (freq === 'WEEKLY' && byDays.length > 0) {
      parts.push(byDays.map((d) => WEEKDAY_LABEL[d] + '요일').join(', '))
    }
    if (freq === 'MONTHLY') parts.push(`${byMonthDay}일`)
    return parts.join(' ')
  }, [freq, interval, byDays, byMonthDay])

  // Update preview when rule or dtstart changes
  useEffect(() => {
    if (!open) return
    if (!dtstart) return
    window.api.recurring
      .preview({
        rrule: builtRrule,
        dtstart,
        until: until || null,
        count: countLimit === '' ? null : Number(countLimit),
        limit: 5
      })
      .then(setPreviewDates)
      .catch(() => setPreviewDates([]))
  }, [open, builtRrule, dtstart, until, countLimit])

  const categoryLabel = useMemo(() => {
    if (!categoryId) return '카테고리 선택 (선택)'
    const cat = categories.find((c) => c.id === categoryId)
    return cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : '선택 안됨'
  }, [categoryId, categories])

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) return setError('이름을 입력해 주세요.')
    const amount = parseMoneyInput(amountStr, currency, currencies)
    if (amount <= 0) return setError('금액을 입력해 주세요.')
    if (freq === 'WEEKLY' && byDays.length === 0)
      return setError('반복 요일을 하나 이상 선택해 주세요.')

    setSubmitting(true)
    setError(null)
    try {
      const input: RecurringCreateInput = {
        name: name.trim(),
        type,
        amount,
        currency,
        categoryId,
        accountId,
        payee: payee.trim() || null,
        memo: memo.trim() || null,
        rrule: builtRrule,
        dtstart,
        until: until || null,
        count: countLimit === '' ? null : Number(countLimit),
        autoCreate,
        pausedUntil: pausedUntil || null,
        tagIds
      }
      if (initial) {
        await window.api.recurring.update({ id: initial.id, ...input })
      } else {
        await window.api.recurring.create(input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function performDelete(): Promise<void> {
    if (!initial) return
    await window.api.recurring.delete(initial.id)
    setConfirmingDelete(false)
    onDeleted?.()
    onClose()
  }

  if (!open) return null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={initial ? '반복 편집' : '새 반복지출/수입'}
        size="md"
        footer={
          <>
            {initial && (
              <button
                onClick={() => setConfirmingDelete(true)}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                type === 'expense'
                  ? 'border-rose-500/60 bg-rose-500/20 text-rose-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
            >
              지출
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                type === 'income'
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}
            >
              수입
            </button>
          </div>

          <Row label="이름">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 넷플릭스 구독"
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
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>
          </Row>

          {/* Frequency builder */}
          <Row label="반복 주기">
            <div className="space-y-2">
              <div className="flex gap-2">
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Frequency[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFreq(f)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                      freq === f
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                        : 'border-slate-700 bg-slate-900 text-slate-400'
                    }`}
                  >
                    {f === 'DAILY'
                      ? '매일'
                      : f === 'WEEKLY'
                        ? '매주'
                        : f === 'MONTHLY'
                          ? '매월'
                          : '매년'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                간격:
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={interval}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      if (val) setInterval(Math.min(365, Math.max(1, parseInt(val, 10))))
                      else setInterval(1)
                    }}
                    className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                <span>
                  {freq === 'DAILY' ? '일' : freq === 'WEEKLY' ? '주' : freq === 'MONTHLY' ? '개월' : '년'}
                  마다
                </span>
              </div>

              {freq === 'WEEKLY' && (
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_LABEL.map((label, i) => {
                    const active = byDays.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setByDays(active ? byDays.filter((d) => d !== i) : [...byDays, i])
                        }
                        className={`h-8 w-8 rounded border text-xs ${
                          active
                            ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {freq === 'MONTHLY' && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  매월
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={byMonthDay}
                    onChange={(e) =>
                      setByMonthDay(Math.min(28, Math.max(1, Number(e.target.value))))
                    }
                    className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-center font-mono text-slate-100"
                  />
                  일
                </div>
              )}

              <div className="text-xs text-slate-500">
                {humanReadable} · <code className="text-slate-400">{builtRrule}</code>
              </div>
            </div>
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label="시작일">
              <input
                type="date"
                value={dtstart}
                onChange={(e) => setDtstart(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Row>
            <Row label="종료일 (선택)">
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Row>
          </div>

          <Row label="카테고리">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-slate-200 hover:border-slate-600"
            >
              {categoryLabel}
            </button>
          </Row>

          <Row label="연결 계좌 (선택)">
            <AccountSelect
              value={accountId}
              onChange={setAccountId}
              accounts={accounts}
              placeholder={accounts.length === 0 ? "등록된 계좌가 없습니다" : "연결 안함"}
            />
          </Row>

          <Row label="지출처 / 메모">
            <div className="space-y-2">
              <input
                type="text"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="지출처 (예: 넷플릭스)"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="메모 (선택)"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </Row>

          <Row label="태그">
            <TagMultiSelect value={tagIds} onChange={setTagIds} />
          </Row>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoCreate}
              onChange={(e) => setAutoCreate(e.target.checked)}
              className="h-4 w-4"
            />
            <span>자동 생성 — 앱 실행 시 due된 날짜의 거래를 자동으로 만듭니다</span>
          </label>

          <Row label="일시 정지 (선택)">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={pausedUntil}
                onChange={(e) => setPausedUntil(e.target.value)}
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              {pausedUntil && (
                <button
                  type="button"
                  onClick={() => setPausedUntil('')}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                >
                  지금 재개
                </button>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {pausedUntil
                ? `${pausedUntil}까지 자동 생성을 건너뜁니다. 그 이후 자동 재개.`
                : '미사용 — 비워두면 정상 동작.'}
            </div>
          </Row>

          <div className="rounded-md border border-slate-700/70 bg-slate-900/40 p-3 text-xs">
            <div className="mb-1 font-semibold text-slate-300">미리보기 (다가오는 5회)</div>
            {previewDates.length === 0 ? (
              <div className="text-slate-500">—</div>
            ) : (
              <div className="flex flex-wrap gap-2 font-mono text-slate-400">
                {previewDates.map((d) => (
                  <span key={d} className="rounded bg-slate-800 px-1.5 py-0.5">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>
      </Modal>

      <CategoryPicker
        open={pickerOpen}
        kind={type}
        selectedId={categoryId}
        onPick={setCategoryId}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="반복 시리즈 삭제"
        danger
        confirmLabel="삭제"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
        message="이 반복 시리즈를 삭제합니다. 기존에 자동 생성된 거래는 그대로 남습니다."
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

function AccountSelect({
  value,
  onChange,
  accounts,
  placeholder
}: {
  value: string | null
  onChange: (id: string | null) => void
  accounts: AccountDto[]
  placeholder: string
}): React.JSX.Element {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={accounts.length === 0}
      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.icon ? `${a.icon} ` : ''}
          {a.name} ({a.currency})
        </option>
      ))}
    </select>
  )
}
export default memo(RecurringForm)
