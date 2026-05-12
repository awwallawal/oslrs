#!/usr/bin/env node
/**
 * Single-page handout renderer (A4 PDF).
 *
 * Designed for Ministry-facing one-pagers, stakeholder briefs, partner
 * handouts. Lighter weight than `_bmad-output/baseline-report/assets/build.js`
 * (which is built for chaptered technical reports with cover + chapter
 * numbering + captions). For single-page handouts that ceremony is wrong;
 * this script instead produces a brand-banded single-page A4 PDF directly.
 *
 * Usage:
 *   node scripts/render-briefing-pdf.mjs <input.md> <output.pdf>
 *
 * Convention:
 *   - The first H1 in the markdown is treated as the document TITLE (rendered
 *     in the maroon brand band at the top).
 *   - The first H3 immediately after the H1 is treated as the SUBTITLE.
 *   - Everything else is rendered as standard body content.
 *   - Tables, lists, blockquotes, code, italics, bold all supported via
 *     markdown-it's CommonMark + GFM tables.
 *
 * Brand:
 *   Maroon `#9C1E23` band, dark variant `#7A171B` for accents — matches the
 *   OSLSR ID Card Service + Operations Manual visual identity (consistent
 *   document family).
 *
 * Output:
 *   A4 portrait, 0 page-margin (band touches the edge), padded body.
 *   Compact typography to keep one page (target: ~700 words max body content).
 *
 * Requirements:
 *   - Node 18+ (uses ESM, fileURLToPath, top-level await)
 *   - markdown-it (already a project dep)
 *   - Microsoft Edge OR Google Chrome on the host
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

// ── 1. Args ──────────────────────────────────────────────────────────────
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/render-briefing-pdf.mjs <input.md> <output.pdf>');
  process.exit(2);
}
const inputPath = resolve(process.cwd(), inputArg);
const outputPath = resolve(process.cwd(), outputArg);
if (!existsSync(inputPath)) {
  console.error(`✗ Input not found: ${inputPath}`);
  process.exit(2);
}
mkdirSync(dirname(outputPath), { recursive: true });

// ── 2. Parse markdown + extract title/subtitle ────────────────────────────
const raw = readFileSync(inputPath, 'utf-8');

// Extract title from first H1
const titleMatch = raw.match(/^#\s+(.+)$/m);
const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

// Extract subtitle from first H3 (the convention used in our briefings)
const subtitleMatch = raw.match(/^###\s+(.+)$/m);
const subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';

// Strip the title H1 + the immediately-following subtitle H3 from body
let body = raw;
if (titleMatch) body = body.replace(titleMatch[0], '');
if (subtitleMatch) body = body.replace(subtitleMatch[0], '');

const bodyHtml = md.render(body.trim());

// ── 3. HTML template (inline CSS, no externals) ───────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.4;
    color: #1f1f1f;
  }
  .band {
    background: #9C1E23;
    color: #ffffff;
    padding: 18mm 18mm 12mm 18mm;
    border-bottom: 4px solid #7A171B;
  }
  .band h1 {
    font-size: 22pt;
    font-weight: 700;
    margin: 0 0 6mm 0;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }
  .band .subtitle {
    font-size: 11pt;
    font-weight: 400;
    margin: 0;
    color: #f4d8d9;
  }
  .body {
    padding: 8mm 18mm 14mm 18mm;
  }
  .body h1 {
    font-size: 13pt;
    font-weight: 700;
    color: #7A171B;
    margin: 4mm 0 2mm 0;
    border-bottom: 1px solid #e5d5d6;
    padding-bottom: 1mm;
  }
  .body h2, .body h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #7A171B;
    margin: 3mm 0 1.5mm 0;
  }
  .body h4 {
    font-size: 10pt;
    font-weight: 700;
    margin: 2mm 0 1mm 0;
    color: #1f1f1f;
  }
  .body p { margin: 0 0 2mm 0; }
  .body ul, .body ol { margin: 1mm 0 2mm 4mm; padding: 0 0 0 4mm; }
  .body li { margin: 0 0 0.8mm 0; }
  .body strong { color: #7A171B; }
  .body hr {
    border: none;
    border-top: 1px solid #d4c0c1;
    margin: 3mm 0;
  }
  .body table {
    width: 100%;
    border-collapse: collapse;
    margin: 2mm 0;
    font-size: 8.5pt;
  }
  .body table th {
    background: #f4ebec;
    color: #7A171B;
    font-weight: 700;
    text-align: left;
    padding: 1.5mm 2mm;
    border-bottom: 2px solid #9C1E23;
    vertical-align: top;
  }
  .body table td {
    padding: 1.5mm 2mm;
    border-bottom: 1px solid #ebe0e1;
    vertical-align: top;
  }
  .body table tr:last-child td { border-bottom: none; }
  .body blockquote {
    border-left: 3px solid #9C1E23;
    margin: 2mm 0;
    padding: 1mm 0 1mm 4mm;
    color: #4a4a4a;
    font-style: italic;
  }
  .body blockquote p { margin: 0 0 1mm 0; }
  .body code {
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 0.92em;
    background: #f4ebec;
    padding: 0.2mm 1mm;
    border-radius: 1mm;
    color: #7A171B;
  }
  .body p[align="right"], .body p[align="right"] i {
    font-size: 8pt;
    color: #6b6b6b;
    text-align: right;
    margin-top: 4mm;
  }
</style>
</head>
<body>
  <div class="band">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
  </div>
  <div class="body">
${bodyHtml}
  </div>
</body>
</html>`;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 4. Write intermediate HTML ────────────────────────────────────────────
const tempHtml = outputPath.replace(/\.pdf$/i, '.html');
writeFileSync(tempHtml, html, 'utf-8');
console.log(`✓ HTML rendered: ${tempHtml}`);

// ── 5. Locate browser ─────────────────────────────────────────────────────
function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}
const browser = findBrowser();
if (!browser) {
  console.error('✗ No Edge / Chrome / Chromium found.');
  console.error(`  HTML preview at: ${tempHtml}`);
  process.exit(3);
}
console.log(`✓ Using browser: ${browser}`);

// ── 6. Render PDF ─────────────────────────────────────────────────────────
const fileUrl = pathToFileURL(tempHtml).href;
try {
  execSync(
    `"${browser}" --headless=new --disable-gpu --no-pdf-header-footer --no-sandbox --virtual-time-budget=10000 --print-to-pdf="${outputPath}" "${fileUrl}"`,
    { stdio: 'pipe' },
  );
  console.log(`✓ PDF rendered: ${outputPath}`);
} catch (err) {
  console.error('✗ PDF generation failed.');
  console.error(err.stderr?.toString?.() || err.message);
  process.exit(4);
}

// ── 7. Keep HTML as preview artifact (operator can refine and re-render) ──
console.log(`\nDone.`);
console.log(`  Source:  ${inputPath}`);
console.log(`  HTML:    ${tempHtml}`);
console.log(`  PDF:     ${outputPath}`);
