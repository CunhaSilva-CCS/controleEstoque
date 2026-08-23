import { describe, expect, it } from 'vitest'
import { api, unwrap } from './api'
import { FINISHED_PRODUCT_TYPES } from '@shared/product-types'

describe('dados de demonstração', () => {
  it('inclui produto final com ficha técnica para fabricação', async () => {
    await unwrap(api.init())
    await unwrap(api.seed(true))

    const products = await unwrap(api.listProducts({ active: true }))
    const kit = products.find((p) => p.sku === 'KIT-ESCR')
    expect(kit).toBeDefined()
    expect(FINISHED_PRODUCT_TYPES.includes(kit!.productType)).toBe(true)

    const recipe = await unwrap(api.getProductRecipe(kit!.id))
    expect(recipe).toHaveLength(2)
    expect(recipe.map((r) => r.materialSku).sort()).toEqual(['FITA-DUP', 'RESMA-A4'])

    const resma = products.find((p) => p.sku === 'RESMA-A4')
    expect(resma?.stock).toBeGreaterThan(0)
  })
})
