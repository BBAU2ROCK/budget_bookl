import { useEffect, useState } from 'react'
import type {
  AccountSpendingEntry,
  AccountSpendingResult,
  CurrencyDto
} from '../../../../shared/types'
import { formatMoney } from '../../lib/money'
import InfoTip from '../InfoTip'

const ACCOUNT_TYPE_LABEL: Record<AccountSpendingEntry['accountType'], string> = {
  checking: '입출금',
  savings: '예적금',
  credit_card: '신용카드',
  cash: '현금',
  investment: '투자',
  loan: '대출',
  other: '기타'
}

const TYPE_BADGE_COLOR: Record<AccountSpendingEntry['accountType'], string> = {
  checking: 'bg-sky-500/15 text-sky-300',
  savings: 'bg-emerald-500/15 text-emerald-300',
  credit_card: 'bg-amber-500/15 text-amber-300',
  cash: 'bg-slate-500/15 text-slate-300',
  investment: 'bg-violet-500/15 text-violet-300',
  loan: 'bg-rose-500/15 text-rose-300',
  other: 'bg-slate-500/15 text-slate-300'
}

export default function AccountSpendingWidget({
  from,
  to,
  currencies,
  baseCurrency,
  title = '계좌별 지출'
}: {
  from: string
  to: string
  currencies: CurrencyDto[]
  baseCurrency: string
  title?: string
}): React.JSX.Element {
  const [data, setData] = useState<AccountSpendingResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    window.api.stats
      .accountSpending({ from, to })
      .then((res) => {
        if (alive) setData(res)
      })
      .catch((err) => {
        console.error(err)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [from, to])

  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center text-sm font-medium text-slate-200">
          {title}
          <InfoTip>
            카드·통장 등 <b>각 통장별로 이번 기간에 얼마 썼는지</b>를 보여줍니다.
            <br />
            <br />
            <b>계산:</b> 그 통장에서 일어난 「지출」 거래 합계
            <br />
            <b>막대 의미:</b>
            <br />
            · 신용카드: <b>한도 사용률</b> (90% 이상 빨강, 70% 이상 주황)
            <br />
            · 그 외 통장: 전체 지출 중 그 통장이 차지하는 비중
            <br />
            <br />
            이체로 다른 통장에 옮긴 돈은 「지출」이 아니므로 빠집니다.
          </InfoTip>
        </h3>
        {data && data.entries.length > 0 && (
          <span className="font-mono text-xs text-slate-400">
            합계 -{formatMoney(data.totalSum, baseCurrency, currencies)} {baseCurrency}
          </span>
        )}
      </header>

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-500">불러오는 중...</div>
      ) : !data || data.entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          이 기간 동안의 지출 거래가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.entries.map((e) => (
            <AccountRow
              key={e.accountId}
              entry={e}
              baseCurrency={baseCurrency}
              currencies={currencies}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AccountRow({
  entry,
  baseCurrency,
  currencies
}: {
  entry: AccountSpendingEntry
  baseCurrency: string
  currencies: CurrencyDto[]
}): React.JSX.Element {
  const isCard = entry.accountType === 'credit_card'
  // 신용카드인데 한도가 양수일 때만 한도 사용률 계산. 한도 0/null/음수는
  // 의미 있는 진행률로 환산할 수 없으므로 일반 비중 막대로 폴백.
  const cardUsage =
    isCard && entry.creditLimit != null && entry.creditLimit > 0
      ? entry.total / entry.creditLimit
      : null
  // 차지 비중(percent) 막대 vs 카드 한도 사용률 막대 — 둘 다 그릴 때는 카드 사용률을 우선
  const barPct = cardUsage != null ? Math.min(cardUsage, 1) : entry.percent
  const barColor =
    cardUsage != null
      ? cardUsage >= 0.9
        ? 'bg-rose-500'
        : cardUsage >= 0.7
          ? 'bg-amber-400'
          : 'bg-emerald-400'
      : 'bg-sky-500/70'

  return (
    <li className="rounded-md border border-slate-800/60 bg-slate-950/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {entry.icon ? (
            <span className="text-base">{entry.icon}</span>
          ) : (
            <span className="text-slate-600">·</span>
          )}
          <span className="truncate text-sm font-medium text-slate-100">{entry.name}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE_COLOR[entry.accountType]}`}
          >
            {ACCOUNT_TYPE_LABEL[entry.accountType]}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="whitespace-nowrap font-mono text-sm text-rose-300">
            -{formatMoney(entry.total, baseCurrency, currencies)}
          </span>
          <span className="text-[10px] text-slate-500">
            {entry.txCount}건 · {(entry.percent * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${Math.max(barPct * 100, 2).toFixed(1)}%` }}
        />
      </div>
      {cardUsage != null && (
        <div className="mt-1 text-[10px] text-slate-500">
          한도 {formatMoney(entry.creditLimit ?? 0, entry.currency, currencies)} {entry.currency}{' '}
          중 {(cardUsage * 100).toFixed(0)}% 사용
        </div>
      )}
    </li>
  )
}
