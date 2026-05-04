import { useCallback, useEffect, useState } from 'react'
import type {
  CategoryTreeNode,
  CurrencyDto,
  TagDto,
  TransactionDto,
  TransactionListResult
} from '../../../shared/types'

export default function DbSmokeTest(): React.JSX.Element {
  const [currencies, setCurrencies] = useState<CurrencyDto[]>([])
  const [categoryTree, setCategoryTree] = useState<CategoryTreeNode[]>([])
  const [tags, setTags] = useState<TagDto[]>([])
  const [txList, setTxList] = useState<TransactionListResult | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const append = (line: string): void =>
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 8))

  const refresh = useCallback(async () => {
    const [ccy, tree, tagList, tx] = await Promise.all([
      window.api.currencies.list(),
      window.api.categories.tree(),
      window.api.tags.list(),
      window.api.transactions.list({ limit: 20, orderBy: 'occurredAt', orderDir: 'desc' })
    ])
    setCurrencies(ccy)
    setCategoryTree(tree)
    setTags(tagList)
    setTxList(tx)
  }, [])

  useEffect(() => {
    refresh()
      .then(() => append('초기 로드 완료'))
      .catch((e) => append(`로드 실패: ${(e as Error).message}`))
  }, [refresh])

  async function smokeCreateTransaction(): Promise<void> {
    setBusy(true)
    try {
      // Find first expense category (leaf if possible)
      const firstExpense =
        categoryTree.find((c) => c.kind === 'expense' && c.children.length > 0)?.children[0] ??
        categoryTree.find((c) => c.kind === 'expense')

      if (!firstExpense) {
        append('카테고리 없음 — seed 실패 가능')
        return
      }

      // Ensure two test tags exist
      const allTags = await window.api.tags.list()
      const ensureTag = async (name: string): Promise<string> => {
        const found = allTags.find((t) => t.name === name)
        if (found) return found.id
        const created = await window.api.tags.create({ name })
        return created.id
      }
      const tagA = await ensureTag('#스모크테스트')
      const tagB = await ensureTag('#충동구매')

      const tx = await window.api.transactions.create({
        type: 'expense',
        occurredAt: new Date().toISOString(),
        amount: 4500,
        currency: 'KRW',
        categoryId: firstExpense.id,
        payee: '스타벅스',
        memo: '아이스 아메리카노',
        tagIds: [tagA, tagB]
      })
      append(`✓ 거래 생성: ${tx.id} (${formatAmount(tx.amount, tx.currency)} ${firstExpense.path})`)
      await refresh()
    } catch (e) {
      append(`✗ 생성 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function smokeCreateTag(): Promise<void> {
    setBusy(true)
    try {
      const name = `#신규태그_${Math.floor(Math.random() * 10000)}`
      const t = await window.api.tags.create({ name, color: '#6366f1' })
      append(`✓ 태그 생성: ${t.name} (${t.id})`)
      await refresh()
    } catch (e) {
      append(`✗ 태그 생성 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function smokePreviewRRule(): Promise<void> {
    setBusy(true)
    try {
      const dates = await window.api.recurring.preview({
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
        dtstart: new Date().toISOString().slice(0, 10),
        limit: 5
      })
      append(`✓ RRULE 미리보기 (매월 1일 × 5): ${dates.join(', ')}`)
    } catch (e) {
      append(`✗ RRULE 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function generateSampleData(): Promise<void> {
    setBusy(true)
    try {
      const leafExpenseCats = flattenLeaves(categoryTree.filter((c) => c.kind === 'expense'))
      const incomeCats = categoryTree.filter((c) => c.kind === 'income')
      if (leafExpenseCats.length === 0 || incomeCats.length === 0) {
        append('카테고리가 부족함')
        return
      }
      const samplePayees = [
        '스타벅스',
        'GS25',
        '이마트',
        'CU',
        '쿠팡',
        '네이버',
        '배달의민족',
        '지에스주유소',
        'CJ택배',
        '교보문고',
        '메가박스',
        '넷플릭스',
        '스포티파이',
        '카카오뱅크',
        '신한은행'
      ]
      const sampleMemos = [
        '점심',
        '저녁',
        '간식',
        '커피',
        '장보기',
        '주유',
        '택시',
        '영화',
        '책',
        '구독료'
      ]

      const tagChoices = ['#필수', '#할부', '#여행', '#충동구매', '#업무']
      const ensuredTagIds = await Promise.all(
        tagChoices.map(async (name) => {
          const found = tags.find((t) => t.name === name)
          if (found) return found.id
          const t = await window.api.tags.create({ name })
          return t.id
        })
      )

      const today = new Date()
      const daysToSeed = 60 // 지난 60일
      let created = 0
      for (let d = 0; d < daysToSeed; d++) {
        const date = new Date(today)
        date.setDate(date.getDate() - d)
        const txCount = 1 + Math.floor(Math.random() * 4) // 1-4 tx/day

        for (let j = 0; j < txCount; j++) {
          const useIncome = Math.random() < 0.1 && d % 15 === 0 // 월 1-2회 수입
          if (useIncome) {
            await window.api.transactions.create({
              type: 'income',
              occurredAt: date.toISOString(),
              amount: 2_000_000 + Math.floor(Math.random() * 500_000),
              currency: 'KRW',
              categoryId: incomeCats[0].id,
              payee: '회사',
              memo: '급여'
            })
          } else {
            const cat = leafExpenseCats[Math.floor(Math.random() * leafExpenseCats.length)]
            const payee = samplePayees[Math.floor(Math.random() * samplePayees.length)]
            const memo = sampleMemos[Math.floor(Math.random() * sampleMemos.length)]
            const amount = 1000 + Math.floor(Math.random() * 49000)
            const tagPool: string[] = []
            if (Math.random() < 0.4) {
              const tagId = ensuredTagIds[Math.floor(Math.random() * ensuredTagIds.length)]
              tagPool.push(tagId)
            }
            await window.api.transactions.create({
              type: 'expense',
              occurredAt: date.toISOString(),
              amount,
              currency: 'KRW',
              categoryId: cat.id,
              payee,
              memo,
              tagIds: tagPool
            })
          }
          created++
        }
      }
      append(`✓ 샘플 데이터 ${created}건 생성 (지난 ${daysToSeed}일)`)
      await refresh()
    } catch (e) {
      append(`✗ 샘플 생성 실패: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200">DB 스모크 테스트</h2>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={smokeCreateTransaction}
              className="rounded-md border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 hover:border-sky-400 hover:bg-sky-500/25 disabled:opacity-50"
            >
              + 테스트 거래 생성
            </button>
            <button
              disabled={busy}
              onClick={smokeCreateTag}
              className="rounded-md border border-fuchsia-500/60 bg-fuchsia-500/15 px-3 py-1.5 text-xs font-medium text-fuchsia-200 hover:border-fuchsia-400 hover:bg-fuchsia-500/25 disabled:opacity-50"
            >
              + 태그 생성
            </button>
            <button
              disabled={busy}
              onClick={smokePreviewRRule}
              className="rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:border-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
            >
              RRULE 미리보기
            </button>
            <button
              disabled={busy}
              onClick={generateSampleData}
              className="rounded-md border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              🎲 샘플 60일치 생성
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DataColumn title={`통화 (${currencies.length})`}>
            {currencies.map((c) => (
              <li key={c.code} className="flex justify-between">
                <span>
                  {c.symbol} <span className="text-slate-500">{c.code}</span>
                </span>
                <span className="text-slate-500">{c.name}</span>
              </li>
            ))}
          </DataColumn>

          <DataColumn title={`카테고리 (${countNodes(categoryTree)})`}>
            {categoryTree.map((c) => (
              <CategoryItem key={c.id} node={c} />
            ))}
          </DataColumn>

          <DataColumn title={`태그 (${tags.length})`}>
            {tags.length === 0 && <li className="text-slate-500">없음</li>}
            {tags.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                {t.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                {t.name}
              </li>
            ))}
          </DataColumn>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-200">
          최근 거래 ({txList?.total ?? 0})
        </h2>
        {!txList || txList.rows.length === 0 ? (
          <p className="text-sm text-slate-500">거래 없음 — 위의 "테스트 거래 생성" 버튼을 눌러 주세요.</p>
        ) : (
          <ul className="divide-y divide-slate-700/50 text-sm">
            {txList.rows.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">로그</h2>
        {log.length === 0 ? (
          <p className="font-mono text-xs text-slate-600">—</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-slate-400">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DataColumn({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <ul className="max-h-48 space-y-1 overflow-auto text-sm text-slate-300">{children}</ul>
    </div>
  )
}

function CategoryItem({ node }: { node: CategoryTreeNode }): React.JSX.Element {
  return (
    <li>
      <div className="flex items-center gap-1" style={{ paddingLeft: node.depth * 12 }}>
        {node.icon && <span>{node.icon}</span>}
        <span>{node.name}</span>
        <span className="ml-auto text-xs text-slate-600">
          {node.kind === 'income' ? '수입' : '지출'}
        </span>
      </div>
      {node.children.map((c) => (
        <CategoryItem key={c.id} node={c} />
      ))}
    </li>
  )
}

function TransactionItem({ tx }: { tx: TransactionDto }): React.JSX.Element {
  const date = new Date(tx.occurredAt).toLocaleString()
  return (
    <li className="flex items-center justify-between py-2">
      <div>
        <div className="text-slate-200">{tx.payee ?? tx.memo ?? '(설명 없음)'}</div>
        <div className="text-xs text-slate-500">
          {date}
          {tx.tagIds.length > 0 && ` · ${tx.tagIds.length} tags`}
        </div>
      </div>
      <div
        className={`font-mono text-sm ${
          tx.type === 'expense' ? 'text-rose-300' : tx.type === 'income' ? 'text-emerald-300' : 'text-slate-300'
        }`}
      >
        {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : '⇄ '}
        {formatAmount(tx.amount, tx.currency)}
      </div>
    </li>
  )
}

function formatAmount(amount: number, currency: string): string {
  // KRW: integer; others: 2 decimals with ÷100
  if (currency === 'KRW' || currency === 'JPY') {
    return `${amount.toLocaleString()} ${currency}`
  }
  return `${(amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`
}

function countNodes(nodes: CategoryTreeNode[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0)
}

function flattenLeaves(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  const out: CategoryTreeNode[] = []
  const walk = (n: CategoryTreeNode): void => {
    if (n.children.length === 0) out.push(n)
    else n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}
