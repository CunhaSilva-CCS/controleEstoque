import { randomUUID } from 'node:crypto'
import type { Supplier } from '../../../shared/types'
import type { Db } from '../types'

function map(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    name: String(row.name),
    document: String(row.document ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    notes: String(row.notes ?? ''),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function listSuppliers(database: Db, activeOnly = false): Supplier[] {
  const sql = activeOnly
    ? 'SELECT * FROM suppliers WHERE active = 1 ORDER BY name'
    : 'SELECT * FROM suppliers ORDER BY name'
  return (database.prepare(sql).all() as Record<string, unknown>[]).map(map)
}

export function createSupplier(
  database: Db,
  input: { name: string; document?: string; phone?: string; email?: string; notes?: string },
  timestamp: string,
): Supplier {
  const name = input.name.trim()
  if (!name) throw new Error('Nome do fornecedor é obrigatório')
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO suppliers (id, name, document, phone, email, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      name,
      input.document?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.email?.trim() ?? '',
      input.notes?.trim() ?? '',
      timestamp,
      timestamp,
    )
  return listSuppliers(database).find((s) => s.id === id)!
}

export function updateSupplier(
  database: Db,
  input: { id: string; name: string; document?: string; phone?: string; email?: string; notes?: string; active: boolean },
  timestamp: string,
): Supplier {
  const name = input.name.trim()
  if (!name) throw new Error('Nome do fornecedor é obrigatório')
  const result = database
    .prepare(
      `UPDATE suppliers
       SET name = ?, document = ?, phone = ?, email = ?, notes = ?, active = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      name,
      input.document?.trim() ?? '',
      input.phone?.trim() ?? '',
      input.email?.trim() ?? '',
      input.notes?.trim() ?? '',
      input.active ? 1 : 0,
      timestamp,
      input.id,
    )
  if (result.changes === 0) throw new Error('Fornecedor não encontrado')
  return listSuppliers(database).find((s) => s.id === input.id)!
}
