import { randomUUID } from 'node:crypto'
import type { FinanceEntry, FinanceEntryFilters, FinanceEntryInput } from '../../../shared/types'
import type { Db } from '../types'
import { recordAudit } from '../audit'
import { getCurrentCompanyId } from '../company-context'

function map(row: Record<string, unknown>): FinanceEntry {
  return {
    id: String(row.id),
    type: row.type as FinanceEntry['type'],
    description: String(row.description),
    amount: Number(row.amount),
    dueDate: String(row.due_date),
    status: row.status as FinanceEntry['status'],
    paidAt: row.paid_at ? String(row.paid_at) : null,
    reference: String(row.reference ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function listFinanceEntries(database: Db, filters: FinanceEntryFilters = {}): FinanceEntry[] {
  const clauses: string[] = ['company_id = ?']
  const params: string[] = [getCurrentCompanyId()]
  if (filters.type) { clauses.push('type = ?'); params.push(filters.type) }
  if (filters.status) { clauses.push('status = ?'); params.push(filters.status) }
  const where = `WHERE ${clauses.join(' AND ')}`
  const rows = database
    .prepare(`SELECT * FROM financial_entries ${where} ORDER BY due_date ASC, created_at ASC`)
    .all(...params) as Record<string, unknown>[]
  return rows.map(map)
}

export function createFinanceEntry(database: Db, input: FinanceEntryInput, timestamp: string): FinanceEntry {
  const description = input.description.trim()
  if (!description) throw new Error('Descrição é obrigatória')
  if (!(input.amount > 0)) throw new Error('Valor deve ser maior que zero')
  if (!input.dueDate) throw new Error('Data de vencimento é obrigatória')
  if (input.type !== 'pagar' && input.type !== 'receber') throw new Error('Tipo inválido')

  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO financial_entries (id, type, description, amount, due_date, status, reference, notes, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`,
    )
    .run(id, input.type, description, input.amount, input.dueDate, input.reference?.trim() ?? '', input.notes?.trim() ?? '', getCurrentCompanyId(), timestamp, timestamp)
  recordAudit(database, 'create', 'financial_entry', id, { type: input.type, amount: input.amount }, timestamp)
  return listFinanceEntries(database).find((entry) => entry.id === id)!
}

export function markFinanceEntryPaid(database: Db, id: string, paid: boolean, timestamp: string): FinanceEntry {
  const result = database
    .prepare(`UPDATE financial_entries SET status = ?, paid_at = ?, updated_at = ? WHERE id = ? AND company_id = ?`)
    .run(paid ? 'pago' : 'pendente', paid ? timestamp : null, timestamp, id, getCurrentCompanyId())
  if (result.changes === 0) throw new Error('Lançamento não encontrado')
  recordAudit(database, paid ? 'pay' : 'unpay', 'financial_entry', id, {}, timestamp)
  return listFinanceEntries(database).find((entry) => entry.id === id)!
}

export function deleteFinanceEntry(database: Db, id: string): void {
  const entry = database.prepare('SELECT status FROM financial_entries WHERE id = ? AND company_id = ?').get(id, getCurrentCompanyId()) as { status: string } | undefined
  if (!entry) throw new Error('Lançamento não encontrado')
  if (entry.status === 'pago') throw new Error('Não é possível excluir um lançamento já pago')
  database.prepare('DELETE FROM financial_entries WHERE id = ? AND company_id = ?').run(id, getCurrentCompanyId())
}
