import type { DateIso, DateTimeIso } from './common'

export interface CurrencyDto {
  code: string
  name: string
  symbol: string
  decimalPlaces: number
  isActive: boolean
  displayOrder: number
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface CurrencyCreateInput {
  code: string
  name: string
  symbol: string
  decimalPlaces: number
  isActive?: boolean
  displayOrder?: number
}

export type CurrencyUpdateInput = Partial<Omit<CurrencyCreateInput, 'code'>> & { code: string }

export interface ExchangeRateDto {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  asOf: DateIso
  source: 'manual' | 'api'
  createdAt: DateTimeIso
  updatedAt: DateTimeIso
}

export interface ExchangeRateUpsertInput {
  fromCurrency: string
  toCurrency: string
  rate: number
  asOf: DateIso
  source?: 'manual' | 'api'
}
