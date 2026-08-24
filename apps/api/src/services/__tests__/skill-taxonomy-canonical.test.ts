import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SKILL_TAXONOMY,
  SKILL_SLUGS,
  BASELINE_SKILL_COUNT,
  SKILL_SLUGS_NOT_YET_IN_FORM,
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
const MASTER = resolve(REPO_ROOT, 'test-fixtures/oslsr_master_v3.xlsx');

/**
 * BOTH shipped forms carry a skill_list, and until 2026-08-23 only Public Core was
 * pinned — the Master form could have drifted silently. Same guard, both forms.
 */
const SHIPPED_FORMS: ReadonlyArray<readonly [string, string]> = [
  ['Public Core', PUBLIC_CORE],
  ['Master v3', MASTER],
];
const skillListOf = (path: string): string[] =>
  XlsformParserService.parseXlsxFile(readFileSync(path)).choices
    .filter((c) => c.list_name === 'skill_list')
    .map((c) => c.name);

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
  it('the first 150 entries match Appendix C row-for-row', () => {
    const appendix = parseAppendixC();
    expect(appendix, 'Appendix C should contain 150 skill rows').toHaveLength(150);
    expect(BASELINE_SKILL_COUNT).toBe(150);
    expect(SKILL_TAXONOMY.length).toBeGreaterThanOrEqual(BASELINE_SKILL_COUNT);
    expect(SKILL_SLUGS).toHaveLength(SKILL_TAXONOMY.length);

    // Label + sector + isco must equal Appendix C in the same order (the enum is
    // a faithful extraction, so a future appendix edit that isn't mirrored fails).
    // The extension block is APPENDED, so no baseline index ever shifts and this
    // parity check keeps its original strength.
    appendix.forEach((row, i) => {
      expect(SKILL_TAXONOMY[i].label, `row ${row.num} label`).toBe(row.label);
      expect(SKILL_TAXONOMY[i].sector, `row ${row.num} sector`).toBe(row.sector);
      expect(SKILL_TAXONOMY[i].isco, `row ${row.num} isco`).toBe(row.isco);
    });
  });

  it('pins the extension block beyond Appendix C (existing sectors only)', () => {
    const ext = SKILL_TAXONOMY.slice(BASELINE_SKILL_COUNT);
    expect(ext.map((s) => s.name)).toEqual([
      // farming-group intake (2026-08-23, first pass)
      'veterinary', 'feed_milling', 'agric_extension', 'beekeeping', 'snail_farming',
      // merge of docs/skills-taxonomy-isco08.md v1.0 (second pass)
      'cassava_processing', 'palm_oil_processing', 'cocoa_farming', 'farm_machinery', 'landscaping',
      'aso_oke_weaving', 'adire_dyeing', 'woodcarving', 'basket_weaving', 'bronze_casting',
      'pos_agent', 'market_trading', 'patent_medicine', 'telecom_retail', 'retail_store',
      'ecommerce_selling', 'insurance_sales',
      'iron_bending', 'ceiling_installation', 'interlocking_paving',
      'dental_technology', 'optometry', 'health_records',
      'mobile_app_dev', 'it_support',
      'vocational_instruction', 'adult_literacy',
      'driving_instruction', 'fleet_management',
      'cosmetology', 'gemstone_cutting', 'petroleum_distribution', 'lpg_operation',
      'mc_hype', 'ohs', 'mediation', 'cooperative_management',
    ]);
    // An extension may NOT invent a sector — the 20-sector count is load-bearing
    // for combobox grouping and analytics byCategory.
    const baselineSectors = new Set(
      SKILL_TAXONOMY.slice(0, BASELINE_SKILL_COUNT).map((s) => s.sector),
    );
    for (const s of ext) {
      expect(baselineSectors.has(s.sector), `extension '${s.name}' invents sector '${s.sector}'`).toBe(true);
    }
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

  it('adds exactly ~89 new slugs on top of the 61 legacy (within the baseline 150)', () => {
    const baseline = SKILL_SLUGS.slice(0, BASELINE_SKILL_COUNT);
    const added = baseline.filter((s) => !LEGACY_61_SLUGS.includes(s as never));
    expect(added).toHaveLength(BASELINE_SKILL_COUNT - 61);
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

  it('does NOT warn when skill_list carries exactly the canonical slugs', () => {
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
  it.each(SHIPPED_FORMS)('%s skill_list carries the baseline 150, all canonical', (_name, path) => {
    const formSkills = skillListOf(path);
    expect(formSkills).toHaveLength(BASELINE_SKILL_COUNT);
    // STRICT, unchanged in force: the form may contain NOTHING outside the
    // canonical set. This is the property that protects stored skills_possessed.
    const canonical = new Set<string>(SKILL_SLUGS);
    expect(formSkills.filter((s) => !canonical.has(s))).toEqual([]);
  });

  it.each(SHIPPED_FORMS)('%s: the taxonomy gap is exactly the extension block', (_name, path) => {
    // The extension slugs are selectable only once BOTH forms are re-uploaded and
    // `wizard.public_form_id` re-pinned. Until then this gap is DELIBERATE — but
    // pinned, so any OTHER slug going missing from a form still fails here.
    const formSkills = new Set(skillListOf(path));
    const missing = SKILL_SLUGS.filter((s) => !formSkills.has(s));
    expect(missing).toEqual([...SKILL_SLUGS_NOT_YET_IN_FORM]);
  });

  it('both shipped forms carry the SAME skill_list — they must not diverge', () => {
    const [publicSkills, masterSkills] = SHIPPED_FORMS.map(([, p]) => skillListOf(p).sort());
    expect(masterSkills).toEqual(publicSkills);
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
