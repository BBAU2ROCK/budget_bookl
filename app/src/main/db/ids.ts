import { customAlphabet } from 'nanoid'

// URL-safe, unambiguous alphabet (no 0/O, 1/l/I confusion avoided by excluding common lookalikes)
const alphabet = '23456789abcdefghijkmnpqrstuvwxyz'
const nano = customAlphabet(alphabet, 10)

export type IdPrefix =
  | 'tx' // transaction
  | 'sp' // transaction split
  | 'c' // category
  | 't' // tag
  | 'a' // account
  | 'rs' // recurring series
  | 'fx' // exchange rate
  | 'att' // attachment
  | 'bg' // budget
  | 'sg' // savings goal

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`
}
