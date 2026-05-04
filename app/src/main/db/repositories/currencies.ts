import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../client'
import { currencies, exchangeRates } from '../schema'
import { newId } from '../ids'
import { toCurrencyDto, toExchangeRateDto } from '../mappers'
import type {
  CurrencyCreateInput,
  CurrencyDto,
  CurrencyUpdateInput,
  ExchangeRateDto,
  ExchangeRateUpsertInput
} from '../../../shared/types'

export const currenciesRepo = {
  list(): CurrencyDto[] {
    const db = getDb()
    const rows = db.select().from(currencies).orderBy(asc(currencies.displayOrder)).all()
    return rows.map(toCurrencyDto)
  },

  create(input: CurrencyCreateInput): CurrencyDto {
    const db = getDb()
    db.insert(currencies)
      .values({
        code: input.code,
        name: input.name,
        symbol: input.symbol,
        decimalPlaces: input.decimalPlaces,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder ?? 0
      })
      .run()
    const row = db.select().from(currencies).where(eq(currencies.code, input.code)).get()
    if (!row) throw new Error('Currency insert failed')
    return toCurrencyDto(row)
  },

  update(input: CurrencyUpdateInput): CurrencyDto {
    const db = getDb()
    const { code, ...rest } = input
    db.update(currencies)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(currencies.code, code))
      .run()
    const row = db.select().from(currencies).where(eq(currencies.code, code)).get()
    if (!row) throw new Error(`Currency ${code} not found`)
    return toCurrencyDto(row)
  },

  delete(code: string): void {
    const db = getDb()
    db.delete(currencies).where(eq(currencies.code, code)).run()
  },

  // Exchange rates
  listRates(): ExchangeRateDto[] {
    const db = getDb()
    const rows = db.select().from(exchangeRates).orderBy(asc(exchangeRates.asOf)).all()
    return rows.map(toExchangeRateDto)
  },

  upsertRate(input: ExchangeRateUpsertInput): ExchangeRateDto {
    const db = getDb()
    const existing = db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, input.fromCurrency),
          eq(exchangeRates.toCurrency, input.toCurrency),
          eq(exchangeRates.asOf, input.asOf)
        )
      )
      .get()

    if (existing) {
      db.update(exchangeRates)
        .set({
          rate: input.rate,
          source: input.source ?? 'manual',
          updatedAt: new Date()
        })
        .where(eq(exchangeRates.id, existing.id))
        .run()
      const updated = db.select().from(exchangeRates).where(eq(exchangeRates.id, existing.id)).get()
      return toExchangeRateDto(updated!)
    }

    const id = newId('fx')
    db.insert(exchangeRates)
      .values({
        id,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: input.rate,
        asOf: input.asOf,
        source: input.source ?? 'manual'
      })
      .run()
    const row = db.select().from(exchangeRates).where(eq(exchangeRates.id, id)).get()!
    return toExchangeRateDto(row)
  },

  deleteRate(id: string): void {
    const db = getDb()
    db.delete(exchangeRates).where(eq(exchangeRates.id, id)).run()
  },

  /**
   * Get most recent rate on-or-before `asOf` for conversion purposes.
   * Returns 1 if from === to.
   */
  getRateAsOf(from: string, to: string, asOf: string): number | null {
    if (from === to) return 1
    const db = getDb()
    const rows = db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.fromCurrency, from), eq(exchangeRates.toCurrency, to)))
      .all()
    const onOrBefore = rows.filter((r) => r.asOf <= asOf).sort((a, b) => (a.asOf < b.asOf ? 1 : -1))
    if (onOrBefore.length > 0) return onOrBefore[0].rate

    // Try inverse
    const inverse = db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.fromCurrency, to), eq(exchangeRates.toCurrency, from)))
      .all()
    const inv = inverse.filter((r) => r.asOf <= asOf).sort((a, b) => (a.asOf < b.asOf ? 1 : -1))
    if (inv.length > 0 && inv[0].rate !== 0) return 1 / inv[0].rate

    return null
  }
}
