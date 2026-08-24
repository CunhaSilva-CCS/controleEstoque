import Database from 'better-sqlite3-multiple-ciphers'
import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Db } from './types'

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8')
let database: Db | null = null
let databaseKey: Buffer | null = null

export function isPlaintextDatabase(filePath: string): boolean {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return true
  const handle = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length)
    fs.readSync(handle, header, 0, header.length, 0)
    return header.equals(SQLITE_HEADER)
  } finally {
    fs.closeSync(handle)
  }
}

export function configureCipher(target: Db): void {
  target.pragma("cipher='sqlcipher'")
  target.pragma('legacy=4')
}

export function openDatabase(filePath: string, key?: Buffer): Db {
  const target = new Database(filePath)
  if (key) {
    configureCipher(target)
    target.key(key)
  }
  return target
}

export function assertDatabaseIntegrity(target: Db): void {
  const result = target.pragma('integrity_check', { simple: true })
  if (result !== 'ok') throw new Error('Falha na verificação de integridade da base de dados')
}

function getOrCreateDatabaseKey(databasePath: string): Buffer {
  const keyPath = path.join(path.dirname(databasePath), 'estoque.key')
  if (fs.existsSync(keyPath)) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('O cofre seguro do sistema operativo não está disponível')
    const protectedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64')
    const keyHex = safeStorage.decryptString(protectedKey)
    if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('A chave protegida da base de dados é inválida')
    return Buffer.from(keyHex, 'hex')
  }
  if (fs.existsSync(databasePath) && !isPlaintextDatabase(databasePath)) {
    throw new Error('A chave de criptografia da base de dados não foi encontrada. Restaure-a antes de continuar.')
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('O cofre seguro do sistema operativo não está disponível')
  const key = randomBytes(32)
  const protectedKey = safeStorage.encryptString(key.toString('hex'))
  const temporaryPath = `${keyPath}.tmp`
  fs.writeFileSync(temporaryPath, protectedKey.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, keyPath)
  return key
}

function encryptPlaintextDatabase(databasePath: string, key: Buffer): void {
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size === 0 || !isPlaintextDatabase(databasePath)) return
  const encryptedPath = `${databasePath}.encrypting`
  const originalPath = `${databasePath}.pre-encryption`
  fs.rmSync(encryptedPath, { force: true })
  const source = new Database(databasePath)
  try {
    assertDatabaseIntegrity(source)
    source.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    source.close()
  }
  fs.copyFileSync(databasePath, encryptedPath)
  const candidate = new Database(encryptedPath)
  try {
    configureCipher(candidate)
    candidate.rekey(key)
    assertDatabaseIntegrity(candidate)
  } finally {
    candidate.close()
  }
  const verification = openDatabase(encryptedPath, key)
  try { assertDatabaseIntegrity(verification) } finally { verification.close() }
  fs.rmSync(originalPath, { force: true })
  fs.renameSync(databasePath, originalPath)
  try {
    fs.renameSync(encryptedPath, databasePath)
    const finalCheck = openDatabase(databasePath, key)
    try { assertDatabaseIntegrity(finalCheck) } finally { finalCheck.close() }
    fs.rmSync(originalPath, { force: true })
  } catch (error) {
    fs.rmSync(databasePath, { force: true })
    if (fs.existsSync(originalPath)) fs.renameSync(originalPath, databasePath)
    throw error
  }
}

export function getDefaultDatabasePath(): string {
  const directory = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(directory, { recursive: true })
  return path.join(directory, 'estoque.db')
}

export function prepareDefaultConnection(): { path: string; key: Buffer } {
  const databasePath = getDefaultDatabasePath()
  const key = getOrCreateDatabaseKey(databasePath)
  encryptPlaintextDatabase(databasePath, key)
  return { path: databasePath, key }
}

export function connect(databasePath: string, key?: Buffer): Db {
  disconnect()
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  database = openDatabase(databasePath, key)
  databaseKey = key ?? null
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  return database
}

export function getDatabase(): Db {
  if (!database) throw new Error('Base de dados não inicializada')
  return database
}

export function getDatabaseKey(): Buffer | null {
  return databaseKey
}

export function disconnect(): void {
  database?.close()
  database = null
  databaseKey = null
}
