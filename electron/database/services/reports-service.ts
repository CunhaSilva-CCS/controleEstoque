import type { MovementFilters, ReportType, StockMovement } from '../../../shared/types'
import { movementLabel, statusLabel } from '../../../shared/labels'
import type { Db } from '../types'
import { listProducts } from '../repositories/products'
import { queryMovements } from './movement-query-service'
import { getCurrentCompanyId } from '../company-context'

export type ReportResult = { columns: string[]; rows: Record<string, string | number | boolean | null>[] }

export function buildReport(
  database: Db,
  type: ReportType,
  filters: MovementFilters,
  mapMovement: (row: Record<string, unknown>) => StockMovement,
): ReportResult {
  const companyId = getCurrentCompanyId()
  if (type === 'posicao') {
    const products = listProducts(database, { active: true })
    return {
      columns: ['Código', 'Nome', 'Categoria', 'Saldo', 'Unidade', 'Custo', 'Valor', 'Status'],
      rows: products.map((p) => ({
        Código: p.sku,
        Nome: p.name,
        Categoria: p.categoryName ?? '',
        Saldo: p.stock,
        Unidade: p.unit,
        Custo: p.costPrice,
        Valor: p.stockValue ?? 0,
        Status: statusLabel(p.status ?? 'ok'),
      })),
    }
  }

  if (type === 'baixo') {
    const products = listProducts(database, { active: true, lowStockOnly: true })
    return {
      columns: ['Código', 'Nome', 'Saldo', 'Mínimo', 'Diferença', 'Status'],
      rows: products.map((p) => ({
        Código: p.sku,
        Nome: p.name,
        Saldo: p.stock,
        Mínimo: p.minStock,
        Diferença: p.stock - p.minStock,
        Status: statusLabel(p.status ?? 'low'),
      })),
    }
  }

  if (type === 'custo-venda') {
    const products = listProducts(database, { active: true, kind: 'acabado' })
    return {
      columns: ['Código', 'Produto final', 'Saldo', 'Unidade', 'Preço de custo', 'Preço de venda', 'Diferença', 'Margem'],
      rows: products.map((product) => {
        const difference = product.salePrice - product.costPrice
        return {
          Código: product.sku,
          'Produto final': product.name,
          Saldo: product.stock,
          Unidade: product.unit,
          'Preço de custo': product.costPrice,
          'Preço de venda': product.salePrice,
          Diferença: difference,
          Margem: product.salePrice > 0 ? (difference / product.salePrice) * 100 : 0,
        }
      }),
    }
  }

  if (type === 'auditoria') {
    const clauses: string[] = ['company_id = ?']
    const params: string[] = [companyId]
    if (filters.from) { clauses.push('created_at >= ?'); params.push(filters.from) }
    if (filters.to) { clauses.push('created_at <= ?'); params.push(filters.to) }
    const where = `WHERE ${clauses.join(' AND ')}`
    const rows = database.prepare(`SELECT created_at, username, action, entity_type, entity_id,
      previous_values, new_values, origin, computer_name FROM audit_logs ${where}
      ORDER BY created_at DESC LIMIT 1000`).all(...params) as Record<string, unknown>[]
    return { columns: ['Data', 'Utilizador', 'Ação', 'Entidade', 'Identificador', 'Valor anterior', 'Valor novo', 'Origem', 'Computador'],
      rows: rows.map((row) => ({ Data: String(row.created_at), Utilizador: String(row.username || 'sistema'),
        Ação: String(row.action), Entidade: String(row.entity_type), Identificador: String(row.entity_id),
        'Valor anterior': String(row.previous_values ?? '{}'), 'Valor novo': String(row.new_values ?? '{}'),
        Origem: String(row.origin ?? 'desktop'), Computador: String(row.computer_name ?? '') })) }
  }

  if (type === 'inventarios') {
    const rows = database.prepare(`SELECT s.code, s.created_at, s.reference_at, s.status,
      COUNT(c.id) products, SUM(CASE WHEN c.counted_stock IS NOT NULL THEN 1 ELSE 0 END) counted,
      COALESCE(SUM(ABS(COALESCE(c.difference, 0))), 0) total_difference, s.approved_at
      FROM inventory_sessions s LEFT JOIN inventory_counts c ON c.session_id = s.id
      WHERE s.company_id = ? GROUP BY s.id ORDER BY s.created_at DESC`).all(companyId) as Record<string, unknown>[]
    return { columns: ['Código', 'Abertura', 'Referência', 'Estado', 'Produtos', 'Contados', 'Diferença absoluta', 'Aprovação'],
      rows: rows.map((row) => ({ Código: String(row.code), Abertura: String(row.created_at),
        Referência: String(row.reference_at), Estado: String(row.status), Produtos: Number(row.products),
        Contados: Number(row.counted), 'Diferença absoluta': Number(row.total_difference),
        Aprovação: String(row.approved_at ?? '') })) }
  }

  const fromDate = filters.from?.slice(0, 10)
  const toDate = filters.to?.slice(0, 10)
  const dateClauses: string[] = ['i.company_id = ?']
  const dateParams: string[] = [companyId]
  if (fromDate) { dateClauses.push('i.issue_date >= ?'); dateParams.push(fromDate) }
  if (toDate) { dateClauses.push('i.issue_date <= ?'); dateParams.push(toDate) }
  const invoiceWhere = `WHERE ${dateClauses.join(' AND ')}`

  if (type === 'compras') {
    const rows = database.prepare(`SELECT i.issue_date, i.number, COALESCE(s.name, 'Sem fornecedor') supplier, p.sku, p.name product, ii.quantity, p.unit, ii.unit_cost, ii.quantity * ii.unit_cost total FROM purchase_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN purchase_invoice_items ii ON ii.invoice_id = i.id JOIN products p ON p.id = ii.product_id ${invoiceWhere} ORDER BY i.issue_date DESC, i.number, p.name`).all(...dateParams) as Record<string, unknown>[]
    return { columns: ['Data', 'Fatura', 'Fornecedor', 'Código', 'Matéria-prima', 'Quantidade', 'Unidade', 'Custo unitário', 'Total da compra'], rows: rows.map((row) => ({ Data: String(row.issue_date), Fatura: String(row.number), Fornecedor: String(row.supplier), Código: String(row.sku), 'Matéria-prima': String(row.product), Quantidade: Number(row.quantity), Unidade: String(row.unit), 'Custo unitário': Number(row.unit_cost), 'Total da compra': Number(row.total) })) }
  }

  if (type === 'vendas' || type === 'margem-vendas') {
    const rows = database.prepare(`SELECT i.issue_date, i.number, c.name customer, c.tax_number, p.sku, p.name product, si.quantity, p.unit, si.unit_price, si.unit_cost_snapshot, si.quantity * si.unit_price revenue, si.quantity * si.unit_cost_snapshot cost FROM sales_invoices i JOIN customers c ON c.id = i.customer_id JOIN sales_invoice_items si ON si.invoice_id = i.id JOIN products p ON p.id = si.product_id ${invoiceWhere} ORDER BY i.issue_date DESC, i.number, p.name`).all(...dateParams) as Record<string, unknown>[]
    if (type === 'vendas') return { columns: ['Data', 'Fatura', 'Cliente', 'NIF', 'Código', 'Produto final', 'Quantidade', 'Unidade', 'Preço unitário', 'Total faturado'], rows: rows.map((row) => ({ Data: String(row.issue_date), Fatura: String(row.number), Cliente: String(row.customer), NIF: String(row.tax_number ?? ''), Código: String(row.sku), 'Produto final': String(row.product), Quantidade: Number(row.quantity), Unidade: String(row.unit), 'Preço unitário': Number(row.unit_price), 'Total faturado': Number(row.revenue) })) }
    return { columns: ['Data', 'Fatura', 'Cliente', 'Produto final', 'Quantidade', 'Receita', 'Custo', 'Margem bruta', 'Margem %'], rows: rows.map((row) => { const revenue = Number(row.revenue); const cost = Number(row.cost); const margin = revenue - cost; return { Data: String(row.issue_date), Fatura: String(row.number), Cliente: String(row.customer), 'Produto final': String(row.product), Quantidade: Number(row.quantity), Receita: revenue, Custo: cost, 'Margem bruta': margin, 'Margem %': revenue > 0 ? margin / revenue * 100 : 0 } }) }
  }

  if (type === 'producao') {
    const clauses: string[] = ['o.company_id = ?']
    const params: string[] = [companyId]
    if (filters.from) { clauses.push('o.created_at >= ?'); params.push(filters.from) }
    if (filters.to) { clauses.push('o.created_at <= ?'); params.push(filters.to) }
    const where = `WHERE ${clauses.join(' AND ')}`
    const rows = database.prepare(`SELECT o.created_at, p.sku, p.name product, o.quantity, p.unit, o.unit_cost_snapshot, o.total_cost_snapshot, o.notes FROM production_orders o JOIN products p ON p.id = o.product_id ${where} ORDER BY o.created_at DESC`).all(...params) as Record<string, unknown>[]
    return { columns: ['Data', 'Código', 'Produto final', 'Quantidade produzida', 'Unidade', 'Custo unitário', 'Custo total da produção', 'Observações'], rows: rows.map((row) => ({ Data: String(row.created_at), Código: String(row.sku), 'Produto final': String(row.product), 'Quantidade produzida': Number(row.quantity), Unidade: String(row.unit), 'Custo unitário': Number(row.unit_cost_snapshot), 'Custo total da produção': Number(row.total_cost_snapshot), Observações: String(row.notes ?? '') })) }
  }

  if (type === 'clientes') {
    const rows = database.prepare(`SELECT c.name, c.tax_number, COUNT(DISTINCT i.id) invoices, COALESCE(SUM(si.quantity), 0) quantity, COALESCE(SUM(si.quantity * si.unit_price), 0) billed, COALESCE(SUM(si.quantity * si.unit_cost_snapshot), 0) cost FROM customers c LEFT JOIN sales_invoices i ON i.customer_id = c.id LEFT JOIN sales_invoice_items si ON si.invoice_id = i.id WHERE c.company_id = ? GROUP BY c.id ORDER BY billed DESC, c.name`).all(companyId) as Record<string, unknown>[]
    return { columns: ['Cliente', 'NIF', 'Faturas emitidas', 'Unidades vendidas', 'Total faturado', 'Custo associado', 'Margem bruta'], rows: rows.map((row) => ({ Cliente: String(row.name), NIF: String(row.tax_number ?? ''), 'Faturas emitidas': Number(row.invoices), 'Unidades vendidas': Number(row.quantity), 'Total faturado': Number(row.billed), 'Custo associado': Number(row.cost), 'Margem bruta': Number(row.billed) - Number(row.cost) })) }
  }

  if (type === 'fornecedores') {
    const rows = database.prepare(`SELECT COALESCE(s.name, 'Sem fornecedor') supplier, COUNT(DISTINCT i.id) invoices, COALESCE(SUM(ii.quantity), 0) quantity, COALESCE(SUM(ii.quantity * ii.unit_cost), 0) purchased, MAX(i.issue_date) last_purchase FROM purchase_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id JOIN purchase_invoice_items ii ON ii.invoice_id = i.id WHERE i.company_id = ? GROUP BY i.supplier_id ORDER BY purchased DESC, supplier`).all(companyId) as Record<string, unknown>[]
    return { columns: ['Fornecedor', 'Faturas registadas', 'Unidades compradas', 'Valor comprado', 'Última compra'], rows: rows.map((row) => ({ Fornecedor: String(row.supplier), 'Faturas registadas': Number(row.invoices), 'Unidades compradas': Number(row.quantity), 'Valor comprado': Number(row.purchased), 'Última compra': String(row.last_purchase ?? '') })) }
  }

  const movements = queryMovements(database, filters, mapMovement)
  return {
    columns: ['Data', 'Código', 'Produto', 'Tipo', 'Quantidade', 'Saldo anterior', 'Saldo novo', 'Motivo'],
    rows: movements.map((m) => ({
      Data: m.createdAt,
      Código: m.productSku ?? '',
      Produto: m.productName ?? '',
      Tipo: movementLabel(m.type),
      Quantidade: m.quantity,
      'Saldo anterior': m.previousStock,
      'Saldo novo': m.newStock,
      Motivo: m.reason,
    })),
  }
}
