import type { CurrencyDto, GoalProgressDto } from '../../../../shared/types'
import { formatInteger, formatMoney } from '../../lib/money'

interface Props {
  progress: GoalProgressDto
  currencies: CurrencyDto[]
}

export default function GoalSourceBreakdown({
  progress,
  currencies
}: Props): React.JSX.Element {
  const c = progress.currency
  return (
    <div className="rounded-md border border-slate-700/40 bg-slate-950/40 p-3 text-xs">
      <div className="mb-1.5 font-semibold text-slate-300">📊 진행 출처</div>
      <div className="space-y-0.5 font-mono">
        <Row label="계좌">
          <span className="text-slate-200">
            {formatMoney(progress.fromAccounts, c, currencies)}
          </span>
          {progress.startingBalanceOffset > 0 && (
            <span className="ml-2 text-[10px] text-slate-500">
              (시작 잔액 −{formatMoney(progress.startingBalanceOffset, c, currencies)} 차감됨)
            </span>
          )}
          {progress.accountContributions.length > 0 && (
            <ul className="mt-0.5 ml-3 text-[10px] text-slate-500">
              {progress.accountContributions.map((a) => (
                <li key={a.accountId}>
                  └ {a.accountName}: {formatMoney(a.balance, c, currencies)}
                </li>
              ))}
              {progress.startingBalanceOffset > 0 && (
                <li className="text-amber-300/80">
                  ↳ 합산 후 시작 잔액 −{formatMoney(progress.startingBalanceOffset, c, currencies)}{' '}
                  차감 적용
                </li>
              )}
            </ul>
          )}
        </Row>
        <Row label="태그">
          <span className="text-slate-200">
            {formatMoney(progress.fromTags, c, currencies)}
          </span>
          {progress.tagContributions.length > 0 && (
            <ul className="mt-0.5 ml-3 text-[10px] text-slate-500">
              {progress.tagContributions.map((t) => (
                <li key={t.tagId}>
                  └ {t.tagName}: {formatMoney(t.total, c, currencies)} (
                  {formatInteger(t.txCount)}건 = income {formatInteger(t.incomeCount)} +
                  transfer {formatInteger(t.transferInCount)})
                </li>
              ))}
            </ul>
          )}
        </Row>
        {progress.fromManual > 0 && (
          <Row label="수동">
            <span className="text-slate-200">
              {formatMoney(progress.fromManual, c, currencies)}
            </span>
          </Row>
        )}
        <div className="mt-1 border-t border-slate-700/40 pt-1">
          <Row label="총 누적">
            <span className="font-bold text-slate-100">
              {formatMoney(progress.totalSaved, c, currencies)} {c}
            </span>
          </Row>
        </div>
      </div>
    </div>
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
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}
