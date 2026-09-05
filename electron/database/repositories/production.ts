import { randomUUID } from 'node:crypto'
import type { OperationStatus, ProductionInput, ProductionOrder, Recipe, RecipeInput, RecipeItem } from '../../../shared/types'
import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'
import { getAuditContext, recordAudit } from '../audit'
import { calculateFinishedProductCost, updateFinishedProductCost } from '../services/costing-service'
import { applyStockMovement } from '../services/stock-service'

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

export function saveRecipe(database: Db, input: RecipeInput, timestamp: string): Recipe {
  if (!input.items.length) throw new Error('Informe ao menos um insumo na receita')

  const product = database
    .prepare('SELECT id, kind, active FROM products WHERE id = ?')
    .get(input.productId) as { id: string; kind: string; active: number } | undefined

  if (!product) throw new Error('Produto final não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode receber receita')
  if (product.kind !== 'acabado') throw new Error('Receita disponível apenas para produto final')

  const existing = database
    .prepare('SELECT id FROM recipes WHERE product_id = ?')
    .get(input.productId) as { id: string } | undefined
  const recipeId = existing?.id ?? randomUUID()

  const tx = database.transaction(() => {
    if (existing) {
      database
        .prepare('UPDATE recipes SET notes = ?, updated_at = ? WHERE id = ?')
        .run(input.notes?.trim() ?? '', timestamp, recipeId)
      database.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(recipeId)
    } else {
      database
        .prepare(
          `INSERT INTO recipes (id, product_id, notes, active, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(recipeId, input.productId, input.notes?.trim() ?? '', timestamp, timestamp)
    }

    const insertItem = database.prepare(
      `INSERT INTO recipe_items (id, recipe_id, product_id, quantity) VALUES (?, ?, ?, ?)`,
    )

    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error('Quantidade do insumo deve ser maior que zero')
      if (item.productId === input.productId) {
        throw new Error('Produto final não pode ser insumo da própria receita')
      }

      const insumo = database
        .prepare('SELECT kind FROM products WHERE id = ?')
        .get(item.productId) as { kind: string } | undefined
      if (!insumo) throw new Error('Insumo não encontrado')
      if (insumo.kind !== 'insumo') throw new Error('Receita aceita apenas insumos como componentes')

      insertItem.run(randomUUID(), recipeId, item.productId, roundQuantity(item.quantity))
    }
  })

  tx()
  updateFinishedProductCost(database, input.productId, timestamp)
  recordAudit(database, 'save', 'recipe', recipeId, { productId: input.productId, itemCount: input.items.length }, timestamp)
  return getRecipeByProductId(database, input.productId)!
}

export function createProduction(database: Db, input: ProductionInput, timestamp: string): ProductionOrder {
  if (!(input.quantity > 0)) throw new Error('Quantidade produzida deve ser maior que zero')

  const productionQuantity = roundQuantity(input.quantity)
  const product = database
    .prepare('SELECT id, kind, active, name, sku FROM products WHERE id = ?')
    .get(input.productId) as
    | { id: string; kind: string; active: number; name: string; sku: string }
    | undefined

  if (!product) throw new Error('Produto não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode ser fabricado')
  if (product.kind !== 'acabado') throw new Error('Fabricação disponível apenas para produto final')

  const recipe = getRecipeByProductId(database, input.productId)
  if (!recipe || !recipe.items.length) {
    throw new Error('Cadastre a receita do produto final antes de fabricar')
  }

  for (const item of recipe.items) {
    const needed = roundQuantity(item.quantity * productionQuantity)
    const stockRow = database
      .prepare('SELECT stock FROM products WHERE id = ?')
      .get(item.productId) as { stock: number }
    if (stockRow.stock < needed) {
      throw new Error(
        `Saldo insuficiente de ${item.productName}. Necessário: ${needed}, disponível: ${stockRow.stock}`,
      )
    }
  }

  const orderId = randomUUID()
  const unitCostSnapshot = calculateFinishedProductCost(database, input.productId)
  const totalCostSnapshot = roundQuantity(unitCostSnapshot * productionQuantity)

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO production_orders (id, recipe_id, product_id, quantity, notes, created_at, unit_cost_snapshot, total_cost_snapshot, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)`,
      )
      .run(orderId, recipe.id, input.productId, productionQuantity, input.notes?.trim() ?? '', timestamp, unitCostSnapshot, totalCostSnapshot, getAuditContext().userId)

    const insertSnapshot = database.prepare(`INSERT INTO production_order_items
      (id, order_id, product_id, quantity, unit_cost_snapshot) VALUES (?, ?, ?, ?, ?)`)

    for (const item of recipe.items) {
      const qty = roundQuantity(item.quantity * productionQuantity)
      const component = database.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.productId) as { cost_price: number }
      insertSnapshot.run(randomUUID(), orderId, item.productId, qty, component.cost_price)
      applyStockMovement(database, {
        productId: item.productId,
        type: 'saida',
        quantity: qty,
        reason: `Fabricação · ${product.name}`,
        reference: orderId,
        origin: 'fabricacao_consumo',
      }, timestamp)
    }

    applyStockMovement(database, {
      productId: input.productId,
      type: 'entrada',
      quantity: productionQuantity,
      reason: `Fabricação · ${product.name}`,
      reference: orderId,
      origin: 'fabricacao_producao',
    }, timestamp)
  })

  tx()
  recordAudit(database, 'create', 'production_order', orderId, { productId: input.productId, quantity: productionQuantity }, timestamp)

  return listProductionOrders(database).find((o) => o.id === orderId)!
}
