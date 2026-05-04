#!/usr/bin/env node
/**
 * Chemiroy Document Design System v2.0 — Build Script
 *
 * Renders a Markdown source file (with YAML front-matter) to a PDF using:
 *   1. js-yaml         — parse YAML front-matter
 *   2. markdown-it     — Markdown → HTML body conversion
 *   3. template.html   — HTML scaffold with placeholder slots
 *   4. v2-styles.css   — design system stylesheet (typography, colour, layout)
 *   5. print.css       — print-specific @page rules
 *   6. Edge / Chrome   — headless --print-to-pdf for final PDF generation
 *
 * Usage:
 *   node build.js <input.md> <output.pdf>
 *
 * Example:
 *   node build.js ../sources/pre-field-status-report.md ../output/PFSR.pdf
 *
 * Front-matter required keys:
 *   docRef, classification, title, subtitle, superhead,
 *   authors, firm, date, version, coverCredit
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

// ─────────────────────── Auto-numbered captions ───────────────────────
// Inject "Table X.Y: Description" before each table and "Figure X.Y:
// Description" before each fenced code block.
//
//   X = chapter number, parsed from H1 headings of the form "N. Title"
//   Y = table/figure counter, reset at each new chapter H1
//   Description = manual override (HTML comment) OR last H2/H3 heading text
//
// Manual override:
//   Place <!-- caption: Custom description here --> immediately before a
//   table or fenced code block. The renderer scans backward up to 5
//   tokens for an html_block matching this pattern.
//
// Auto fallback:
//   If no manual caption is found, the most recent H2 or H3 heading text
//   (with leading numeric prefix stripped) is used as the description.
//
// Front-matter H1s (Document Control, Table of Contents, Abbreviations)
// have no numeric prefix, so chapterNum stays at 0 and captions are
// suppressed for any tables/figures within front matter.

let chapterNum = 0;
let tableCount = 0;
let figureCount = 0;
let lastSubsection = '';

function findCaptionComment(tokens, startIdx) {
  for (let i = startIdx - 1; i >= Math.max(0, startIdx - 5); i -= 1) {
    const t = tokens[i];
    if (t.type === 'html_block') {
      const m = t.content.match(/<!--\s*caption:\s*([\s\S]+?)\s*-->/i);
      if (m) return m[1].trim();
    }
  }
  return null;
}

function buildCaption(label, num, manual, fallback) {
  const description = manual || fallback;
  if (description) {
    return `<strong>${label} ${num}:</strong> ${description}`;
  }
  return `<strong>${label} ${num}</strong>`;
}

const defaultHeadingOpen = md.renderer.rules.heading_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const inline = tokens[idx + 1];
  if (token.tag === 'h1' && inline && inline.type === 'inline') {
    const m = inline.content.match(/^(\d+)\./);
    if (m) {
      chapterNum = parseInt(m[1], 10);
      tableCount = 0;
      figureCount = 0;
      lastSubsection = '';
    } else {
      chapterNum = 0;
      lastSubsection = '';
    }
  } else if ((token.tag === 'h2' || token.tag === 'h3') && inline && inline.type === 'inline') {
    // Strip leading numeric prefix (e.g., "8.14 " or "8.14.2 ")
    lastSubsection = inline.content.replace(/^[\d.]+\s*/, '').trim();
  }
  return defaultHeadingOpen(tokens, idx, options, env, self);
};

const defaultTableOpen = md.renderer.rules.table_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
  if (chapterNum > 0) {
    tableCount += 1;
    const manual = findCaptionComment(tokens, idx);
    const caption = buildCaption('Table', `${chapterNum}.${tableCount}`, manual, lastSubsection);
    // Emit caption as a sibling of the table (NOT wrapped in
    // `.keep-with-next`). Multi-page tables make a wrapping `break-inside:
    // avoid` constraint unsatisfiable, which causes chromium to fall back
    // to "break at the first internal boundary" — i.e. between caption
    // and table.thead. Instead we rely on:
    //   .caption          { break-after: avoid !important; }
    //   .caption + table  { break-before: avoid !important; }
    // The two adjacent-sibling rules glue caption to table without
    // imposing an impossible whole-table no-break constraint.
    return `<p class="caption caption--table">${caption}</p>\n`
      + defaultTableOpen(tokens, idx, options, env, self);
  }
  return defaultTableOpen(tokens, idx, options, env, self);
};

const defaultFence = md.renderer.rules.fence
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  if (chapterNum > 0) {
    figureCount += 1;
    const manual = findCaptionComment(tokens, idx);
    const caption = buildCaption('Figure', `${chapterNum}.${figureCount}`, manual, lastSubsection);
    return `<div class="keep-with-next">\n<p class="caption caption--figure">${caption}</p>\n`
      + defaultFence(tokens, idx, options, env, self) + '\n</div>';
  }
  return defaultFence(tokens, idx, options, env, self);
};

const defaultCodeBlock = md.renderer.rules.code_block
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.code_block = function (tokens, idx, options, env, self) {
  if (chapterNum > 0) {
    figureCount += 1;
    const manual = findCaptionComment(tokens, idx);
    const caption = buildCaption('Figure', `${chapterNum}.${figureCount}`, manual, lastSubsection);
    return `<div class="keep-with-next">\n<p class="caption caption--figure">${caption}</p>\n`
      + defaultCodeBlock(tokens, idx, options, env, self) + '\n</div>';
  }
  return defaultCodeBlock(tokens, idx, options, env, self);
};

// HTML block hook — captions any <figure class="diagram"> ... </figure>
// block (used to wrap SVG diagrams converted from Excalidraw). The block
// is inserted in the markdown source by post-processing scripts that map
// SVG files to chapter sections.
const defaultHtmlBlock = md.renderer.rules.html_block
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.html_block = function (tokens, idx, options, env, self) {
  const content = (tokens[idx].content || '').trim();
  if (chapterNum > 0 && /^<figure\s+class="diagram"/i.test(content)) {
    figureCount += 1;
    const manual = findCaptionComment(tokens, idx);
    const caption = buildCaption('Figure', `${chapterNum}.${figureCount}`, manual, lastSubsection);
    return `<div class="keep-with-next">\n<p class="caption caption--figure">${caption}</p>\n`
      + defaultHtmlBlock(tokens, idx, options, env, self) + '\n</div>';
  }
  return defaultHtmlBlock(tokens, idx, options, env, self);
};

// ─────────────────────── 1. Argument parsing ───────────────────────

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node build.js <input.md> <output.pdf>');
  process.exit(2);
}

const inputPath  = resolve(process.cwd(), inputArg);
const outputPath = resolve(process.cwd(), outputArg);

if (!existsSync(inputPath)) {
  console.error(`✗ Input file not found: ${inputPath}`);
  process.exit(2);
}

mkdirSync(dirname(outputPath), { recursive: true });

// ─────────────────────── 2. Parse markdown + front-matter ───────────

const raw = readFileSync(inputPath, 'utf-8');

const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!fmMatch) {
  console.error('✗ Input markdown must begin with --- YAML front-matter --- block.');
  process.exit(2);
}

const frontMatter = yaml.load(fmMatch[1]);
const mdBody      = fmMatch[2];

const required = ['docRef','classification','title','subtitle','superhead','authors','firm','date','version','coverCredit'];
const missing  = required.filter(k => !frontMatter[k]);
if (missing.length) {
  console.error(`✗ Front-matter missing required keys: ${missing.join(', ')}`);
  process.exit(2);
}

let contentHtml = md.render(mdBody);

// ─────────────────────── Heading-orphan prevention ───────────────────────
// Wrap each H1/H2/H3/H4 heading + its IMMEDIATELY following block element
// in a `<div class="keep-with-next">`. Combined with `break-inside: avoid`
// in print.css, this guarantees chromium keeps the heading on the same
// page as its first content block — preventing the heading-on-one-page,
// paragraph-on-the-next regression.
//
// IMPORTANT: <table> is excluded from the alternation because tables are
// frequently multi-page (e.g. Abbreviations, regulatory traceability).
// Wrapping a heading + multi-page table in `break-inside: avoid` makes
// the constraint unsatisfiable; chromium then falls back to breaking at
// the FIRST internal boundary, which orphans the heading.
//
// For H + table relationships we instead rely on:
//   1. CSS `h1+*, h2+*, …` adjacent-sibling rule with break-before: avoid
//   2. CSS `.caption + table` rule (when a Table caption is between H and
//      table — caption is captured as `<p>` by this regex, table follows)
//   3. <thead> repeating on each page (CSS default)
//
// Block elements still in the alternation: p, ul, ol, figure, pre,
// blockquote, div. These are typically single-page-or-smaller blocks.
contentHtml = contentHtml.replace(
  /(<h[1234][^>]*>[\s\S]*?<\/h[1234]>)\s*(<(p|ul|ol|figure|pre|blockquote|div)[^>]*>[\s\S]*?<\/\3>)/g,
  '<div class="keep-with-next">\n$1\n$2\n</div>'
);

// ─────────────────────── 3. Inject into template ────────────────────
// CSS is inlined into the rendered HTML so the output file is self-contained
// (avoids relative-path breakage when output/ is in a different dir from assets/).
// Image url() paths in CSS are rewritten to absolute file:// URLs.

const templatePath = join(__dirname, 'template.html');
const template = readFileSync(templatePath, 'utf-8');

const v2css    = readFileSync(join(__dirname, 'v2-styles.css'), 'utf-8');
const printcss = readFileSync(join(__dirname, 'print.css'), 'utf-8');

// Rewrite relative image paths in CSS to absolute file:// URLs anchored at __dirname
const assetsBase = pathToFileURL(__dirname + '/').href;  // e.g. file:///C:/.../assets/
const v2cssAbs    = v2css.replaceAll(/url\((['"]?)images\//g, `url($1${assetsBase}images/`);
const printcssAbs = printcss.replaceAll(/url\((['"]?)images\//g, `url($1${assetsBase}images/`);

const inlinedTemplate = template
  .replace('<link rel="stylesheet" href="v2-styles.css">', `<style>\n${v2cssAbs}\n</style>`)
  .replace('<link rel="stylesheet" href="print.css">',     `<style>\n${printcssAbs}\n</style>`);

const replacements = {
  DOC_REF:        frontMatter.docRef,
  CLASSIFICATION: frontMatter.classification,
  TITLE:          frontMatter.title,
  SUBTITLE:       frontMatter.subtitle,
  SUPERHEAD:      frontMatter.superhead,
  AUTHORS:        frontMatter.authors,
  FIRM:           frontMatter.firm,
  DATE:           frontMatter.date,
  VERSION:        String(frontMatter.version),
  COVER_CREDIT:   frontMatter.coverCredit,
  CONTENT_HTML:   contentHtml,
};

const filled = Object.entries(replacements).reduce(
  (acc, [k, v]) => acc.replaceAll(`{{ ${k} }}`, v),
  inlinedTemplate,
);

// ─────────────────────── 4. Write intermediate HTML ────────────────

const tempHtmlPath = outputPath.replace(/\.pdf$/i, '.html');
writeFileSync(tempHtmlPath, filled, 'utf-8');
console.log(`✓ HTML rendered: ${tempHtmlPath}`);

// ─────────────────────── 5. Locate Edge/Chrome ─────────────────────

function findBrowser() {
  const candidates = [
    // Windows — Microsoft Edge (most common)
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Windows — Google Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  // Try PATH-resolution
  for (const cmd of ['msedge', 'chrome', 'google-chrome', 'chromium']) {
    try {
      const out = execSync(`where ${cmd} 2>nul || which ${cmd} 2>/dev/null`, { encoding: 'utf-8' }).trim().split(/\r?\n/)[0];
      if (out && existsSync(out)) return out;
    } catch {}
  }

  return null;
}

const browser = findBrowser();
if (!browser) {
  console.error('✗ No Edge / Chrome / Chromium found.');
  console.error('  Install Microsoft Edge (Windows default) OR Google Chrome.');
  console.error('  HTML preview was generated at:', tempHtmlPath);
  process.exit(3);
}
console.log(`✓ Using browser: ${browser}`);

// ─────────────────────── 6. Render PDF via headless ────────────────
//
// Two SEPARATE PDFs per document — cover and body each rendered with its
// OWN optimal @page CSS, no merge step. Reason: chromium's
// `--print-to-pdf` does not reliably honour `@page :first { margin: 0 }`
// for long documents, and merging via pdf-lib introduces its own
// fragility for a workflow already tested in single-document mode.
//
// Output naming convention:
//   <name>.pdf  -> argument provided (treated as the BODY pdf path)
//   <name>-Cover.pdf -> derived from argument; cover-only, full bleed
//
// The deliverable is therefore TWO files per document. They can be sent
// alongside each other to the Ministry; for printing, the cover is
// printed first (full-bleed) followed by the body (with margins).

function renderPdf(htmlPath, pdfOutPath) {
  const fileUrl = pathToFileURL(htmlPath).href;
  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--no-sandbox',
    '--virtual-time-budget=10000',
    `--print-to-pdf="${pdfOutPath}"`,
    `"${fileUrl}"`,
  ];
  execSync(`"${browser}" ${flags.join(' ')}`, { stdio: 'pipe' });
}

// Split filled HTML into cover-only and body-only variants.
function splitCoverAndBody(html) {
  const coverStartMarker = '<div class="cover variant-photo">';
  const coverStartIdx = html.indexOf(coverStartMarker);
  if (coverStartIdx < 0) throw new Error('Cover block not found in template');
  let depth = 0;
  let i = coverStartIdx;
  let coverEndIdx = -1;
  while (i < html.length) {
    if (html.startsWith('<div', i)) { depth += 1; i += 4; }
    else if (html.startsWith('</div>', i)) {
      depth -= 1;
      i += 6;
      if (depth === 0) { coverEndIdx = i; break; }
    } else { i += 1; }
  }
  if (coverEndIdx < 0) throw new Error('Cover block has unbalanced divs');

  const beforeCover = html.slice(0, coverStartIdx);
  const coverBlock  = html.slice(coverStartIdx, coverEndIdx);
  const afterCover  = html.slice(coverEndIdx);

  // Cover HTML: head + cover element only. Inject @page override so every
  // page in this single-page document has zero margin (full bleed).
  const coverPageOverride = '<style>@page { size: A4; margin: 0 !important; }</style>';
  const coverHtml = beforeCover.replace('</head>', coverPageOverride + '\n</head>') + coverBlock + '\n</body>\n</html>\n';

  // Body HTML: drop the cover block entirely.
  const bodyHtml = beforeCover + afterCover;

  return { coverHtml, bodyHtml };
}

async function mergePdfs(coverPdfPath, bodyPdfPath, outPath) {
  const cover = await PDFDocument.load(readFileSync(coverPdfPath));
  const body  = await PDFDocument.load(readFileSync(bodyPdfPath));
  const merged = await PDFDocument.create();
  const coverPages = await merged.copyPages(cover, cover.getPageIndices());
  for (const p of coverPages) merged.addPage(p);
  const bodyPages = await merged.copyPages(body, body.getPageIndices());
  for (const p of bodyPages) merged.addPage(p);
  writeFileSync(outPath, await merged.save());
}

const { coverHtml, bodyHtml } = splitCoverAndBody(filled);

// Intermediate paths (will be merged into outputPath; intermediates are kept
// as a fallback in case the merge introduces a regression).
const coverPdfPath  = outputPath.replace(/\.pdf$/i, '-Cover.pdf');
const bodyPdfPath   = outputPath.replace(/\.pdf$/i, '-Body.pdf');
const coverHtmlPath = outputPath.replace(/\.pdf$/i, '-Cover.html');
const bodyHtmlPath  = outputPath.replace(/\.pdf$/i, '-Body.html');

writeFileSync(coverHtmlPath, coverHtml, 'utf-8');
writeFileSync(bodyHtmlPath,  bodyHtml,  'utf-8');

try {
  console.log(`→ Generating cover PDF…`);
  renderPdf(coverHtmlPath, coverPdfPath);
  console.log(`✓ Cover PDF: ${coverPdfPath}`);

  console.log(`→ Generating body PDF…`);
  renderPdf(bodyHtmlPath, bodyPdfPath);
  console.log(`✓ Body PDF: ${bodyPdfPath}`);

  console.log(`→ Merging cover + body via pdf-lib…`);
  await mergePdfs(coverPdfPath, bodyPdfPath, outputPath);
  console.log(`✓ Merged PDF: ${outputPath}`);
} catch (err) {
  console.error(`✗ PDF generation/merge failed.`);
  console.error(err.stderr?.toString?.() || err.message);
  process.exit(4);
}

// ─────────────────────── 7. Cleanup ─────────────────────────────────
// Intermediate Cover/Body PDFs and HTMLs are KEPT as fallback files in
// case the merged output regresses; the main deliverable is outputPath.

console.log(`\nDone.`);
console.log(`  Source:           ${inputPath}`);
console.log(`  Cover PDF (sep):  ${coverPdfPath}`);
console.log(`  Body PDF (sep):   ${bodyPdfPath}`);
console.log(`  Merged PDF:       ${outputPath}`);
