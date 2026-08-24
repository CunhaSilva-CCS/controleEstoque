import fs from 'node:fs'
import type { Db, Migration } from '../types'
import { initialSchemaMigration } from './001-initial-schema'
import { purchasesAndProductionMigration } from './002-add-purchases-and-production'
import { customersAndSalesMigration } from './003-add-customers-and-sales'
import { costSnapshotsMigration } from './004-add-cost-snapshots'
import { securePasswordHistoryMigration } from './005-secure-password-history'
import { operationGovernanceMigration } from './006-operation-governance'
import { physicalInventoryMigration } from './007-physical-inventory'
import { unitsAndLotsMigration } from './008-units-and-lots'

export const migrations: Migration[] = [
  initialSchemaMigration,
  purchasesAndProductionMigration,
  customersAndSalesMigration,
  costSnapshotsMigration,
  securePasswordHistoryMigration,
  operationGovernanceMigration,
  physicalInventoryMigration,
  unitsAndLotsMigration,
]

export class MigrationFailure extends Error {
  constructor(message: string, readonly backupPath: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export function runMigrations(
  database: Db,
  databasePath: string,
  now = new Date().toISOString(),
  plan: Migration[] = migrations,
): number[] {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  )`)
  const applied = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map((item) => item.version),
  )
  const pending = plan.filter((migration) => !applied.has(migration.version))
  if (!pending.length) return []

  database.pragma('wal_checkpoint(TRUNCATE)')
  const backupPath = `${databasePath}.pre-migration`
  fs.copyFileSync(databasePath, backupPath)
  const completed: number[] = []
  try {
    for (const migration of pending) {
      database.transaction(() => {
        migration.up(database)
        database.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        ).run(migration.version, migration.name, now)
      })()
      completed.push(migration.version)
    }
    const integrity = database.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`integrity_check: ${String(integrity)}`)
    fs.rmSync(backupPath, { force: true })
    return completed
  } catch (error) {
    throw new MigrationFailure('Não foi possível atualizar a estrutura da base de dados', backupPath, { cause: error })
  }
}
