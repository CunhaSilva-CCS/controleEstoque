import type { OperationStatus, SalesInvoice } from '../../../shared/types'
import type { Db } from '../types'

export function listSalesInvoices(database: Db): SalesInvoice[] {
  const rows = database.prepare(`SELECT i.*, c.name AS customer_name, c.tax_number AS customer_tax_number,
    c.address AS customer_address FROM sales_invoices i JOIN customers c ON c.id = i.customer_id
    ORDER BY i.created_at DESC LIMIT 200`).all() as Record<string, unknown>[]
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
