/**
 * build-draft-triage-workbook — turn the live wizard_drafts extract into an
 * operator-decidable Excel workbook.
 *
 * WHY: 292 abandoned drafts hold 37 distinct answer keys; ~200 carry a name, NIN
 * and DOB, and 203 answered `consent_basic = yes`. Story 9-28's precedent (63
 * respondents pushed straight into the registry with no submission row) means
 * "adopt the data and TELL the person" is an established, Ministry-accepted
 * disposition — not a novel one. This workbook is how that call gets made
 * per-person, on evidence, instead of in aggregate.
 *
 * OUTPUT: a `DECISION` column with a real dropdown (ExcelJS dataValidation —
 * SheetJS community cannot do this), pre-seeded with a RECOMMENDATION derived
 * from the data, which the operator can override row by row.
 *
 * ⚠️ PII. Reads and writes ONLY under `docs/vps-snapshots/`, which is gitignored
 * ("Production data snapshots (PII) — never commit"). Do not move the output.
 *
 * USAGE
 *   pnpm --filter @oslsr/api draft:triage
 */
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SNAP = resolve(process.cwd(), '../../docs/vps-snapshots');
const IN = resolve(SNAP, 'drafts-raw-2026-08-01.json');
const OUT = resolve(SNAP, 'draft-triage-2026-08-01.xlsx');

interface Row {
  draft_id: string;
  contact_email: string;
  current_step: number | null;
  created: string;
  expires: string;
  q: Record<string, unknown> | null;
  fd: Record<string, unknown> | null;
}

const rows: Row[] = JSON.parse(readFileSync(IN, 'utf8'));

/**
 * ⚠️ DEDUPE KEYS — without these the workbook cannot see that a draft's person is
 * ALREADY in the registry, and a push would create a duplicate record. The first
 * cut of this script omitted them (the cross-check lived in an earlier SQL extract
 * and was lost when the extract was re-shaped), so it reported 0 ALREADY_REGISTERED
 * while 18 drafts in fact match an existing respondent. Caught 2026-08-01 by
 * reading the output instead of trusting the tally — handoff §2a2.
 *
 * `the63` = respondents with NO submission row: the cohort pushed straight into the
 * registry by Story 9-28's precedent. A draft matching one of THOSE is the most
 * valuable row in this sheet — it means we can now BACKFILL the rich answers behind
 * a record that was created bare.
 */
const dedupe = JSON.parse(readFileSync(resolve(SNAP, 'dedupe-keys-2026-08-01.json'), 'utf8')) as {
  all_nins: string[]; the63_nins: string[]; the63_total: number;
};
const REGISTERED = new Set(dedupe.all_nins.map((n) => String(n).trim()));
const THE63 = new Set(dedupe.the63_nins.map((n) => String(n).trim()));

const str = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);

/** Identity lives in the QUESTIONNAIRE for old drafts and in head-step fields for new ones. */
const pick = (r: Row, qKey: string, fdKey?: string): string => {
  const fromFd = fdKey ? str(r.fd?.[fdKey]).trim() : '';
  return fromFd || str(r.q?.[qKey]).trim();
};

/** ORDER MATTERS — identity first, then the Public Core block, then the 22 Master-only orphans. */
const CORE = [
  'consent_basic', 'consent_marketplace', 'consent_enriched',
  'main_occupation', 'employment_type', 'years_experience', 'skills_possessed', 'skills_other',
];
const ORPHANS = [
  'marital_status', 'education_level', 'disability_status', 'employment_status', 'temp_absent',
  'looking_for_work', 'available_for_work', 'hours_worked', 'monthly_income', 'is_head',
  'household_size', 'dependents_count', 'housing_status', 'training_interest', 'has_business',
  'business_name', 'business_reg', 'business_address', 'apprentice_count', 'bio_short',
  'portfolio_url', 'gps_location',
];

const DECISIONS = [
  'PUSH_TO_REGISTRY',   // adopt + OSLRS number + welcome/thankyou/referral + magic link to amend
  'INVITE_TO_RESUME',   // not complete enough — email a resume link instead
  'EXCLUDE_CONSENT_NO', // said no; do not process further
  'EXCLUDE_EMPTY',      // nothing usable
  'ALREADY_REGISTERED', // NIN already a full respondent — pushing would duplicate
  'BACKFILL_THE_63',    // matches a Story 9-28 bare record: enrich it, do not re-create
];

const built = rows.map((r) => {
  const firstname = pick(r, 'firstname', 'givenName');
  const surname = pick(r, 'surname', 'familyName');
  const nin = pick(r, 'nin', 'nin');
  const dob = pick(r, 'dob', 'dateOfBirth');
  const lga = pick(r, 'lga_id', 'lgaId');
  const phone = pick(r, 'phone_number', 'phone');
  const consent = str(r.q?.consent_basic).trim().toLowerCase();
  const answers = Object.keys(r.q ?? {}).length;

  // "Registerable" = the fields a respondent row actually needs.
  const hasIdentity = !!(firstname && surname);
  const registerable = hasIdentity && !!nin && !!phone && !!lga;

  const alreadyRegistered = !!nin && REGISTERED.has(nin);
  const isOneOf63 = !!nin && THE63.has(nin);

  let recommend: string;
  if (alreadyRegistered && !isOneOf63) recommend = 'ALREADY_REGISTERED';
  else if (isOneOf63) recommend = 'BACKFILL_THE_63';
  else if (consent === 'no') recommend = 'EXCLUDE_CONSENT_NO';
  else if (answers === 0 && !hasIdentity) recommend = 'EXCLUDE_EMPTY';
  else if (registerable && consent === 'yes') recommend = 'PUSH_TO_REGISTRY';
  else recommend = 'INVITE_TO_RESUME';

  const why = [
    isOneOf63 ? 'ONE OF THE 63 — bare record exists, these answers can backfill it' : '',
    alreadyRegistered && !isOneOf63 ? 'NIN already a full respondent — do NOT duplicate' : '',
    consent === 'no' ? 'consent_basic=NO' : '',
    consent === '' ? 'consent BLANK' : '',
    !firstname ? 'no first name' : '',
    !surname ? 'no surname' : '',
    !nin ? 'no NIN' : '',
    !lga ? 'no LGA' : '',
    !phone ? 'no phone' : '',
  ].filter(Boolean).join('; ') || 'all required fields present';

  return { r, firstname, surname, nin, dob, lga, phone, consent, answers, registerable,
           recommend, why, alreadyRegistered, isOneOf63 };
});

const wb = new ExcelJS.Workbook();
wb.creator = 'OSLRS adjudication — draft triage 2026-08-01';
const ws = wb.addWorksheet('Draft triage', { views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] });

const headers = [
  'DECISION', 'RECOMMENDED', 'WHY', 'answers', 'already_registered', 'one_of_the_63',
  'first_name', 'surname', 'nin', 'dob', 'lga', 'phone', 'contact_email',
  'consent_basic', 'current_step', 'created', 'expires',
  ...CORE.filter((c) => c !== 'consent_basic'),
  ...ORPHANS,
  'draft_id',
];
ws.addRow(headers);
ws.getRow(1).font = { bold: true };
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };

for (const b of built) {
  ws.addRow([
    b.recommend, b.recommend, b.why, b.answers,
    b.alreadyRegistered ? 'YES' : '', b.isOneOf63 ? 'YES' : '',
    b.firstname, b.surname, b.nin, b.dob, b.lga, b.phone, b.r.contact_email,
    b.consent, b.r.current_step ?? '', b.r.created, b.r.expires,
    ...CORE.filter((c) => c !== 'consent_basic').map((k) => str(b.r.q?.[k])),
    ...ORPHANS.map((k) => str(b.r.q?.[k])),
    b.r.draft_id,
  ]);
}

// The dropdown — this is the whole point of using ExcelJS over SheetJS.
for (let i = 2; i <= built.length + 1; i++) {
  ws.getCell(`A${i}`).dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`"${DECISIONS.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Pick one',
    error: 'Choose a decision from the list.',
  };
}

ws.columns.forEach((c, i) => {
  c.width = i === 2 ? 42 : i === 0 || i === 1 ? 22 : Math.min(24, Math.max(11, String(headers[i]).length + 3));
});
ws.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };

// A second sheet so the operator sees the shape before deciding 292 rows.
const sum = wb.addWorksheet('Summary');
const tally = DECISIONS.map((d) => [d, built.filter((b) => b.recommend === d).length]);
sum.addRow(['RECOMMENDATION', 'drafts']);
sum.getRow(1).font = { bold: true };
tally.forEach((t) => sum.addRow(t));
sum.addRow([]);
sum.addRow(['Total drafts', built.length]);
sum.addRow(['With >=1 answer', built.filter((b) => b.answers > 0).length]);
sum.addRow(['Registerable (name+NIN+phone+LGA)', built.filter((b) => b.registerable).length]);
sum.addRow(['consent_basic = yes', built.filter((b) => b.consent === 'yes').length]);
sum.addRow(['consent_basic = no', built.filter((b) => b.consent === 'no').length]);
sum.addRow(['consent blank', built.filter((b) => b.consent === '').length]);
sum.addRow([]);
sum.addRow(['NIN already a full respondent', built.filter((b) => b.alreadyRegistered && !b.isOneOf63).length]);
sum.addRow(['Matches one of the 63 (backfillable)', built.filter((b) => b.isOneOf63).length]);
sum.addRow(['The 63 total (bare records, no submission)', dedupe.the63_total]);
sum.getColumn(1).width = 40;
sum.getColumn(2).width = 12;

await wb.xlsx.writeFile(OUT);
console.log(`✅ ${OUT}`);
console.log(`   ${built.length} drafts`);
for (const [d, n] of tally) console.log(`   ${String(n).padStart(4)}  ${d}`);
