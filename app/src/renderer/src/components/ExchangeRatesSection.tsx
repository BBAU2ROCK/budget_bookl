import { useCallback, useEffect, useState } from 'react'
import type { CurrencyDto, ExchangeRateDto } from '../../../shared/types'
import { useToast } from './toast/ToastContext'

export default function ExchangeRatesSection(): React.JSX.Element {
  const [rates, setRates] = useState<ExchangeRateDto[]>([])
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [busy, setBusy] = useState(false)

  // Form state
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('KRW')
  const [rate, setRate] = useState('')
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  // Auto-refresh state
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [lastRunAt, setLastRunAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const toast = useToast()

  const load = useCallback(async () => {
    const [r, c, enabled, last] = await Promise.all([
      window.api.currencies.listRates(),
      window.api.currencies.list(),
      window.api.settings.get('autoFxRefreshEnabled') as Promise<boolean | undefined>,
      window.api.settings.get('autoFxRefreshLastRunAt') as Promise<string | null | undefined>
    ])
    setRates(r.slice().sort((a, b) => (a.asOf > b.asOf ? -1 : 1)))
    setCurrencies(c)
    setAutoEnabled(enabled ?? false)
    setLastRunAt(last ?? null)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleAuto(next: boolean): Promise<void> {
    setAutoEnabled(next)
    await window.api.settings.set('autoFxRefreshEnabled', next)
    if (next) {
      toast.show({
        tone: 'info',
        message:
          '환율 자동 갱신이 켜졌습니다. 다음 앱 실행 시 외부 API에서 최신 환율을 받아옵니다.'
      })
    }
  }

  async function handleManualRefresh(): Promise<void> {
    setRefreshing(true)
    try {
      const r = await window.api.currencies.autoRefresh()
      if (r.error) {
        toast.show({ tone: 'error', message: `환율 갱신 실패: ${r.error}` })
      } else {
        toast.show({
          tone: 'success',
          message: `${r.baseCurrency} 기준 ${r.saved}개 통화 환율 갱신 완료 (${r.asOf})`
        })
      }
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  async function handleUpsert(): Promise<void> {
    setError(null)
    const numRate = Number(rate)
    if (!Number.isFinite(numRate) || numRate <= 0) {
      setError('유효한 환율(양수)을 입력해 주세요.')
      return
    }
    if (fromCurrency === toCurrency) {
      setError('출발 통화와 도착 통화가 달라야 합니다.')
      return
    }
    setBusy(true)
    try {
      await window.api.currencies.upsertRate({
        fromCurrency,
        toCurrency,
        rate: numRate,
        asOf,
        source: 'manual'
      })
      setRate('')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('이 환율 항목을 삭제하시겠습니까?')) return
    setBusy(true)
    try {
      await window.api.currencies.deleteRate(id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-200">환율</h2>
          <p className="text-xs text-slate-500">
            다통화 거래·이체에서 FX 변환에 사용됩니다. 직접 입력 또는 자동 갱신 중 선택하세요.
          </p>
        </div>
      </div>

      {/* Auto-refresh strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={autoEnabled}
            onChange={(e) => toggleAuto(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            <b>자동 갱신</b> — 앱 실행 시 24시간마다 외부 API(open.er-api.com)에서 최신 환율 가져오기
          </span>
        </label>
        <div className="flex items-center gap-2">
          {lastRunAt && (
            <span className="text-xs text-slate-500">
              마지막 갱신: {new Date(lastRunAt).toLocaleString()}
            </span>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1 text-xs text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {refreshing ? '갱신 중...' : '🔄 지금 갱신'}
          </button>
        </div>
      </div>

      {/* Add form */}
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-5">
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-slate-500">
            출발
          </label>
          <select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-slate-500">
            도착
          </label>
          <select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-slate-500">
            환율
          </label>
          <input
            type="text"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={`1 ${fromCurrency} = ? ${toCurrency}`}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-slate-500">
            기준일
          </label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleUpsert}
            disabled={busy}
            className="w-full rounded border border-sky-500/60 bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
          >
            추가/갱신
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Table */}
      {rates.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">
          등록된 환율이 없습니다. 다통화 거래 전에 환율을 하나 이상 추가해 주세요.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">기준일</th>
                <th className="px-3 py-2">페어</th>
                <th className="px-3 py-2 text-right">환율</th>
                <th className="px-3 py-2">출처</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.asOf}</td>
                  <td className="px-3 py-2 text-slate-200">
                    {r.fromCurrency} → {r.toCurrency}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">
                    {r.rate.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.source}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={busy}
                      title="삭제"
                      className="text-slate-500 hover:text-rose-300 disabled:opacity-30"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
