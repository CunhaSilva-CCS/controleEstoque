import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, verify } from 'node:crypto'
import { LICENSE_PUBLIC_KEY_PEM } from '../shared/license-public-key'
import type { LicenseDetails, LicenseStatus } from '../shared/types'

const PREFIX = 'CTX1-'
const STORAGE_PREFIX = 'CTX-PROTECTED-1:'

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
      throw new Error(`Licença expirada em ${new Date(details.expiresAt).toLocaleDateString('pt-BR')}`)
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

export function getLicenseStatus(): LicenseStatus {
  const installationId = getInstallationId()
  const filePath = licensePath()
  if (!fs.existsSync(filePath)) return { active: false, reason: 'Este sistema ainda não foi licenciado', installationId }
  try {
    const stored = readLicenseFromStorage(fs.readFileSync(filePath, 'utf8'))
    const status = verifyLicenseKey(stored.licenseKey, LICENSE_PUBLIC_KEY_PEM, new Date(), installationId)
    if (status.active && !stored.protected) saveProtectedLicense(stored.licenseKey)
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
