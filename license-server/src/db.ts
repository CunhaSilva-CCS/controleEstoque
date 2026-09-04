import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL não configurada')
}

export const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } })

export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revoked_licenses (
      license_id TEXT PRIMARY KEY,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reason TEXT
    )
  `)
  await pool.query('ALTER TABLE revoked_licenses ADD COLUMN IF NOT EXISTS customer TEXT')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS issued_licenses (
      license_id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      customer TEXT NOT NULL,
      edition TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export interface RevocationRow {
  licenseId: string
  revokedAt: string
  reason: string | null
  customer: string | null
}

export async function getRevocation(licenseId: string): Promise<Omit<RevocationRow, 'licenseId'> | null> {
  const result = await pool.query<{ revoked_at: Date; reason: string | null; customer: string | null }>(
    'SELECT revoked_at, reason, customer FROM revoked_licenses WHERE license_id = $1',
    [licenseId],
  )
  if (result.rowCount === 0) return null
  const row = result.rows[0]
  return { revokedAt: row.revoked_at.toISOString(), reason: row.reason, customer: row.customer }
}

export async function listRevocations(): Promise<RevocationRow[]> {
  const result = await pool.query<{ license_id: string; revoked_at: Date; reason: string | null; customer: string | null }>(
    'SELECT license_id, revoked_at, reason, customer FROM revoked_licenses ORDER BY revoked_at DESC',
  )
  return result.rows.map((row) => ({
    licenseId: row.license_id,
    revokedAt: row.revoked_at.toISOString(),
    reason: row.reason,
    customer: row.customer,
  }))
}

export async function revokeLicense(licenseId: string, reason: string | null, customer: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO revoked_licenses (license_id, reason, customer) VALUES ($1, $2, $3)
     ON CONFLICT (license_id) DO UPDATE SET reason = EXCLUDED.reason, customer = EXCLUDED.customer`,
    [licenseId, reason, customer],
  )
}

export async function unrevokeLicense(licenseId: string): Promise<void> {
  await pool.query('DELETE FROM revoked_licenses WHERE license_id = $1', [licenseId])
}

export interface IssuedLicenseInput {
  licenseId: string
  installationId: string
  customer: string
  edition: string
  issuedAt: string
  expiresAt: string | null
}

export interface IssuedLicenseRow extends IssuedLicenseInput {
  registeredAt: string
}

// Registro apenas informativo: nunca guarda a chave nem a chave privada, só metadados da emissão local.
export async function registerIssuedLicense(input: IssuedLicenseInput): Promise<void> {
  await pool.query(
    `INSERT INTO issued_licenses (license_id, installation_id, customer, edition, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (license_id) DO UPDATE SET
       installation_id = EXCLUDED.installation_id,
       customer = EXCLUDED.customer,
       edition = EXCLUDED.edition,
       issued_at = EXCLUDED.issued_at,
       expires_at = EXCLUDED.expires_at`,
    [input.licenseId, input.installationId, input.customer, input.edition, input.issuedAt, input.expiresAt],
  )
}

export async function listIssuedLicenses(): Promise<IssuedLicenseRow[]> {
  const result = await pool.query<{
    license_id: string
    installation_id: string
    customer: string
    edition: string
    issued_at: Date
    expires_at: Date | null
    registered_at: Date
  }>('SELECT license_id, installation_id, customer, edition, issued_at, expires_at, registered_at FROM issued_licenses ORDER BY registered_at DESC')
  return result.rows.map((row) => ({
    licenseId: row.license_id,
    installationId: row.installation_id,
    customer: row.customer,
    edition: row.edition,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    registeredAt: row.registered_at.toISOString(),
  }))
}
