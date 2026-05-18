import { memo, useEffect, useState } from 'react'
import type {
  AccountDto,
  CurrencyDto,
  GoalTagInclusionType,
  GoalTemplate,
  SavingsGoalCreateInput,
  SavingsGoalDto,
  TagDto
} from '../../../../shared/types'
import Modal, { ConfirmDialog } from '../Modal'
import { formatLiveInput, formatMoneyForInput, parseMoneyInput } from '../../lib/money-input'

interface Props {
  open: boolean
  initial?: SavingsGoalDto | null
  template?: GoalTemplate | null
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

const COLOR_PRESETS = [
  '#0ea5e9',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#f59e0b',
  '#6366f1',
  '#ef4444',
  '#14b8a6'
]

function GoalForm({
  open,
  initial,
  template,
  onClose,
  onSaved,
  onDeleted
}: Props): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [targetAmountStr, setTargetAmountStr] = useState('0')
  const [currency, setCurrency] = useState('KRW')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [targetDate, setTargetDate] = useState<string>('')
  const [startingBalanceStr, setStartingBalanceStr] = useState('0')
  const [manualAmountStr, setManualAmountStr] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [tagInclusionTypes, setTagInclusionTypes] = useState<GoalTagInclusionType[]>([
    'income',
    'transfer_in'
  ])
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([])
  const [linkedTagIds, setLinkedTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [tags, setTags] = useState<TagDto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // window.confirm()을 거치면 Electron webContents가 다음번 텍스트 입력 이벤트를
  // 일부 차단하는 회귀가 있다 → React 모달로 처리.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([
      window.api.accounts.list(),
      window.api.currencies.list(),
      window.api.tags.list()
    ]).then(([a, c, t]) => {
      setAccounts(a)
      setCurrencies(c)
      setTags(t)
    })

    if (initial) {
      setName(initial.name)
      setDescription(initial.description ?? '')
      setIcon(initial.icon ?? '')
      setColor(initial.color)
      setCurrency(initial.currency)
      setStartDate(initial.startDate)
      setTargetDate(initial.targetDate ?? '')
      setUseManual(initial.manualAmount != null)
      setTagInclusionTypes(initial.tagInclusionTypes)
      setLinkedAccountIds(initial.linkedAccountIds)
      setLinkedTagIds(initial.linkedTagIds)
      setNotes(initial.notes ?? '')
    } else if (template) {
      setName(template.name)
      setDescription(template.description)
      setIcon(template.icon)
      setColor(template.color)
      setCurrency('KRW')
      setStartDate(new Date().toISOString().slice(0, 10))
      setTargetDate('')
      setUseManual(false)
      setTagInclusionTypes(['income', 'transfer_in'])
      setLinkedAccountIds([])
      setLinkedTagIds([])
      setNotes('')
    } else {
      setName('')
      setDescription('')
      setIcon('')
      setColor(null)
      setTargetAmountStr('0')
      setCurrency('KRW')
      setStartDate(new Date().toISOString().slice(0, 10))
      setTargetDate('')
      setStartingBalanceStr('0')
      setManualAmountStr('')
      setUseManual(false)
      setTagInclusionTypes(['income', 'transfer_in'])
      setLinkedAccountIds([])
      setLinkedTagIds([])
      setNotes('')
    }
    setError(null)
  }, [open, initial, template])

  useEffect(() => {
    if (!template || initial) return
    if (currencies.length === 0) return
    setTargetAmountStr(formatMoneyForInput(template.suggestedAmount, 'KRW', currencies))
  }, [template, initial, currencies])

  useEffect(() => {
    if (!initial || currencies.length === 0) return
    setTargetAmountStr(formatMoneyForInput(initial.targetAmount, initial.currency, currencies))
    setStartingBalanceStr(
      formatMoneyForInput(initial.startingBalance, initial.currency, currencies)
    )
    if (initial.manualAmount != null) {
      setManualAmountStr(formatMoneyForInput(initial.manualAmount, initial.currency, currencies))
    } else {
      setManualAmountStr('')
    }
  }, [initial, currencies])

  function toggleInclusionType(type: GoalTagInclusionType): void {
    if (tagInclusionTypes.includes(type)) {
      // 마지막 1개 보호
      if (tagInclusionTypes.length === 1) return
      setTagInclusionTypes(tagInclusionTypes.filter((t) => t !== type))
    } else {
      setTagInclusionTypes([...tagInclusionTypes, type])
    }
  }

  async function handleSubmit(): Promise<void> {
    setError(null)
    setSubmitting(true)
    try {
      if (!name.trim()) throw new Error('목표 이름을 입력해 주세요.')
      const targetAmount = parseMoneyInput(targetAmountStr, currency, currencies)
      if (targetAmount <= 0) throw new Error('목표 금액은 0보다 커야 합니다.')
      if (targetDate && targetDate < startDate)
        throw new Error('마감일이 시작일 이전일 수 없습니다.')
      if (linkedTagIds.length > 0 && tagInclusionTypes.length === 0) {
        throw new Error('태그 합산 시 최소 1개의 거래 타입을 선택해야 합니다.')
      }

      const startingBalance = parseMoneyInput(startingBalanceStr, currency, currencies)
      const manualAmount = useManual
        ? parseMoneyInput(manualAmountStr, currency, currencies)
        : null

      const input: SavingsGoalCreateInput = {
        name: name.trim(),
        description: description.trim() || null,
        targetAmount,
        currency,
        startDate,
        targetDate: targetDate || null,
        startingBalance,
        manualAmount,
        tagInclusionTypes,
        icon: icon || null,
        color,
        notes: notes.trim() || null,
        linkedAccountIds,
        linkedTagIds
      }
      if (initial) {
        await window.api.goals.update({ id: initial.id, ...input })
      } else {
        await window.api.goals.create(input)
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
    await window.api.goals.delete(initial.id)
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
      title={initial ? '목표 편집' : '새 자산 목표'}
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
        <div>
          <label className="mb-1 block text-xs text-slate-400">이름</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 4))}
              placeholder="✈️"
              className="w-14 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-center text-lg text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="여행자금"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">설명 (선택)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="유럽 2주 여행 비용"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">목표 금액</label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={targetAmountStr}
              onFocus={() => {
                if (targetAmountStr === '0') setTargetAmountStr('')
              }}
              onBlur={() => {
                if (!targetAmountStr) setTargetAmountStr('0')
              }}
              onChange={(e) => setTargetAmountStr(formatLiveInput(e.target.value))}
              placeholder="3,000,000"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!!initial}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100 focus:border-sky-500 focus:outline-none disabled:opacity-60"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">마감일 (선택)</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Source: accounts */}
        <div className="rounded-md border border-slate-700/40 bg-slate-950/40 p-3">
          <div className="mb-1.5 text-xs font-semibold text-slate-300">📊 진행 측정 방식</div>

          <div className="mb-2">
            <label className="mb-1 block text-xs text-slate-400">계좌 잔액 합산</label>
            <select
              multiple
              size={Math.min(4, Math.max(2, accounts.length))}
              value={linkedAccountIds}
              onChange={(e) =>
                setLinkedAccountIds(
                  Array.from(e.target.selectedOptions).map((o) => o.value)
                )
              }
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon ? `${a.icon} ` : ''}
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-slate-500">
              Ctrl/Cmd 클릭으로 여러 개 선택. 미선택 시 계좌 합산 안 함.
            </div>
          </div>

          {linkedAccountIds.length > 0 && (
            <div className="mb-2">
              <label className="mb-1 block text-xs text-slate-400">
                시작 잔액 (이 목표 시작 시점에 이미 있던 금액 — 차감)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={startingBalanceStr}
                onFocus={() => {
                  if (startingBalanceStr === '0') setStartingBalanceStr('')
                }}
                onBlur={() => {
                  if (!startingBalanceStr) setStartingBalanceStr('0')
                }}
                onChange={(e) => setStartingBalanceStr(formatLiveInput(e.target.value))}
                placeholder="0"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}

          {tags.length > 0 && (
            <div className="mb-2">
              <label className="mb-1 block text-xs text-slate-400">태그 매칭 거래 합산</label>
              <select
                multiple
                size={Math.min(4, Math.max(2, tags.length))}
                value={linkedTagIds}
                onChange={(e) =>
                  setLinkedTagIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {linkedTagIds.length > 0 && (
                <div className="mt-1.5 flex gap-3 text-xs">
                  <label className="flex items-center gap-1 text-slate-400">
                    <input
                      type="checkbox"
                      checked={tagInclusionTypes.includes('income')}
                      onChange={() => toggleInclusionType('income')}
                    />
                    수입 거래
                  </label>
                  <label className="flex items-center gap-1 text-slate-400">
                    <input
                      type="checkbox"
                      checked={tagInclusionTypes.includes('transfer_in')}
                      onChange={() => toggleInclusionType('transfer_in')}
                    />
                    입금된 이체
                  </label>
                </div>
              )}
            </div>
          )}

          <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={useManual}
              onChange={(e) => setUseManual(e.target.checked)}
              className="h-4 w-4"
            />
            <span>수동 입력 (외부 자산 직접 추적)</span>
          </label>
          {useManual && (
            <div className="mt-1">
              <input
                type="text"
                inputMode="decimal"
                value={manualAmountStr}
                onFocus={() => {
                  if (manualAmountStr === '0') setManualAmountStr('')
                }}
                onChange={(e) => setManualAmountStr(formatLiveInput(e.target.value))}
                placeholder="현재 누적 금액"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-right font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Color */}
        <div>
          <label className="mb-1 block text-xs text-slate-400">색</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`h-7 w-7 rounded border border-slate-700 text-xs text-slate-500 hover:border-slate-500 ${
                color == null ? 'ring-1 ring-sky-500' : ''
              }`}
            >
              ✕
            </button>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded transition ${color === c ? 'ring-2 ring-white' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

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
    <ConfirmDialog
      open={confirmingDelete}
      title="목표 삭제"
      danger
      confirmLabel="영구 삭제"
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={performDelete}
      message="이 목표를 영구 삭제합니다. 계속하시겠습니까?"
    />
    </>
  )
}

export default memo(GoalForm)
