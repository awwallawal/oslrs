/**
 * Generate the enumerator-facing skills list — Markdown (diffable) + PDF (printable).
 *
 *   pnpm --filter @oslsr/api exec tsx scripts/generate-skills-list.ts
 *
 * ── Why this is a generator and not two hand-maintained files ────────────────
 * A printed list that has drifted from the form is WORSE than no list: an enumerator
 * in the field trusts the paper in their hand over the screen, and offers a trade the
 * form cannot record. That is not hypothetical here — `docs/launch-campaign/
 * association-data-sheet-PRINT.html` drifted from its own spec when Appendix B gained
 * "Tiling / Terrazzo / Marble" on 2026-07-20 and the print artifact was never
 * regenerated. The ASNAT tiler intake then produced **48 distinct free-text spellings
 * of one trade**, because the controlled list did not contain the trade being
 * collected. This script exists so that cannot happen to the skills list.
 *
 * ── Why BOTH formats ─────────────────────────────────────────────────────────
 * The PDF is what gets handed out. The Markdown is what a reviewer can actually read
 * in a diff — a committed PDF is an opaque blob, so a silent taxonomy change would
 * show as "binary files differ" and nobody would look. `skills-list.drift.test.ts`
 * asserts the committed Markdown still matches `SKILL_TAXONOMY`, so regenerating is
 * not optional: forget it and CI reddens.
 *
 * ⚠️ `scripts/` sits OUTSIDE tsconfig, so `tsc` does not check this file. RUN it.
 *
 * ⛔ The rendering lives in `src/lib/skills-list-render.ts`, NOT here, and that split is
 * load-bearing: this file writes files at module top level, so a test importing it would
 * REGENERATE the doc it is about to assert on. That exact bug shipped and was caught by
 * hand-injecting drift and watching the guard pass anyway. Keep I/O here, logic there.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { SKILL_TAXONOMY } from '@oslsr/types';
import { renderMarkdown, groupBySector, NOT_A_LIMIT, type SkillRow } from '../src/lib/skills-list-render.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', '..', '..', 'docs');
const MD_PATH = join(DOCS, 'skills-list-for-enumerators.md');
const PDF_PATH = join(DOCS, 'OSLRS-skills-list-for-enumerators.pdf');

function writePdf(rows: readonly SkillRow[]): void {
  const sectors = groupBySector(rows);
  const MAROON = '#9C1E23';
  const INK = '#1a1a1a';
  const MUTED = '#666666';

  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 46, right: 46 } });
  doc.pipe(createWriteStream(PDF_PATH));

  const W = doc.page.width - 92;
  const COL_W = (W - 18) / 2;

  const header = () => {
    doc.rect(0, 0, doc.page.width, 78).fill(MAROON);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17)
      .text('Oyo State Labour Registry', 46, 22);
    doc.font('Helvetica').fontSize(11)
      .text(`Skills you can record in the field — all ${rows.length}, in ${sectors.length} groups`, 46, 46);
    doc.fillColor(INK);
  };

  header();
  doc.y = 96;

  doc.roundedRect(46, doc.y, W, 62, 4).fillAndStroke('#FFF8E1', '#E6C200');
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
    .text('This list is a HELP, not a limit.', 58, doc.y + 10, { width: W - 24 });
  doc.font('Helvetica').fontSize(9.5).fillColor(INK)
    .text(NOT_A_LIMIT.replace('This list is a HELP, not a limit. ', ''), 58, doc.y + 4, {
      width: W - 24, lineGap: 1.5,
    });
  doc.y += 22;

  let col = 0;
  const startY = doc.y;
  let colY = doc.y;

  const nextColumn = () => {
    if (col === 0) { col = 1; colY = startY; return; }
    doc.addPage(); header(); col = 0; colY = 96;
  };

  for (const [sector, list] of sectors) {
    if (colY + 30 + list.length * 11.5 >= doc.page.height - 58) nextColumn();
    const x = 46 + col * (COL_W + 18);

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MAROON)
      .text(`${sector.toUpperCase()}  (${list.length})`, x, colY, { width: COL_W });
    colY = doc.y + 2;
    doc.moveTo(x, colY).lineTo(x + COL_W, colY).lineWidth(0.6).strokeColor(MAROON).stroke();
    colY += 4;

    for (const r of list) {
      if (colY > doc.page.height - 62) {
        nextColumn();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
          .text(`${sector} (cont.)`, 46 + col * (COL_W + 18), colY, { width: COL_W });
        colY = doc.y + 3;
      }
      doc.font('Helvetica').fontSize(8.6).fillColor(INK)
        .text('•  ' + r.label, 46 + col * (COL_W + 18), colY, { width: COL_W - 4 });
      colY = doc.y + 1.5;
    }
    colY += 7;
  }

  doc.end();
}

const rows = SKILL_TAXONOMY as unknown as SkillRow[];
if (rows.length < 150) throw new Error(`taxonomy looks wrong: ${rows.length} entries`);

writeFileSync(MD_PATH, renderMarkdown(rows) + '\n', 'utf8');
writePdf(rows);

console.log(`skills: ${rows.length} across ${groupBySector(rows).length} sectors`);
console.log('markdown:', MD_PATH);
console.log('pdf     :', PDF_PATH);
