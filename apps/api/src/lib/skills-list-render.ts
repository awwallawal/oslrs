/**
 * Pure rendering for the enumerator skills list — NO side effects.
 *
 * ⛔ WHY THIS IS A SEPARATE MODULE FROM THE GENERATOR SCRIPT.
 *
 * These functions used to live in `scripts/generate-skills-list.ts`, which writes
 * `docs/skills-list-for-enumerators.md` at module top level. The drift test imported
 * them from there — and importing a module RUNS it, so the act of loading the test's
 * dependency REGENERATED the very file the test then compared against.
 *
 * The guard could not fail. It was verified by hand-editing the committed doc to
 * introduce drift and re-running: 5/5 passed, twice, with the injected string gone
 * from disk afterwards. The "mysteriously reverted" edit was the test rewriting it.
 *
 * A test that repairs its own subject before asserting on it is not a guard, it is a
 * regeneration step with opinions. So: pure logic lives here, the script does I/O and
 * imports this, and the test imports ONLY this.
 * → [[pattern-test-that-passes-over-a-hole]]
 */

export type SkillRow = { name: string; label: string; sector: string };

/** The one line that must be true on paper as well as on screen. */
export const NOT_A_LIMIT =
  'This list is a HELP, not a limit. If someone\'s trade is not here, still register them — '
  + 'type what they actually do. The form accepts a free-text trade and it is counted, never '
  + 'dropped. Blue-collar and white-collar both belong here: barbers, vulcanizers, welders and '
  + 'caterers as much as teachers and accountants.';

/** Sectors A→Z, skills A→Z within each. Deterministic, so a diff shows real changes only. */
export function groupBySector(rows: readonly SkillRow[]): Array<[string, SkillRow[]]> {
  const by = new Map<string, SkillRow[]>();
  for (const r of rows) {
    if (!by.has(r.sector)) by.set(r.sector, []);
    by.get(r.sector)!.push(r);
  }
  for (const list of by.values()) list.sort((a, b) => a.label.localeCompare(b.label));
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** The committed Markdown, byte-for-byte. */
export function renderMarkdown(rows: readonly SkillRow[]): string {
  const sectors = groupBySector(rows);
  const out: string[] = [];
  out.push('# Skills an enumerator can record');
  out.push('');
  out.push('<!-- GENERATED FILE — do not edit by hand.');
  out.push('     Source: packages/types/src/skills-taxonomy.ts');
  out.push('     Regenerate: pnpm --filter @oslsr/api exec tsx scripts/generate-skills-list.ts');
  out.push('     Guarded by: apps/api/src/services/__tests__/skills-list.drift.test.ts -->');
  out.push('');
  out.push(`**${rows.length} skills across ${sectors.length} groups.**`);
  out.push('');
  out.push(`> ⭐ **${NOT_A_LIMIT}**`);
  out.push('');
  for (const [sector, list] of sectors) {
    out.push(`## ${sector} (${list.length})`);
    out.push('');
    for (const r of list) out.push(`- ${r.label}`);
    out.push('');
  }
  return out.join('\n');
}
