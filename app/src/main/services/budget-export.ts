/**
 * 예산 메뉴 화면 데이터를 Excel(.xlsx) 파일로 내보냄 (v0.1.16).
 *
 * 가족 구성원이 외부(iPhone Numbers, 다른 PC 등)에서 확인할 수 있도록 한 시트로 깔끔하게
 * 정리. 한글 컬럼 헤더 / 천 단위 콤마 / 트리 들여쓰기 / 합계 행 강조.
 *
 * 단일 시트 구성:
 *  1. 제목 (병합 셀, 큰 글씨)
 *  2. 「이번 달 가계 흐름」 — 수입 / 지출 / 흑자 / 금융비용 (BudgetTopSummary 기반)
 *  3. 「예산 진행 상황」 — 예산 한도 / 사용 / 남은 / 사용률 / 시간 진행률 / 월말 예상
 *  4. 「카테고리별 상세」 — 트리 들여쓰기 + 사용률·상태·거래 건수
 *  5. 합계 행 (강조 색상)
 *  6. 푸터 (생성 일시 + 버전)
 *
 * 합계 계산: totalEntry(사용자 명시 전체 예산)가 있으면 우선 사용. 없으면
 * BudgetSummaryHeader의 buildAggregatedTotal과 동일한 부모-자식 중복 회피 로직.
 */
import { BrowserWindow, dialog } from 'electron'
import ExcelJS from 'exceljs'
import { statsRepo } from '../db/repositories/stats'
import { settingsRepo } from '../db/repositories/settings'
import type {
  BudgetExportInput,
  BudgetExportResult,
  BudgetStatus,
  BudgetVsActualEntry
} from '../../shared/types'

const STATUS_KO: Record<BudgetStatus, string> = {
  safe: '안전',
  warning: '주의',
  over: '초과',
  critical: '위험',
  unset: '미설정'
}

/** categoryPath의 ' › ' 구분자 개수로 트리 depth 계산 (0=root) */
function depthOf(e: BudgetVsActualEntry): number {
  if (!e.categoryPath) return 0
  return e.categoryPath.split(' › ').length - 1
}

export async function exportBudgetXlsx(
  input: BudgetExportInput
): Promise<BudgetExportResult | null> {
  const { year, month } = input

  // ===== 1. 데이터 수집 =====
  // includeUnsetCategories=true: 거래만 있고 예산은 없는 카테고리도 표시 (회색 처리됨)
  const entries = statsRepo.budgetVsActual({ year, month, includeUnsetCategories: true })
  const summary = statsRepo.monthlySummary({ year, month })
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString()
  const savings = statsRepo.savingsBalance({ from: monthStart, to: monthEnd })
  const baseCurrency = settingsRepo.getBaseCurrency()

  const totalEntry = entries.find((e) => e.isTotalRow) ?? null
  const catEntries = entries.filter((e) => !e.isTotalRow)

  // ===== 2. 합계 계산 =====
  let totalBudget = 0
  let totalActual = 0
  let daysInPeriod = 0
  let daysPassed = 0
  let projected = 0
  if (totalEntry) {
    totalBudget = totalEntry.effectiveBudget
    totalActual = totalEntry.actual
    daysInPeriod = totalEntry.daysInPeriod
    daysPassed = totalEntry.daysPassed
    projected = totalEntry.projectedAtPeriodEnd
  } else {
    // 부모-자식 중복 방지: 부모에 예산이 있으면 자식 행은 합계에서 제외
    const budgetedCatIds = new Set<string>()
    for (const e of catEntries) {
      if (e.categoryId && e.budgetId !== null) budgetedCatIds.add(e.categoryId)
    }
    for (const e of catEntries) {
      const parentBudgeted = e.parentCategoryId && budgetedCatIds.has(e.parentCategoryId)
      if (parentBudgeted) continue
      totalActual += e.actual
      if (e.status !== 'unset') totalBudget += e.effectiveBudget
      if (daysInPeriod === 0) {
        daysInPeriod = e.daysInPeriod
        daysPassed = e.daysPassed
      }
    }
    const dailyPace = daysPassed > 0 ? totalActual / daysPassed : 0
    projected = Math.round(dailyPace * daysInPeriod)
  }
  const remaining = totalBudget - totalActual
  const usagePercent = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0
  const timeProgress = daysInPeriod > 0 ? (daysPassed / daysInPeriod) * 100 : 0
  const projectedPercent = totalBudget > 0 ? (projected / totalBudget) * 100 : 0

  const surplus = summary.income - summary.expense
  const savingsRate = summary.income > 0 ? (savings.netInPeriod / summary.income) * 100 : 0
  const surplusPercent = summary.income > 0 ? (surplus / summary.income) * 100 : 0

  // ===== 3. Workbook 생성 =====
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BudgetBook'
  wb.lastModifiedBy = 'BudgetBook'
  wb.created = new Date()
  wb.modified = new Date()

  const ws = wb.addWorksheet(`${year}년 ${month}월 예산`)

  // 컬럼 너비
  ws.columns = [
    { width: 30 }, // A: 카테고리
    { width: 16 }, // B: 예산 한도
    { width: 16 }, // C: 실제 사용
    { width: 16 }, // D: 남은 예산
    { width: 12 }, // E: 사용률
    { width: 10 }, // F: 상태
    { width: 12 } // G: 거래 건수
  ]

  // 셀 서식·색상 상수
  const NUM_FMT = '#,##0'
  const PCT_FMT = '0.0"%"'
  const FONT = '맑은 고딕'
  const COLOR = {
    title: 'FF1F2937',
    titleBg: 'FFF1F5F9',
    flowBg: 'FFE0F2FE', // 가계 흐름 — 하늘
    budgetBg: 'FFFEF3C7', // 예산 진행 — 노랑
    detailBg: 'FFDCFCE7', // 카테고리 — 연두
    headerBg: 'FF94A3B8',
    totalBg: 'FFFEF9C3',
    safe: 'FF059669',
    warning: 'FFD97706',
    over: 'FFEA580C',
    critical: 'FFDC2626',
    income: 'FF059669',
    expense: 'FFDC2626',
    savings: 'FF0284C7',
    muted: 'FF6B7280'
  }
  const statusColor = (s: BudgetStatus): string =>
    s === 'safe'
      ? COLOR.safe
      : s === 'warning'
        ? COLOR.warning
        : s === 'over'
          ? COLOR.over
          : s === 'critical'
            ? COLOR.critical
            : COLOR.muted

  let row = 1

  // ===== 4. 제목 =====
  ws.mergeCells(`A${row}:G${row}`)
  const titleCell = ws.getCell(`A${row}`)
  titleCell.value = `${year}년 ${month}월 예산 — BudgetBook 가족 가계부 (단위: ${baseCurrency})`
  titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: COLOR.title } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.titleBg } }
  ws.getRow(row).height = 28
  row += 2

  // ===== 5. 섹션 1: 이번 달 가계 흐름 =====
  ws.mergeCells(`A${row}:G${row}`)
  const s1 = ws.getCell(`A${row}`)
  s1.value = '📊 이번 달 가계 흐름'
  s1.font = { name: FONT, size: 12, bold: true }
  s1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.flowBg } }
  s1.alignment = { vertical: 'middle' }
  ws.getRow(row).height = 22
  row++

  const addKv = (
    label: string,
    value: number,
    valueColor?: string,
    note?: string,
    isPercent?: boolean
  ): void => {
    const labelCell = ws.getCell(`A${row}`)
    labelCell.value = label
    labelCell.font = { name: FONT }

    const valCell = ws.getCell(`B${row}`)
    valCell.value = value
    valCell.numFmt = isPercent ? PCT_FMT : NUM_FMT
    valCell.font = {
      name: FONT,
      bold: true,
      color: valueColor ? { argb: valueColor } : undefined
    }
    valCell.alignment = { horizontal: 'right' }

    if (note) {
      const noteCell = ws.getCell(`C${row}`)
      noteCell.value = note
      noteCell.font = { name: FONT, color: { argb: COLOR.muted } }
    }
    row++
  }

  addKv('수입', summary.income, COLOR.income)
  addKv('지출', summary.expense, COLOR.expense)
  addKv(
    '흑자',
    surplus,
    surplus >= 0 ? COLOR.safe : COLOR.critical,
    summary.income > 0 ? `(수입의 ${surplusPercent.toFixed(0)}%)` : undefined
  )
  addKv(
    '금융비용 (저축·투자)',
    savings.netInPeriod,
    COLOR.savings,
    summary.income > 0 ? `(저축률 ${savingsRate.toFixed(0)}%)` : undefined
  )
  row++ // 빈 줄

  // ===== 6. 섹션 2: 예산 진행 상황 =====
  ws.mergeCells(`A${row}:G${row}`)
  const s2 = ws.getCell(`A${row}`)
  s2.value = '💰 예산 진행 상황'
  s2.font = { name: FONT, size: 12, bold: true }
  s2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.budgetBg } }
  s2.alignment = { vertical: 'middle' }
  ws.getRow(row).height = 22
  row++

  addKv('예산 한도', totalBudget)
  addKv('실제 사용', totalActual)
  addKv('남은 예산', remaining, remaining >= 0 ? COLOR.safe : COLOR.critical)
  addKv('사용률', usagePercent, undefined, undefined, true)
  addKv('시간 진행률', timeProgress, undefined, `(${daysPassed}/${daysInPeriod}일)`, true)
  addKv(
    '월말 예상',
    projected,
    undefined,
    totalBudget > 0 ? `(한도 대비 ${projectedPercent.toFixed(0)}%)` : undefined
  )
  row++ // 빈 줄

  // ===== 7. 섹션 3: 카테고리별 상세 =====
  ws.mergeCells(`A${row}:G${row}`)
  const s3 = ws.getCell(`A${row}`)
  s3.value = '📋 카테고리별 상세'
  s3.font = { name: FONT, size: 12, bold: true }
  s3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.detailBg } }
  s3.alignment = { vertical: 'middle' }
  ws.getRow(row).height = 22
  row++

  // 테이블 헤더
  const headers = ['카테고리', '예산 한도', '실제 사용', '남은 예산', '사용률', '상태', '거래 건수']
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1)
    c.value = h
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.headerBg } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' }
    }
  })
  ws.getRow(row).height = 20
  row++

  // 데이터 행 (트리 들여쓰기)
  for (const e of catEntries) {
    const depth = depthOf(e)
    const indent = '    '.repeat(depth)
    const displayName = `${indent}${e.categoryName ?? '(미분류)'}`

    const nameCell = ws.getCell(row, 1)
    nameCell.value = displayName
    nameCell.font = { name: FONT, bold: depth === 0 }
    nameCell.alignment = { horizontal: 'left' }

    if (e.status === 'unset') {
      // 예산 없는 카테고리: 실제 사용만 회색으로 표시
      ws.getCell(row, 2).value = ''
      const actualCell = ws.getCell(row, 3)
      actualCell.value = e.actual
      actualCell.numFmt = NUM_FMT
      actualCell.alignment = { horizontal: 'right' }
      actualCell.font = { name: FONT, color: { argb: COLOR.muted } }
      ws.getCell(row, 4).value = ''
      ws.getCell(row, 5).value = ''
      const statusCell = ws.getCell(row, 6)
      statusCell.value = STATUS_KO[e.status]
      statusCell.font = { name: FONT, color: { argb: COLOR.muted } }
      statusCell.alignment = { horizontal: 'center' }
      const countCell = ws.getCell(row, 7)
      countCell.value = e.transactionCount
      countCell.alignment = { horizontal: 'right' }
    } else {
      const budgetCell = ws.getCell(row, 2)
      budgetCell.value = e.effectiveBudget
      budgetCell.numFmt = NUM_FMT
      budgetCell.alignment = { horizontal: 'right' }

      const actualCell = ws.getCell(row, 3)
      actualCell.value = e.actual
      actualCell.numFmt = NUM_FMT
      actualCell.alignment = { horizontal: 'right' }

      const remainCell = ws.getCell(row, 4)
      remainCell.value = e.remaining
      remainCell.numFmt = NUM_FMT
      remainCell.alignment = { horizontal: 'right' }
      remainCell.font = {
        name: FONT,
        color: { argb: e.remaining >= 0 ? COLOR.safe : COLOR.critical }
      }

      const pctCell = ws.getCell(row, 5)
      pctCell.value = e.percentUsed
      pctCell.numFmt = PCT_FMT
      pctCell.alignment = { horizontal: 'right' }

      const statusCell = ws.getCell(row, 6)
      statusCell.value = STATUS_KO[e.status]
      statusCell.font = { name: FONT, bold: true, color: { argb: statusColor(e.status) } }
      statusCell.alignment = { horizontal: 'center' }

      const countCell = ws.getCell(row, 7)
      countCell.value = e.transactionCount
      countCell.alignment = { horizontal: 'right' }
    }
    row++
  }

  // 합계 행 (강조)
  const totalRowIdx = row
  ws.getCell(totalRowIdx, 1).value = '합계'
  ws.getCell(totalRowIdx, 2).value = totalBudget
  ws.getCell(totalRowIdx, 3).value = totalActual
  ws.getCell(totalRowIdx, 4).value = remaining
  ws.getCell(totalRowIdx, 5).value = usagePercent
  ws.getCell(totalRowIdx, 6).value = ''
  ws.getCell(totalRowIdx, 7).value = catEntries.reduce((acc, e) => acc + e.transactionCount, 0)

  for (let col = 1; col <= 7; col++) {
    const c = ws.getCell(totalRowIdx, col)
    c.font = { name: FONT, bold: true, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.totalBg } }
    c.border = {
      top: { style: 'medium' },
      bottom: { style: 'medium' }
    }
    if (col === 2 || col === 3 || col === 4) c.numFmt = NUM_FMT
    if (col === 5) c.numFmt = PCT_FMT
    if (col >= 2) c.alignment = { horizontal: 'right' }
  }
  // 남은 예산만 색상 강조
  ws.getCell(totalRowIdx, 4).font = {
    name: FONT,
    bold: true,
    size: 11,
    color: { argb: remaining >= 0 ? COLOR.safe : COLOR.critical }
  }
  ws.getRow(totalRowIdx).height = 22
  row += 2

  // ===== 8. 푸터 =====
  ws.mergeCells(`A${row}:G${row}`)
  const footerCell = ws.getCell(`A${row}`)
  footerCell.value = `생성: ${new Date().toLocaleString('ko-KR')} · BudgetBook`
  footerCell.font = { name: FONT, size: 9, color: { argb: COLOR.muted }, italic: true }
  footerCell.alignment = { horizontal: 'right' }

  // ===== 9. 저장 다이얼로그 =====
  const focused = BrowserWindow.getFocusedWindow()
  const defaultName = `BudgetBook_예산_${year}년_${String(month).padStart(2, '0')}월.xlsx`
  const result = await dialog.showSaveDialog(focused ?? undefined!, {
    title: '예산 엑셀 내보내기',
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (result.canceled || !result.filePath) return null

  await wb.xlsx.writeFile(result.filePath)

  return {
    savedPath: result.filePath,
    rowCount: catEntries.length
  }
}
