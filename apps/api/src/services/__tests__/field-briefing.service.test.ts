/**
 * Story 13-59 (AC5.5, AC8.1, Task 5) — the briefing must not be able to go
 * stale.
 *
 * AC5.5's warning: the briefing is Markdown and a PDF *will* drift from it the
 * moment someone edits the `.md`. *A stale briefing in the field is worse than
 * no briefing, because it will be believed.*
 *
 * The implementation removes the drift instead of policing it — the PDF is
 * rendered from the `.md` on every request, so there is no second artefact to
 * fall behind. These tests exist to prove that claim rather than assert it:
 * that the live file is what gets read, and that the output actually tracks the
 * input. A guard that cannot fail proves nothing (§2a2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import {
  BRIEFING_RELATIVE_PATH,
  isBriefingAvailable,
  parseBriefingMarkdown,
  readBriefingMarkdown,
  renderBriefingPdf,
  resolveBriefingPath,
} from '../field-briefing.service.js';

describe('Story 13-59 — the briefing source is resolved, not guessed', () => {
  /**
   * The marker walk-up is the part most likely to break silently: `src/` (tsx,
   * here) and `dist/` (node, production) sit at different depths, and a
   * hardcoded `../../../..` would be correct in exactly one of them. This test
   * runs from `src/`; production correctness rests on the walk-up finding
   * `pnpm-workspace.yaml` rather than on a counted path.
   */
  it('locates the real file in the repo', () => {
    const path = resolveBriefingPath();

    expect(path).toBeTruthy();
    expect(existsSync(path!)).toBe(true);
    expect(path!.replace(/\\/g, '/')).toContain(BRIEFING_RELATIVE_PATH);
    expect(isBriefingAvailable()).toBe(true);
  });

  /**
   * ⭐ THE DRIFT ASSERTION. What the service reads is byte-identical to what is
   * on disk right now — not a copy, not a snapshot, not a build artefact. This
   * is what makes "render in CI or guard the checked-in PDF" unnecessary: there
   * is nothing checked in to guard.
   */
  it('reads the LIVE file, byte for byte', () => {
    const fromService = readBriefingMarkdown();
    const fromDisk = readFileSync(resolveBriefingPath()!, 'utf8');

    expect(fromService).toBe(fromDisk);
  });

  /**
   * 13-4 R8, and the reason this document is printed at all. If this line ever
   * disappears from the briefing the test fails LOUDLY — which is the correct
   * outcome, because it should not disappear by accident. A deliberate rewording
   * updates this expectation in the same commit, which is exactly the review
   * moment the check exists to force.
   */
  it('the live briefing still carries the read-out rule (13-4 R8)', () => {
    const lines = parseBriefingMarkdown(readBriefingMarkdown());
    const text = lines.map((l) => l.text).join('\n');

    expect(text).toContain('DO NOT READ OUT A NUMBER UNTIL THE APP SHOWS YOU ONE');
    // And it must still be rendered as a QUOTE — the briefing's own way of
    // shouting. Demoting it to body text would bury the one rule that matters.
    expect(lines.some((l) => l.style === 'quote' && l.text.includes('DO NOT READ OUT'))).toBe(true);
  });
});

describe('Story 13-59 — the Markdown subset', () => {
  it('maps headings, bullets, quotes and rules', () => {
    const lines = parseBriefingMarkdown(
      ['# Title', '## Section', '### Sub', '- a bullet', '> quoted', '---', 'plain'].join('\n'),
    );

    expect(lines.map((l) => l.style)).toEqual([
      'h1', 'h2', 'h3', 'bullet', 'quote', 'rule', 'body',
    ]);
    expect(lines[3].text).toBe('a bullet');
  });

  it('strips inline markers but keeps every word', () => {
    const [line] = parseBriefingMarkdown('**bold** and *italic* and `code`');
    expect(line.text).toBe('bold and italic and code');
  });

  it('keeps a quoted heading as a quote, not a heading', () => {
    const [line] = parseBriefingMarkdown('> ### ⚠️ DO NOT READ OUT');
    expect(line.style).toBe('quote');
    expect(line.text).toContain('DO NOT READ OUT');
  });
});

describe('Story 13-59 — the rendered PDF', () => {
  it('AC8.1 — produces a PDF that opens', async () => {
    const pdf = await renderBriefingPdf();

    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('EOF');
  });

  /**
   * The output TRACKS the input. Without this the drift claim is untestable:
   * a renderer that ignored its argument and returned a fixed buffer would pass
   * every other test in this file.
   */
  it('a change in the Markdown changes the PDF', async () => {
    const [a, b] = await Promise.all([
      renderBriefingPdf('# Briefing\n\nOriginal text.'),
      renderBriefingPdf('# Briefing\n\nEdited text, materially different and longer.'),
    ]);

    expect(a.equals(b)).toBe(false);
  });
});
