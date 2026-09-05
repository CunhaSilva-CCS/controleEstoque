import { randomUUID } from 'node:crypto'
import type { OperationStatus, PurchaseInvoice, PurchaseInvoiceInput, PurchaseInvoiceUpdateInput } from '../../../shared/types'
import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'
import { getAuditContext, recordAudit } from '../audit'
import { applyStockMovement } from '../services/stock-service'
import { receiveLot } from '../services/lot-service'
import { updateInvoiceAverageCost } from '../services/costing-service'
import { convertToStockUnit } from '../services/unit-service'
import { getCurrentCompanyId } from '../company-context'

export function listPurchaseInvoices(database: Db): PurchaseInvoice[] {
  const rows = database.prepare(`SELECT i.*, s.name AS supplier_name FROM purchase_invoices i
    LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE i.company_id = ?
    ORDER BY i.created_at DESC LIMIT 200`).all(getCurrentCompanyId()) as Record<string, unknown>[]
  const items = database.prepare(`SELECT ii.*, p.name AS product_name, p.sku AS product_sku,
    p.unit AS product_unit FROM purchase_invoice_items ii JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = ? ORDER BY p.name`)
  return rows.map((row) => ({
    id: String(row.id), number: String(row.number),
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    supplierName: row.supplier_name == null ? null : String(row.supplier_name),
    issueDate: String(row.issue_date), notes: String(row.notes ?? ''), createdAt: String(row.created_at),
    status: (row.status as OperationStatus) ?? 'confirmado', cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancellationReason: String(row.cancellation_reason ?? ''),
    items: (items.all(row.id) as Record<string, unknown>[]).map((item) => ({
      id: String(item.id), productId: String(item.product_id), productName: String(item.product_name),
      productSku: String(item.product_sku), productUnit: String(item.product_unit),
      quantity: Number(item.quantity), unitCost: Number(item.unit_cost),
    })),
  }))
}

export function createPurchaseInvoice(database: Db, input: PurchaseInvoiceInput, timestamp: string): PurchaseInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('Número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('Data da fatura é obrigatória')
  if (!input.items.length) throw new Error('Informe ao menos um item na fatura')

  const invoiceId = randomUUID()
  const companyId = getCurrentCompanyId()

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO purchase_invoices (id, number, supplier_id, issue_date, notes, company_id, created_at, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)`,
      )
      .run(
        invoiceId,
        number,
        input.supplierId || null,
        input.issueDate,
        input.notes?.trim() ?? '',
        companyId,
        timestamp,
        getAuditContext().userId,
      )

    const insertItem = database.prepare(
      `INSERT INTO purchase_invoice_items (id, invoice_id, product_id, quantity, unit_cost, lot_number, manufactured_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const affectedIds = new Set<string>()
    const seenProductIds = new Set<string>()
    for (const item of input.items) {
      if (seenProductIds.has(item.productId)) throw new Error('Não repita o mesmo insumo na fatura')
      seenProductIds.add(item.productId)
      if (!(item.quantity > 0)) throw new Error('Quantidade do item deve ser maior que zero')
      if (item.unitCost < 0) throw new Error('Custo unitário não pode ser negativo')

      const product = database
        .prepare('SELECT id, kind, active, purchase_unit FROM products WHERE id = ? AND company_id = ?')
        .get(item.productId, companyId) as { id: string; kind: string; active: number; purchase_unit: string | null } | undefined
      if (!product) throw new Error('Produto não encontrado')
      if (!product.active) throw new Error('Produto inativo não pode entrar por fatura')
      if (product.kind !== 'insumo') {
        throw new Error('Entrada por fatura permitida apenas para insumos')
      }

      const quantity = convertToStockUnit(database, item.productId, item.quantity, product.purchase_unit ?? undefined)
      const stockUnitCost = roundQuantity(item.unitCost / (quantity / item.quantity))
      affectedIds.add(item.productId)
      insertItem.run(randomUUID(), invoiceId, item.productId, quantity, stockUnitCost,
        item.lotNumber?.trim() ?? '', item.manufacturedAt || null, item.expiresAt || null)

      const movement = applyStockMovement(database, {
        productId: item.productId,
        type: 'entrada',
        quantity,
        reason: `Fatura ${number}`,
        reference: invoiceId,
        origin: 'fatura',
      }, timestamp)
      receiveLot(database, { productId: item.productId, supplierId: input.supplierId,
        lotNumber: item.lotNumber, manufacturedAt: item.manufacturedAt, expiresAt: item.expiresAt,
        quantity, stockMovementId: movement.id, timestamp })

    }
    affectedIds.forEach((productId) => updateInvoiceAverageCost(database, productId, timestamp))
  })

  tx()
  recordAudit(database, 'create', 'purchase_invoice', invoiceId, { number, itemCount: input.items.length }, timestamp)

  return listPurchaseInvoices(database).find((i) => i.id === invoiceId)!
}

export function updatePurchaseInvoice(database: Db, input: PurchaseInvoiceUpdateInput, timestamp: string): PurchaseInvoice {
  const number = input.number.trim()
  if (!number) throw new Error('Número da fatura é obrigatório')
  if (!input.issueDate) throw new Error('Data da fatura é obrigatória')
  if (!input.items.length) throw new Error('Informe ao menos um item na fatura')

  const current = listPurchaseInvoices(database).find((invoice) => invoice.id === input.id)
  if (!current) throw new Error('Fatura não encontrada')
  if (current.status !== 'rascunho') {
    throw new Error('Uma fatura confirmada não pode ser alterada. Utilize o estorno para preservar o histórico.')
  }

  const companyId = getCurrentCompanyId()
  const duplicate = database.prepare(
    `SELECT id FROM purchase_invoices
     WHERE lower(number) = lower(?) AND COALESCE(supplier_id, '') = COALESCE(?, '') AND id <> ? AND company_id = ?`,
  ).get(number, input.supplierId || null, input.id, companyId)
  if (duplicate) throw new Error('Já existe uma fatura com este número para o fornecedor informado')

  const productIds = new Set<string>()
  for (const item of input.items) {
    if (productIds.has(item.productId)) throw new Error('Não repita o mesmo insumo na fatura')
    productIds.add(item.productId)
    if (!(item.quantity > 0)) throw new Error('Quantidade do item deve ser maior que zero')
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new Error('Custo unitário não pode ser negativo')
    }
    const product = database.prepare('SELECT kind, active FROM products WHERE id = ? AND company_id = ?').get(item.productId, companyId) as
      | { kind: string; active: number }
      | undefined
    if (!product) throw new Error('Produto não encontrado')
    if (!product.active) throw new Error('Produto inativo não pode entrar por fatura')
    if (product.kind !== 'insumo') throw new Error('Entrada por fatura permitida apenas para insumos')
  }

  const oldQuantities = new Map<string, number>()
  const newQuantities = new Map<string, number>()
  current.items.forEach((item) => oldQuantities.set(item.productId, roundQuantity(item.quantity)))
  input.items.forEach((item) => newQuantities.set(item.productId, roundQuantity(item.quantity)))
  const affectedIds = new Set([...oldQuantities.keys(), ...newQuantities.keys()])

  for (const productId of affectedIds) {
    const delta = roundQuantity((newQuantities.get(productId) ?? 0) - (oldQuantities.get(productId) ?? 0))
    if (delta >= 0) continue
    const row = database.prepare('SELECT stock FROM products WHERE id = ?').get(productId) as { stock: number }
    if (roundQuantity(row.stock + delta) < 0) {
      throw new Error('Não é possível reduzir a fatura: parte deste stock já foi consumida')
    }
  }

  const tx = database.transaction(() => {
    database.prepare(
      `UPDATE purchase_invoices SET number = ?, supplier_id = ?, issue_date = ?, notes = ? WHERE id = ? AND company_id = ?`,
    ).run(number, input.supplierId || null, input.issueDate, input.notes?.trim() ?? '', input.id, companyId)
    database.prepare('DELETE FROM purchase_invoice_items WHERE invoice_id = ?').run(input.id)
    const insertItem = database.prepare(
      `INSERT INTO purchase_invoice_items (id, invoice_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const item of input.items) {
      insertItem.run(randomUUID(), input.id, item.productId, roundQuantity(item.quantity), item.unitCost)
    }
    for (const productId of affectedIds) {
      const delta = roundQuantity((newQuantities.get(productId) ?? 0) - (oldQuantities.get(productId) ?? 0))
      if (delta === 0) continue
      applyStockMovement(database, {
        productId,
        type: delta > 0 ? 'entrada' : 'saida',
        quantity: Math.abs(delta),
        reason: `Edição da fatura ${number}`,
        reference: input.id,
        origin: 'fatura',
      }, timestamp)
    }
    affectedIds.forEach((productId) => updateInvoiceAverageCost(database, productId, timestamp))
  })
  tx()
  recordAudit(database, 'update', 'purchase_invoice', input.id, { number, itemCount: input.items.length }, timestamp)
  return listPurchaseInvoices(database).find((invoice) => invoice.id === input.id)!
}
