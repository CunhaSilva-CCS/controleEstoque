import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import type { TestContext } from '@vitest/runner'
import { afterEach, describe, expect, it } from 'vitest'
import { MigrationFailure, migrations, runMigrations } from './index'

const temporaryPaths: string[] = []

function openDatabase(context: TestContext): { database: Database.Database; databasePath: string } | null {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-migration-'))
  temporaryPaths.push(directory)
  const databasePath = path.join(directory, 'database.db')
  try {
    return { database: new Database(databasePath), databasePath }
  } catch (error) {
    const message = String(error)
    if (message.includes('NODE_MODULE_VERSION') || message.includes('mach-o') || message.includes('ELF')) {
      context.skip()
      return null
    }
    throw error
  }
}

afterEach(() => {
  for (const directory of temporaryPaths.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('migrations formais da base de dados', () => {
  it('aplica cada versão uma única vez e valida a integridade', (context) => {
    const opened = openDatabase(context)
    if (!opened) return
    const { database, databasePath } = opened
    expect(runMigrations(database, databasePath)).toEqual(migrations.map(({ version }) => version))
    expect(runMigrations(database, databasePath)).toEqual([])
    expect(database.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      .toEqual(migrations.map(({ version }) => ({ version })))
    expect(fs.existsSync(`${databasePath}.pre-migration`)).toBe(false)
    database.close()
  })

  it('reverte a transação com erro e conserva a cópia para recuperação', (context) => {
    const opened = openDatabase(context)
    if (!opened) return
    const { database, databasePath } = opened
    database.exec('CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES (\'preservado\')')
    expect(() => runMigrations(database, databasePath, new Date().toISOString(), [{
      version: 99,
      name: 'migration-that-fails',
      up(db) {
        db.exec('CREATE TABLE must_rollback (id TEXT)')
        throw new Error('falha simulada')
      },
    }])).toThrow(MigrationFailure)
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'must_rollback'").get()).toBeUndefined()
    expect(fs.existsSync(`${databasePath}.pre-migration`)).toBe(true)
    database.close()
  })
})
