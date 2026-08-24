import { describe, expect, it } from 'vitest'
import { api, unwrap } from './api'
import { formatCurrency, movementLabel, statusLabel } from './format'

describe('regras de estoque (API em memória)', () => {
  it('bloqueia código duplicado', async () => {
    await unwrap(
      api.createProduct({
        sku: 'SKU-A',
        name: 'Produto A',
        kind: 'insumo',
        unit: 'un',
        costPrice: 1,
        salePrice: 2,
        minStock: 1,
      }),
    )
    const dup = await api.createProduct({
      sku: 'sku-a',
      name: 'Outro',
      kind: 'insumo',
      unit: 'un',
      costPrice: 1,
      salePrice: 2,
      minStock: 1,
    })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error).toMatch(/código/i)
  })

  it('fatura aumenta saldo de insumo', async () => {
    const product = await unwrap(
      api.createProduct({
        sku: `SKU-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Insumo teste',
        kind: 'insumo',
        unit: 'un',
        costPrice: 5,
        salePrice: 10,
        minStock: 2,
      }),
    )

    expect(product.stock).toBe(0)

    await unwrap(
      api.createPurchaseInvoice({
        number: 'NF-100',
        issueDate: '2026-01-01',
        items: [{ productId: product.id, quantity: 5, unitCost: 5 }],
      }),
    )

    const afterInvoice = await unwrap(api.getProduct(product.id))
    expect(afterInvoice?.stock).toBe(5)
  })

  it('fabricação consome insumo e produz acabado', async () => {
    const insumo = await unwrap(
      api.createProduct({
        sku: `INS-${crypto.randomUUID().slice(0, 6)}`,
        name: 'Parafuso',
        kind: 'insumo',
        unit: 'un',
        costPrice: 1,
        salePrice: 2,
        minStock: 0,
      }),
    )
    const acabado = await unwrap(
      api.createProduct({
        sku: `ACB-${crypto.randomUUID().slice(0, 6)}`,
        name: 'Módulo montado',
        kind: 'acabado',
        unit: 'un',
        costPrice: 10,
        salePrice: 20,
        minStock: 0,
      }),
    )

    await unwrap(
      api.createPurchaseInvoice({
        number: 'NF-200',
        issueDate: '2026-01-02',
        items: [{ productId: insumo.id, quantity: 10, unitCost: 1 }],
      }),
    )

    await unwrap(
      api.saveRecipe({
        productId: acabado.id,
        items: [{ productId: insumo.id, quantity: 2 }],
      }),
    )

    await unwrap(api.createProduction({ productId: acabado.id, quantity: 3 }))

    const insumoAfter = await unwrap(api.getProduct(insumo.id))
    const acabadoAfter = await unwrap(api.getProduct(acabado.id))
    expect(insumoAfter?.stock).toBe(4)
    expect(acabadoAfter?.stock).toBe(3)
  })

  it('ajuste define saldo absoluto', async () => {
    const product = await unwrap(
      api.createProduct({
        sku: `SKU-${crypto.randomUUID().slice(0, 8)}`,
        name: 'Mouse',
        kind: 'insumo',
        unit: 'un',
        costPrice: 20,
        salePrice: 40,
        minStock: 5,
      }),
    )

    await unwrap(
      api.createPurchaseInvoice({
        number: 'NF-300',
        issueDate: '2026-01-03',
        items: [{ productId: product.id, quantity: 10, unitCost: 20 }],
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
    expect(statusLabel('ok')).toBe('Normal')
    expect(statusLabel('zero')).toBe('Zerado')
    expect(statusLabel('low')).toBe('Baixo')
    expect(movementLabel('entrada')).toBe('Entrada')
  })
})
