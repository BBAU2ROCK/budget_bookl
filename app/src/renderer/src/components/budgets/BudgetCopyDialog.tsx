import { useEffect, useState } from 'react'
import type { BudgetCopyResult } from '../../../../shared/types'
import Modal from '../Modal'

interface Props {
  open: boolean
  toYear: number
  toMonth: number
  onClose: () => void
  onCompleted: (result: BudgetCopyResult) => void
}

export default function BudgetCopyDialog({
  open,
  toYear,
  toMonth,
  onClose,
  onCompleted
}: Props): React.JSX.Element | null {
  const [fromYear, setFromYear] = useState(toYear)
  const [fromMonth, setFromMonth] = useState(toMonth === 1 ? 12 : toMonth - 1)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Default: previous month
    setFromYear(toMonth === 1 ? toYear - 1 : toYear)
    setFromMonth(toMonth === 1 ? 12 : toMonth - 1)
    setOverwrite(false)
    setError(null)
  }, [open, toYear, toMonth])

  async function handleCopy(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.budgets.copyMonth({
        fromYear,
        fromMonth,
        toYear,
        toMonth,
        overwrite
      })
      onCompleted(result)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="다른 달에서 예산 복사"
      size="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            취소
          </button>
          <button
            onClick={handleCopy}
            disabled={busy}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            {busy ? '복사 중...' : '복사'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-slate-300">
          <b>
            {toYear}년 {toMonth}월
          </b>
          로 예산을 복사합니다.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">출처: 연도</label>
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={9999}
              value={fromYear}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                if (digits) setFromYear(parseInt(digits, 10))
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">출처: 월</label>
            <select
              value={fromMonth}
              onChange={(e) => setFromMonth(parseInt(e.target.value, 10))}
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

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="h-4 w-4"
          />
          <span>대상 월에 이미 있는 예산 덮어쓰기</span>
        </label>

        {error && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
