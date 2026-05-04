import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AccountBalanceDto,
  AccountDto,
  AccountType,
  CurrencyDto
} from '../../../shared/types'
import AccountForm from '../components/AccountForm'
import CardAnalysisSection from '../components/CardAnalysisSection'
import InfoTip from '../components/InfoTip'
import { formatWithSymbol } from '../lib/money'

const TYPE_LABEL: Record<AccountType, string> = {
  checking: '입출금',
  savings: '예적금',
  credit_card: '신용카드',
  cash: '현금',
  investment: '투자',
  loan: '대출',
  other: '기타'
}

export default function Accounts(): React.JSX.Element {
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [balances, setBalances] = useState<AccountBalanceDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [editing, setEditing] = useState<AccountDto | null>(null)
  const [creating, setCreating] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      window.api.accounts.list(includeArchived),
      window.api.accounts.balances(),
      window.api.currencies.list()
    ])
    setAccounts(a)
    setBalances(b)
    setCurrencies(c)
  }, [includeArchived])

  useEffect(() => {
    load()
  }, [load])

  const balanceById = new Map(balances.map((b) => [b.accountId, b]))
  const cardAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'credit_card' && !a.isArchived),
    [accounts]
  )

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center text-2xl font-bold text-slate-100">
            계좌
            <InfoTip side="bottom">
              거래를 어디 통장에서 결제했는지 추적하는 곳입니다. <b>잔액 자동 계산</b>은
              초기 잔액 + 모든 수입·이체 in − 모든 지출·이체 out으로 이뤄집니다.
              <br />
              <br />
              <b>계좌 종류:</b>
              <br />
              · <b>입출금</b>: 일상 통장. 카드/현금 결제·이체 자유
              <br />
              · <b>예적금</b>: 저축 통장. 「저축」 KPI 합산 대상
              <br />
              · <b>신용카드</b>: 한도/결제일/결산일 입력 가능. 카드 분석에 잡힘
              <br />
              · <b>현금</b>: 지갑 현금
              <br />
              · <b>투자</b>: 주식·펀드 등. 「저축」 합산 대상
              <br />
              · <b>대출</b>: 마이너스 자산
            </InfoTip>
          </h1>
          <p className="text-sm text-slate-400">
            {accounts.length}개 · 자산 추적은 선택사항 (거래 기록에 필수 아님)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
            />
            보관 포함
          </label>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30"
          >
            + 새 계좌
          </button>
        </div>
      </header>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center">
          <p className="text-sm text-slate-400">
            등록된 계좌가 없습니다. <br />
            계좌를 만들면 이체/잔액 추적이 가능해집니다.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 rounded-md border border-sky-500/60 bg-sky-500/20 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/30"
          >
            첫 계좌 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const bal = balanceById.get(a.id)
            return (
              <button
                key={a.id}
                onClick={() => setEditing(a)}
                className={`rounded-xl border border-slate-700/70 bg-slate-900/50 p-5 text-left transition hover:border-sky-500/40 ${
                  a.isArchived ? 'opacity-60' : ''
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {a.icon && <span className="text-xl">{a.icon}</span>}
                    <span className="font-semibold text-slate-100">{a.name}</span>
                  </div>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {TYPE_LABEL[a.type]}
                  </span>
                </div>
                <div className="font-mono text-2xl font-bold text-slate-100">
                  {formatWithSymbol(bal?.balance ?? a.initialBalance, a.currency, currencies)}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{a.currency}</span>
                  {a.isArchived && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                      보관됨
                    </span>
                  )}
                </div>
                {bal && bal.netFlow !== 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    순 흐름: {bal.netFlow > 0 ? '+' : ''}
                    {formatWithSymbol(bal.netFlow, a.currency, currencies)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      <AccountForm open={creating} onClose={() => setCreating(false)} onSaved={load} />
      <AccountForm
        open={!!editing}
        initial={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <CardAnalysisSection cardAccounts={cardAccounts} currencies={currencies} />
    </div>
  )
}

