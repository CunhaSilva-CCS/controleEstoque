import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '/opt/cursor/artifacts/screenshots'
const DOCS = '/workspace/docs/screenshots'
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(DOCS, { recursive: true })

async function shot(page, name) {
  await page.waitForTimeout(350)
  for (const dir of [OUT, DOCS]) {
    const file = path.join(dir, `${name}.png`)
    await page.screenshot({ path: file, fullPage: false })
  }
  console.log('saved', name)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.brand h1')
  await shot(page, '01-dashboard-primeiro-uso')

  await page.getByRole('button', { name: 'Carregar demo' }).click()
  await page.getByText('Dados de demonstração carregados').waitFor({ timeout: 5000 })
  await page.waitForSelector('text=Críticos')
  await shot(page, '02-dashboard-com-dados')

  await page.locator('.nav a', { hasText: 'Produtos' }).click()
  await page.waitForURL('**/produtos')
  await page.waitForSelector('h2:text("Produtos")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '03-produtos')

  await page.getByRole('button', { name: 'Novo produto' }).click()
  await page.waitForSelector('.modal h3:text("Novo produto")')
  await shot(page, '04-produto-formulario')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForSelector('.modal', { state: 'detached' })

  await page.getByRole('button', { name: 'Movimentar' }).first().click()
  await page.waitForSelector('.modal h3')
  await shot(page, '05-movimentar-produto')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForSelector('.modal', { state: 'detached' })

  await page.locator('.nav a', { hasText: 'Categorias' }).click()
  await page.waitForSelector('h2:text("Categorias")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '06-categorias')

  await page.locator('.nav a', { hasText: 'Fornecedores' }).click()
  await page.waitForSelector('h2:text("Fornecedores")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '07-fornecedores')

  await page.locator('.nav a', { hasText: 'Movimentações' }).click()
  await page.waitForSelector('h2:text("Movimentações")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '08-movimentacoes')

  await page.locator('.nav a', { hasText: 'Relatórios' }).click()
  await page.waitForSelector('h2:text("Relatórios")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '09-relatorios')

  await page.locator('.nav a', { hasText: 'Alertas' }).click()
  await page.waitForSelector('h2:text("Alertas de estoque")')
  await page.waitForSelector('table tbody tr')
  await shot(page, '10-alertas')

  await page.getByRole('button', { name: 'Ajustar mínimo' }).first().click()
  await page.waitForSelector('.modal h3')
  await shot(page, '11-ajustar-minimo')
  await page.getByRole('button', { name: 'Cancelar' }).click()

  await browser.close()
  console.log('DONE')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
