import { expect, test, type Page } from '@playwright/test'

async function skipOrAcceptSeed(page: Page, acceptDemo: boolean) {
  const banner = page.getByTestId('seed-banner')
  if (await banner.count()) {
    await page.getByTestId(acceptDemo ? 'btn-seed-accept' : 'btn-seed-skip').click()
    await expect(banner).toHaveCount(0)
  }
}

async function saveModal(page: Page) {
  await page.getByTestId('btn-modal-submit').click()
}

test.describe('Fluxos F01–F08 (web/memory)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('F01 — inicialização e seed vazio', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await skipOrAcceptSeed(page, false)
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('F02 — cadastrar categoria', async ({ page }) => {
    await skipOrAcceptSeed(page, false)
    await page.getByTestId('nav-categorias').click()
    await expect(page.getByTestId('categories-page')).toBeVisible()
    await page.getByTestId('btn-new-category').click()
    await page.getByTestId('input-category-name').fill('E2E Categoria')
    await saveModal(page)
    await expect(page.getByText('E2E Categoria')).toBeVisible()
  })

  test('F03 — cadastrar fornecedor', async ({ page }) => {
    await skipOrAcceptSeed(page, false)
    await page.getByTestId('nav-fornecedores').click()
    await expect(page.getByTestId('suppliers-page')).toBeVisible()
    await page.getByTestId('btn-new-supplier').click()
    await page.getByTestId('input-supplier-name').fill('Fornecedor E2E')
    await saveModal(page)
    await expect(page.getByText('Fornecedor E2E')).toBeVisible()
  })

  test('F04/F06/F07/F08 — produto, entrada, saída bloqueada e ajuste', async ({ page }) => {
    await skipOrAcceptSeed(page, false)

    // F04 produto
    await page.getByTestId('nav-produtos').click()
    await page.getByTestId('btn-new-product').click()
    await page.getByTestId('input-product-sku').fill('E2E-001')
    await page.getByTestId('input-product-name').fill('Produto E2E')
    await page.getByTestId('input-product-unit').fill('un')
    await page.getByTestId('input-product-cost').fill('10')
    await page.getByTestId('input-product-sale').fill('20')
    await page.getByTestId('input-product-min').fill('2')
    await page.getByTestId('input-product-initial').fill('5')
    await saveModal(page)
    await expect(page.getByText('E2E-001')).toBeVisible()
    await expect(page.getByText('Produto E2E')).toBeVisible()

    // F06 entrada
    await page.getByTestId('nav-movimentacoes').click()
    await page.getByTestId('btn-new-movement').click()
    await page.getByTestId('select-movement-product').selectOption({ label: 'E2E-001 · Produto E2E' })
    await page.getByTestId('select-movement-type').selectOption('entrada')
    await page.getByTestId('input-movement-qty').fill('3')
    await page.getByTestId('input-movement-reason').fill('Compra E2E')
    await saveModal(page)
    await expect(page.getByText('Compra E2E')).toBeVisible()

    // F07 saída insuficiente (saldo 8)
    await page.getByTestId('btn-new-movement').click()
    await page.getByTestId('select-movement-product').selectOption({ label: 'E2E-001 · Produto E2E' })
    await page.getByTestId('select-movement-type').selectOption('saida')
    await page.getByTestId('input-movement-qty').fill('999')
    await page.getByTestId('input-movement-reason').fill('Saída inválida')
    await saveModal(page)
    await expect(page.getByText(/saldo|insuficiente|disponível/i).first()).toBeVisible()
    // fecha modal que permanece aberto após erro de validação
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.locator('.modal-backdrop')).toHaveCount(0)

    // F08 ajuste
    await page.getByTestId('btn-new-movement').click()
    await page.getByTestId('select-movement-product').selectOption({ label: 'E2E-001 · Produto E2E' })
    await page.getByTestId('select-movement-type').selectOption('ajuste')
    await page.getByTestId('input-movement-new-stock').fill('4')
    await page.getByTestId('input-movement-reason').fill('Inventário E2E')
    await saveModal(page)
    await expect(page.getByText('Inventário E2E')).toBeVisible()
  })

  test('F05 — inativar produto', async ({ page }) => {
    await skipOrAcceptSeed(page, true)
    await page.getByTestId('nav-produtos').click()
    await expect(page.getByTestId('products-page')).toBeVisible()
    const row = page.locator('tr', { hasText: /./ }).nth(1)
    await expect(row).toBeVisible()
    const toggle = row.getByRole('button', { name: /Inativar|Reativar/i }).first()
    if (await toggle.count()) {
      await toggle.click()
    }
  })

  test('Configurações — backup e updates (web stubs)', async ({ page }) => {
    await skipOrAcceptSeed(page, false)
    await page.getByTestId('nav-configuracoes').click()
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await expect(page.getByTestId('app-version')).toContainText(/1\.0\.0/)
    await page.getByTestId('btn-export-backup').click()
    await expect(page.getByText(/Backup/i).first()).toBeVisible()
    await page.getByTestId('btn-check-updates').click()
    await expect(page.getByTestId('update-status')).toContainText(/web|indispon|desabilit/i)
  })
})
