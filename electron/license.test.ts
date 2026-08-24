import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { verifyLicenseKey } from './license'

function fixture(expiresAt: string | null) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    licenseId: 'lic-test',
    installationId: 'installation-test',
    customer: 'Cliente Teste',
    edition: 'professional',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt,
  }))
  const signature = sign(null, payload, privateKey).toString('base64url')
  return {
    key: `CTX1-${payload.toString('base64url')}.${signature}`,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}

describe('licenciamento offline', () => {
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
})
