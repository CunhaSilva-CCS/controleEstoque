import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = process.cwd()
const input = path.join(root, 'docs', 'MANUAL-DO-UTILIZADOR.html')
const output = path.join(root, 'docs', 'Manual-do-Utilizador-ERP-Cortexis-Tech.pdf')
const logoPath = path.join(root, 'public', 'favicon-192.png')
const logoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(input).toString(), { waitUntil: 'networkidle' })
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%;margin:0 16mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe5ec;padding:0 0 4px;font-family:Arial,sans-serif;color:#64748b;font-size:7px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <img src="${logoDataUrl}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;background:#111827;" />
          <span style="font-weight:600;color:#164e63;">ERP Cortexis Tech · Controlo de Stock</span>
        </div>
        <span>Manual do Utilizador · Versão 1.0</span>
      </div>`,
    footerTemplate: '<div style="width:100%;font:8px Arial;color:#64748b;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '25mm', right: '16mm', bottom: '18mm', left: '16mm' },
  })
  console.log(output)
} finally {
  await browser.close()
}
