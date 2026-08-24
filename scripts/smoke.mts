import { api, unwrap } from '../src/lib/api'

async function main() {
  await unwrap(api.init())
  await unwrap(api.login({ username: 'admin', password: 'admin123' }))
  await unwrap(
    api.changePassword({ currentPassword: 'admin123', newPassword: 'Admin#smoke1' }),
  )
  await unwrap(api.seed(true))
  const dash = await unwrap(api.getDashboard())
  console.log('activeProducts', dash.activeProducts)
  console.log('lowStock', dash.lowStockCount, 'zero', dash.zeroStockCount)

  const p = await unwrap(
    api.createProduct({
      sku: 'TEST-001',
      name: 'Insumo Teste',
      kind: 'insumo',
      unit: 'un',
      costPrice: 10,
      salePrice: 20,
      minStock: 2,
    }),
  )
  console.log('created', p.sku, 'stock', p.stock)

  await unwrap(
    api.createPurchaseInvoice({
      number: 'NF-SMOKE-001',
      issueDate: new Date().toISOString().slice(0, 10),
      items: [{ productId: p.id, quantity: 5, unitCost: 10 }],
    }),
  )
  const afterInvoice = await unwrap(api.getProduct(p.id))
  console.log('after fatura stock', afterInvoice?.stock)

  await unwrap(
    api.createMovement({
      productId: p.id,
      type: 'ajuste',
      quantity: 0,
      newStock: 4,
      reason: 'Inventário teste',
    }),
  )
  const afterAdjust = await unwrap(api.getProduct(p.id))
  console.log('after ajuste stock', afterAdjust?.stock)

  const movs = await unwrap(api.listMovements({ productId: p.id }))
  console.log('movements', movs.length)

  const report = await unwrap(api.getReport('posicao'))
  console.log('report rows', report.rows.length)
  const backup = await unwrap(api.exportBackup())
  console.log('backup', backup.saved, backup.path)
  const info = await unwrap(api.getAppInfo())
  console.log('appInfo', info.version, info.packaged)
  const update = await unwrap(api.checkForUpdates())
  console.log('update', update.state)
  console.log('SMOKE_OK')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
