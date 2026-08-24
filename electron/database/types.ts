import type Database from 'better-sqlite3-multiple-ciphers'

export type Db = Database.Database

export interface Migration {
  version: number
  name: string
  up: (database: Db) => void
}
