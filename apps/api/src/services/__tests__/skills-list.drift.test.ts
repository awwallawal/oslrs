/**
 * The committed enumerator skills list must still match `SKILL_TAXONOMY`.
 *
 * ── Why this test exists, with the receipt ───────────────────────────────────
 * A printed list that has drifted from the form is WORSE than no list: an enumerator
 * in the field trusts the paper in their hand over the screen, and offers a trade the
 * form cannot record.
 *
 * That is not hypothetical. `docs/launch-campaign/association-data-sheet-PRINT.html`
 * drifted from its own spec when Appendix B gained "Tiling / Terrazzo / Marble" on
 * 2026-07-20 and the print artifact was never regenerated. The ASNAT tiler intake then
 * produced **48 distinct free-text spellings of one trade** — verbatim the "three
 * clusters of one" the spec warns about — because the controlled list did not contain
 * the trade being collected. The cost was measured, not imagined.
 *
 * ⚠️ THIS GUARDS THE MARKDOWN, NOT THE PDF, AND THAT IS DELIBERATE — say it plainly so
 * nobody assumes more coverage than exists. A PDF is a binary blob: a diff shows
 * "binary files differ" and no reviewer reads further, and asserting on its bytes would
 * fail on every regeneration (timestamps, object ordering) while proving nothing about
 * its content. The Markdown is generated from the SAME `renderMarkdown` the PDF's data
 * comes from, so a taxonomy change that reddens this test is a taxonomy change the PDF
 * also needs. **When this fails, regenerate BOTH** — the command is in the failure
 * message and in the file's own header.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_TAXONOMY } from '@oslsr/types';
// ⛔ Imported from the PURE module, never from `scripts/generate-skills-list.ts`. That script
// writes the doc at module top level, so importing it here would regenerate the file this test
// compares against — which is exactly the bug that made an earlier version of this guard
// unfailable. See the header of skills-list-render.ts.
import { renderMarkdown, groupBySector } from '../../lib/skills-list-render.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MD_PATH = join(HERE, '..', '..', '..', '..', '..', 'docs', 'skills-list-for-enumerators.md');

const REGEN = 'pnpm --filter @oslsr/api exec tsx scripts/generate-skills-list.ts';

describe('enumerator skills list — committed copy vs the taxonomy', () => {
  it('⭐ the committed Markdown is exactly what the taxonomy generates', () => {
    const committed = readFileSync(MD_PATH, 'utf8');
    const expected = renderMarkdown(SKILL_TAXONOMY as never) + '\n';

    // Compare the whole document, not just the count: a skill RENAMED or moved to a
    // different sector changes neither the total nor the sector count, and is exactly
    // the drift a headline number would wave through.
    expect(
      committed === expected
        ? 'match'
        : `docs/skills-list-for-enumerators.md is STALE. Regenerate BOTH artifacts:\n  ${REGEN}`,
    ).toBe('match');
  });

  it('every skill in the taxonomy appears in the committed list', () => {
    const committed = readFileSync(MD_PATH, 'utf8');
    const missing = (SKILL_TAXONOMY as ReadonlyArray<{ label: string }>)
      .filter((s) => !committed.includes(`- ${s.label}`))
      .map((s) => s.label);
    // Named, not counted — "3 missing" sends someone hunting; the names do not.
    expect(missing).toEqual([]);
  });

  it('the list offers NOTHING the taxonomy does not contain', () => {
    // The dangerous direction. A stale entry is a trade an enumerator will offer and
    // the form cannot record — precisely the Appendix B failure, inverted.
    const committed = readFileSync(MD_PATH, 'utf8');
    const known = new Set((SKILL_TAXONOMY as ReadonlyArray<{ label: string }>).map((s) => s.label));
    const listed = [...committed.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
    expect(listed.filter((l) => !known.has(l))).toEqual([]);
  });

  it('keeps the "not a limit" instruction, which is the most load-bearing line on the page', () => {
    // An enumerator who believes the list is exhaustive will turn away a real worker
    // whose trade is missing. That is a person lost from the register, not a formatting
    // problem, so the sentence is asserted rather than trusted to survive an edit.
    const committed = readFileSync(MD_PATH, 'utf8');
    expect(committed).toContain('not a limit');
    expect(committed).toContain('still register them');
    expect(committed).toContain('free-text');
  });

  it('is grouped and ordered deterministically, so a diff shows real changes only', () => {
    const sectors = groupBySector(SKILL_TAXONOMY as never);
    const names = sectors.map(([s]) => s);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const [, list] of sectors) {
      const labels = list.map((r) => r.label);
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    }
  });
});
