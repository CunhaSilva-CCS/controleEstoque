import { randomUUID } from 'node:crypto'
import type { Customer, CustomerInput, CustomerUpdateInput } from '../../../shared/types'
import type { Db } from '../types'
import { recordAudit } from '../audit'
import { getCurrentCompanyId } from '../company-context'

function map(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id), name: String(row.name), taxNumber: String(row.tax_number ?? ''),
    address: String(row.address ?? ''), phone: String(row.phone ?? ''), email: String(row.email ?? ''),
    notes: String(row.notes ?? ''), active: Boolean(row.active),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  }
}

export function listCustomers(database: Db, activeOnly = false): Customer[] {
  const sql = activeOnly
    ? 'SELECT * FROM customers WHERE company_id = ? AND active = 1 ORDER BY name'
    : 'SELECT * FROM customers WHERE company_id = ? ORDER BY name'
  return (database.prepare(sql).all(getCurrentCompanyId()) as Record<string, unknown>[]).map(map)
}

export function createCustomer(database: Db, input: CustomerInput, timestamp: string): Customer {
  const name = input.name.trim()
  if (!name) throw new Error('O nome do cliente é obrigatório')
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO customers (id, name, tax_number, address, phone, email, notes, active, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(id, name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.notes?.trim() ?? '', getCurrentCompanyId(), timestamp, timestamp)
  recordAudit(database, 'create', 'customer', id, { name }, timestamp)
  return listCustomers(database).find((item) => item.id === id)!
}

export function updateCustomer(database: Db, input: CustomerUpdateInput, timestamp: string): Customer {
  const name = input.name.trim()
  if (!name) throw new Error('O nome do cliente é obrigatório')
  const result = database
    .prepare(
      `UPDATE customers SET name = ?, tax_number = ?, address = ?, phone = ?, email = ?, notes = ?, active = ?, updated_at = ? WHERE id = ? AND company_id = ?`,
    )
    .run(name, input.taxNumber?.trim() ?? '', input.address?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.notes?.trim() ?? '', input.active ? 1 : 0, timestamp, input.id, getCurrentCompanyId())
  if (result.changes === 0) throw new Error('Cliente não encontrado')
  recordAudit(database, 'update', 'customer', input.id, { name, active: input.active }, timestamp)
  return listCustomers(database).find((item) => item.id === input.id)!
}
