import type { OperationStatus, PurchaseInvoice } from '../../../shared/types'
import type { Db } from '../types'

export function listPurchaseInvoices(database: Db): PurchaseInvoice[] {
  const rows = database.prepare(`SELECT i.*, s.name AS supplier_name FROM purchase_invoices i
    LEFT JOIN suppliers s ON s.id = i.supplier_id ORDER BY i.created_at DESC LIMIT 200`).all() as Record<string, unknown>[]
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
