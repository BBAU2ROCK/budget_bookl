import { and, asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../client'
import { accounts, transactions } from '../schema'
void sql
import { newId } from '../ids'
import { toAccountDto } from '../mappers'
import type {
  AccountBalanceDto,
  AccountCreateInput,
  AccountDto,
  AccountUpdateInput
} from '../../../shared/types'

export const accountsRepo = {
  list(includeArchived = false): AccountDto[] {
    const db = getDb()
    const rows = includeArchived
      ? db.select().from(accounts).orderBy(asc(accounts.displayOrder)).all()
      : db
          .select()
          .from(accounts)
          .where(eq(accounts.isArchived, false))
          .orderBy(asc(accounts.displayOrder))
          .all()
    return rows.map(toAccountDto)
  },

  create(input: AccountCreateInput): AccountDto {
    const db = getDb()
    const id = newId('a')
    db.insert(accounts)
      .values({
        id,
        name: input.name,
        type: input.type,
        currency: input.currency,
        initialBalance: input.initialBalance ?? 0,
        color: input.color ?? null,
        icon: input.icon ?? null,
        notes: input.notes ?? null,
        displayOrder: input.displayOrder ?? 0,
        isArchived: false,
        issuer: input.issuer ?? null,
        cardLast4: input.cardLast4 ?? null,
        billingDay: input.billingDay ?? null,
        statementClosing: input.statementClosing ?? null,
        creditLimit: input.creditLimit ?? null,
        annualFee: input.annualFee ?? null,
        benefitsSummary: input.benefitsSummary ?? null
      })
      .run()
    const row = db.select().from(accounts).where(eq(accounts.id, id)).get()!
    return toAccountDto(row)
  },

  /** List distinct non-null issuer values across all credit_card accounts — for autocomplete. */
  distinctIssuers(): string[] {
    const db = getDb()
    const rows = db
      .selectDistinct({ issuer: accounts.issuer })
      .from(accounts)
      .where(sql`${accounts.issuer} IS NOT NULL AND ${accounts.issuer} != ''`)
      .all()
    return rows
      .map((r) => r.issuer)
      .filter((v): v is string => !!v)
      .sort()
  },

  update(input: AccountUpdateInput): AccountDto {
    const db = getDb()
    const { id, ...rest } = input
    db.update(accounts)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .run()
    const row = db.select().from(accounts).where(eq(accounts.id, id)).get()
    if (!row) throw new Error(`Account ${id} not found`)
    return toAccountDto(row)
  },

  delete(id: string): void {
    const db = getDb()
    db.delete(accounts).where(eq(accounts.id, id)).run()
  },

  /**
   * Compute current balance for each (or specified) account in the account's own currency.
   * For cross-currency transfers, `counter_amount` is used at the destination side.
   */
  balances(accountIds?: string[]): AccountBalanceDto[] {
    const db = getDb()
    const acctRows = accountIds
      ? db.select().from(accounts).where(sql`${accounts.id} IN ${accountIds}`).all()
      : db.select().from(accounts).all()

    return acctRows.map((acct) => {
      const income =
        db
          .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
          .from(transactions)
          .where(and(eq(transactions.accountId, acct.id), eq(transactions.type, 'income')))
          .get()?.sum ?? 0

      const expense =
        db
          .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
          .from(transactions)
          .where(and(eq(transactions.accountId, acct.id), eq(transactions.type, 'expense')))
          .get()?.sum ?? 0

      const transferOut =
        db
          .select({ sum: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
          .from(transactions)
          .where(and(eq(transactions.accountId, acct.id), eq(transactions.type, 'transfer')))
          .get()?.sum ?? 0

      // Transfers in: use counter_amount when non-null (cross-currency), else amount (same-currency)
      const transferIn =
        db
          .select({
            sum: sql<number>`COALESCE(SUM(COALESCE(${transactions.counterAmount}, ${transactions.amount})), 0)`
          })
          .from(transactions)
          .where(
            and(eq(transactions.counterAccountId, acct.id), eq(transactions.type, 'transfer'))
          )
          .get()?.sum ?? 0

      const netFlow = income - expense - transferOut + transferIn
      return {
        accountId: acct.id,
        currency: acct.currency,
        balance: acct.initialBalance + netFlow,
        netFlow
      }
    })
  }
}
