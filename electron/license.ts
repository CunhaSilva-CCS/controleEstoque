import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, verify } from 'node:crypto'
import { LICENSE_PUBLIC_KEY_PEM } from '../shared/license-public-key'
import type { LicenseDetails, LicenseStatus } from '../shared/types'
import { captureMessage } from './telemetry'

const LICENSE_EXPIRY_WARNING_DAYS = 14
const REVOCATION_CHECK_TIMEOUT_MS = 4_000
const REVOCATION_CHECK_URL =
  process.env.CORTEXIS_LICENSE_REVOCATION_URL ?? 'https://cortexis-license-api-production.up.railway.app'

const PREFIX = 'CTX1-'
const STORAGE_PREFIX = 'CTX-PROTECTED-1:'

// Cache local do estado de revogação remota; permite bloquear licenças perpétuas sem exigir conexão contínua.
let revokedLicenseIds: Set<string> | null = null

function revocationCachePath(): string {
  return path.join(app.getPath('userData'), 'revoked-licenses.json')
}

function ensureRevocationCacheLoaded(): Set<string> {
  if (revokedLicenseIds) return revokedLicenseIds
  try {
    const raw = fs.readFileSync(revocationCachePath(), 'utf8')
    const parsed = JSON.parse(raw)
    revokedLicenseIds = new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [])
  } catch {
    revokedLicenseIds = new Set()
  }
  return revokedLicenseIds
}

function saveRevocationCache(cache: Set<string>): void {
  const filePath = revocationCachePath()
  const tempPath = `${filePath}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(tempPath, JSON.stringify([...cache]), 'utf8')
  fs.renameSync(tempPath, filePath)
}

/**
 * Consulta o serviço remoto de revogação para uma licença e atualiza o cache local.
 * Falha silenciosamente (mantém o último estado conhecido) quando não há rede ou o serviço está indisponível.
 */
export async function refreshRevocationStatus(licenseId: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REVOCATION_CHECK_TIMEOUT_MS)
  try {
    const response = await fetch(`${REVOCATION_CHECK_URL}/licenses/${encodeURIComponent(licenseId)}/status`, {
      signal: controller.signal,
    })
    if (!response.ok) return
    const data = (await response.json()) as { revoked?: boolean }
    const cache = ensureRevocationCacheLoaded()
    const wasRevoked = cache.has(licenseId)
    if (data.revoked && !wasRevoked) {
      cache.add(licenseId)
      saveRevocationCache(cache)
    } else if (!data.revoked && wasRevoked) {
      cache.delete(licenseId)
      saveRevocationCache(cache)
    }
  } catch {
    // Sem conexão ou serviço indisponível: mantém a última verificação conhecida.
  } finally {
    clearTimeout(timeout)
  }
}

function decodePart(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function validatePayload(value: unknown): LicenseDetails {
  if (!value || typeof value !== 'object') throw new Error('Conteúdo da licença inválido')
  const item = value as Record<string, unknown>
  if (item.version !== 1) throw new Error('Versão da licença incompatível')
  if (typeof item.licenseId !== 'string' || !item.licenseId) throw new Error('Identificação inválida')
  if (typeof item.installationId !== 'string' || !item.installationId) throw new Error('Instalação inválida')
  if (typeof item.customer !== 'string' || !item.customer.trim()) throw new Error('Cliente inválido')
  if (item.edition !== 'standard' && item.edition !== 'professional') throw new Error('Edição inválida')
  if (typeof item.issuedAt !== 'string' || Number.isNaN(Date.parse(item.issuedAt))) throw new Error('Emissão inválida')
  if (item.expiresAt !== null && (typeof item.expiresAt !== 'string' || Number.isNaN(Date.parse(item.expiresAt)))) {
    throw new Error('Validade inválida')
  }
  if (item.modules !== undefined && (!Array.isArray(item.modules) || !item.modules.every((m) => typeof m === 'string'))) {
    throw new Error('Módulos da licença inválidos')
  }
  return item as unknown as LicenseDetails
}

export function verifyLicenseKey(
  rawKey: string,
  publicKeyPem = LICENSE_PUBLIC_KEY_PEM,
  now = new Date(),
  installationId?: string,
): LicenseStatus {
  try {
    const normalized = rawKey.trim().replace(/\s+/g, '')
    if (!normalized.startsWith(PREFIX)) throw new Error('Formato de chave inválido')
    const [payloadPart, signaturePart, extra] = normalized.slice(PREFIX.length).split('.')
    if (!payloadPart || !signaturePart || extra) throw new Error('Formato de chave inválido')
    const payloadBuffer = decodePart(payloadPart)
    const signature = decodePart(signaturePart)
    if (!verify(null, payloadBuffer, publicKeyPem, signature)) throw new Error('Assinatura da licença inválida')
    const details = validatePayload(JSON.parse(payloadBuffer.toString('utf8')))
    if (installationId && details.installationId !== installationId) {
      throw new Error('Esta chave pertence a outra instalação')
    }
    if (details.expiresAt && now.getTime() > Date.parse(details.expiresAt)) {
      throw new Error(`Licença expirada em ${new Date(details.expiresAt).toLocaleDateString('pt-PT')}`)
    }
    return { active: true, details }
  } catch (error) {
    return { active: false, reason: error instanceof Error ? error.message : 'Licença inválida', installationId: installationId ?? '' }
  }
}

function licensePath(): string {
  return path.join(app.getPath('userData'), 'license.key')
}

export function protectLicenseForStorage(
  rawKey: string,
  encrypt: (value: string) => Buffer = (value) => safeStorage.encryptString(value),
): string {
  const normalized = rawKey.trim()
  if (!normalized.startsWith(PREFIX)) throw new Error('Formato de chave inválido')
  return `${STORAGE_PREFIX}${encrypt(normalized).toString('base64')}`
}

export function readLicenseFromStorage(
  storedValue: string,
  decrypt: (value: Buffer) => string = (value) => safeStorage.decryptString(value),
): { licenseKey: string; protected: boolean } {
  const normalized = storedValue.trim()
  if (!normalized.startsWith(STORAGE_PREFIX)) {
    return { licenseKey: normalized, protected: false }
  }
  const encoded = normalized.slice(STORAGE_PREFIX.length)
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Licença protegida corrompida')
  }
  const licenseKey = decrypt(Buffer.from(encoded, 'base64')).trim()
  if (!licenseKey.startsWith(PREFIX)) throw new Error('Licença protegida corrompida')
  return { licenseKey, protected: true }
}

function saveProtectedLicense(rawKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Cofre seguro indisponível')
  const filePath = licensePath()
  const tempPath = `${filePath}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(tempPath, protectLicenseForStorage(rawKey), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tempPath, filePath)
}

function getInstallationId(): string {
  const filePath = path.join(app.getPath('userData'), 'installation.id')
  if (fs.existsSync(filePath)) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Cofre seguro indisponível')
    return safeStorage.decryptString(Buffer.from(fs.readFileSync(filePath, 'utf8'), 'base64'))
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Cofre seguro indisponível')
  const id = randomUUID()
  const protectedId = safeStorage.encryptString(id).toString('base64')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, protectedId, { encoding: 'utf8', mode: 0o600 })
  return id
}

function warnIfLicenseNearingExpiry(details: LicenseDetails): void {
  if (!details.expiresAt) return
  const daysLeft = Math.ceil((Date.parse(details.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000))
  if (daysLeft > LICENSE_EXPIRY_WARNING_DAYS) return
  captureMessage(
    `Licença de "${details.customer}" expira em ${new Date(details.expiresAt).toLocaleDateString('pt-PT')} (${daysLeft} dia(s) restante(s))`,
    'warning',
  )
}

export function getLicenseStatus(): LicenseStatus {
  const installationId = getInstallationId()
  const filePath = licensePath()
  if (!fs.existsSync(filePath)) return { active: false, reason: 'Este sistema ainda não foi licenciado', installationId }
  try {
    const stored = readLicenseFromStorage(fs.readFileSync(filePath, 'utf8'))
    const status = verifyLicenseKey(stored.licenseKey, LICENSE_PUBLIC_KEY_PEM, new Date(), installationId)
    if (status.active && !stored.protected) saveProtectedLicense(stored.licenseKey)
    if (status.active && ensureRevocationCacheLoaded().has(status.details.licenseId)) {
      return { active: false, reason: 'Esta licença foi revogada', installationId }
    }
    if (status.active) warnIfLicenseNearingExpiry(status.details)
    return status
  } catch (error) {
    return {
      active: false,
      reason: error instanceof Error ? error.message : 'Falha ao ler a licença protegida',
      installationId,
    }
  }
}

export function activateLicense(rawKey: string): LicenseStatus {
  const installationId = getInstallationId()
  const status = verifyLicenseKey(rawKey, LICENSE_PUBLIC_KEY_PEM, new Date(), installationId)
  if (!status.active) return status
  saveProtectedLicense(rawKey)
  return status
}

export function requireValidLicense(): LicenseDetails {
  const status = getLicenseStatus()
  if (!status.active) throw new Error(status.reason)
  return status.details
}
