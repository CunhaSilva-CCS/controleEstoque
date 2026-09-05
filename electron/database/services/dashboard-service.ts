import type { DashboardData } from '../../../shared/types'
import type { Db } from '../types'
import { listProducts } from '../repositories/products'
import { queryMovements } from './movement-query-service'
import type { StockMovement } from '../../../shared/types'

export function getDashboard(database: Db, mapMovement: (row: Record<string, unknown>) => StockMovement): DashboardData {
  const activeProducts = (
    database.prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1').get() as { c: number }
  ).c
  const totalStockValue = (
    database
      .prepare('SELECT COALESCE(SUM(stock * cost_price), 0) AS v FROM products WHERE active = 1')
      .get() as { v: number }
  ).v
  const lowStockCount = (
    database
      .prepare(
        `SELECT COUNT(*) AS c FROM products
         WHERE active = 1 AND stock > 0 AND stock <= min_stock`,
      )
      .get() as { c: number }
  ).c
  const zeroStockCount = (
    database
      .prepare('SELECT COUNT(*) AS c FROM products WHERE active = 1 AND stock <= 0')
      .get() as { c: number }
  ).c

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const movementsToday = (
    database
      .prepare('SELECT COUNT(*) AS c FROM stock_movements WHERE created_at >= ?')
      .get(startOfDay.toISOString()) as { c: number }
  ).c

  const criticalProducts = listProducts(database, { active: true, lowStockOnly: true })
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5)

  const recentMovements = queryMovements(database, {}, mapMovement).slice(0, 8)

  return {
    activeProducts,
    totalStockValue,
    lowStockCount,
    zeroStockCount,
    movementsToday,
    criticalProducts,
    recentMovements,
  }
}
