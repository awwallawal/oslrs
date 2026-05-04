#!/usr/bin/env node
/**
 * ASCII figure → SVG converter for IUBR figures.
 *
 * Walks the IUBR markdown source, identifies fenced code blocks that match
 * one of several patterns, and replaces each with an SVG figure equivalent.
 *
 * Patterns handled:
 *   - **Bar chart** — title line in CAPS + percentage axis, e.g.:
 *       GENDER DISTRIBUTION (n=330)
 *
 *       Male   ████████████████████████   51.8%
 *       Female ██████████████████████     47.0%
 *
 *   - (Other patterns can be added; box-diagram parser is non-trivial and
 *      not implemented here — those figures stay as ASCII for now.)
 *
 * Output:
 *   - Writes SVG file to `_bmad-output/baseline-report/diagrams/figXY-slug.svg`
 *   - Replaces the original fence in the markdown with:
 *       <figure class="diagram">
 *       <img src="../diagrams/figXY-slug.svg" alt="<title>">
 *       </figure>
 *
 * Usage:
 *   node convert-ascii-figures.js
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE = join(__dirname, '..', 'sources', 'improved-updated-baseline-report.md');
const DIAGRAMS_DIR = join(__dirname, '..', 'diagrams');

// ─────────────────── Bar chart detection + parse ───────────────────

const MAROON = '#9C1E23';
const MAROON_LIGHT = '#c34848';
const INK = '#1a1a1a';
const RULE = '#c9bba6';
const PAPER = '#fbf9f2';

function detectBarChart(blockLines) {
  if (blockLines.length < 3) return null;
  const titleLine = blockLines[0].trim();
  if (!titleLine) return null;
  // Heuristic: title starts with uppercase letter, contains at least 3 uppercase
  // characters, and the body has bar characters somewhere.
  if (!/^[A-Z]/.test(titleLine)) return null;
  const upperCount = (titleLine.match(/[A-Z]/g) || []).length;
  if (upperCount < 3) return null;
  const hasBars = blockLines.some(line => /█/.test(line));
  if (!hasBars) return null;
  return { titleLine };
}

function parseBarData(blockLines) {
  // Each data line: <label, padded> <bars> <space> <value>
  // We extract label (text before bars) and value (text after bars).
  const data = [];
  for (const line of blockLines) {
    const match = line.match(/^(.+?)\s+(█+)\s+(.+?)\s*$/);
    if (match) {
      const label = match[1].trim();
      const barLength = match[2].length;
      const value = match[3].trim();
      data.push({ label, barLength, value });
    }
  }
  return data;
}

function generateBarChartSvg(title, data, n) {
  if (data.length === 0) return null;

  const maxBar = Math.max(...data.map(d => d.barLength));
  const barAreaW = 380;
  const labelW = 120;
  const valueW = 70;
  const rowH = 26;
  const padding = 30;

  const w = labelW + barAreaW + valueW + 2 * padding;
  const h = padding + 30 + data.length * rowH + padding + 22;

  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">\n`;
  svg += `  <rect width="${w}" height="${h}" fill="${PAPER}"/>\n`;

  // Title
  svg += `  <text x="${padding}" y="${padding + 8}" font-family='"Inter", sans-serif' font-size="14" font-weight="600" fill="${INK}">${escapeXml(title)}</text>\n`;

  // Bars
  const barsX = padding + labelW;
  let y = padding + 30;
  for (const d of data) {
    const barW = (d.barLength / maxBar) * barAreaW;
    // Label
    svg += `  <text x="${barsX - 8}" y="${y + rowH / 2 + 4}" font-family='"Inter", sans-serif' font-size="11" fill="${INK}" text-anchor="end">${escapeXml(d.label)}</text>\n`;
    // Bar (gradient-like effect via two layers — just a single maroon for clarity)
    svg += `  <rect x="${barsX}" y="${y + 4}" width="${barW.toFixed(1)}" height="${rowH - 8}" fill="${MAROON}" rx="2" ry="2"/>\n`;
    // Value
    svg += `  <text x="${barsX + barW + 8}" y="${y + rowH / 2 + 4}" font-family='"Inter", sans-serif' font-size="11" font-weight="500" fill="${INK}">${escapeXml(d.value)}</text>\n`;
    y += rowH;
  }

  // Footer (n=)
  if (n) {
    svg += `  <text x="${w - padding}" y="${h - 14}" font-family='"Inter", sans-serif' font-size="9" fill="#6b6b6b" text-anchor="end">${escapeXml(n)}</text>\n`;
  }

  svg += `</svg>\n`;
  return svg;
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/\(n=\d+\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

// ─────────────────── Walk markdown + replace ───────────────────

const md = readFileSync(SOURCE, 'utf-8');
const lines = md.split('\n');

const out = [];
let i = 0;
let chapterNum = 0;
let figureSeq = 0;
let conversions = [];

while (i < lines.length) {
  const line = lines[i];

  // Track chapter
  const chapterMatch = line.match(/^# (\d+)\./);
  if (chapterMatch) {
    chapterNum = parseInt(chapterMatch[1], 10);
    figureSeq = 0;
    out.push(line);
    i++;
    continue;
  }

  // Reset on front-matter H1
  if (/^# /.test(line) && !/^# \d+\./.test(line)) {
    chapterNum = 0;
    out.push(line);
    i++;
    continue;
  }

  // Detect fenced code block
  if (line.trim() === '```' || line.trim().startsWith('```')) {
    const startIdx = i;
    const blockLines = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '```') {
      blockLines.push(lines[i]);
      i++;
    }
    const endIdx = i; // closing ```
    i++; // skip closing fence

    if (chapterNum === 0) {
      // Front matter — keep as is
      for (let j = startIdx; j <= endIdx; j++) out.push(lines[j]);
      continue;
    }

    const detected = detectBarChart(blockLines);
    if (detected) {
      figureSeq++;
      const titleLine = detected.titleLine;
      const nMatch = titleLine.match(/\(([^)]+)\)/);
      const cleanTitle = titleLine.replace(/\([^)]*\)/, '').trim();
      const n = nMatch ? `(${nMatch[1]})` : '';
      const data = parseBarData(blockLines);

      if (data.length > 0) {
        const svg = generateBarChartSvg(titleLine, data, n);
        const slug = slugify(cleanTitle);
        const filename = `fig-ch${chapterNum}-${figureSeq}-${slug}.svg`;
        const svgPath = join(DIAGRAMS_DIR, filename);
        writeFileSync(svgPath, svg, 'utf-8');
        conversions.push({ chapter: chapterNum, title: cleanTitle, file: filename });

        // Emit replacement block
        const captionTitle = cleanTitle.split(' ').map(w =>
          w === 'NBS' || w === 'ILO' || w === 'ICLS-19' ? w : w.charAt(0) + w.slice(1).toLowerCase()
        ).join(' ');
        out.push(`<!-- caption: ${captionTitle} -->`);
        out.push('');
        out.push('<figure class="diagram">');
        out.push(`<img src="../diagrams/${filename}" alt="${captionTitle}">`);
        out.push('</figure>');
        continue;
      }
    }

    // Not a bar chart — keep original fence
    for (let j = startIdx; j <= endIdx; j++) out.push(lines[j]);
    continue;
  }

  out.push(line);
  i++;
}

writeFileSync(SOURCE, out.join('\n'), 'utf-8');

console.log(`\nConverted ${conversions.length} bar charts:`);
for (const c of conversions) {
  console.log(`  Ch ${c.chapter}: ${c.title} → ${c.file}`);
}
