import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SKILL_TAXONOMY,
  SKILL_SLUGS,
  type ParsedXlsform,
} from '@oslsr/types';
import { XlsformParserService } from '../xlsform-parser.service.js';

/**
 * Story 13-20 — pin the canonical 150-skill taxonomy and its guard.
 *
 * skill_list previously shipped only 61 options while the validator + the
 * baseline study expect 150. The canonical 150 live in Appendix C; this suite is
 * the drift guard that keeps SKILL_TAXONOMY == Appendix C and preserves the 61
 * legacy slugs so prior `skills_possessed` data stays joinable (AC3), mirroring
 * the 13-16 lga_list canonical pin.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');
const APPENDIX_C = resolve(
  REPO_ROOT,
  '_bmad-output/baseline-report/appendices/appendix-c-skills-taxonomy.md',
);
const PUBLIC_CORE = resolve(REPO_ROOT, 'test-fixtures/oslsr-public-core-v1.xlsx');

/** Parse the `| # | Skill | Sector | ISCO-08 |` rows out of Appendix C. */
function parseAppendixC(): Array<{ num: number; label: string; sector: string; isco: string }> {
  const md = readFileSync(APPENDIX_C, 'utf8');
  const rows: Array<{ num: number; label: string; sector: string; isco: string }> = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*$/);
    if (m) rows.push({ num: Number(m[1]), label: m[2].trim(), sector: m[3].trim(), isco: m[4].trim() });
  }
  return rows;
}

// The 61 slugs that shipped in the forms before 13-20 — extracted from the
// pre-expansion choices. AC3: every one MUST survive in the 150 so historical
// skills_possessed values still resolve.
const LEGACY_61_SLUGS = [
  'carpentry', 'plumbing', 'electrical', 'welding', 'masonry', 'painting', 'tiling', 'roofing',
  'hvac', 'solar', 'aluminum', 'auto_mechanic', 'auto_electrician', 'panel_beating', 'vulcanizing',
  'motorcycle_repair', 'heavy_equipment', 'generator_repair', 'tailoring', 'fashion_design',
  'hairdressing', 'barbing', 'makeup', 'shoe_making', 'bag_making', 'jewelry', 'farming', 'livestock',
  'fishery', 'catering', 'baking', 'food_processing', 'butchery', 'software_dev', 'web_design',
  'graphic_design', 'video_editing', 'data_entry', 'accounting', 'office_admin', 'computer_repair',
  'social_media', 'nursing', 'pharmacy_tech', 'lab_tech', 'community_health', 'caregiving',
  'physiotherapy', 'teaching', 'driving', 'security', 'event_planning', 'photography', 'cleaning',
  'laundry', 'furniture', 'upholstery', 'pottery', 'blacksmith', 'weaving', 'sign_writing',
] as const;

describe('Story 13-20 — canonical Skill taxonomy (AC1 parity)', () => {
  it('SKILL_TAXONOMY has exactly 150 skills matching Appendix C row-for-row', () => {
    const appendix = parseAppendixC();
    expect(appendix, 'Appendix C should contain 150 skill rows').toHaveLength(150);
    expect(SKILL_TAXONOMY).toHaveLength(150);
    expect(SKILL_SLUGS).toHaveLength(150);

    // Label + sector + isco must equal Appendix C in the same order (the enum is
    // a faithful extraction, so a future appendix edit that isn't mirrored fails).
    appendix.forEach((row, i) => {
      expect(SKILL_TAXONOMY[i].label, `row ${row.num} label`).toBe(row.label);
      expect(SKILL_TAXONOMY[i].sector, `row ${row.num} sector`).toBe(row.sector);
      expect(SKILL_TAXONOMY[i].isco, `row ${row.num} isco`).toBe(row.isco);
    });
  });

  it('every slug is unique and snake_case', () => {
    expect(new Set(SKILL_SLUGS).size).toBe(SKILL_SLUGS.length);
    for (const slug of SKILL_SLUGS) {
      expect(slug, `slug '${slug}' must be lowercase snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('spans the 20 canonical sectors', () => {
    const sectors = new Set(SKILL_TAXONOMY.map((s) => s.sector));
    expect(sectors.size).toBe(20);
  });
});

describe('Story 13-20 — additive slugs (AC3)', () => {
  it('preserves all 61 legacy form slugs so prior skills_possessed stays joinable', () => {
    const slugSet = new Set(SKILL_SLUGS);
    const dropped = LEGACY_61_SLUGS.filter((s) => !slugSet.has(s));
    expect(dropped, `legacy slugs dropped from the 150: ${dropped.join(', ')}`).toEqual([]);
  });

  it('adds exactly ~89 new slugs on top of the 61 legacy (150 total)', () => {
    const added = SKILL_SLUGS.filter((s) => !LEGACY_61_SLUGS.includes(s as never));
    expect(added).toHaveLength(150 - 61);
  });

  it('reuses the legacy `security` slug for Appendix-C #116 (label refined, value stable)', () => {
    const security = SKILL_TAXONOMY.find((s) => s.name === 'security');
    expect(security).toBeDefined();
    // slug preserved (data-safe) but label follows the canonical source.
    expect(security!.label).toBe('Private Security Guard');
  });
});

describe('Story 13-20 — parser canonical-value pin (AC1 guard)', () => {
  const base = (skillNames: string[]): ParsedXlsform => ({
    survey: [
      { type: 'select_multiple skill_list', name: 'skills_possessed', label: 'Skills', required: 'yes' },
    ],
    choices: skillNames.map((name) => ({ list_name: 'skill_list', name, label: name })),
    settings: { form_id: 'f', version: '1', form_title: 'T' },
  });

  it('does NOT warn when skill_list carries exactly the canonical 150', () => {
    const issues = XlsformParserService.validateSchema(base([...SKILL_SLUGS]));
    const skillIssues = issues.filter((i) => i.field === 'skill_list');
    expect(skillIssues, JSON.stringify(skillIssues, null, 2)).toHaveLength(0);
  });

  it('warns on a non-canonical skill_list value', () => {
    const issues = XlsformParserService.validateSchema(base(['carpentry', 'not_a_real_skill']));
    const canonicalWarnings = issues.filter(
      (i) => i.field === 'skill_list' && i.message.includes('not a canonical'),
    );
    expect(canonicalWarnings.length).toBeGreaterThanOrEqual(1);
    expect(canonicalWarnings.map((w) => w.message).join(' ')).toContain("'not_a_real_skill'");
  });
});

describe('Story 13-20 — shipped Public Core carries the 150 (AC2/AC4)', () => {
  it('the Public Core skill_list equals the canonical SKILL_SLUGS set', () => {
    const parsed = XlsformParserService.parseXlsxFile(readFileSync(PUBLIC_CORE));
    const formSkills = parsed.choices
      .filter((c) => c.list_name === 'skill_list')
      .map((c) => c.name);
    expect(formSkills).toHaveLength(150);
    expect(new Set(formSkills)).toEqual(new Set(SKILL_SLUGS));
  });

  it('validate() no longer emits the skill_list minimum/canonical warning (AC4)', () => {
    const parsed = XlsformParserService.parseXlsxFile(readFileSync(PUBLIC_CORE));
    const result = XlsformParserService.validate(parsed);
    expect(result.errors).toHaveLength(0);
    const skillWarnings = result.warnings.filter((w) => w.field === 'skill_list');
    expect(skillWarnings, JSON.stringify(skillWarnings, null, 2)).toHaveLength(0);
    // Only the two deferred conditional-field warnings should remain.
    const remaining = result.warnings.map((w) => String(w.field)).sort();
    expect(remaining).toEqual(['apprentice_count', 'business_address']);
  });
});
