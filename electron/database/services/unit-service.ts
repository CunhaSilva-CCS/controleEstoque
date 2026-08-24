import { roundQuantity } from '../../../shared/quantity'
import type { Db } from '../types'

export function convertToStockUnit(database: Db, productId: string, quantity: number, fromUnit?: string): number {
  if (!(quantity > 0)) throw new Error('A quantidade deve ser superior a zero')
  const product = database.prepare(
    'SELECT unit, purchase_unit, purchase_conversion_factor FROM products WHERE id = ?',
  ).get(productId) as { unit: string; purchase_unit: string | null; purchase_conversion_factor: number } | undefined
  if (!product) throw new Error('Produto não encontrado')
  if (!fromUnit || fromUnit === product.unit) return roundQuantity(quantity)
  const configured = database.prepare(
    `SELECT factor FROM unit_conversions WHERE product_id = ? AND from_unit = ? AND to_unit = ? AND active = 1`,
  ).get(productId, fromUnit, product.unit) as { factor: number } | undefined
  const factor = configured?.factor ?? (
    fromUnit === product.purchase_unit ? Number(product.purchase_conversion_factor) : 0
  )
  if (!(factor > 0)) throw new Error(`Não existe conversão de ${fromUnit} para ${product.unit}`)
  return roundQuantity(quantity * factor)
}
