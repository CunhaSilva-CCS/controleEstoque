import { randomUUID } from 'node:crypto'
import type { MovementOrigin, MovementType, StockMovement } from '../../../shared/types'
import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'
import { getAuditContext } from '../audit'

export interface ApplyMovementInput {
  productId: string
  type: MovementType
  quantity?: number
  newStock?: number
  reason: string
  reference: string
  origin: MovementOrigin
  reversalOf?: string | null
}

export function applyStockMovement(database: Db, input: ApplyMovementInput, timestamp: string): StockMovement {
  const reason = input.reason.trim()
  if (!reason) throw new Error('Motivo é obrigatório')
  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(input.productId) as Record<string, unknown> | undefined
  if (!product) throw new Error('Produto não encontrado')
  if (!product.active) throw new Error('Produto inativo não pode receber movimentações')

  const previous = roundQuantity(Number(product.stock))
  let quantity = roundQuantity(input.quantity ?? 0)
  let newStock: number
  if (input.type === 'entrada') {
    if (!(quantity > 0)) throw new Error('Quantidade da entrada deve ser maior que zero')
    newStock = roundQuantity(previous + quantity)
  } else if (input.type === 'saida') {
    if (!(quantity > 0)) throw new Error('Quantidade da saída deve ser maior que zero')
    if (quantity > previous) throw new Error(`Saldo insuficiente. Disponível: ${previous}`)
    newStock = roundQuantity(previous - quantity)
  } else {
    if (input.newStock === undefined || input.newStock < 0) throw new Error('Informe o novo saldo (≥ 0) para o ajuste')
    newStock = roundQuantity(input.newStock)
    quantity = roundQuantity(newStock - previous)
  }

  const id = randomUUID()
  database.transaction(() => {
    database.prepare(
      `INSERT INTO stock_movements (
        id, product_id, type, quantity, previous_stock, new_stock, reason, reference, origin, created_at,
        created_by, reversal_of
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.productId, input.type, quantity, previous, newStock, reason, input.reference.trim(), input.origin,
      timestamp, getAuditContext().userId, input.reversalOf ?? null)
    database.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, timestamp, input.productId)
  })()

  return {
    id, productId: input.productId, type: input.type, quantity, previousStock: previous,
    newStock, reason, reference: input.reference.trim(), origin: input.origin, createdAt: timestamp,
    productName: String(product.name), productSku: String(product.sku),
  }
}
