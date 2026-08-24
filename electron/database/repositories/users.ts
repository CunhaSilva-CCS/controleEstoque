import { randomUUID } from 'node:crypto'
import type { User, UserRole } from '../../../shared/types'
import { recordAudit } from '../audit'
import type { Db } from '../types'
import {
  DEFAULT_PASSWORD, assertPasswordNotReused, assertPasswordPolicy, hashPassword,
  legacyHashPassword, needsPasswordRehash, rememberPassword, verifyPassword,
} from '../services/password-service'

const COLUMNS = 'id, name, username, role, active, must_change_password, created_at, updated_at'

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id), name: String(row.name), username: String(row.username),
    role: row.role as UserRole, active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

function getUser(database: Db, id: string): User {
  const row = database.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Utilizador não encontrado')
  return mapUser(row)
}

export function ensureDefaultAdmin(database: Db, timestamp: string): void {
  const count = (database.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  if (count === 0) {
    database.prepare(
      `INSERT INTO users (id, name, username, password_hash, role, active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, ?)`,
    ).run(randomUUID(), 'Administrador', 'admin', hashPassword(DEFAULT_PASSWORD), timestamp, timestamp)
    return
  }
  database.prepare('UPDATE users SET must_change_password = 1 WHERE password_hash = ?')
    .run(legacyHashPassword(DEFAULT_PASSWORD))
}

export function listUsers(database: Db): User[] {
  return (database.prepare(`SELECT ${COLUMNS} FROM users ORDER BY name`).all() as Record<string, unknown>[]).map(mapUser)
}

export function createUser(database: Db, input: { name: string; username: string; password: string; role: UserRole }, timestamp: string): User {
  const name = input.name.trim(), username = input.username.trim()
  if (!name) throw new Error('O nome do utilizador é obrigatório')
  if (!username) throw new Error('O utilizador é obrigatório')
  assertPasswordPolicy(input.password)
  const id = randomUUID()
  try {
    database.prepare(
      `INSERT INTO users (id, name, username, password_hash, role, active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    ).run(id, name, username, hashPassword(input.password), input.role, timestamp, timestamp)
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('Este utilizador já se encontra registado')
    throw error
  }
  recordAudit(database, 'create', 'user', id, { username, role: input.role }, timestamp)
  return getUser(database, id)
}

export function setUserActive(database: Db, id: string, active: boolean, timestamp: string): User {
  if (!active) {
    const admins = (database.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get() as { c: number }).c
    const target = database.prepare('SELECT role, active FROM users WHERE id = ?').get(id) as { role: UserRole; active: number } | undefined
    if (!target) throw new Error('Utilizador não encontrado')
    if (target.role === 'admin' && target.active && admins <= 1) throw new Error('Não é possível desativar o último administrador')
  }
  const result = database.prepare('UPDATE users SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, timestamp, id)
  if (!result.changes) throw new Error('Utilizador não encontrado')
  recordAudit(database, active ? 'activate' : 'deactivate', 'user', id, {}, timestamp)
  return getUser(database, id)
}

export function authenticateUser(database: Db, username: string, password: string, timestamp: string): User | null {
  const row = database.prepare(`SELECT ${COLUMNS}, password_hash FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username.trim()) as (Record<string, unknown> & { password_hash: string }) | undefined
  if (!row || !verifyPassword(password, row.password_hash)) return null
  const user = mapUser(row)
  if (!user.active) return null
  if (needsPasswordRehash(row.password_hash)) {
    database.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(password), timestamp, user.id)
    recordAudit(database, 'migrate_password_hash', 'user', user.id, {}, timestamp)
  }
  return user
}

export function changePassword(database: Db, userId: string, current: string, next: string, timestamp: string): User {
  const row = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined
  if (!row) throw new Error('Utilizador não encontrado')
  if (!verifyPassword(current, row.password_hash)) throw new Error('A palavra-passe atual está incorreta')
  assertPasswordPolicy(next)
  assertPasswordNotReused(database, userId, next, row.password_hash)
  database.transaction(() => {
    rememberPassword(database, userId, row.password_hash, timestamp)
    database.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
      .run(hashPassword(next), timestamp, userId)
  })()
  recordAudit(database, 'change_password', 'user', userId, {}, timestamp)
  return getUser(database, userId)
}

export function resetUserPassword(database: Db, userId: string, temporary: string, timestamp: string): User {
  const row = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined
  if (!row) throw new Error('Utilizador não encontrado')
  assertPasswordPolicy(temporary)
  assertPasswordNotReused(database, userId, temporary, row.password_hash)
  database.transaction(() => {
    rememberPassword(database, userId, row.password_hash, timestamp)
    database.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?')
      .run(hashPassword(temporary), timestamp, userId)
  })()
  recordAudit(database, 'reset_password', 'user', userId, {}, timestamp)
  return getUser(database, userId)
}
