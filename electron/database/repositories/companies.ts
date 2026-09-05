import { randomUUID } from 'node:crypto'
import type { Company, CompanyInput } from '../../../shared/types'
import type { Db } from '../types'

function map(row: Record<string, unknown>): Company {
  return {
    id: String(row.id),
    name: String(row.name),
    taxNumber: String(row.tax_number ?? ''),
    address: String(row.address ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function listCompanies(database: Db, activeOnly = false): Company[] {
  const sql = activeOnly
    ? 'SELECT * FROM companies WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM companies ORDER BY name'
  return (database.prepare(sql).all() as Record<string, unknown>[]).map(map)
}

export function getCompany(database: Db, id: string): Company | null {
  const row = database.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? map(row) : null
}

export function createCompany(database: Db, input: CompanyInput, timestamp: string): Company {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da empresa é obrigatório')
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO companies (id, name, tax_number, address, phone, email, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(id, name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', timestamp, timestamp)
  return getCompany(database, id)!
}

export function updateCompany(
  database: Db,
  input: { id: string; name: string; taxNumber?: string; address?: string; phone?: string; email?: string; active: boolean },
  timestamp: string,
): Company {
  const name = input.name.trim()
  if (!name) throw new Error('Nome da empresa é obrigatório')
  if (!input.active) {
    const remainingActive = database
      .prepare('SELECT COUNT(*) AS c FROM companies WHERE active = 1 AND id <> ?')
      .get(input.id) as { c: number }
    if (remainingActive.c === 0) throw new Error('É necessário manter pelo menos uma empresa ativa')
  }
  const result = database
    .prepare(
      `UPDATE companies SET name = ?, tax_number = ?, address = ?, phone = ?, email = ?, active = ?, updated_at = ? WHERE id = ?`,
    )
    .run(name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.active ? 1 : 0, timestamp, input.id)
  if (result.changes === 0) throw new Error('Empresa não encontrada')
  return getCompany(database, input.id)!
}
