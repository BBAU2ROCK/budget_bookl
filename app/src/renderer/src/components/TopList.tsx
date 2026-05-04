import type { CurrencyDto, TopPayeeEntry, TopTransactionEntry } from '../../../shared/types'
import { formatInteger, formatMoney } from '../lib/money'
import InfoTip from './InfoTip'

export function TopPayees({
  data,
  currency,
  currencies
}: {
  data: TopPayeeEntry[]
  currency: string
  currencies?: CurrencyDto[]
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-200">
        자주 쓴 곳 Top 10
        <InfoTip>
          <b>지출처(가게/서비스 이름)</b>를 같은 이름끼리 묶어 합계가 큰 순서로 10곳을 보여줍니다.
          <br />
          <br />
          <b>계산:</b> 그 기간의 「지출」 거래를 <b>지출처 이름</b>으로 묶은 합계
          <br />
          <b>회수:</b> 같은 지출처에서 결제한 횟수
          <br />
          <br />
          예: 스타벅스 12회 / 합계 4만8천원처럼 표시.
        </InfoTip>
      </h3>
      {data.length === 0 ? (
        <div className="text-sm text-slate-500">데이터 없음</div>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {data.map((row, i) => (
            <li
              key={row.payee}
              className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-slate-800/60"
            >
              <span className="w-5 text-xs text-slate-500">{i + 1}</span>
              <span className="flex-1 truncate text-slate-200">{row.payee}</span>
              <span className="text-xs text-slate-500">{formatInteger(row.count)}회</span>
              <span className="font-mono text-slate-300">
                {formatMoney(row.total, currency, currencies)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function TopTransactions({
  data,
  currency,
  currencies
}: {
  data: TopTransactionEntry[]
  currency: string
  currencies?: CurrencyDto[]
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h3 className="mb-3 flex items-center text-sm font-semibold text-slate-200">
        가장 큰 지출 Top 10
        <InfoTip>
          그 기간의 <b>「지출」 거래 한 건씩</b>을 금액 큰 순서로 10건 보여줍니다.
          <br />
          <br />
          위「자주 쓴 곳 Top 10」은 같은 가게의 여러 결제를 묶지만, 여기는 <b>한 건 단위</b>입니다.
          큰 결제 한 번을 놓치지 않게 보는 용도.
        </InfoTip>
      </h3>
      {data.length === 0 ? (
        <div className="text-sm text-slate-500">데이터 없음</div>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {data.map((row, i) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-slate-800/60"
            >
              <span className="w-5 text-xs text-slate-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-200">
                  {row.payee ?? row.memo ?? '(설명 없음)'}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {row.categoryPath ?? '미분류'} ·{' '}
                  {new Date(row.occurredAt).toLocaleDateString()}
                </div>
              </div>
              <span className="font-mono text-rose-300">
                {formatMoney(row.amountInBase, currency, currencies)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
