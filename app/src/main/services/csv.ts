import { BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { transactionsRepo } from '../db/repositories/transactions'
import { categoriesRepo } from '../db/repositories/categories'
import { tagsRepo } from '../db/repositories/tags'
import type {
  CsvExportInput,
  CsvExportResult,
  CsvImportResult,
  TransactionCreateInput,
  TransactionType
} from '../../shared/types'

/* =========================================================================
 * CSV serialization helpers
 * =========================================================================*/

function escapeCsv(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

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

/* =========================================================================
 * Export
 * =========================================================================*/

const EXPORT_COLUMNS = [
  'id',
  'type',
  'occurred_at',
  'amount',
  'currency',
  'amount_in_base',
  'base_currency',
  'fx_rate',
  'category_path',
  'account_id',
  'counter_account_id',
  'counter_amount',
  'original_amount',
  'discount_reason',
  'payee',
  'memo',
  'payment_method',
  'tags'
]

export async function exportTransactionsCsv(
  input: CsvExportInput
): Promise<CsvExportResult | null> {
  const result = transactionsRepo.list(input.filter ?? {})

  // Build category path lookup
  const catList = categoriesRepo.list(true)
  const catById = new Map(catList.map((c) => [c.id, c]))
  const pathOf = (id: string | null): string => {
    if (!id) return ''
    let cur = catById.get(id)
    if (!cur) return ''
    const parts: string[] = [cur.name]
    while (cur?.parentId) {
      cur = catById.get(cur.parentId)
      if (cur) parts.unshift(cur.name)
    }
    return parts.join(' › ')
  }

  const tagList = tagsRepo.list(true)
  const tagById = new Map(tagList.map((t) => [t.id, t.name]))

  // Build CSV
  const lines: string[] = []
  lines.push(EXPORT_COLUMNS.join(','))
  for (const tx of result.rows) {
    const row = [
      tx.id,
      tx.type,
      tx.occurredAt,
      tx.amount,
      tx.currency,
      tx.amountInBase,
      tx.baseCurrency,
      tx.fxRate,
      pathOf(tx.categoryId),
      tx.accountId ?? '',
      tx.counterAccountId ?? '',
      tx.counterAmount ?? '',
      tx.originalAmount ?? '',
      tx.discountReason ?? '',
      tx.payee ?? '',
      tx.memo ?? '',
      tx.paymentMethod ?? '',
      tx.tagIds.map((id) => tagById.get(id) ?? id).join('|')
    ]
    lines.push(row.map(escapeCsv).join(','))
  }

  const focused = BrowserWindow.getFocusedWindow()
  const { canceled, filePath } = await dialog.showSaveDialog(focused ?? undefined!, {
    title: '거래 내역 CSV 내보내기',
    defaultPath:
      input.suggestedFilename ??
      `budgetbook-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (canceled || !filePath) return null

  // Write with UTF-8 BOM so Excel on Windows interprets Korean correctly
  writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf8')

  return { savedPath: filePath, rowCount: result.rows.length }
}

/* =========================================================================
 * Import
 * =========================================================================*/

export async function importTransactionsCsv(): Promise<CsvImportResult | null> {
  const focused = BrowserWindow.getFocusedWindow()
  const { canceled, filePaths } = await dialog.showOpenDialog(focused ?? undefined!, {
    title: 'CSV 파일 선택',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (canceled || filePaths.length === 0) return null

  const content = readFileSync(filePaths[0], 'utf8').replace(/^\uFEFF/, '')
  const rawLines = content.split(/\r?\n/).filter((l) => l.length > 0)
  if (rawLines.length <= 1) return { inserted: 0, skipped: 0, errors: [] }

  const header = parseCsvLine(rawLines[0]).map((h) => h.trim())
  const idx = (name: string): number => header.indexOf(name)

  const colType = idx('type')
  const colOccurred = idx('occurred_at')
  const colAmount = idx('amount')
  const colCurrency = idx('currency')
  const colCategoryPath = idx('category_path')
  const colPayee = idx('payee')
  const colMemo = idx('memo')
  const colPaymentMethod = idx('payment_method')
  const colTags = idx('tags')
  const colOriginalAmount = idx('original_amount')
  const colDiscountReason = idx('discount_reason')
  const colCounterAmount = idx('counter_amount')

  if (colType < 0 || colOccurred < 0 || colAmount < 0 || colCurrency < 0) {
    throw new Error(
      'CSV 헤더에 필수 컬럼이 없습니다: type, occurred_at, amount, currency'
    )
  }

  const catList = categoriesRepo.list(true)
  // 카테고리 매핑 정책:
  //  1) full path("식비 › 외식")로 정확 매핑 — 항상 우선
  //  2) 단일 이름("외식")은 그 이름이 트리 전체에 1회만 존재할 때만 매핑.
  //     같은 이름이 여러 부모 아래에 있으면 모호하므로 매핑 안 함 (CSV 매핑 오류 방지).
  const pathToId = new Map<string, string>()
  const pathOf = (id: string): string => {
    let cur = catList.find((c) => c.id === id)
    if (!cur) return ''
    const parts: string[] = [cur.name]
    const seen = new Set<string>([cur.id])
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId)
      cur = catList.find((c) => c.id === cur!.parentId)
      if (cur) parts.unshift(cur.name)
    }
    return parts.join(' › ')
  }
  // 1) full path 매핑
  for (const c of catList) {
    pathToId.set(pathOf(c.id), c.id)
  }
  // 2) 유일한 이름만 단축 매핑
  const nameCount = new Map<string, number>()
  for (const c of catList) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1)
  for (const c of catList) {
    if ((nameCount.get(c.name) ?? 0) === 1 && !pathToId.has(c.name)) {
      pathToId.set(c.name, c.id)
    }
  }

  let inserted = 0
  let skipped = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let r = 1; r < rawLines.length; r++) {
    const cells = parseCsvLine(rawLines[r])
    try {
      // 외부 가계부 호환: 'Expense'/'EXPENSE' 같은 변형도 허용
      const type = (cells[colType]?.toLowerCase().trim() ?? '') as TransactionType
      if (!['expense', 'income', 'transfer'].includes(type)) {
        throw new Error(`알 수 없는 type: ${cells[colType]}`)
      }
      const occurredAt = cells[colOccurred]
      const amount = Number(cells[colAmount])
      const currency = cells[colCurrency]
      if (!occurredAt || Number.isNaN(amount) || amount <= 0 || !currency) {
        throw new Error('필수 필드 누락 또는 잘못된 값 (amount는 양수여야 합니다)')
      }

      const categoryId = colCategoryPath >= 0 ? pathToId.get(cells[colCategoryPath]) ?? null : null
      const tagNames =
        colTags >= 0 && cells[colTags] ? cells[colTags].split('|').map((t) => t.trim()).filter(Boolean) : []
      const tagIds = tagsRepo.ensureByNames(tagNames)

      // 선택적 컬럼들 — 헤더에 있고 값이 비어있지 않은 경우에만 포함
      const originalAmountRaw = colOriginalAmount >= 0 ? cells[colOriginalAmount] : ''
      const originalAmount =
        originalAmountRaw && !Number.isNaN(Number(originalAmountRaw))
          ? Number(originalAmountRaw)
          : null
      const counterAmountRaw = colCounterAmount >= 0 ? cells[colCounterAmount] : ''
      const counterAmount =
        counterAmountRaw && !Number.isNaN(Number(counterAmountRaw))
          ? Number(counterAmountRaw)
          : null

      const input: TransactionCreateInput = {
        type,
        occurredAt,
        amount,
        currency,
        categoryId,
        payee: colPayee >= 0 ? cells[colPayee] || null : null,
        memo: colMemo >= 0 ? cells[colMemo] || null : null,
        paymentMethod: colPaymentMethod >= 0 ? cells[colPaymentMethod] || null : null,
        originalAmount,
        discountReason: colDiscountReason >= 0 ? cells[colDiscountReason] || null : null,
        counterAmount,
        tagIds
      }
      transactionsRepo.create(input)
      inserted++
    } catch (err) {
      skipped++
      errors.push({ row: r + 1, message: (err as Error).message })
    }
  }

  return { inserted, skipped, errors }
}
