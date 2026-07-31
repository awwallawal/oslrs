/**
 * form-diff — compare two XLSForm workbooks BEFORE a re-pin.
 *
 * WHY THIS EXISTS (Pitfall #46, and the 2026-07-31 Master→Public-Core analysis).
 * A form re-pin changes what the public wizard asks AND how many steps it has, and
 * every live wizard draft was answered against the form that was pinned at the time.
 * Pitfall #46 tells you the step count can move; it gives you nothing to RUN. This is
 * the thing to run.
 *
 * It answers the three questions a re-pin actually raises:
 *   1. Which stored answer keys have no home in the incoming form? (orphans — usually
 *      harmless, they ride along in raw_data, but they are DATA THE REGISTRY LOSES.)
 *   2. Which incoming questions are absent from the outgoing form? (blank on resume —
 *      the respondent must answer them, so a required one is a resume dead-end.)
 *   3. Which names survive but changed MEANING? (same `name`, different `type`, or a
 *      choice value that no longer exists.) This is the dangerous class: it does not
 *      look like a break, it silently mis-maps or fails validation on an answer the
 *      respondent already gave.
 *
 * Plus the step-count delta, because `N = 3 head + one per SECTION + 1 review` is what
 * Story 13-47's `.max(5)` cap got wrong for weeks.
 *
 * WORKED EXAMPLE (the reason this is not hypothetical). On 2026-07-31 the question was
 * whether 291 live drafts — answered against the MASTER — could safely resume into the
 * PUBLIC CORE. Run over those two files this reports: Public Core is a strict SUBSET of
 * Master (0 questions absent, 0 type changes), 22 Master-only orphans, and sections
 * 7 → 6 (N 11 → 10) because `grp_household` is dropped. That section delta is exactly
 * the cross-form resume hazard: a draft parked past the dropped section lands on a
 * DIFFERENT one.
 *
 * USAGE
 *   pnpm --filter @oslsr/api form:diff <outgoing.xlsx> <incoming.xlsx>
 *
 * EXIT CODE — deliberately asymmetric, because the classes differ in kind:
 *   0  no silent-mis-map risk (orphans and additions are reported, not fatal)
 *   1  a type change or a dropped choice value was found — an answer already given
 *      would mis-map or stop validating. Read the output before re-pinning.
 *   2  bad invocation / unreadable workbook.
 *
 * NOTE ON SHAPE: single script, no src/lib split. Story 13-37 split its detector
 * because it is a CI GATE that needs unit tests and tsc coverage. This is an operator
 * tool run by hand at a re-pin. If it is ever wired into CI, split it first — see
 * 13-37's Project Structure Notes for why (`rootDir: ./src` forbids src→scripts imports).
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

interface Question {
  name: string;
  type: string;
  required: boolean;
}
interface FormShape {
  path: string;
  questions: Question[];
  sections: string[];
  /** Wizard step count: 3 head steps + one per SECTION + 1 review (useWizardStepCount.ts:20-22). */
  wizardSteps: number;
  /** list_name -> the set of choice values it offers. */
  choices: Map<string, Set<string>>;
}

function loadForm(path: string): FormShape {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(readFileSync(path));
  } catch (err) {
    console.error(`✗ cannot read workbook: ${path}\n  ${(err as Error).message}`);
    process.exit(2);
  }
  const surveySheet = wb.Sheets['survey'];
  if (!surveySheet) {
    console.error(`✗ ${path} has no "survey" sheet — is this an XLSForm?`);
    process.exit(2);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(surveySheet);

  const isGroupMarker = (type: string) => /^(begin|end)[ _](group|repeat)$/i.test(type);
  const questions: Question[] = [];
  const sections: string[] = [];

  for (const row of rows) {
    const type = String(row.type ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (!type || !name) continue;
    if (/^begin[ _]group$/i.test(type)) sections.push(name);
    if (isGroupMarker(type)) continue;
    questions.push({
      name,
      type,
      required: /^(yes|true|1)$/i.test(String(row.required ?? '').trim()),
    });
  }

  const choices = new Map<string, Set<string>>();
  const choiceSheet = wb.Sheets['choices'];
  if (choiceSheet) {
    for (const row of XLSX.utils.sheet_to_json<Record<string, unknown>>(choiceSheet)) {
      const list = String(row.list_name ?? '').trim();
      const value = String(row.name ?? '').trim();
      if (!list || !value) continue;
      if (!choices.has(list)) choices.set(list, new Set());
      choices.get(list)!.add(value);
    }
  }

  return { path, questions, sections, wizardSteps: 3 + sections.length + 1, choices };
}

/** The choice list a question draws from, e.g. `select_multiple skill_list` -> `skill_list`. */
function choiceListOf(type: string): string | null {
  const m = /^select_(one|multiple)\s+(\S+)/i.exec(type);
  return m ? m[2] : null;
}

const [outgoingPath, incomingPath] = process.argv.slice(2);
if (!outgoingPath || !incomingPath) {
  console.error(
    'usage: pnpm --filter @oslsr/api form:diff <outgoing.xlsx> <incoming.xlsx>\n' +
      '  outgoing = the form currently pinned (what live drafts were answered against)\n' +
      '  incoming = the form you are about to pin',
  );
  process.exit(2);
}

const out = loadForm(outgoingPath);
const inc = loadForm(incomingPath);

const outByName = new Map(out.questions.map((q) => [q.name, q]));
const incByName = new Map(inc.questions.map((q) => [q.name, q]));

const orphaned = out.questions.filter((q) => !incByName.has(q.name));
const introduced = inc.questions.filter((q) => !outByName.has(q.name));
const typeChanged = inc.questions.filter((q) => {
  const before = outByName.get(q.name);
  return before && before.type !== q.type;
});

// A choice value that existed and no longer does: an answer already stored stops validating.
const droppedChoices: Array<{ question: string; list: string; values: string[] }> = [];
for (const q of inc.questions) {
  const list = choiceListOf(q.type);
  const before = outByName.get(q.name);
  if (!list || !before) continue;
  const beforeList = choiceListOf(before.type);
  if (!beforeList) continue;
  const was = out.choices.get(beforeList) ?? new Set<string>();
  const now = inc.choices.get(list) ?? new Set<string>();
  const gone = [...was].filter((v) => !now.has(v));
  if (gone.length) droppedChoices.push({ question: q.name, list, values: gone });
}

const line = (s = '') => console.log(s);
line('FORM DIFF — run this BEFORE a re-pin (Pitfall #46)');
line('='.repeat(64));
line(`OUTGOING  ${out.path}`);
line(`          ${out.questions.length} questions · ${out.sections.length} sections · wizard N = ${out.wizardSteps}`);
line(`INCOMING  ${inc.path}`);
line(`          ${inc.questions.length} questions · ${inc.sections.length} sections · wizard N = ${inc.wizardSteps}`);
line();

if (out.wizardSteps !== inc.wizardSteps) {
  line(`⚠️  WIZARD STEP COUNT CHANGES: ${out.wizardSteps} → ${inc.wizardSteps}`);
  line('    Any server-side step bound is a claim about the OUTGOING form (Pitfall #46).');
  line(`    Verify a draft PUT at currentStep=${inc.wizardSteps} returns 200 after the re-pin.`);
  const dropped = out.sections.filter((s) => !inc.sections.includes(s));
  const addedSections = inc.sections.filter((s) => !out.sections.includes(s));
  if (dropped.length) line(`    sections REMOVED: ${dropped.join(', ')}`);
  if (addedSections.length) line(`    sections ADDED:   ${addedSections.join(', ')}`);
  line('    ⚠️  A draft parked PAST a removed section resumes on a DIFFERENT section,');
  line('        because currentStep is a positional index, not a section id.');
  line();
}

line(`ORPHANED (${orphaned.length}) — stored answers with no home in the incoming form:`);
line(orphaned.length ? '  ' + orphaned.map((q) => q.name).join(', ') : '  (none)');
line('  → carried in raw_data but never re-displayed. Data the registry stops collecting.');
line();

line(`INTRODUCED (${introduced.length}) — blank on resume, must be answered:`);
line(introduced.length ? '  ' + introduced.map((q) => `${q.name}${q.required ? ' (REQUIRED)' : ''}`).join(', ') : '  (none)');
if (introduced.some((q) => q.required)) {
  line('  ⚠️  A REQUIRED new question means every resuming draft-holder must answer it');
  line('      before they can submit — check that the step is reachable for them.');
}
line();

line(`SILENT MIS-MAP RISK — the class that does not look like a break:`);
if (!typeChanged.length && !droppedChoices.length) {
  line('  (none) — no question changed type and no choice value was dropped.');
} else {
  for (const q of typeChanged) {
    line(`  ✗ TYPE CHANGED  ${q.name}: ${outByName.get(q.name)!.type} → ${q.type}`);
  }
  for (const d of droppedChoices) {
    line(`  ✗ CHOICE DROPPED ${d.question} (${d.list}): ${d.values.slice(0, 12).join(', ')}${d.values.length > 12 ? ` … +${d.values.length - 12} more` : ''}`);
    line('     an answer already stored with this value will no longer validate.');
  }
}
line();

const subset = introduced.length === 0 && typeChanged.length === 0;
line(
  subset
    ? '✅ INCOMING IS A STRICT SUBSET of OUTGOING (by name and type) — every stored answer still maps.'
    : 'ℹ️  Incoming is NOT a strict subset — see INTRODUCED / SILENT MIS-MAP above.',
);

const fatal = typeChanged.length > 0 || droppedChoices.length > 0;
line(fatal ? '\n❌ RE-PIN GATE: silent mis-map risk found — read the output above first.' : '\n✅ RE-PIN GATE: no silent mis-map risk.');
process.exit(fatal ? 1 : 0);
