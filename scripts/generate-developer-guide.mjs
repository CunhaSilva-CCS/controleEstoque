import path from 'node:path'
import fs from 'node:fs'
import { chromium } from 'playwright'

const root = process.cwd()
const input = path.join(root, 'docs', 'GUIA-DO-DESENVOLVEDOR.md')
const output = path.join(root, 'docs', 'Guia-do-Desenvolvedor-ERP-Cortexis-Tech.pdf')
const source = fs.readFileSync(input, 'utf8')
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><style>
  body{font:10px/1.55 Arial,sans-serif;color:#172033;margin:0} pre{white-space:pre-wrap;word-wrap:break-word;font:10px/1.55 Arial,sans-serif;margin:0} @page{size:A4} 
</style></head><body><pre>${escape(source)}</pre></body></html>`
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.pdf({ path: output, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;margin:0 16mm;font:7px Arial;color:#64748b">ERP Cortexis Tech · Guia do Desenvolvedor</div>',
    footerTemplate: '<div style="width:100%;font:8px Arial;color:#64748b;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '22mm', right: '14mm', bottom: '16mm', left: '14mm' } })
  console.log(output)
} finally { await browser.close() }
