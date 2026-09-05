import { randomUUID } from 'node:crypto'
import type { OperationStatus, SalesInvoice, SalesInvoiceInput } from '../../../shared/types'
import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'
import { getAuditContext, recordAudit } from '../audit'
import { applyStockMovement } from '../services/stock-service'
import { getCurrentCompanyId } from '../company-context'

export function listSalesInvoices(database: Db): SalesInvoice[] {
  const rows = database.prepare(`SELECT i.*, c.name AS customer_name, c.tax_number AS customer_tax_number,
    c.address AS customer_address FROM sales_invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.company_id = ? ORDER BY i.created_at DESC LIMIT 200`).all(getCurrentCompanyId()) as Record<string, unknown>[]
  const items = database.prepare(`SELECT ii.*, p.name AS product_name, p.sku AS product_sku,
    p.unit AS product_unit FROM sales_invoice_items ii JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = ? ORDER BY p.name`)
  return rows.map((row) => ({
    id: String(row.id), number: String(row.number), customerId: String(row.customer_id),
    customerName: String(row.customer_name), customerTaxNumber: String(row.customer_tax_number ?? ''),
    customerAddress: String(row.customer_address ?? ''), issueDate: String(row.issue_date),
    notes: String(row.notes ?? ''), createdAt: String(row.created_at),
    status: (row.status as OperationStatus) ?? 'confirmado', cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancellationReason: String(row.cancellation_reason ?? ''),
    items: (items.all(row.id) as Record<string, unknown>[]).map((item) => ({
      id: String(item.id), productId: String(item.product_id), productName: String(item.product_name),
      productSku: String(item.product_sku), productUnit: String(item.product_unit),
      quantity: Number(item.quantity), unitPrice: Number(item.unit_price),
    })),
  }))
}

export function createSalesInvoice(database: Db, input: SalesInvoiceInput, timestamp: string): SalesInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('O número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('A data da fatura é obrigatória')
  if (!input.customerId) throw new Error('Selecione um cliente')
  if (!input.items.length) throw new Error('Adicione, pelo menos, um produto final')
  const companyId = getCurrentCompanyId()
  const customer = database.prepare('SELECT active FROM customers WHERE id = ? AND company_id = ?').get(input.customerId, companyId) as { active: number } | undefined
  if (!customer?.active) throw new Error('Selecione um cliente ativo')
  const invoiceId = randomUUID()
  const tx = database.transaction(() => {
    database.prepare(`INSERT INTO sales_invoices (id, number, customer_id, issue_date, notes, company_id, created_at, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)`).run(invoiceId, number, input.customerId, input.issueDate, input.notes?.trim() ?? '', companyId, timestamp, getAuditContext().userId)
    const insertItem = database.prepare(`INSERT INTO sales_invoice_items (id, invoice_id, product_id, quantity, unit_price, unit_cost_snapshot) VALUES (?, ?, ?, ?, ?, ?)`)
    const used = new Set<string>()
    for (const item of input.items) {
      if (used.has(item.productId)) throw new Error('Não repita o mesmo produto na fatura')
      used.add(item.productId)
      const product = database.prepare('SELECT name, kind, active, stock, cost_price FROM products WHERE id = ? AND company_id = ?').get(item.productId, companyId) as { name: string; kind: string; active: number; stock: number; cost_price: number } | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error(`O produto ${product.name} está inativo`)
      if (product.kind !== 'acabado') throw new Error('A faturação de saída aceita apenas produtos finais')
      const quantity = roundQuantity(item.quantity)
      if (!(quantity > 0)) throw new Error('A quantidade deve ser superior a zero')
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('O preço unitário não pode ser negativo')
      if (quantity > Number(product.stock)) throw new Error(`Stock insuficiente de ${product.name}. Disponível: ${roundQuantity(Number(product.stock))}`)
      insertItem.run(randomUUID(), invoiceId, item.productId, quantity, item.unitPrice, Number(product.cost_price))
      applyStockMovement(database, { productId: item.productId, type: 'saida', quantity, reason: `Fatura de saída ${number}`, reference: invoiceId, origin: 'fatura_saida' }, timestamp)
    }
  })
  try { tx() } catch (error) {
    if (String(error).includes('UNIQUE')) throw new Error('Já existe uma fatura de saída com este número')
    throw error
  }
  recordAudit(database, 'create', 'sales_invoice', invoiceId, { number, customerId: input.customerId, itemCount: input.items.length }, timestamp)
  return listSalesInvoices(database).find((invoice) => invoice.id === invoiceId)!
}
