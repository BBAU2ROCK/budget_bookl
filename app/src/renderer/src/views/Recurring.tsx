import { useCallback, useEffect, useState } from 'react'
import type { CurrencyDto, RecurringSeriesDto, CategoryDto, AccountDto } from '../../../shared/types'
import RecurringForm from '../components/RecurringForm'
import InfoTip from '../components/InfoTip'
import { formatMoney } from '../lib/money'

export default function Recurring(): React.JSX.Element {
  const [list, setList] = useState<RecurringSeriesDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [editing, setEditing] = useState<RecurringSeriesDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [rec, ccy, cat, acct] = await Promise.all([
      window.api.recurring.list(includeInactive),
      window.api.currencies.list(),
      window.api.categories.list(true),
      window.api.accounts.list(true)
    ])
    setList(rec)
    setCurrencies(ccy)
    setCategories(cat)
    setAccounts(acct)
  }, [includeInactive])

  useEffect(() => {
    load()
  }, [load])

  async function runNow(): Promise<void> {
    const r = await window.api.recurring.generateDue()
    setLastRun(
      `${new Date().toLocaleString()} — 생성 ${r.created}건, 스킵 ${r.skipped}건 (${r.seriesProcessed}개 시리즈 처리)`
    )
    await load()
  }

  async function toggleActive(item: RecurringSeriesDto): Promise<void> {
    await window.api.recurring.update({ id: item.id, isActive: !item.isActive })
    await load()
  }

  const catById = new Map(categories.map((c) => [c.id, c]))
  const acctById = new Map(accounts.map((a) => [a.id, a]))

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-100">
            반복 지출/수입
            <InfoTip side="bottom">
              매달·매주 자동으로 생성될 거래입니다 (월세·통신비·구독·월급 등).
              <br />
              <br />
              <b>주기 설정:</b> 매일 / 매주 / 매월 / 매년 단위로 시작일·종료일 지정
              <br />
              <br />
              <b>자동 생성:</b> 앱을 켤 때마다 발생일이 지난 거래를 자동으로 만듭니다. 끄면 발생일이 와도 자동 생성 X (수동으로만)
              <br />
              <br />
              <b>일시 정지:</b> 특정 날짜까지 자동 생성 멈춤. 그 날짜가 지나면 자동 재개
              <br />
              <br />
              <b>다음 발생일:</b> 다음에 자동 생성될 날짜. 일시 정지 중에도 미리 계산해서 표시
              <br />
              <br />
              <b>중요:</b> 자동 생성된 거래는 일반 거래와 똑같이 편집·삭제 가능. 시리즈 자체를 삭제해도 이미 만들어진 과거 거래는 그대로 남습니다.
            </InfoTip>
          </h1>
          <p className="text-sm text-slate-400">
            {list.length}개 시리즈 · 자동 생성은 앱 시작 시 실행됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            비활성 포함
          </label>
          <button
            onClick={runNow}
            className="rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/25"
          >
            지금 실행
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 반복
          </button>
        </div>
      </header>

      {lastRun && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {lastRun}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <p className="text-sm text-slate-400">
            등록된 반복 항목이 없습니다.
            <br />
            구독료·월세·고정 수입 등을 자동 기록하려면 새로 추가하세요.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 rounded-md border border-sky-500/60 bg-sky-500/20 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/30"
          >
            첫 반복 만들기
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700/50 bg-slate-900/70 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">구분</th>
                <th className="px-4 py-2.5">카테고리</th>
                <th className="px-4 py-2.5">계좌</th>
                <th className="px-4 py-2.5">주기</th>
                <th className="px-4 py-2.5">다음 일자</th>
                <th className="px-4 py-2.5 text-right">금액</th>
                <th className="px-4 py-2.5 text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setEditing(r)}
                  className={`cursor-pointer border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40 ${
                    !r.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-200">
                    <div className="font-medium">{r.name}</div>
                    {r.payee && (
                      <div className="text-xs text-slate-500">{r.payee}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.type === 'expense' ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
                        지출
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                        수입
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {r.categoryId ? (catById.get(r.categoryId)?.name ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {r.accountId ? (
                      <span className="flex items-center gap-1">
                        {acctById.get(r.accountId)?.icon}
                        {acctById.get(r.accountId)?.name ?? '—'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    <code className="font-mono">{humanizeRrule(r.rrule)}</code>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                    {r.nextOccurrence ?? '—'}
                    {isPaused(r) && (
                      <div className="mt-0.5 text-[10px] text-amber-300">
                        ⏸ {r.pausedUntil}까지 일시정지
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-200">
                    {formatMoney(r.amount, r.currency, currencies)} {r.currency}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleActive(r)
                      }}
                      className={`rounded-full px-2 py-0.5 ${
                        !r.isActive
                          ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                          : isPaused(r)
                            ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                            : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                      }`}
                    >
                      {!r.isActive ? '비활성' : isPaused(r) ? '일시정지' : '활성'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecurringForm open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <RecurringForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
        onDeleted={load}
      />
    </div>
  )
}

function isPaused(r: RecurringSeriesDto): boolean {
  if (!r.pausedUntil) return false
  const today = new Date().toISOString().slice(0, 10)
  return r.pausedUntil >= today
}

function humanizeRrule(rr: string): string {
  const body = rr.replace(/^RRULE:/, '')
  const parts = Object.fromEntries(body.split(';').map((p) => p.split('=') as [string, string]))
  const interval = Number(parts.INTERVAL ?? 1)
  const freq = parts.FREQ
  let base = ''
  if (interval === 1) {
    base =
      freq === 'DAILY' ? '매일' : freq === 'WEEKLY' ? '매주' : freq === 'MONTHLY' ? '매월' : '매년'
  } else {
    const unit =
      freq === 'DAILY' ? '일' : freq === 'WEEKLY' ? '주' : freq === 'MONTHLY' ? '개월' : '년'
    base = `${interval}${unit}마다`
  }
  if (parts.BYDAY) {
    const map: Record<string, string> = {
      SU: '일',
      MO: '월',
      TU: '화',
      WE: '수',
      TH: '목',
      FR: '금',
      SA: '토'
    }
    base += ' ' + parts.BYDAY.split(',').map((c) => map[c] + '요일').join(',')
  }
  if (parts.BYMONTHDAY) base += ` ${parts.BYMONTHDAY}일`
  return base
}
