import { useRef, useState } from 'react'
import type { BudgetCreateInput, CategoryDto } from '../../../shared/types'

/**
 * Budget Matrix CSV import:
 *   Header row: 카테고리,2026-01,2026-02,...
 *   Each row: <category name>,<amount>,<amount>,...
 * Empty cells / 0 = skip.
 */
export default function BudgetMatrixImportSection(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const text = await file.text()
      // Strip UTF-8 BOM if present
      const cleanText = text.replace(/^﻿/, '')
      const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length < 2) {
        throw new Error('CSV에 헤더 또는 데이터가 부족합니다.')
      }

      const header = parseCsvLine(lines[0])
      if (header.length < 2) {
        throw new Error('헤더에 카테고리 컬럼과 최소 1개 월 컬럼이 필요합니다.')
      }
      const monthCols = header.slice(1)
      // Validate month format: YYYY-MM
      const monthRegex = /^(\d{4})-(\d{2})$/
      const months = monthCols.map((c) => {
        const m = monthRegex.exec(c.trim())
        if (!m) throw new Error(`헤더 "${c}"가 YYYY-MM 형식이 아닙니다.`)
        return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) }
      })

      const allCategories: CategoryDto[] = await window.api.categories.list(true)
      const findByName = (name: string): CategoryDto | null => {
        const trimmed = name.trim()
        return allCategories.find((c) => c.name === trimmed) ?? null
      }

      const budgetsToUpsert: BudgetCreateInput[] = []
      const parseErrors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i])
        if (cells.length === 0) continue
        const categoryName = (cells[0] ?? '').trim()
        if (!categoryName) continue

        const category = findByName(categoryName)
        if (!category) {
          parseErrors.push(`행 ${i + 1}: 카테고리 "${categoryName}" 없음 (건너뜀)`)
          continue
        }

        for (let j = 0; j < monthCols.length; j++) {
          const cell = (cells[j + 1] ?? '').trim()
          if (!cell || cell === '0' || cell === '-') continue
          const amount = parseInt(cell.replace(/[,원\s]/g, ''), 10)
          if (!Number.isFinite(amount) || amount < 0) {
            parseErrors.push(`행 ${i + 1}, ${monthCols[j]}: 잘못된 금액 (${cell})`)
            continue
          }
          budgetsToUpsert.push({
            categoryId: category.id,
            periodYear: months[j].year,
            periodMonth: months[j].month,
            amount
          })
        }
      }

      if (budgetsToUpsert.length === 0) {
        throw new Error('가져올 예산이 없습니다. CSV 내용을 확인해 주세요.')
      }

      const res = await window.api.budgets.bulkUpsert({ budgets: budgetsToUpsert })

      const lines2 = [
        `✓ 처리 완료: 신규 ${res.created}건, 업데이트 ${res.updated}건`,
        ...(res.errors.length > 0
          ? [`API 오류 ${res.errors.length}건:`, ...res.errors.slice(0, 3).map((e) => `  · 행 ${e.index + 2}: ${e.message}`)]
          : []),
        ...(parseErrors.length > 0
          ? [`파싱 경고 ${parseErrors.length}건:`, ...parseErrors.slice(0, 3).map((e) => `  · ${e}`)]
          : [])
      ]
      setResult(lines2.join('\n'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function downloadSampleCsv(): void {
    const header = ['카테고리']
    const months: string[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const m = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
    }
    const csv = [
      [...header, ...months].join(','),
      ['식비', ...months.map(() => '500000')].join(','),
      ['교통비', ...months.map(() => '400000')].join(','),
      ['통신비', ...months.map(() => '60000')].join(',')
    ].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `budget-matrix-template-${now.toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-200">📋 예산 매트릭스 가져오기</h2>
      <p className="mb-3 text-xs text-slate-500">
        CSV 헤더: <code className="rounded bg-slate-950 px-1">카테고리,2026-01,2026-02,...</code>
        <br />
        카테고리명은 앱의 기존 이름과 정확히 일치해야 합니다. 0 또는 빈 셀은 건너뜁니다.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
        >
          {busy ? '처리 중...' : '📁 CSV 파일 선택'}
        </button>
        <button
          onClick={downloadSampleCsv}
          disabled={busy}
          className="rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          📥 샘플 양식 다운로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>

      {result && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          {result}
        </pre>
      )}
      {error && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          ✗ {error}
        </pre>
      )}
    </section>
  )
}

/* ─── Minimal CSV line parser (handles quoted fields) ──────────────────────*/
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQuote = true
      else if (c === ',') {
        out.push(cur)
        cur = ''
      } else cur += c
    }
  }
  out.push(cur)
  return out
}
