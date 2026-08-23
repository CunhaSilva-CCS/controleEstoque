import { describe, expect, it } from 'vitest'
import { api, unwrap } from './api'
import { formatCurrency, movementLabel, statusLabel } from './format'

describe('regras de estoque (API em memória)', () => {
  it('bloqueia SKU duplicado', async () => {
    await unwrap(
      api.createProduct({
        sku: 'SKU-A',
        name: 'Produto A',
        productType: 'revenda',
        unit: 'un',
        costPrice: 1,
        salePrice: 2,
        minStock: 1,
      }),
    )
    const dup = await api.createProduct({
      sku: 'sku-a',
      name: 'Outro',
      productType: 'revenda',
      unit: 'un',
      costPrice: 1,
      salePrice: 2,
      minStock: 1,
    })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error).toMatch(/SKU/i)
  })

  it('entrada aumenta saldo e saída insuficiente é bloqueada', async () => {
    const product = await unwrap(
      api.createProduct({
        sku: `SKU-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Cabo',
        productType: 'revenda',
        unit: 'un',
        costPrice: 5,
        salePrice: 10,
        minStock: 2,
        initialStock: 5,
      }),
    )

    await unwrap(
      api.createMovement({
        productId: product.id,
        type: 'entrada',
        quantity: 3,
        reason: 'Compra',
      }),
    )

    const afterIn = await unwrap(api.getProduct(product.id))
    expect(afterIn?.stock).toBe(8)

    const blocked = await api.createMovement({
      productId: product.id,
      type: 'saida',
      quantity: 99,
      reason: 'Venda',
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toMatch(/Saldo insuficiente/)

    const still = await unwrap(api.getProduct(product.id))
    expect(still?.stock).toBe(8)
  })

  it('ajuste define saldo absoluto', async () => {
    const product = await unwrap(
      api.createProduct({
        sku: `SKU-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Mouse',
        productType: 'revenda',
        unit: 'un',
        costPrice: 20,
        salePrice: 40,
        minStock: 5,
        initialStock: 10,
      }),
    )

    const mov = await unwrap(
      api.createMovement({
        productId: product.id,
        type: 'ajuste',
        quantity: 0,
        newStock: 4,
        reason: 'Inventário',
      }),
    )

    expect(mov.previousStock).toBe(10)
    expect(mov.newStock).toBe(4)
    expect(mov.quantity).toBe(-6)

    const updated = await unwrap(api.getProduct(product.id))
    expect(updated?.stock).toBe(4)
    expect(updated?.status).toBe('low')
  })
})

describe('formatadores', () => {
  it('formata moeda e rótulos', () => {
    expect(formatCurrency(10)).toMatch(/R\$/)
    expect(statusLabel('zero')).toBe('Zerado')
    expect(statusLabel('low')).toBe('Baixo')
    expect(movementLabel('entrada')).toBe('Entrada')
  })
})
