import { describe, expect, it } from 'vitest'
import { api, unwrap } from './api'

describe('faturas e fabricação (API em memória)', () => {
  async function createMaterial(sku: string, stock: number) {
    return unwrap(
      api.createProduct({
        sku,
        name: `Material ${sku}`,
        unit: 'un',
        costPrice: 2,
        salePrice: 5,
        minStock: 1,
        initialStock: stock,
      }),
    )
  }

  async function createFinished(sku: string) {
    return unwrap(
      api.createProduct({
        sku,
        name: `Acabado ${sku}`,
        unit: 'un',
        costPrice: 10,
        salePrice: 25,
        minStock: 2,
        initialStock: 0,
      }),
    )
  }

  it('fatura registra entrada no estoque para cada item', async () => {
    const product = await createMaterial(`MAT-${crypto.randomUUID().slice(0, 6)}`, 5)

    const invoice = await unwrap(
      api.createInvoice({
        number: `NF-${crypto.randomUUID().slice(0, 6)}`,
        issueDate: '2026-08-23',
        items: [{ productId: product.id, quantity: 10, unitCost: 3 }],
      }),
    )

    expect(invoice.items).toHaveLength(1)
    const updated = await unwrap(api.getProduct(product.id))
    expect(updated?.stock).toBe(15)

    const movements = await unwrap(api.listMovements({ productId: product.id, type: 'entrada' }))
    expect(movements.some((m) => m.reason === 'Entrada por fatura' && m.reference === invoice.number)).toBe(
      true,
    )
  })

  it('fabricação baixa matérias-primas e entra produto acabado', async () => {
    const suffix = crypto.randomUUID().slice(0, 6)
    const mp1 = await createMaterial(`MP1-${suffix}`, 100)
    const mp2 = await createMaterial(`MP2-${suffix}`, 50)
    const finished = await createFinished(`PA-${suffix}`)

    await unwrap(
      api.saveProductRecipe({
        finishedProductId: finished.id,
        items: [
          { materialProductId: mp1.id, quantity: 2 },
          { materialProductId: mp2.id, quantity: 1 },
        ],
      }),
    )

    const order = await unwrap(
      api.createManufacturingOrder({
        finishedProductId: finished.id,
        quantity: 5,
        notes: 'Lote teste',
      }),
    )

    expect(order.quantity).toBe(5)

    const afterMp1 = await unwrap(api.getProduct(mp1.id))
    const afterMp2 = await unwrap(api.getProduct(mp2.id))
    const afterFinished = await unwrap(api.getProduct(finished.id))

    expect(afterMp1?.stock).toBe(90)
    expect(afterMp2?.stock).toBe(45)
    expect(afterFinished?.stock).toBe(5)
  })

  it('fabricação bloqueia saldo insuficiente de matéria-prima', async () => {
    const suffix = crypto.randomUUID().slice(0, 6)
    const mp = await createMaterial(`MP-${suffix}`, 3)
    const finished = await createFinished(`PA2-${suffix}`)

    await unwrap(
      api.saveProductRecipe({
        finishedProductId: finished.id,
        items: [{ materialProductId: mp.id, quantity: 2 }],
      }),
    )

    const blocked = await api.createManufacturingOrder({
      finishedProductId: finished.id,
      quantity: 2,
    })

    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toMatch(/Saldo insuficiente/)

    const still = await unwrap(api.getProduct(mp.id))
    expect(still?.stock).toBe(3)
  })
})
