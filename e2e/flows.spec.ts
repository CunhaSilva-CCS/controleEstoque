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

async function loginIfNeeded(page: Page) {
  const login = page.getByTestId('login-page')
  if (await login.count()) {
    await page.getByTestId('input-login-user').fill('admin')
    await page.getByTestId('input-login-pass').fill('admin123')
    await page.getByTestId('btn-login-submit').click()
    await expect(
      page.getByTestId('change-password-page').or(page.getByTestId('app-shell')),
    ).toBeVisible()
  }

  const changePassword = page.getByTestId('change-password-page')
  if (await changePassword.isVisible()) {
    await page.getByTestId('input-change-current').fill('admin123')
    await page.getByTestId('input-change-new').fill('Admin#e2e1')
    await page.getByTestId('input-change-confirm').fill('Admin#e2e1')
    await page.getByTestId('btn-change-password-submit').click()
  }
}

test.describe('Fluxos F01–F08 (web/memory)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await loginIfNeeded(page)
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('F01 — inicialização e seed vazio', async ({ page }) => {
    await expect(page.getByTestId('page-title')).toHaveText('Painel')
    await skipOrAcceptSeed(page, false)
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
  })

  test('layout permanece lateral em notebook Windows com escala de exibição', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 720 })
    const columns = await page.getByTestId('app-shell').evaluate(
      (element) => window.getComputedStyle(element).gridTemplateColumns,
    )
    expect(columns.split(' ')).toHaveLength(2)
    const sidebar = await page.locator('.sidebar').boundingBox()
    const main = await page.locator('.main-area').boundingBox()
    expect(sidebar?.width).toBeLessThan(300)
    expect(main?.x).toBeGreaterThan(200)
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

  test('F04/F06/F07/F08 — produto, fatura, fabricação e ajuste', async ({ page }) => {
    await skipOrAcceptSeed(page, false)

    // F04 produto insumo
    await page.getByTestId('nav-produtos').click()
    await page.getByTestId('btn-new-product').click()
    await page.getByTestId('input-product-sku').fill('E2E-001')
    await page.getByTestId('input-product-name').fill('Produto E2E')
    await page.getByTestId('select-product-kind').selectOption('insumo')
    await page.getByTestId('select-product-unit').selectOption('un')
    await page.getByTestId('input-product-cost').fill('10')
    await page.getByTestId('input-product-sale').fill('20')
    await page.getByTestId('input-product-min').fill('2')
    await saveModal(page)
    await expect(page.getByText('E2E-001')).toBeVisible()

    // F06 entrada via fatura
    await page.getByTestId('nav-faturas').click()
    await page.getByTestId('btn-new-invoice').click()
    await page.getByTestId('input-invoice-number').fill('NF-E2E-001')
    await page.getByTestId('select-invoice-product').selectOption({ label: 'E2E-001 · Produto E2E' })
    await page.getByTestId('input-invoice-qty').fill('5')
    await page.getByTestId('input-invoice-cost').fill('10')
    await saveModal(page)
    await expect(page.getByText('NF-E2E-001')).toBeVisible()

    // F04 produto final
    await page.getByTestId('nav-produtos').click()
    await page.getByTestId('btn-new-product').click()
    await page.getByTestId('input-product-sku').fill('E2E-FINAL-001')
    await page.getByTestId('input-product-name').fill('Produto Final E2E')
    await page.getByTestId('select-product-kind').selectOption('acabado')
    await page.getByTestId('select-product-unit').selectOption('un')
    await page.getByTestId('input-product-cost').fill('20')
    await page.getByTestId('input-product-sale').fill('40')
    await page.getByTestId('input-product-min').fill('1')
    await saveModal(page)
    await expect(page.getByText('E2E-FINAL-001')).toBeVisible()

    // F07 receita e fabricação: consome 2 insumos e produz 1 produto final
    await page.getByTestId('nav-receitas').click()
    await page.getByTestId('btn-new-recipe').click()
    await page.getByTestId('select-recipe-product').selectOption({ label: 'E2E-FINAL-001 · Produto Final E2E' })
    await page.getByTestId('select-recipe-component').selectOption({ label: 'E2E-001 · Produto E2E' })
    await page.getByTestId('input-recipe-qty').fill('2')
    await saveModal(page)
    await expect(page.getByText('E2E-FINAL-001')).toBeVisible()

    await page.getByTestId('nav-fabricacao').click()
    await page.getByTestId('btn-new-production').click()
    await page.getByTestId('select-production-product').selectOption({ label: 'E2E-FINAL-001 · Produto Final E2E' })
    await page.getByTestId('input-production-qty').fill('2')
    await saveModal(page)
    await expect(page.getByText('Produto Final E2E')).toBeVisible()

    // F08 ajuste manual
    await page.getByTestId('nav-movimentacoes').click()
    await page.getByTestId('btn-new-movement').click()
    await page.getByTestId('select-movement-product').selectOption({ label: 'E2E-001 · Produto E2E' })
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
    await expect(page.getByText(/cópia de segurança/i).first()).toBeVisible()
    await page.getByTestId('btn-check-updates').click()
    await expect(page.getByTestId('update-status')).toContainText(/indispon|desabilit/i)
  })
})
