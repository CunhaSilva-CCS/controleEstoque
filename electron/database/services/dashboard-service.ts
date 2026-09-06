import type {
  DashboardActivityItem,
  DashboardAlert,
  DashboardData,
  DashboardDailyPoint,
  DashboardFinancialSummary,
  DashboardMovementTrendPoint,
  ProductKind,
  StockMovement,
} from '../../../shared/types'
import type { Db } from '../types'
import { listProducts } from '../repositories/products'
import { queryMovements } from './movement-query-service'
import { getCurrentCompanyId } from '../company-context'

function startOfDayIso(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function dateKey(iso: string): string {
  return iso.slice(0, 10)
}

function buildFinancialSummary(
  database: Db,
  companyId: string,
  fromIso: string,
  toIso?: string,
): DashboardFinancialSummary {
  const dateParams: string[] = [fromIso.slice(0, 10)]
  let salesWhere = 'WHERE i.company_id = ? AND i.status = ? AND i.issue_date >= ?'
  let purchaseWhere = 'WHERE i.company_id = ? AND i.status = ? AND i.issue_date >= ?'
  const status = 'confirmado'
  if (toIso) {
    salesWhere += ' AND i.issue_date <= ?'
    purchaseWhere += ' AND i.issue_date <= ?'
    dateParams.push(toIso.slice(0, 10))
  }

  const salesParams = [companyId, status, ...dateParams]
  const purchaseParams = [companyId, status, ...dateParams]

  const sales = database
    .prepare(
      `SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) revenue,
              COUNT(DISTINCT i.id) invoices,
              COALESCE(SUM(si.quantity * si.unit_cost_snapshot), 0) cost
       FROM sales_invoices i
       JOIN sales_invoice_items si ON si.invoice_id = i.id
       ${salesWhere}`,
    )
    .get(...salesParams) as { revenue: number; invoices: number; cost: number }

  const purchases = database
    .prepare(
      `SELECT COALESCE(SUM(ii.quantity * ii.unit_cost), 0) spend,
              COUNT(DISTINCT i.id) invoices
       FROM purchase_invoices i
       JOIN purchase_invoice_items ii ON ii.invoice_id = i.id
       ${purchaseWhere}`,
    )
    .get(...purchaseParams) as { spend: number; invoices: number }

  const productionParams: string[] = [fromIso]
  let productionWhere = 'WHERE o.company_id = ? AND o.status = ? AND o.created_at >= ?'
  if (toIso) {
    productionWhere += ' AND o.created_at <= ?'
    productionParams.push(toIso)
  }
  productionParams.unshift(status)
  productionParams.unshift(companyId)

  const production = database
    .prepare(
      `SELECT COALESCE(SUM(o.quantity), 0) units,
              COALESCE(SUM(o.total_cost_snapshot), 0) cost
       FROM production_orders o
       ${productionWhere}`,
    )
    .get(...productionParams) as { units: number; cost: number }

  const movementParams: string[] = [companyId, fromIso]
  let movementWhere = 'WHERE company_id = ? AND created_at >= ?'
  if (toIso) {
    movementWhere += ' AND created_at <= ?'
    movementParams.push(toIso)
  }
  const movementsCount = (
    database.prepare(`SELECT COUNT(*) AS c FROM stock_movements ${movementWhere}`).get(...movementParams) as {
      c: number
    }
  ).c

  const revenue = Number(sales.revenue)
  const cost = Number(sales.cost)
  const grossMargin = revenue - cost

  return {
    salesRevenue: revenue,
    salesInvoices: Number(sales.invoices),
    purchaseSpend: Number(purchases.spend),
    purchaseInvoices: Number(purchases.invoices),
    productionUnits: Number(production.units),
    productionCost: Number(production.cost),
    grossMargin,
    grossMarginPercent: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
    movementsCount,
  }
}

export function getDashboard(database: Db, mapMovement: (row: Record<string, unknown>) => StockMovement): DashboardData {
  const companyId = getCurrentCompanyId()

  const activeProducts = (
    database.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1 AND company_id = ?').get(companyId) as { c: number }
  ).c
  const totalStockValue = (
    database
      .prepare('SELECT COALESCE(SUM(stock * cost_price), 0) AS v FROM products WHERE active = 1 AND company_id = ?')
      .get(companyId) as { v: number }
  ).v
  const lowStockCount = (
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM products
         WHERE active = 1 AND stock > 0 AND stock <= min_stock AND company_id = ?`,
      )
      .get(companyId) as { c: number }
  ).c
  const zeroStockCount = (
    database
      .prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock <= 0 AND company_id = ?')
      .get(companyId) as { c: number }
  ).c

  const startOfDay = startOfDayIso()
  const movementsToday = (
    database
      .prepare('SELECT COUNT(*) AS c FROM stock_movements WHERE created_at >= ? AND company_id = ?')
      .get(startOfDay, companyId) as { c: number }
  ).c

  const okStockCount = (
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM products
         WHERE active = 1 AND stock > min_stock AND company_id = ?`,
      )
      .get(companyId) as { c: number }
  ).c

  const insumoCount = (
    database.prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1 AND kind = 'insumo' AND company_id = ?").get(companyId) as { c: number }
  ).c
  const acabadoCount = (
    database.prepare("SELECT COUNT(*) AS c FROM products WHERE active = 1 AND kind = 'acabado' AND company_id = ?").get(companyId) as { c: number }
  ).c
  const categoriesCount = (
    database.prepare('SELECT COUNT(*) AS c FROM categories WHERE active = 1 AND company_id = ?').get(companyId) as { c: number }
  ).c
  const suppliersCount = (
    database.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE active = 1 AND company_id = ?').get(companyId) as { c: number }
  ).c
  const customersCount = (
    database.prepare('SELECT COUNT(*) AS c FROM customers WHERE active = 1 AND company_id = ?').get(companyId) as { c: number }
  ).c
  const recipesCount = (
    database.prepare('SELECT COUNT(*) AS c FROM recipes WHERE active = 1 AND company_id = ?').get(companyId) as { c: number }
  ).c
  const pendingInventoryCount = (
    database
      .prepare("SELECT COUNT(*) AS c FROM inventory_sessions WHERE status = 'aguarda_aprovacao' AND company_id = ?")
      .get(companyId) as { c: number }
  ).c

  const criticalProducts = listProducts(database, { active: true, lowStockOnly: true })
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8)

  const recentMovements = queryMovements(database, {}, mapMovement).slice(0, 10)

  const weekStart = daysAgoIso(6)
  const monthStart = daysAgoIso(29)

  const stockByCategoryRows = database
    .prepare(
      `SELECT COALESCE(c.name, 'Sem categoria') category_name,
              COUNT(p.id) product_count,
              COALESCE(SUM(p.stock * p.cost_price), 0) stock_value
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1 AND p.company_id = ?
       GROUP BY p.category_id
       ORDER BY stock_value DESC
       LIMIT 8`,
    )
    .all(companyId) as { category_name: string; product_count: number; stock_value: number }[]

  const stockByKindRows = database
    .prepare(
      `SELECT kind, COUNT(*) product_count, COALESCE(SUM(stock * cost_price), 0) stock_value
       FROM products WHERE active = 1 AND company_id = ? GROUP BY kind`,
    )
    .all(companyId) as { kind: ProductKind; product_count: number; stock_value: number }[]

  const topProductsRows = database
    .prepare(
      `SELECT id, sku, name, unit, stock, kind, (stock * cost_price) stock_value
       FROM products WHERE active = 1 AND stock > 0 AND company_id = ?
       ORDER BY stock_value DESC LIMIT 8`,
    )
    .all(companyId) as {
    id: string
    sku: string
    name: string
    unit: string
    stock: number
    kind: ProductKind
    stock_value: number
  }[]

  const topCustomersRows = database
    .prepare(
      `SELECT c.name, COALESCE(SUM(si.quantity * si.unit_price), 0) billed
       FROM customers c
       LEFT JOIN sales_invoices i ON i.customer_id = c.id AND i.status = 'confirmado' AND i.company_id = ?
       LEFT JOIN sales_invoice_items si ON si.invoice_id = i.id
       WHERE c.active = 1 AND c.company_id = ?
       GROUP BY c.id
       ORDER BY billed DESC
       LIMIT 5`,
    )
    .all(companyId, companyId) as { name: string; billed: number }[]

  const topSuppliersRows = database
    .prepare(
      `SELECT COALESCE(s.name, 'Sem fornecedor') name, COALESCE(SUM(ii.quantity * ii.unit_cost), 0) purchased
       FROM purchase_invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       JOIN purchase_invoice_items ii ON ii.invoice_id = i.id
       WHERE i.status = 'confirmado' AND i.company_id = ?
       GROUP BY i.supplier_id
       ORDER BY purchased DESC
       LIMIT 5`,
    )
    .all(companyId) as { name: string; purchased: number }[]

  const trendFrom = daysAgoIso(13)
  const salesTrendRows = database
    .prepare(
      `SELECT i.issue_date date, COALESCE(SUM(si.quantity * si.unit_price), 0) value
       FROM sales_invoices i
       JOIN sales_invoice_items si ON si.invoice_id = i.id
       WHERE i.status = 'confirmado' AND i.company_id = ? AND i.issue_date >= ?
       GROUP BY i.issue_date ORDER BY i.issue_date`,
    )
    .all(companyId, trendFrom.slice(0, 10)) as { date: string; value: number }[]

  const purchaseTrendRows = database
    .prepare(
      `SELECT i.issue_date date, COALESCE(SUM(ii.quantity * ii.unit_cost), 0) value
       FROM purchase_invoices i
       JOIN purchase_invoice_items ii ON ii.invoice_id = i.id
       WHERE i.status = 'confirmado' AND i.company_id = ? AND i.issue_date >= ?
       GROUP BY i.issue_date ORDER BY i.issue_date`,
    )
    .all(companyId, trendFrom.slice(0, 10)) as { date: string; value: number }[]

  const movementTrendRows = database
    .prepare(
      `SELECT date(created_at) date, type, COUNT(*) count
       FROM stock_movements
       WHERE company_id = ? AND created_at >= ?
       GROUP BY date(created_at), type
       ORDER BY date`,
    )
    .all(companyId, trendFrom) as { date: string; type: string; count: number }[]

  const salesTrendMap = new Map(salesTrendRows.map((row) => [row.date, Number(row.value)]))
  const purchaseTrendMap = new Map(purchaseTrendRows.map((row) => [row.date, Number(row.value)]))
  const movementTrendMap = new Map<string, { entrada: number; saida: number; ajuste: number }>()

  for (const row of movementTrendRows) {
    const key = String(row.date)
    const current = movementTrendMap.get(key) ?? { entrada: 0, saida: 0, ajuste: 0 }
    if (row.type === 'entrada') current.entrada = Number(row.count)
    else if (row.type === 'saida') current.saida = Number(row.count)
    else current.ajuste = Number(row.count)
    movementTrendMap.set(key, current)
  }

  const salesTrend: DashboardDailyPoint[] = []
  const purchaseTrend: DashboardDailyPoint[] = []
  const movementTrend: DashboardMovementTrendPoint[] = []

  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = dateKey(d.toISOString())
    salesTrend.push({ date: key, value: salesTrendMap.get(key) ?? 0 })
    purchaseTrend.push({ date: key, value: purchaseTrendMap.get(key) ?? 0 })
    const movement = movementTrendMap.get(key) ?? { entrada: 0, saida: 0, ajuste: 0 }
    movementTrend.push({ date: key, ...movement })
  }

  const recentActivity: DashboardActivityItem[] = []

  const recentPurchases = database
    .prepare(
      `SELECT i.id, i.number, i.issue_date, COALESCE(s.name, 'Sem fornecedor') supplier,
              COALESCE(SUM(ii.quantity * ii.unit_cost), 0) total
       FROM purchase_invoices i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       JOIN purchase_invoice_items ii ON ii.invoice_id = i.id
       WHERE i.status = 'confirmado' AND i.company_id = ?
       GROUP BY i.id ORDER BY i.created_at DESC LIMIT 5`,
    )
    .all(companyId) as { id: string; number: string; issue_date: string; supplier: string; total: number }[]

  for (const row of recentPurchases) {
    recentActivity.push({
      id: `purchase-${row.id}`,
      type: 'compra',
      title: `Fatura ${row.number}`,
      subtitle: row.supplier,
      amount: Number(row.total),
      createdAt: row.issue_date,
    })
  }

  const recentSales = database
    .prepare(
      `SELECT i.id, i.number, i.issue_date, c.name customer,
              COALESCE(SUM(si.quantity * si.unit_price), 0) total
       FROM sales_invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN sales_invoice_items si ON si.invoice_id = i.id
       WHERE i.status = 'confirmado' AND i.company_id = ?
       GROUP BY i.id ORDER BY i.created_at DESC LIMIT 5`,
    )
    .all(companyId) as { id: string; number: string; issue_date: string; customer: string; total: number }[]

  for (const row of recentSales) {
    recentActivity.push({
      id: `sale-${row.id}`,
      type: 'venda',
      title: `Fatura ${row.number}`,
      subtitle: row.customer,
      amount: Number(row.total),
      createdAt: row.issue_date,
    })
  }

  const recentProduction = database
    .prepare(
      `SELECT o.id, o.created_at, p.name product, o.quantity, o.total_cost_snapshot
       FROM production_orders o
       JOIN products p ON p.id = o.product_id
       WHERE o.status = 'confirmado' AND o.company_id = ?
       ORDER BY o.created_at DESC LIMIT 5`,
    )
    .all(companyId) as { id: string; created_at: string; product: string; quantity: number; total_cost_snapshot: number }[]

  for (const row of recentProduction) {
    recentActivity.push({
      id: `production-${row.id}`,
      type: 'producao',
      title: row.product,
      subtitle: `${Number(row.quantity)} un. produzidas`,
      amount: Number(row.total_cost_snapshot),
      createdAt: row.created_at,
    })
  }

  recentActivity.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const trimmedActivity = recentActivity.slice(0, 12)

  const alerts: DashboardAlert[] = []

  if (zeroStockCount > 0) {
    alerts.push({
      id: 'zero-stock',
      severity: 'danger',
      title: 'Produtos esgotados',
      message: `${zeroStockCount} produto(s) com stock zero.`,
      link: '/produtos?low=1',
    })
  }
  if (lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      severity: 'warn',
      title: 'Stock abaixo do mínimo',
      message: `${lowStockCount} produto(s) precisam de reposição.`,
      link: '/produtos?low=1',
    })
  }
  if (pendingInventoryCount > 0) {
    alerts.push({
      id: 'pending-inventory',
      severity: 'info',
      title: 'Inventário pendente',
      message: `${pendingInventoryCount} sessão(ões) aguardam aprovação.`,
      link: '/inventario-fisico',
    })
  }

  return {
    activeProducts,
    totalStockValue,
    lowStockCount,
    zeroStockCount,
    movementsToday,
    criticalProducts,
    recentMovements,
    stockHealth: { ok: okStockCount, low: lowStockCount, zero: zeroStockCount },
    insumoCount,
    acabadoCount,
    categoriesCount,
    suppliersCount,
    customersCount,
    recipesCount,
    pendingInventoryCount,
    financials: {
      today: buildFinancialSummary(database, companyId, startOfDay),
      week: buildFinancialSummary(database, companyId, weekStart),
      month: buildFinancialSummary(database, companyId, monthStart),
    },
    stockByCategory: stockByCategoryRows.map((row) => ({
      categoryName: row.category_name,
      productCount: Number(row.product_count),
      stockValue: Number(row.stock_value),
    })),
    stockByKind: stockByKindRows.map((row) => ({
      kind: row.kind,
      productCount: Number(row.product_count),
      stockValue: Number(row.stock_value),
    })),
    topProductsByValue: topProductsRows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
      stockValue: Number(row.stock_value),
      kind: row.kind,
    })),
    topCustomers: topCustomersRows.map((row) => ({
      name: row.name,
      value: Number(row.billed),
    })),
    topSuppliers: topSuppliersRows.map((row) => ({
      name: row.name,
      value: Number(row.purchased),
    })),
    salesTrend,
    purchaseTrend,
    movementTrend,
    recentActivity: trimmedActivity,
    alerts,
  }
}
