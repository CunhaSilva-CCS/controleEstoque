import type { OperationStatus, ProductionOrder, Recipe, RecipeItem } from '../../../shared/types'
import type { Db } from '../types'

export function listRecipes(database: Db): Recipe[] {
  const rows = database.prepare(`SELECT r.*, p.name AS product_name, p.sku AS product_sku FROM recipes r
    JOIN products p ON p.id = r.product_id ORDER BY p.name`).all() as Record<string, unknown>[]
  const items = database.prepare(`SELECT ri.*, p.name AS product_name, p.sku AS product_sku
    FROM recipe_items ri JOIN products p ON p.id = ri.product_id WHERE ri.recipe_id = ? ORDER BY p.name`)
  return rows.map((row) => ({
    id: String(row.id), productId: String(row.product_id), productName: String(row.product_name),
    productSku: String(row.product_sku), notes: String(row.notes ?? ''), active: Boolean(row.active),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    items: (items.all(row.id) as Record<string, unknown>[]).map((item): RecipeItem => ({
      id: String(item.id), productId: String(item.product_id), productName: String(item.product_name),
      productSku: String(item.product_sku), quantity: Number(item.quantity),
    })),
  }))
}

export function getRecipeByProductId(database: Db, productId: string): Recipe | null {
  return listRecipes(database).find((recipe) => recipe.productId === productId) ?? null
}

export function listProductionOrders(database: Db): ProductionOrder[] {
  const rows = database.prepare(`SELECT po.*, p.name AS product_name, p.sku AS product_sku
    FROM production_orders po JOIN products p ON p.id = po.product_id
    ORDER BY po.created_at DESC LIMIT 200`).all() as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id), recipeId: String(row.recipe_id), productId: String(row.product_id),
    productName: String(row.product_name), productSku: String(row.product_sku), quantity: Number(row.quantity),
    unitCostSnapshot: Number(row.unit_cost_snapshot ?? 0), totalCostSnapshot: Number(row.total_cost_snapshot ?? 0),
    notes: String(row.notes ?? ''), createdAt: String(row.created_at),
    status: (row.status as OperationStatus) ?? 'confirmado', cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancellationReason: String(row.cancellation_reason ?? ''),
  }))
}
