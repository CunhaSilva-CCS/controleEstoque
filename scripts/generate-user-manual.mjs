import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = process.cwd()
const input = path.join(root, 'docs', 'MANUAL-USUARIO.html')
const output = path.join(root, 'docs', 'Manual-do-Usuario-ERP-Cortexis-Tech.pdf')
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(input).toString(), { waitUntil: 'networkidle' })
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:8px Arial;color:#64748b;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
  })
  console.log(output)
} finally {
  await browser.close()
}
