import fs from 'node:fs'
import type { LocalDiagnostics } from '../../../shared/types'
import type { Db } from '../types'

/** Produz dados técnicos deliberadamente redigidos para diagnóstico local e suporte. */
export function collectLocalDiagnostics(database: Db, databasePath: string, appVersion: string): LocalDiagnostics {
  const integrity = database.pragma('integrity_check', { simple: true }) === 'ok' ? 'ok' : 'error'
  const databaseVersion = database.pragma('user_version', { simple: true }) as number
  const last = database.prepare("SELECT value FROM app_meta WHERE key = 'last_automatic_backup'").get() as { value: string } | undefined
  let availableDiskBytes: number | null = null
  try {
    const stat = fs.statfsSync(databasePath)
    availableDiskBytes = Number(stat.bavail) * Number(stat.bsize)
  } catch { /* statfs não é oferecido por todos os sistemas de ficheiros */ }
  return {
    appVersion, databaseVersion, integrity, lastAutomaticBackup: last?.value ?? null, availableDiskBytes,
    // Nunca exportar detalhe do erro: pode conter caminhos, nomes ou valores introduzidos pelo utilizador.
    recentErrors: (database.prepare("SELECT created_at FROM audit_log WHERE action = 'error' ORDER BY created_at DESC LIMIT 10").all() as { created_at: string }[])
      .map(({ created_at }) => ({ at: created_at, message: 'Erro registado; consulte o suporte técnico.' })),
  }
}
