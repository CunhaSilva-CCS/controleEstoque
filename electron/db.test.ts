import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TestContext } from '@vitest/runner'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
}))

import {
  closeDatabase,
  authenticateUser,
  changePassword,
  backupDatabase,
  createProduct,
  createProduction,
  createPurchaseInvoice,
  createCustomer,
  createSalesInvoice,
  createUser,
  getProduct,
  initDatabaseAtPath,
  listMovements,
  restoreDatabase,
  resetUserPassword,
  saveRecipe,
} from './db'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-estoque-db-'))
const dbPath = path.join(testDir, 'integration.db')
let initialized = false

function ensureDatabase(context: TestContext): boolean {
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

  it('fatura apenas produtos finais e baixa o stock de forma atómica', (context) => {
    if (!ensureDatabase(context)) return
    const material = createProduct({ sku: 'SQL-SALE-MAT', name: 'Matéria-prima venda', kind: 'insumo', unit: 'un', costPrice: 1, salePrice: 1, minStock: 0 })
    const finished = createProduct({ sku: 'SQL-SALE-FINAL', name: 'Produto final venda', kind: 'acabado', unit: 'un', costPrice: 0, salePrice: 15, minStock: 0 })
    createPurchaseInvoice({ number: 'NF-SALE-MAT', issueDate: '2026-08-24', items: [{ productId: material.id, quantity: 10, unitCost: 2 }] })
    saveRecipe({ productId: finished.id, items: [{ productId: material.id, quantity: 1 }] })
    createProduction({ productId: finished.id, quantity: 5 })
    const customer = createCustomer({ name: 'Cliente Teste', taxNumber: '123456789' })

    expect(() => createSalesInvoice({ number: 'FS-INVALID', customerId: customer.id, issueDate: '2026-08-24', items: [{ productId: finished.id, quantity: 1, unitPrice: 15 }, { productId: material.id, quantity: 1, unitPrice: 2 }] })).toThrow(/apenas produtos finais/)
    expect(getProduct(finished.id)?.stock).toBe(5)

    const invoice = createSalesInvoice({ number: 'FS-VALID', customerId: customer.id, issueDate: '2026-08-24', items: [{ productId: finished.id, quantity: 2, unitPrice: 15 }] })
    expect(invoice.customerName).toBe('Cliente Teste')
    expect(getProduct(finished.id)?.stock).toBe(3)
    expect(listMovements({ productId: finished.id }).some((movement) => movement.origin === 'fatura_saida' && movement.quantity === 2)).toBe(true)
  })

  it('rejeita tentativa de injeção SQL no login', (context) => {
    if (!ensureDatabase(context)) return
    expect(authenticateUser("admin' OR 1=1 --", 'qualquer')).toBeNull()
    expect(authenticateUser('admin', "' OR '1'='1")).toBeNull()
  })

  it('protege palavras-passe com política, troca obrigatória e histórico', (context) => {
    if (!ensureDatabase(context)) return
    expect(() => createUser({ name: 'Fraco', username: 'fraco', password: '123456', role: 'operador' }))
      .toThrow(/10 caracteres/)
    const user = createUser({
      name: 'Utilizador Seguro',
      username: 'utilizador-seguro',
      password: 'Temporaria#123',
      role: 'operador',
    })
    expect(user.mustChangePassword).toBe(true)
    expect(authenticateUser(user.username, 'Temporaria#123')?.id).toBe(user.id)

    const changed = changePassword(user.id, 'Temporaria#123', 'Definitiva#456')
    expect(changed.mustChangePassword).toBe(false)
    expect(authenticateUser(user.username, 'Temporaria#123')).toBeNull()
    expect(authenticateUser(user.username, 'Definitiva#456')?.id).toBe(user.id)
    expect(() => changePassword(user.id, 'Definitiva#456', 'Temporaria#123')).toThrow(/últimas 5/)

    const reset = resetUserPassword(user.id, 'Recuperacao#789')
    expect(reset.mustChangePassword).toBe(true)
    expect(authenticateUser(user.username, 'Recuperacao#789')?.mustChangePassword).toBe(true)
  })

  it('rejeita restauração inválida sem fechar ou substituir o banco ativo', (context) => {
    if (!ensureDatabase(context)) return
    const product = createProduct({
      sku: 'SQL-RESTORE-SAFE',
      name: 'Produto preservado',
      kind: 'insumo',
      unit: 'un',
      costPrice: 1,
      salePrice: 1,
      minStock: 0,
    })
    const invalidBackup = path.join(testDir, 'backup-invalido.db')
    fs.writeFileSync(invalidBackup, 'conteúdo que não é SQLite')

    expect(() => restoreDatabase(invalidBackup)).toThrow(/não é um banco de dados válido/)
    expect(getProduct(product.id)?.name).toBe('Produto preservado')
  })

  it('criptografa o arquivo e também produz backup criptografado', async (context) => {
    if (!ensureDatabase(context)) return
    const encryptedPath = path.join(testDir, 'encrypted.db')
    const encryptedBackup = path.join(testDir, 'encrypted-backup.db')
    const key = Buffer.alloc(32, 0x5a)
    initDatabaseAtPath(encryptedPath, key)
    const product = createProduct({
      sku: 'SQL-ENCRYPTED',
      name: 'Produto criptografado',
      kind: 'insumo',
      unit: 'un',
      costPrice: 1,
      salePrice: 1,
      minStock: 0,
    })
    await backupDatabase(encryptedBackup)
    closeDatabase()

    expect(fs.readFileSync(encryptedPath).subarray(0, 16).toString()).not.toBe('SQLite format 3\0')
    expect(fs.readFileSync(encryptedBackup).subarray(0, 16).toString()).not.toBe('SQLite format 3\0')
    expect(() => initDatabaseAtPath(encryptedPath, Buffer.alloc(32, 0x33))).toThrow()

    initDatabaseAtPath(encryptedBackup, key)
    expect(getProduct(product.id)?.name).toBe('Produto criptografado')
  })
})
