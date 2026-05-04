import { useState } from 'react'
import type { ResetMode, ResetResult } from '../../../shared/types'
import Modal from './Modal'
import { useToast } from './toast/ToastContext'

const CONFIRM_TOKEN = '초기화'

export default function ResetSection(): React.JSX.Element {
  const [mode, setMode] = useState<ResetMode | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResetResult | null>(null)
  const toast = useToast()

  const isConfirmed = typed.trim() === CONFIRM_TOKEN

  function openModal(m: ResetMode): void {
    setMode(m)
    setTyped('')
    setResult(null)
  }

  function closeModal(): void {
    if (busy) return
    setMode(null)
    setTyped('')
  }

  async function backupFirst(): Promise<void> {
    const r = await window.api.backup.exportDb()
    if (r) {
      toast.show({
        tone: 'success',
        message: `백업이 저장되었습니다: ${r.savedPath}`,
        durationMs: 5000
      })
    }
  }

  async function executeReset(): Promise<void> {
    if (!mode || !isConfirmed) return
    setBusy(true)
    try {
      const r =
        mode === 'transactions'
          ? await window.api.reset.transactionsOnly()
          : await window.api.reset.all()
      setResult(r)
    } catch (e) {
      toast.show({
        tone: 'error',
        message: `초기화 실패: ${(e as Error).message}`,
        durationMs: 6000
      })
    } finally {
      setBusy(false)
    }
  }

  async function restart(): Promise<void> {
    await window.api.appControl.relaunch()
  }

  return (
    <section className="rounded-xl border border-rose-500/30 bg-slate-900/50 p-5">
      <h2 className="mb-1 text-base font-semibold text-rose-200">⚠️ 데이터 초기화</h2>
      <p className="mb-4 text-xs text-slate-400">
        되돌릴 수 없는 파괴적 작업입니다. 실행 전에 반드시 DB 백업(위 "백업 / 내보내기" 섹션)을
        먼저 수행해 주세요.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ResetCard
          tone="amber"
          title="거래 내역만 초기화"
          description="모든 거래·반복지출·첨부파일 삭제. 카테고리, 태그, 계좌, 환율, 설정은 유지됩니다."
          onClick={() => openModal('transactions')}
          disabled={busy}
        />
        <ResetCard
          tone="rose"
          title="공장 초기화 (전체 삭제)"
          description="모든 데이터 삭제 + 기본 카테고리/통화/설정 재생성. 앱을 처음 설치한 상태로 돌아갑니다."
          onClick={() => openModal('all')}
          disabled={busy}
        />
      </div>

      <Modal
        open={!!mode}
        onClose={closeModal}
        title={
          mode === 'transactions'
            ? '거래 내역 초기화 확인'
            : mode === 'all'
              ? '공장 초기화 확인'
              : ''
        }
        size="md"
        footer={
          !result ? (
            <>
              <button
                onClick={backupFirst}
                disabled={busy}
                className="mr-auto rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
              >
                💾 DB 백업 먼저 저장
              </button>
              <button
                onClick={closeModal}
                disabled={busy}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={executeReset}
                disabled={!isConfirmed || busy}
                className="rounded-md border border-rose-500/60 bg-rose-500/25 px-3 py-1.5 text-sm font-medium text-rose-200 hover:bg-rose-500/35 disabled:opacity-40"
              >
                {busy ? '삭제 중...' : '영구 삭제 실행'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={closeModal}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
              >
                닫기
              </button>
              <button
                onClick={restart}
                className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
              >
                앱 재시작
              </button>
            </>
          )
        }
      >
        {result ? (
          <ResetResultView result={result} />
        ) : (
          <div className="space-y-4 text-sm">
            {mode === 'transactions' ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="mb-1 font-semibold">삭제될 항목</div>
                <ul className="space-y-0.5">
                  <li>· 모든 거래 (transactions)</li>
                  <li>· 거래 분할 (transaction_splits)</li>
                  <li>· 거래-태그 연결 (transaction_tags)</li>
                  <li>· 모든 반복지출/수입 시리즈 (recurring_series)</li>
                  <li>· 모든 첨부파일 메타데이터 (attachments)</li>
                </ul>
                <div className="mt-2 font-semibold">유지될 항목</div>
                <ul className="space-y-0.5">
                  <li>· 카테고리, 태그, 계좌 정의</li>
                  <li>· 예산, 저축 목표</li>
                  <li>· 환율, 설정값, 기준 통화</li>
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                <div className="mb-1 font-semibold">전부 삭제됨</div>
                <ul className="space-y-0.5">
                  <li>· 모든 거래, 분할, 반복, 태그, 계좌, 환율</li>
                  <li>· 모든 예산, 저축 목표</li>
                  <li>· 사용자가 만든 카테고리 (기본 카테고리로 대체)</li>
                  <li>· 모든 설정값 (기본값으로 복원)</li>
                </ul>
                <div className="mt-2 font-semibold">복원될 항목</div>
                <ul className="space-y-0.5">
                  <li>· 기본 통화 5개 (KRW/USD/EUR/JPY/CNY)</li>
                  <li>· 기본 카테고리 31개 (수입 5 + 지출 26)</li>
                  <li>· 기본 설정 (baseCurrency=KRW, locale=ko-KR 등)</li>
                </ul>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-slate-400">
                확인을 위해 아래 입력창에{' '}
                <b className="font-mono text-rose-300">{CONFIRM_TOKEN}</b>을(를) 정확히
                입력하세요.
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_TOKEN}
                autoFocus
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-rose-500 focus:outline-none"
              />
              {typed && !isConfirmed && (
                <p className="mt-1 text-xs text-slate-500">정확히 입력해야 버튼이 활성화됩니다.</p>
              )}
            </div>

            <div className="rounded-md bg-slate-950/80 p-3 text-[11px] text-slate-500">
              Tip: "DB 백업 먼저 저장" 버튼으로 실행 전 안전 백업을 남길 수 있습니다. 이후 "설정 /
              백업" 화면에서 언제든 복원할 수 있습니다.
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

function ResetCard({
  tone,
  title,
  description,
  onClick,
  disabled
}: {
  tone: 'amber' | 'rose'
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/40 hover:border-amber-400/80 hover:bg-amber-500/10'
      : 'border-rose-500/40 hover:border-rose-400/80 hover:bg-rose-500/10'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border bg-slate-900/60 p-4 text-left transition disabled:opacity-50 ${toneClass}`}
    >
      <div
        className={`text-sm font-semibold ${
          tone === 'amber' ? 'text-amber-200' : 'text-rose-200'
        }`}
      >
        {title}
      </div>
      <div className="mt-1 text-xs text-slate-400">{description}</div>
    </button>
  )
}

function ResetResultView({ result }: { result: ResetResult }): React.JSX.Element {
  const d = result.deleted
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-200">
        <div className="font-semibold">
          ✓ {result.mode === 'transactions' ? '거래 내역이 초기화되었습니다.' : '공장 초기화가 완료되었습니다.'}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-slate-500">삭제된 항목</div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
          <Item label="거래" n={d.transactions} />
          <Item label="거래 분할" n={d.transactionSplits ?? 0} />
          <Item label="반복 시리즈" n={d.recurringSeries} />
          <Item label="첨부파일" n={d.attachments} />
          {result.mode === 'all' && (
            <>
              <Item label="예산" n={d.budgets ?? 0} />
              <Item label="저축 목표" n={d.savingsGoals ?? 0} />
              <Item label="계좌" n={d.accounts ?? 0} />
              <Item label="카테고리" n={d.categories ?? 0} />
              <Item label="태그" n={d.tags ?? 0} />
              <Item label="환율" n={d.exchangeRates ?? 0} />
            </>
          )}
        </dl>
      </div>

      <div className="rounded-md bg-slate-950/80 p-3 text-[11px] text-slate-500">
        일부 뷰는 앱 재시작 후에 깔끔하게 갱신됩니다. 지금 재시작하시겠습니까?
      </div>
    </div>
  )
}

function Item({ label, n }: { label: string; n: number }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{n.toLocaleString()}건</dd>
    </div>
  )
}
