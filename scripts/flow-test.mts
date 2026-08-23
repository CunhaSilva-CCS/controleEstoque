import { api, unwrap } from '../src/lib/api'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main() {
  console.log('=== TESTE DE FLUXO COMPLETO ===\n')

  await unwrap(api.init())

  // 1. Cadastro base
  console.log('1) Cadastro de fornecedor e produtos')
  const supplier = await unwrap(
    api.createSupplier({
      name: 'Fornecedor Fluxo E2E',
      document: '11.111.111/0001-11',
    }),
  )

  const mp1 = await unwrap(
    api.createProduct({
      sku: `MP-FLUXO-${Date.now()}`,
      name: 'Plástico ABS',
      productType: 'materia_prima',
      unit: 'kg',
      costPrice: 12,
      salePrice: 0,
      minStock: 5,
      initialStock: 0,
    }),
  )

  const mp2 = await unwrap(
    api.createProduct({
      sku: `MP2-FLUXO-${Date.now()}`,
      name: 'Pigmento azul',
      productType: 'insumo',
      unit: 'g',
      costPrice: 0.5,
      salePrice: 0,
      minStock: 100,
      initialStock: 0,
    }),
  )

  const finished = await unwrap(
    api.createProduct({
      sku: `PF-FLUXO-${Date.now()}`,
      name: 'Capa de celular',
      productType: 'produto_final',
      unit: 'un',
      costPrice: 25,
      salePrice: 59.9,
      minStock: 3,
      initialStock: 0,
    }),
  )

  console.log('   OK — fornecedor + 2 matérias + 1 produto final')

  // 2. Fatura → entrada no estoque
  console.log('2) Fatura com entrada automática no estoque')
  const invoiceNumber = `NF-FLUXO-${Date.now()}`
  const invoice = await unwrap(
    api.createInvoice({
      number: invoiceNumber,
      supplierId: supplier.id,
      issueDate: '2026-08-23',
      items: [
        { productId: mp1.id, quantity: 50, unitCost: 12 },
        { productId: mp2.id, quantity: 500, unitCost: 0.5 },
      ],
    }),
  )

  const mp1AfterInvoice = await unwrap(api.getProduct(mp1.id))
  const mp2AfterInvoice = await unwrap(api.getProduct(mp2.id))
  assert(mp1AfterInvoice?.stock === 50, `MP1 saldo esperado 50, got ${mp1AfterInvoice?.stock}`)
  assert(mp2AfterInvoice?.stock === 500, `MP2 saldo esperado 500, got ${mp2AfterInvoice?.stock}`)
  assert(invoice.items?.length === 2, 'Fatura deve ter 2 itens')

  const invoiceMovements = await unwrap(
    api.listMovements({ type: 'entrada', productId: mp1.id }),
  )
  assert(
    invoiceMovements.some((m) => m.reason === 'Entrada por fatura' && m.reference === invoiceNumber),
    'Movimentação de fatura não encontrada',
  )
  console.log('   OK — estoque MP1=50, MP2=500, movimentações registradas')

  // 3. Ficha técnica
  console.log('3) Ficha técnica do produto final')
  await unwrap(
    api.saveProductRecipe({
      finishedProductId: finished.id,
      items: [
        { materialProductId: mp1.id, quantity: 2 },
        { materialProductId: mp2.id, quantity: 10 },
      ],
    }),
  )
  const recipe = await unwrap(api.getProductRecipe(finished.id))
  assert(recipe.length === 2, 'Ficha técnica deve ter 2 itens')
  console.log('   OK — BOM cadastrada')

  // 4. Fabricação → baixa MP + entrada PF
  console.log('4) Fabricação com baixa de matérias-primas')
  const batchQty = 5
  await unwrap(
    api.createManufacturingOrder({
      finishedProductId: finished.id,
      quantity: batchQty,
      notes: 'Lote fluxo E2E',
    }),
  )

  const mp1AfterFab = await unwrap(api.getProduct(mp1.id))
  const mp2AfterFab = await unwrap(api.getProduct(mp2.id))
  const finishedAfterFab = await unwrap(api.getProduct(finished.id))

  assert(mp1AfterFab?.stock === 40, `MP1 após fab: esperado 40, got ${mp1AfterFab?.stock}`)
  assert(mp2AfterFab?.stock === 450, `MP2 após fab: esperado 450, got ${mp2AfterFab?.stock}`)
  assert(finishedAfterFab?.stock === 5, `PF após fab: esperado 5, got ${finishedAfterFab?.stock}`)
  console.log('   OK — MP1=40, MP2=450, produto final=5')

  // 5. Bloqueio por saldo insuficiente
  console.log('5) Validação: saldo insuficiente bloqueia fabricação')
  const blocked = await api.createManufacturingOrder({
    finishedProductId: finished.id,
    quantity: 100,
  })
  assert(!blocked.ok, 'Fabricação excessiva deveria ser bloqueada')
  console.log(`   OK — bloqueado: ${!blocked.ok ? blocked.error : 'falhou'}`)

  // 6. Tipo inválido na ficha (produto final como MP)
  console.log('6) Validação: produto final não pode ser matéria-prima')
  const badRecipe = await api.saveProductRecipe({
    finishedProductId: finished.id,
    items: [{ materialProductId: finished.id, quantity: 1 }],
  })
  assert(!badRecipe.ok, 'Receita com produto final como MP deveria falhar')
  console.log('   OK — regra de tipo respeitada')

  // 7. Dashboard e relatório
  console.log('7) Dashboard e relatório')
  const dash = await unwrap(api.getDashboard())
  assert(dash.activeProducts >= 3, 'Dashboard deve listar produtos ativos')
  const report = await unwrap(api.getReport('posicao'))
  assert(report.columns.includes('Tipo'), 'Relatório deve incluir coluna Tipo')
  assert(report.rows.some((r) => r.Nome === 'Capa de celular'), 'Produto final no relatório')
  console.log(`   OK — ${dash.activeProducts} produtos ativos, relatório com ${report.rows.length} linhas`)

  console.log('\n=== FLUXO_OK ===')
  console.log('Cadastro → Fatura → Estoque → Ficha técnica → Fabricação → Validações')
}

main().catch((e) => {
  console.error('\n=== FLUXO_FALHOU ===')
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
