import { memo, useEffect, useRef, useState } from 'react'
import type {
  AccountCreateInput,
  AccountDto,
  AccountType,
  CurrencyDto
} from '../../../shared/types'
import Modal, { ConfirmDialog } from './Modal'
import { formatMoneyForInput, parseMoneyInput, formatLiveInput } from '../lib/money-input'

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string; icon: string }> = [
  { value: 'checking', label: '입출금', icon: '🏦' },
  { value: 'savings', label: '예적금', icon: '💰' },
  { value: 'credit_card', label: '신용카드', icon: '💳' },
  { value: 'cash', label: '현금', icon: '💵' },
  { value: 'investment', label: '투자', icon: '📈' },
  { value: 'loan', label: '대출', icon: '📉' },
  { value: 'other', label: '기타', icon: '📂' }
]

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: AccountDto | null
}

function AccountForm({
  open,
  onClose,
  onSaved,
  initial
}: Props): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [currency, setCurrency] = useState('KRW')
  const [initialBalanceStr, setInitialBalanceStr] = useState('0')
  const [icon, setIcon] = useState('')
  const [notes, setNotes] = useState('')
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])

  // Card-specific state
  const [issuer, setIssuer] = useState('')
  const [cardLast4, setCardLast4] = useState('')
  const [billingDayStr, setBillingDayStr] = useState('')
  const [statementClosingStr, setStatementClosingStr] = useState('')
  const [creditLimitStr, setCreditLimitStr] = useState('')
  const [annualFeeStr, setAnnualFeeStr] = useState('')
  const [benefitsSummary, setBenefitsSummary] = useState('')
  const [issuerSuggestions, setIssuerSuggestions] = useState<string[]>([])
  const [issuerFocus, setIssuerFocus] = useState(false)
  const issuerInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // window.confirm() 대신 React 모달 — Electron webContents 입력 차단 회귀 회피.
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([window.api.currencies.list(), window.api.accounts.distinctIssuers()]).then(
      ([c, issuers]) => {
        setCurrencies(c)
        setIssuerSuggestions(issuers)
      }
    )
    if (initial) {
      setName(initial.name)
      setType(initial.type)
      setCurrency(initial.currency)
      setIcon(initial.icon ?? '')
      setNotes(initial.notes ?? '')
      setIssuer(initial.issuer ?? '')
      setCardLast4(initial.cardLast4 ?? '')
      setBillingDayStr(initial.billingDay ? String(initial.billingDay) : '')
      setStatementClosingStr(initial.statementClosing ? String(initial.statementClosing) : '')
      setBenefitsSummary(initial.benefitsSummary ?? '')
    } else {
      setName('')
      setType('checking')
      setCurrency('KRW')
      setInitialBalanceStr('0')
      setIcon('')
      setNotes('')
      setIssuer('')
      setCardLast4('')
      setBillingDayStr('')
      setStatementClosingStr('')
      setCreditLimitStr('')
      setAnnualFeeStr('')
      setBenefitsSummary('')
    }
    setError(null)
  }, [open, initial])

  useEffect(() => {
    if (!initial || currencies.length === 0) return
    setInitialBalanceStr(formatMoneyForInput(initial.initialBalance, initial.currency, currencies))
    setCreditLimitStr(
      initial.creditLimit != null
        ? formatMoneyForInput(initial.creditLimit, initial.currency, currencies)
        : ''
    )
    setAnnualFeeStr(
      initial.annualFee != null
        ? formatMoneyForInput(initial.annualFee, initial.currency, currencies)
        : ''
    )
  }, [initial, currencies])

  const isCard = type === 'credit_card'

  async function handleSubmit(): Promise<void> {
    if (!name.trim()) return setError('계좌명을 입력해 주세요.')

    // Duplicate-name guard: active accounts only, case-insensitive trim, skip self when editing.
    // Same-name accounts cause confusion in transaction dropdowns and account analytics,
    // so we block creation outright (user can disambiguate by appending suffix or
    // archiving the older account).
    const trimmedName = name.trim()
    const activeAccounts = await window.api.accounts.list(false)
    const conflict = activeAccounts.find(
      (a) =>
        a.id !== initial?.id &&
        a.name.trim().toLowerCase() === trimmedName.toLowerCase()
    )
    if (conflict) {
      return setError(
        `같은 이름의 계좌(${conflict.name})가 이미 존재합니다. 다른 이름을 사용하거나 기존 계좌를 보관 처리해 주세요.`
      )
    }

    // Parse card fields
    let billingDay: number | null = null
    if (billingDayStr) {
      const n = parseInt(billingDayStr, 10)
      if (!Number.isFinite(n) || n < 1 || n > 31)
        return setError('결제일은 1~31 사이 숫자여야 합니다.')
      billingDay = n
    }
    let statementClosing: number | null = null
    if (statementClosingStr) {
      const n = parseInt(statementClosingStr, 10)
      if (!Number.isFinite(n) || n < 1 || n > 31)
        return setError('마감일은 1~31 사이 숫자여야 합니다.')
      statementClosing = n
    }
    if (cardLast4 && !/^\d{4}$/.test(cardLast4))
      return setError('카드번호 뒷 4자리는 숫자 4개만 입력해 주세요.')

    setSubmitting(true)
    setError(null)
    try {
      const initialBalance = parseMoneyInput(initialBalanceStr, currency, currencies)
      const input: AccountCreateInput = {
        name: name.trim(),
        type,
        currency,
        initialBalance,
        icon: icon || null,
        notes: notes.trim() || null,
        issuer: isCard && issuer.trim() ? issuer.trim() : null,
        cardLast4: isCard && cardLast4 ? cardLast4 : null,
        billingDay: isCard ? billingDay : null,
        statementClosing: isCard ? statementClosing : null,
        creditLimit:
          isCard && creditLimitStr
            ? parseMoneyInput(creditLimitStr, currency, currencies)
            : null,
        annualFee:
          isCard && annualFeeStr
            ? parseMoneyInput(annualFeeStr, currency, currencies)
            : null,
        benefitsSummary: isCard && benefitsSummary.trim() ? benefitsSummary.trim() : null
      }
      if (initial) {
        await window.api.accounts.update({ id: initial.id, ...input })
      } else {
        await window.api.accounts.create(input)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function performArchive(): Promise<void> {
    if (!initial) return
    await window.api.accounts.update({ id: initial.id, isArchived: !initial.isArchived })
    setConfirmingArchive(false)
    onSaved()
    onClose()
  }

  if (!open) return null

  const filteredIssuers = issuerSuggestions.filter(
    (s) => !issuer.trim() || s.toLowerCase().includes(issuer.trim().toLowerCase())
  )

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '계좌 편집' : '새 계좌'}
      size="md"
      footer={
        <>
          {initial && (
            <button
              onClick={() => setConfirmingArchive(true)}
              className="mr-auto rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/25"
            >
              {initial.isArchived ? '보관 해제' : '보관'}
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
        <Row label="계좌명">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 신한 주거래 / 삼성 taptap"
            autoFocus
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Row>

        <Row label="종류">
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_TYPES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setType(opt.value)
                  if (!icon) setIcon(opt.icon)
                }}
                className={`rounded-md border px-3 py-1.5 text-xs transition ${
                  type === opt.value
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
        </Row>

        <div className="grid grid-cols-2 gap-3">
          <Row label="통화">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!!initial}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-60"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </Row>
          <Row label={initial ? '초기 잔액 (고정)' : '초기 잔액'}>
            <input
              type="text"
              value={initialBalanceStr}
              onFocus={() => {
                if (initialBalanceStr === '0') setInitialBalanceStr('')
              }}
              onBlur={() => {
                if (!initialBalanceStr) setInitialBalanceStr('0')
              }}
              onChange={(e) => setInitialBalanceStr(formatLiveInput(e.target.value))}
              placeholder="0"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </Row>
        </div>

        {/* Card-specific section */}
        {isCard && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="mb-2 text-xs font-semibold text-sky-200">💳 신용카드 전용 정보 (모두 선택)</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="mb-1 block text-xs text-slate-400">카드사</label>
                  <input
                    ref={issuerInputRef}
                    type="text"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    onFocus={() => setIssuerFocus(true)}
                    onBlur={() => setTimeout(() => setIssuerFocus(false), 150)}
                    placeholder="신한, 삼성, 현대 ..."
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                  {issuerFocus && filteredIssuers.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-lg">
                      {filteredIssuers.slice(0, 6).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setIssuer(s)
                            setIssuerFocus(false)
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">카드번호 뒷 4자리</label>
                  <input
                    type="text"
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    maxLength={4}
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key)) e.preventDefault()
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">결제일 (1-31)</label>
                  <input
                    type="text"
                    value={billingDayStr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      if (val && parseInt(val, 10) <= 31) setBillingDayStr(val)
                      else if (!val) setBillingDayStr('')
                    }}
                    placeholder="15"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">마감일 (1-31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={statementClosingStr}
                    onChange={(e) => setStatementClosingStr(e.target.value)}
                    placeholder="1"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">월 한도</label>
                  <input
                    type="text"
                    value={creditLimitStr}
                    onFocus={() => {
                      if (creditLimitStr === '0') setCreditLimitStr('')
                    }}
                    onBlur={() => {
                      if (!creditLimitStr) setCreditLimitStr('')
                    }}
                    onChange={(e) => setCreditLimitStr(formatLiveInput(e.target.value))}
                    placeholder="2,000,000"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">연회비</label>
                  <input
                    type="text"
                    value={annualFeeStr}
                    onChange={(e) => setAnnualFeeStr(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">혜택 요약</label>
                <textarea
                  value={benefitsSummary}
                  onChange={(e) => setBenefitsSummary(e.target.value)}
                  rows={2}
                  placeholder="예: 통신 10%, 카페 5%, 해외결제 2% 캐시백"
                  className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        <Row label="아이콘 (선택)">
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={4}
            className="w-20 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center text-lg text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Row>

        <Row label="메모 (선택)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </Row>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
    {initial && (
      <ConfirmDialog
        open={confirmingArchive}
        title={initial.isArchived ? '보관 해제' : '계좌 보관'}
        confirmLabel={initial.isArchived ? '해제' : '보관'}
        onCancel={() => setConfirmingArchive(false)}
        onConfirm={performArchive}
        message={
          initial.isArchived
            ? `'${initial.name}' 계좌의 보관을 해제하고 다시 활성 상태로 만듭니다.`
            : `'${initial.name}' 계좌를 보관 처리합니다 (목록에서 숨김, 거래는 유지).`
        }
      />
    )}
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
export default memo(AccountForm)
