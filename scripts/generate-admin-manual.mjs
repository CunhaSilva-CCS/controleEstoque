import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const root = process.cwd();
const input = path.join(root, "docs", "MANUAL-DO-ADMINISTRADOR.md");
const output = path.join(
  root,
  "docs",
  "Manual-do-Administrador-ERP-Cortexis-Tech.pdf",
);
const logoPath = path.join(root, "public", "favicon-192.png");
const logoDataUrl = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Aplica formatação inline (negrito, código, links) preservando o restante como texto simples.
function inline(text) {
  let result = escapeHtml(text);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

function renderTable(lines) {
  const rows = lines.filter(
    (line) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line),
  );
  const cells = rows.map((line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim()),
  );
  const [header, ...body] = cells;
  const thead = `<thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

// Conversor mínimo, cobre apenas a sintaxe usada nos manuais deste projeto (sem dependências externas).
function markdownToHtml(source) {
  const lines = source.split("\n");
  const html = [];
  let i = 0;
  let inList = null;

  function closeList() {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const block = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        block.push(lines[i]);
        i++;
      }
      i++;
      closeList();
      const label =
        lang === "mermaid"
          ? '<div class="code-label">Diagrama</div>'
          : lang
            ? `<div class="code-label">${escapeHtml(lang)}</div>`
            : "";
      html.push(
        `<div class="code-block">${label}<pre>${escapeHtml(block.join("\n"))}</pre></div>`,
      );
      continue;
    }

    if (/^\|.*\|$/.test(line.trim())) {
      const block = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        block.push(lines[i].trim());
        i++;
      }
      closeList();
      html.push(renderTable(block));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].replace(/\s*\{#.*\}\s*$/, "");
      html.push(`<h${level}>${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      closeList();
      html.push("<hr />");
      i++;
      continue;
    }

    const unordered = line.match(/^-\s+(.*)$/);
    if (unordered) {
      if (inList !== "ul") {
        closeList();
        html.push("<ul>");
        inList = "ul";
      }
      html.push(`<li>${inline(unordered[1])}</li>`);
      i++;
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (inList !== "ol") {
        closeList();
        html.push("<ol>");
        inList = "ol";
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return html.join("\n");
}

const source = fs.readFileSync(input, "utf8");
const body = markdownToHtml(source);

const html = `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; }
  body { font: 10.5px/1.6 Arial, sans-serif; color: #172033; margin: 0; }
  h1 { font-size: 20px; color: #164e63; border-bottom: 2px solid #164e63; padding-bottom: 6px; margin-top: 0; }
  h2 { font-size: 15px; color: #0f172a; margin-top: 22px; border-bottom: 1px solid #dbe5ec; padding-bottom: 3px; }
  h3 { font-size: 12px; color: #1e293b; margin-top: 16px; }
  p { margin: 6px 0; }
  a { color: #2563eb; text-decoration: none; }
  code { background: #eef2f7; border-radius: 3px; padding: 1px 4px; font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  hr { border: none; border-top: 1px solid #dbe5ec; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9.5px; }
  th, td { border: 1px solid #dbe5ec; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; color: #164e63; }
  .code-block { background: #0f172a; border-radius: 6px; margin: 10px 0; overflow: hidden; }
  .code-label { color: #94a3b8; font-size: 8px; padding: 4px 10px 0; font-family: ui-monospace, Menlo, monospace; }
  .code-block pre { color: #e2e8f0; font-family: ui-monospace, Menlo, monospace; font-size: 9px; padding: 8px 10px; margin: 0; white-space: pre-wrap; word-wrap: break-word; }
</style>
</head>
<body>${body}</body>
</html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width:100%;margin:0 16mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe5ec;padding:0 0 4px;font-family:Arial,sans-serif;color:#64748b;font-size:7px;">
        <div style="display:flex;align-items:center;gap:7px;">
          <img src="${logoDataUrl}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;background:#111827;" />
          <span style="font-weight:600;color:#164e63;">ERP Cortexis Tech · Controlo de Stock</span>
        </div>
        <span>Manual Completo do Administrador</span>
      </div>`,
    footerTemplate:
      '<div style="width:100%;font:8px Arial;color:#64748b;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: "25mm", right: "16mm", bottom: "18mm", left: "16mm" },
  });
  console.log(output);
} finally {
  await browser.close();
}
