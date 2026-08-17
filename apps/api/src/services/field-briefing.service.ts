/**
 * Story 13-59 (AC5.1, AC5.5, Task 5) — the enumerator field briefing, as a PDF
 * an officer can put on their phone before they lose signal.
 *
 * ## The drift problem, and why this design removes it rather than guarding it
 *
 * AC5.5 states it plainly: the briefing is Markdown
 * (`docs/runbooks/enumerator-field-briefing.md`), and a PDF **will** drift from
 * it the moment someone edits the `.md` —
 * [[pattern-a-record-about-the-work-is-not-the-work]]. *A stale briefing in the
 * field is worse than no briefing, because it will be believed.* The AC offers
 * two remedies: render in CI, or check the PDF in behind a guard that fails
 * when the `.md` changes and the PDF does not.
 *
 * This module takes a third option that makes both unnecessary: **render the
 * PDF from the Markdown at request time.** There is no second artefact to drift,
 * so there is no drift to detect. That is strictly stronger than a guard,
 * because a guard is a check that can be cached, skipped, or ordered below
 * something broader (Pitfall #45 / #47), while an absent artefact cannot go
 * stale at all.
 *
 * ⚠️ The cost of the choice, stated honestly: the API now depends on a file
 * outside its own package at RUNTIME. That is safe here for a specific,
 * checked reason — production deploys by `git pull origin main` into
 * `/root/oslrs` and runs `node dist/index.js` from inside that same tree, so
 * `docs/` is always present beside the code that reads it. The resolver below
 * walks up to the workspace marker rather than counting `../`s, so it does not
 * care how deep `dist/` nests. `assertBriefingAvailable()` exists so a missing
 * file is a loud, specific error rather than a 500 with a stack trace.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { AppError } from '@oslsr/utils';

const BRAND_MAROON = '#9C1E23';
const BODY_TEXT = '#1a1a1a';
const MUTED_TEXT = '#555555';

/** Path of the briefing RELATIVE to the workspace root — one definition. */
export const BRIEFING_RELATIVE_PATH = 'docs/runbooks/enumerator-field-briefing.md';

/**
 * Walk up from this module until the workspace marker is found.
 *
 * ⚠️ A marker walk-up, NOT a hardcoded `../../../..`. `db/index.ts:11` still
 * carries the hardcoded form (13-26 exists to replace it), and the reason it is
 * a story at all is that the correct number of `../`s differs between `src/`
 * (tsx, dev + tests) and `dist/` (node, production). Counting them means the
 * path is right in exactly one of those two places.
 */
function findWorkspaceRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Absolute path to the briefing Markdown, or null when it cannot be located.
 *
 * ⚠️ MEMOISED (review H2). The walk-up does one `existsSync` per directory
 * level plus one for the file itself, and `isBriefingAvailable()` is called on
 * every `/users/artefacts` request — which is every dashboard page load, for
 * every authenticated person on the platform. Those are SYNCHRONOUS stats on
 * the event loop that also runs all ten BullMQ workers in this process
 * (`app.ts:103`), so they are not free the way filesystem calls usually look.
 *
 * Safe to cache for the process lifetime: the file arrives with the deploy
 * (`git pull` into `/root/oslrs`) and PM2 restarts the API immediately after,
 * so the answer cannot change under a running process. `resetBriefingPathCache`
 * exists for tests that move the file around.
 *
 * ⚠️ The MARKDOWN itself is deliberately NOT cached — `readBriefingMarkdown`
 * still reads the live file on every request. Caching the path removes the
 * repeated stat; caching the content would reintroduce exactly the drift this
 * module exists to make impossible.
 */
let cachedPath: string | null | undefined;

export function resolveBriefingPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;

  const here = dirname(fileURLToPath(import.meta.url));
  const root = findWorkspaceRoot(here);
  if (!root) {
    cachedPath = null;
    return cachedPath;
  }

  const path = join(root, BRIEFING_RELATIVE_PATH);
  cachedPath = existsSync(path) ? path : null;
  return cachedPath;
}

/** Test-only: forget the memoised path. */
export function resetBriefingPathCache(): void {
  cachedPath = undefined;
}

/**
 * Read the briefing source.
 *
 * @throws AppError — loudly, and naming the file. A briefing that silently
 *   renders as an empty PDF is the failure mode this whole story exists to
 *   prevent: the officer downloads something, believes they are equipped, and
 *   finds out at a household door.
 */
export function readBriefingMarkdown(): string {
  const path = resolveBriefingPath();
  if (!path) {
    throw new AppError(
      'BRIEFING_UNAVAILABLE',
      `The field briefing source (${BRIEFING_RELATIVE_PATH}) could not be found on this server. ` +
        'The briefing is rendered from that file at request time; without it there is nothing to send.',
      500,
    );
  }

  const markdown = readFileSync(path, 'utf8');
  if (!markdown.trim()) {
    throw new AppError(
      'BRIEFING_UNAVAILABLE',
      `The field briefing source (${BRIEFING_RELATIVE_PATH}) is empty.`,
      500,
    );
  }
  return markdown;
}

/** True when the briefing can be served. Used by the artefact-state endpoint. */
export function isBriefingAvailable(): boolean {
  return resolveBriefingPath() !== null;
}

interface Line {
  text: string;
  style: 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'body' | 'rule' | 'blank';
}

/**
 * A deliberately small Markdown subset — headings, bullets, block quotes,
 * horizontal rules, and bold/emphasis stripped to plain text.
 *
 * ⚠️ NOT a general Markdown renderer, and it must not become one. The input is
 * ONE known 112-line document that we control, and the output is read by a
 * field officer on a phone. Pulling in a full Markdown→PDF stack to render one
 * in-repo file would add a dependency, a CVE surface and an OSV-gate liability
 * (§2e) to solve a problem we do not have.
 */
export function parseBriefingMarkdown(markdown: string): Line[] {
  const lines: Line[] = [];

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      lines.push({ text: '', style: 'blank' });
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      lines.push({ text: '', style: 'rule' });
      continue;
    }

    // A quoted heading (`> ### ⚠️ DO NOT READ OUT …`) is the briefing's own way
    // of shouting. Keep it as a quote so it stays visually distinct — that
    // block IS 13-4 R8 and is the single most important thing in the document.
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      lines.push({ text: stripInline(quote[1].replace(/^#{1,6}\s*/, '')), style: 'quote' });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      lines.push({
        text: stripInline(heading[2]),
        style: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      lines.push({ text: stripInline(bullet[1]), style: 'bullet' });
      continue;
    }

    lines.push({ text: stripInline(line), style: 'body' });
  }

  return lines;
}

/** Strip the inline markers we do not render, keeping the words intact. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .trim();
}

/**
 * Render the briefing to an A4 PDF.
 *
 * @param markdown defaults to the live file, so callers cannot accidentally
 *   render a stale copy they are holding.
 */
export function renderBriefingPdf(markdown: string = readBriefingMarkdown()): Promise<Buffer> {
  const parsed = parseBriefingMarkdown(markdown);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', () =>
        reject(new AppError('PDF_GENERATION_ERROR', 'Failed to generate the field briefing PDF', 500)),
      );

      for (const line of parsed) {
        switch (line.style) {
          case 'blank':
            doc.moveDown(0.4);
            break;
          case 'rule':
            doc
              .moveDown(0.3)
              .strokeColor('#dddddd')
              .lineWidth(0.5)
              .moveTo(doc.page.margins.left, doc.y)
              .lineTo(doc.page.width - doc.page.margins.right, doc.y)
              .stroke()
              .moveDown(0.5);
            break;
          case 'h1':
            doc.fillColor(BRAND_MAROON).font('Helvetica-Bold').fontSize(20).text(line.text).moveDown(0.4);
            break;
          case 'h2':
            doc.fillColor(BRAND_MAROON).font('Helvetica-Bold').fontSize(15).text(line.text).moveDown(0.3);
            break;
          case 'h3':
            doc.fillColor(BODY_TEXT).font('Helvetica-Bold').fontSize(12).text(line.text).moveDown(0.2);
            break;
          case 'quote':
            doc
              .fillColor(BRAND_MAROON)
              .font('Helvetica-Bold')
              .fontSize(11)
              .text(line.text, { indent: 12 })
              .moveDown(0.2);
            break;
          case 'bullet':
            doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10.5).text(`•  ${line.text}`, { indent: 10 });
            break;
          default:
            doc.fillColor(BODY_TEXT).font('Helvetica').fontSize(10.5).text(line.text);
        }
      }

      doc
        .moveDown(1)
        .fillColor(MUTED_TEXT)
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(
          `Rendered from ${BRIEFING_RELATIVE_PATH} — Oyo State Labour & Skills Registry`,
          { align: 'center' },
        );

      doc.end();
    } catch (err) {
      reject(
        err instanceof AppError
          ? err
          : new AppError('PDF_GENERATION_ERROR', 'Failed to generate the field briefing PDF', 500),
      );
    }
  });
}
