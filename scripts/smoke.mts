import { api, unwrap } from '../src/lib/api'

async function main() {
  await unwrap(api.init())
  await unwrap(api.seed(true))
  const dash = await unwrap(api.getDashboard())
  console.log('activeProducts', dash.activeProducts)
  console.log('lowStock', dash.lowStockCount, 'zero', dash.zeroStockCount)

  const p = await unwrap(
    api.createProduct({
      sku: 'TEST-001',
      name: 'Produto Teste',
      unit: 'un',
      costPrice: 10,
      salePrice: 20,
      minStock: 2,
      initialStock: 3,
    }),
  )
  console.log('created', p.sku, 'stock', p.stock)

  const blocked = await api.createMovement({
    productId: p.id,
    type: 'saida',
    quantity: 99,
    reason: 'teste',
  })
  console.log('blocked', !blocked.ok, blocked.ok ? '' : blocked.error)

  await unwrap(
    api.createMovement({
      productId: p.id,
      type: 'entrada',
      quantity: 5,
      reason: 'Compra teste',
    }),
  )
  const after = await unwrap(api.getProduct(p.id))
  console.log('after entrada stock', after?.stock)

  const movs = await unwrap(api.listMovements({ productId: p.id }))
  console.log('movements', movs.length)

  const report = await unwrap(api.getReport('posicao'))
  console.log('report rows', report.rows.length)
  console.log('SMOKE_OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
