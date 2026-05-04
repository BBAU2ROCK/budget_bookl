import { useEffect, useState } from 'react'
import ExchangeRatesSection from '../components/ExchangeRatesSection'
import ResetSection from '../components/ResetSection'
import BudgetMatrixImportSection from '../components/BudgetMatrixImportSection'

interface AppMeta {
  name: string
  version: string
  dbPath: string
  userDataPath: string
  platform: string
  electron: string
  node: string
}

export default function BackupSettings(): React.JSX.Element {
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const append = (line: string): void =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 12))

  useEffect(() => {
    window.api.app.meta().then(setMeta)
    window.api.settings.all().then(setSettings)
  }, [])

  async function exportDb(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.backup.exportDb()
      if (!r) return append('DB 백업 취소됨')
      append(`✓ DB 백업 저장: ${r.savedPath} (${(r.sizeBytes / 1024).toFixed(1)} KB)`)
    } catch (e) {
      append(`✗ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function importDb(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.backup.importDb()
      if (!r) return append('DB 복원 취소됨')
      append(
        `✓ 복원 완료. 기존 DB는 ${r.previousBackupPath}로 안전 백업되었습니다. 앱을 재시작해 주세요.`
      )
    } catch (e) {
      append(`✗ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.backup.exportCsv({})
      if (!r) return append('CSV 내보내기 취소됨')
      append(`✓ CSV 저장: ${r.savedPath} (${r.rowCount}건)`)
    } catch (e) {
      append(`✗ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function importCsv(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.backup.importCsv()
      if (!r) return append('CSV 가져오기 취소됨')
      append(`✓ CSV 가져오기: 삽입 ${r.inserted}건, 건너뜀 ${r.skipped}건`)
      if (r.errors.length > 0) {
        r.errors.slice(0, 3).forEach((e) => append(`  · row ${e.row}: ${e.message}`))
      }
    } catch (e) {
      append(`✗ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function regenerateDue(): Promise<void> {
    setBusy(true)
    try {
      const r = await window.api.recurring.generateDue()
      append(
        `✓ 반복지출 자동생성: 생성 ${r.created}, 스킵 ${r.skipped} (총 ${r.seriesProcessed}개 시리즈 처리)`
      )
      if (r.errors.length > 0) {
        r.errors.slice(0, 3).forEach((e) => append(`  · ${e.seriesId} ${e.date}: ${e.message}`))
      }
    } catch (e) {
      append(`✗ ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">설정 / 백업</h1>
        <p className="text-sm text-slate-400">데이터 백업과 내보내기</p>
      </header>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-200">앱 정보</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <MetaRow k="앱" v={meta ? `${meta.name} v${meta.version}` : '—'} />
          <MetaRow k="플랫폼" v={meta?.platform ?? '—'} />
          <MetaRow k="Electron" v={meta?.electron ?? '—'} />
          <MetaRow k="Node" v={meta?.node ?? '—'} />
          <MetaRow k="DB 파일" v={meta?.dbPath ?? '—'} mono />
          <MetaRow k="기준 통화" v={(settings.baseCurrency as string) ?? 'KRW'} />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-200">백업 / 내보내기</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionButton
            disabled={busy}
            onClick={exportDb}
            title="DB 백업 (.db)"
            desc="현재 DB 파일을 원하는 위치에 복사합니다. 언제든 복원 가능합니다."
          />
          <ActionButton
            disabled={busy}
            onClick={importDb}
            title="DB 복원 (.db)"
            desc="백업 파일로 현재 DB를 교체합니다. 기존 DB는 자동 안전 백업됩니다."
          />
          <ActionButton
            disabled={busy}
            onClick={exportCsv}
            title="거래 CSV 내보내기"
            desc="거래 전체를 UTF-8 BOM CSV로 저장 (Excel 한글 호환)."
          />
          <ActionButton
            disabled={busy}
            onClick={importCsv}
            title="거래 CSV 가져오기"
            desc="CSV 파일의 거래를 추가 삽입합니다. 카테고리 경로·태그명 매칭."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-200">유지관리</h2>
        <ActionButton
          disabled={busy}
          onClick={regenerateDue}
          title="반복지출 수동 생성 실행"
          desc="활성 시리즈 중 오늘 이전 due 된 항목을 즉시 materialize 합니다."
        />
      </section>

      <ExchangeRatesSection />

      <BudgetMatrixImportSection />

      <ResetSection />

      <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">로그</h3>
        {log.length === 0 ? (
          <p className="font-mono text-xs text-slate-600">—</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-slate-400">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center">
      <dt className="w-24 text-slate-500">{k}</dt>
      <dd className={`flex-1 truncate text-slate-300 ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  )
}

function ActionButton({
  title,
  desc,
  onClick,
  disabled
}: {
  title: string
  desc: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 text-left transition hover:border-sky-500/60 hover:bg-sky-500/10 disabled:opacity-50"
    >
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{desc}</div>
    </button>
  )
}
