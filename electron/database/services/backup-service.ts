import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { recordAudit } from '../audit'
import { assertDatabaseIntegrity, getDatabase, getDatabaseKey, openDatabase } from '../connection'

export async function backupDatabase(destination: string): Promise<void> {
  const database = getDatabase()
  const temporary = `${destination}.tmp`
  fs.rmSync(temporary, { force: true })
  const key = getDatabaseKey()
  if (key) {
    database.pragma('wal_checkpoint(TRUNCATE)')
    fs.copyFileSync(database.name, temporary)
    const candidate = openDatabase(temporary, key)
    try { assertDatabaseIntegrity(candidate) } finally { candidate.close() }
  } else {
    await database.backup(temporary)
  }
  fs.rmSync(destination, { force: true })
  fs.renameSync(temporary, destination)
}

export async function createAutomaticBackup(retention = 30): Promise<string | null> {
  const database = getDatabase()
  const today = new Date().toISOString().slice(0, 10)
  const last = database.prepare("SELECT value FROM app_meta WHERE key = 'last_automatic_backup'")
    .get() as { value: string } | undefined
  if (last?.value === today) return null
  const directory = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(directory, { recursive: true })
  const destination = path.join(directory, `estoque-automatico-${today}.db`)
  await backupDatabase(destination)
  database.prepare(
    `INSERT INTO app_meta (key, value) VALUES ('last_automatic_backup', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(today)
  const backups = fs.readdirSync(directory)
    .filter((name) => /^estoque-automatico-\d{4}-\d{2}-\d{2}\.db$/.test(name)).sort()
  for (const name of backups.slice(0, Math.max(0, backups.length - retention))) {
    fs.unlinkSync(path.join(directory, name))
  }
  recordAudit(database, 'automatic_backup', 'database', '', { destination, retention })
  return destination
}
