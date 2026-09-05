import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { protectLicenseForStorage, readLicenseFromStorage, verifyLicenseKey } from './license'
import { LICENSE_MODULE_IDS, getEnabledModules } from '../shared/license-modules'

function fixture(
  expiresAt: string | null,
  overrides: { edition?: 'standard' | 'professional'; modules?: string[] } = {},
) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    licenseId: 'lic-test',
    installationId: 'installation-test',
    customer: 'Cliente Teste',
    edition: overrides.edition ?? 'professional',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt,
    ...(overrides.modules ? { modules: overrides.modules } : {}),
  }))
  const signature = sign(null, payload, privateKey).toString('base64url')
  return {
    key: `CTX1-${payload.toString('base64url')}.${signature}`,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

describe('licenciamento offline', () => {
  it('protege a licença armazenada sem deixar a chave legível', () => {
    const key = 'CTX1-conteudo.assinatura'
    const protectedValue = protectLicenseForStorage(key, (value) => Buffer.from(`cofre:${value}`))
    expect(protectedValue).not.toContain(key)
    expect(protectedValue).not.toContain('CTX1-')

    const restored = readLicenseFromStorage(protectedValue, (value) =>
      value.toString('utf8').replace(/^cofre:/, ''),
    )
    expect(restored).toEqual({ licenseKey: key, protected: true })
  })

  it('reconhece licença antiga em texto para permitir migração', () => {
    const key = 'CTX1-conteudo.assinatura'
    expect(readLicenseFromStorage(key, () => '')).toEqual({ licenseKey: key, protected: false })
  })

  it('rejeita conteúdo protegido corrompido', () => {
    expect(() => readLicenseFromStorage('CTX-PROTECTED-1:***', () => '')).toThrow(/corrompida/)
  })

  it('aceita uma licença assinada e dentro da validade', () => {
    const item = fixture('2027-01-01T00:00:00.000Z')
    const status = verifyLicenseKey(item.key, item.publicKey, new Date('2026-08-24T00:00:00Z'))
    expect(status.active).toBe(true)
    if (status.active) expect(status.details.customer).toBe('Cliente Teste')
  })

  it('rejeita alteração manual no conteúdo', () => {
    const item = fixture(null)
    const [payload, signature] = item.key.slice(5).split('.')
    const alteredPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`
    const altered = `CTX1-${alteredPayload}.${signature}`
    expect(verifyLicenseKey(altered, item.publicKey).active).toBe(false)
  })

  it('rejeita licença expirada', () => {
    const item = fixture('2026-01-02T00:00:00.000Z')
    const status = verifyLicenseKey(item.key, item.publicKey, new Date('2026-08-24T00:00:00Z'))
    expect(status.active).toBe(false)
    if (!status.active) expect(status.reason).toMatch(/expirada/)
  })

  it('rejeita uma chave emitida para outra instalação', () => {
    const item = fixture(null)
    const status = verifyLicenseKey(item.key, item.publicKey, new Date(), 'outro-computador')
    expect(status.active).toBe(false)
    if (!status.active) expect(status.reason).toMatch(/outra instalação/)
  })

  it('licença professional sem "modules" libera todos os módulos (compatibilidade)', () => {
    const item = fixture(null, { edition: 'professional' })
    const status = verifyLicenseKey(item.key, item.publicKey)
    expect(status.active).toBe(true)
    if (status.active) expect(getEnabledModules(status.details)).toEqual(new Set(LICENSE_MODULE_IDS))
  })

  it('licença standard sem "modules" não libera nenhum módulo opcional', () => {
    const item = fixture(null, { edition: 'standard' })
    const status = verifyLicenseKey(item.key, item.publicKey)
    expect(status.active).toBe(true)
    if (status.active) expect(getEnabledModules(status.details).size).toBe(0)
  })

  it('licença com "modules" explícito vale à risca, independente da edição', () => {
    const item = fixture(null, { edition: 'standard', modules: ['financeiro'] })
    const status = verifyLicenseKey(item.key, item.publicKey)
    expect(status.active).toBe(true)
    if (status.active) expect(getEnabledModules(status.details)).toEqual(new Set(['financeiro']))
  })
})
