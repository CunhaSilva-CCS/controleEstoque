import { randomUUID } from 'node:crypto'
import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'

export function receiveLot(database: Db, input: {
  productId: string; supplierId?: string | null; lotNumber?: string; manufacturedAt?: string;
  expiresAt?: string; quantity: number; stockMovementId: string; timestamp: string
}): void {
  const product = database.prepare('SELECT lot_control FROM products WHERE id = ?').get(input.productId) as { lot_control: number }
  if (!product.lot_control && !input.lotNumber?.trim()) return
  const lotNumber = input.lotNumber?.trim()
  if (!lotNumber) throw new Error('O número do lote é obrigatório para este produto')
  const existing = database.prepare('SELECT id FROM stock_lots WHERE product_id = ? AND lot_number = ?')
    .get(input.productId, lotNumber) as { id: string } | undefined
  const lotId = existing?.id ?? randomUUID()
  if (existing) {
    database.prepare(`UPDATE stock_lots SET initial_quantity = initial_quantity + ?,
      available_quantity = available_quantity + ?, status = 'disponivel' WHERE id = ?`)
      .run(input.quantity, input.quantity, lotId)
  } else {
    database.prepare(`INSERT INTO stock_lots (id, product_id, supplier_id, lot_number, manufactured_at,
      expires_at, received_at, initial_quantity, available_quantity, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponivel')`)
      .run(lotId, input.productId, input.supplierId ?? null, lotNumber, input.manufacturedAt || null,
        input.expiresAt || null, input.timestamp, input.quantity, input.quantity)
  }
  database.prepare(`INSERT INTO lot_movements (id, lot_id, stock_movement_id, quantity, direction, created_at)
    VALUES (?, ?, ?, ?, 'entrada', ?)`).run(randomUUID(), lotId, input.stockMovementId, input.quantity, input.timestamp)
}

export function consumeLotsFefo(database: Db, productId: string, quantity: number, stockMovementId: string, timestamp: string): void {
  const controlled = database.prepare('SELECT lot_control FROM products WHERE id = ?').get(productId) as { lot_control: number }
  if (!controlled.lot_control) return
  const lots = database.prepare(`SELECT id, available_quantity FROM stock_lots
    WHERE product_id = ? AND available_quantity > 0 AND status = 'disponivel'
    ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, received_at`).all(productId) as { id: string; available_quantity: number }[]
  let remaining = roundQuantity(quantity)
  for (const lot of lots) {
    if (remaining <= 0) break
    const consumed = Math.min(remaining, Number(lot.available_quantity))
    const available = roundQuantity(Number(lot.available_quantity) - consumed)
    database.prepare(`UPDATE stock_lots SET available_quantity = ?, status = ? WHERE id = ?`)
      .run(available, available === 0 ? 'esgotado' : 'disponivel', lot.id)
    database.prepare(`INSERT INTO lot_movements (id, lot_id, stock_movement_id, quantity, direction, created_at)
      VALUES (?, ?, ?, ?, 'saida', ?)`).run(randomUUID(), lot.id, stockMovementId, consumed, timestamp)
    remaining = roundQuantity(remaining - consumed)
  }
  if (remaining > 0) throw new Error('Stock por lote insuficiente para concluir a operação')
}
