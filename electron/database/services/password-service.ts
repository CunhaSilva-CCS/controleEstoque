import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Db } from '../types'

export const DEFAULT_PASSWORD = 'admin123'
const HISTORY_LIMIT = 5
const COST = 32_768
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_LENGTH = 64

export function legacyHashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024,
  }).toString('hex')
  return `scrypt$1$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt}$${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith('scrypt$')) {
    const actual = Buffer.from(legacyHashPassword(password), 'hex')
    const expected = Buffer.from(storedHash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const parts = storedHash.split('$')
  const current = parts.length === 7 && parts[1] === '1'
  const salt = current ? parts[5] : parts[1]
  const expectedHex = current ? parts[6] : parts[2]
  const cost = current ? Number(parts[2]) : 16_384
  const blockSize = current ? Number(parts[3]) : 8
  const parallelization = current ? Number(parts[4]) : 1
  if (!salt || !expectedHex || ![16_384, COST].includes(cost) || blockSize !== 8 || parallelization !== 1) return false
  const actual = scryptSync(password, salt, KEY_LENGTH, {
    N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024,
  })
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function needsPasswordRehash(hash: string): boolean {
  return !hash.startsWith(`scrypt$1$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$`)
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 10) throw new Error('A palavra-passe deve ter, pelo menos, 10 caracteres')
  if (password.length > 128) throw new Error('A palavra-passe deve ter, no máximo, 128 caracteres')
  if (!/[a-z]/.test(password)) throw new Error('Inclua pelo menos uma letra minúscula')
  if (!/[A-Z]/.test(password)) throw new Error('Inclua pelo menos uma letra maiúscula')
  if (!/\d/.test(password)) throw new Error('Inclua pelo menos um número')
  if (!/[^A-Za-z0-9]/.test(password)) throw new Error('Inclua pelo menos um carácter especial')
  if (password === DEFAULT_PASSWORD) throw new Error('Não utilize a palavra-passe predefinida. Escolha uma diferente.')
}

export function assertPasswordNotReused(database: Db, userId: string, password: string, currentHash: string): void {
  if (verifyPassword(password, currentHash)) throw new Error('A nova palavra-passe deve ser diferente da atual')
  const history = database.prepare(
    'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(userId, HISTORY_LIMIT) as { password_hash: string }[]
  if (history.some((item) => verifyPassword(password, item.password_hash))) {
    throw new Error(`Não reutilize nenhuma das últimas ${HISTORY_LIMIT} palavras-passe`)
  }
}

export function rememberPassword(database: Db, userId: string, hash: string, timestamp: string): void {
  database.prepare(
    'INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (lower(hex(randomblob(16))), ?, ?, ?)',
  ).run(userId, hash, timestamp)
  database.prepare(
    `DELETE FROM password_history WHERE user_id = ? AND id NOT IN (
       SELECT id FROM password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
     )`,
  ).run(userId, userId, HISTORY_LIMIT)
}
