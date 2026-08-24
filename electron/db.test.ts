import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TaskContext } from '@vitest/runner'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}))

import {
  closeDatabase,
  createProduct,
  createProduction,
  createPurchaseInvoice,
  getProduct,
  initDatabaseAtPath,
  listMovements,
  saveRecipe,
} from './db'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-estoque-db-'))
const dbPath = path.join(testDir, 'integration.db')
let initialized = false

function ensureDatabase(context: TaskContext): boolean {
  if (initialized) return true
  try {
    initDatabaseAtPath(dbPath)
    initialized = true
    return true
  } catch (error) {
    const message = String(error)
    if (
      message.includes('NODE_MODULE_VERSION') ||
      message.includes('slice is not valid mach-o file') ||
      message.includes('invalid ELF header')
    ) {
      context.skip()
      return false
    }
    throw error
  }
}

describe('integração SQLite de estoque', () => {
  afterAll(() => {
    closeDatabase()
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('mantém fatura atômica quando um item falha', (context) => {
    if (!ensureDatabase(context)) return
    const input = createProduct({
      sku: 'SQL-INS-ATOMIC',
      name: 'Insumo SQLite',
      kind: 'insumo',
      unit: 'un',
      costPrice: 1,
      salePrice: 2,
      minStock: 0,
    })

    expect(() =>
      createPurchaseInvoice({
        number: 'NF-SQL-INVALID',
        issueDate: '2026-08-24',
        items: [
          { productId: input.id, quantity: 5, unitCost: 1 },
          { productId: 'inexistente', quantity: 1, unitCost: 1 },
        ],
      }),
    ).toThrow(/Produto não encontrado/)

    expect(getProduct(input.id)?.stock).toBe(0)
    expect(listMovements({ productId: input.id })).toHaveLength(0)
  })

  it('consome insumo e produz produto final na mesma operação', (context) => {
    if (!ensureDatabase(context)) return
    const input = createProduct({
      sku: 'SQL-INS-PROD',
      name: 'Componente SQLite',
      kind: 'insumo',
      unit: 'un',
      costPrice: 2,
      salePrice: 3,
      minStock: 0,
    })
    const finalProduct = createProduct({
      sku: 'SQL-FINAL',
      name: 'Produto final SQLite',
      kind: 'acabado',
      unit: 'un',
      costPrice: 10,
      salePrice: 20,
      minStock: 0,
    })

    createPurchaseInvoice({
      number: 'NF-SQL-PROD',
      issueDate: '2026-08-24',
      items: [{ productId: input.id, quantity: 10, unitCost: 2 }],
    })
    saveRecipe({
      productId: finalProduct.id,
      items: [{ productId: input.id, quantity: 2 }],
    })
    createProduction({ productId: finalProduct.id, quantity: 3 })

    expect(getProduct(input.id)?.stock).toBe(4)
    expect(getProduct(finalProduct.id)?.stock).toBe(3)
    const productionMovements = listMovements().filter((movement) =>
      movement.origin.startsWith('fabricacao_'),
    )
    expect(productionMovements).toHaveLength(2)
  })

  it('reverte toda a fabricação quando falta saldo', (context) => {
    if (!ensureDatabase(context)) return
    const input = createProduct({
      sku: 'SQL-INS-LOW',
      name: 'Componente insuficiente',
      kind: 'insumo',
      unit: 'un',
      costPrice: 1,
      salePrice: 1,
      minStock: 0,
    })
    const finalProduct = createProduct({
      sku: 'SQL-FINAL-LOW',
      name: 'Produto sem material',
      kind: 'acabado',
      unit: 'un',
      costPrice: 1,
      salePrice: 1,
      minStock: 0,
    })
    saveRecipe({
      productId: finalProduct.id,
      items: [{ productId: input.id, quantity: 2 }],
    })

    expect(() => createProduction({ productId: finalProduct.id, quantity: 1 })).toThrow(
      /Saldo insuficiente/,
    )
    expect(getProduct(input.id)?.stock).toBe(0)
    expect(getProduct(finalProduct.id)?.stock).toBe(0)
  })
})
