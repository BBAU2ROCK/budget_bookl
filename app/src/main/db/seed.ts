import { eq } from 'drizzle-orm'
import { getDb } from './client'
import { categories, currencies, settings } from './schema'
import { newId } from './ids'

const DEFAULT_CURRENCIES = [
  { code: 'KRW', name: '대한민국 원', symbol: '₩', decimalPlaces: 0, displayOrder: 0 },
  { code: 'USD', name: '미국 달러', symbol: '$', decimalPlaces: 2, displayOrder: 1 },
  { code: 'EUR', name: '유로', symbol: '€', decimalPlaces: 2, displayOrder: 2 },
  { code: 'JPY', name: '일본 엔', symbol: '¥', decimalPlaces: 0, displayOrder: 3 },
  { code: 'CNY', name: '중국 위안', symbol: '¥', decimalPlaces: 2, displayOrder: 4 }
] as const

interface SeedCategory {
  name: string
  kind: 'income' | 'expense'
  icon?: string
  color?: string
  children?: Omit<SeedCategory, 'kind'>[]
}

const DEFAULT_CATEGORIES: SeedCategory[] = [
  // Income
  { name: '급여', kind: 'income', icon: '💼', color: '#22c55e' },
  { name: '이자/배당', kind: 'income', icon: '🏦', color: '#10b981' },
  { name: '투자수익', kind: 'income', icon: '📈', color: '#06b6d4' },
  { name: '용돈/선물', kind: 'income', icon: '🎁', color: '#a855f7' },
  { name: '기타수입', kind: 'income', icon: '➕', color: '#64748b' },

  // Expense
  {
    name: '식비',
    kind: 'expense',
    icon: '🍚',
    color: '#f97316',
    children: [
      { name: '식료품', icon: '🛒' },
      { name: '외식', icon: '🍽️' },
      { name: '카페/간식', icon: '☕' }
    ]
  },
  {
    name: '교통',
    kind: 'expense',
    icon: '🚌',
    color: '#0ea5e9',
    children: [
      { name: '대중교통', icon: '🚇' },
      { name: '택시', icon: '🚕' },
      { name: '주유/주차', icon: '⛽' }
    ]
  },
  {
    name: '주거',
    kind: 'expense',
    icon: '🏠',
    color: '#8b5cf6',
    children: [
      { name: '월세/관리비', icon: '🏢' },
      { name: '공과금', icon: '💡' }
    ]
  },
  {
    name: '통신',
    kind: 'expense',
    icon: '📱',
    color: '#6366f1',
    children: [
      { name: '휴대폰', icon: '📞' },
      { name: '인터넷', icon: '🌐' }
    ]
  },
  {
    name: '쇼핑',
    kind: 'expense',
    icon: '🛍️',
    color: '#ec4899',
    children: [
      { name: '의류', icon: '👕' },
      { name: '생필품', icon: '🧴' }
    ]
  },
  {
    name: '여가',
    kind: 'expense',
    icon: '🎬',
    color: '#f59e0b',
    children: [
      { name: '영화/공연', icon: '🎟️' },
      { name: '여행', icon: '✈️' },
      { name: '취미', icon: '🎨' }
    ]
  },
  { name: '의료', kind: 'expense', icon: '⚕️', color: '#ef4444' },
  { name: '교육', kind: 'expense', icon: '📚', color: '#3b82f6' },
  { name: '보험', kind: 'expense', icon: '🛡️', color: '#475569' },
  { name: '경조사', kind: 'expense', icon: '💐', color: '#db2777' },
  { name: '기타지출', kind: 'expense', icon: '➖', color: '#64748b' }
]

const SEED_GUARD_KEY = '__seeded__'

/**
 * Run seed if never seeded before. Idempotent.
 */
export function seedIfEmpty(): void {
  const db = getDb()

  const guard = db.select().from(settings).where(eq(settings.key, SEED_GUARD_KEY)).get()
  if (guard) return

  db.transaction((tx) => {
    // 1. Currencies
    for (const c of DEFAULT_CURRENCIES) {
      tx.insert(currencies)
        .values({ ...c, isActive: true })
        .onConflictDoNothing()
        .run()
    }

    // 2. Categories (2-level)
    let order = 0
    for (const root of DEFAULT_CATEGORIES) {
      const rootId = newId('c')
      tx.insert(categories)
        .values({
          id: rootId,
          name: root.name,
          parentId: null,
          kind: root.kind,
          icon: root.icon,
          color: root.color,
          displayOrder: order++,
          isArchived: false
        })
        .run()

      if (root.children) {
        let childOrder = 0
        for (const child of root.children) {
          tx.insert(categories)
            .values({
              id: newId('c'),
              name: child.name,
              parentId: rootId,
              kind: root.kind,
              icon: child.icon,
              color: child.color ?? root.color,
              displayOrder: childOrder++,
              isArchived: false
            })
            .run()
        }
      }
    }

    // 3. Default settings
    const defaultSettings: Record<string, unknown> = {
      baseCurrency: 'KRW',
      locale: 'ko-KR',
      theme: 'dark',
      firstDayOfMonth: 1, // 가계부 월 시작일
      firstDayOfWeek: 1 // 0=Sun, 1=Mon
    }
    for (const [key, value] of Object.entries(defaultSettings)) {
      tx.insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoNothing()
        .run()
    }

    // 4. Seed guard
    tx.insert(settings)
      .values({ key: SEED_GUARD_KEY, value: JSON.stringify(new Date().toISOString()) })
      .run()
  })
}
