/**
 * Story 13-73 AC6 — PREPARE (never apply) the restore of orphaned form schemas.
 *
 * ⭐ WHAT THIS DOES. For each target form row that submissions still reference but
 * `questionnaire_forms` no longer holds, it streams the monthly backup that holds it
 * — `GetObject` → AES-256-GCM decipher (IV + auth tag from the cleartext manifest)
 * → gunzip → the `COPY public.questionnaire_forms` block — extracts that one row,
 * checks its shape against what 13-69 recorded on 2026-09-18, runs read-only
 * preflight checks against the target database, and PRINTS an INSERT that restores
 * it as `status = 'archived'`.
 *
 * ⛔ IT WRITES NOTHING. No database write (the preflight runs inside a `READ ONLY`
 * transaction), no file on the host, no restore. The SQL goes to stdout for a human
 * to read and for adjudication/the operator to apply — 13-73 Task 5.2: "prepared and
 * dry-run by dev, applied by adjudication/operator".
 * ⚠️ `restore-backup.ts --dry-run` does NOT do this — it validates the manifest only.
 *
 * ⛔ `archived`, NEVER `published` (AC6): published would put a retired form back on
 * the enumerator and public form lists (`native-form.service.ts` lists `published`).
 *
 * WHY PLAIN JS (.mjs) AND NOT TS. `scripts/` is outside `tsconfig` anyway, and this
 * must run on the VPS BEFORE 13-73 deploys without copying anything into the git
 * tree there. Piped over ssh into `node --input-type=module -` from `apps/api`, its
 * bare imports resolve against that directory's node_modules:
 *
 *   ssh root@oslsr-home-app 'cd /root/oslrs/apps/api && node --input-type=module - [--only <id-prefix>]' \
 *     < apps/api/scripts/restore-orphaned-form-schemas.mjs > restore.sql
 *
 * After deploy it also runs in place: `cd apps/api && node scripts/restore-orphaned-form-schemas.mjs`.
 * Env (read from `<repo>/.env`, or `ENV_FILE`): S3_*, BACKUP_ENCRYPTION_KEY, DATABASE_URL.
 *
 * Apply (adjudication/operator, after reading it): `psql -v ON_ERROR_STOP=1 -f restore.sql`.
 * The file is one transaction; any failed check inside it rolls the whole thing back.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createDecipheriv } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import dotenv from 'dotenv';
import pg from 'pg';

// stdout is reserved for the SQL; everything a human reads goes to stderr.
const log = (...a) => process.stderr.write(`${a.join(' ')}\n`);

/**
 * The targets, with the shape 13-69 R8 recorded when it verified them on 2026-09-18.
 * A mismatch is a STOP, not a warning: it means the backup does not hold what the
 * story was written against.
 */
const TARGETS = [
  {
    id: '019f8ed3-e518-7ad9-989a-7b59da8db964',
    monthly: '2026-08',
    expect: { formId: 'oslsr_public_core_v1', version: 'pubcore-2', sections: 6, questions: 25, geopoint: 0 },
  },
  {
    id: '019d7d40-d3a8-78a9-850e-f306550cc999',
    monthly: '2026-05',
    // 13-69 wrote the version as `v2026012601`; the backup row says `2026012601` (no
    // `v`) — a transcription in the record, caught by this check on 2026-09-24.
    expect: { formId: 'oslsr_master_v3', version: '2026012601', sections: 7, questions: 39, geopoint: 1 },
  },
];

// ── env + args ────────────────────────────────────────────────────────────────
const envFile = process.env.ENV_FILE ?? resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) dotenv.config({ path: envFile });
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const targets = only ? TARGETS.filter((t) => t.id.startsWith(only)) : TARGETS;
if (targets.length === 0) throw new Error(`--only ${only} matches no target`);

function s3() {
  const cfg = { region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1' };
  if (process.env.S3_ENDPOINT) Object.assign(cfg, { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true });
  if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    cfg.credentials = { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY };
  }
  return new S3Client(cfg);
}
const BUCKET = process.env.S3_BUCKET_NAME || 'oslsr-media';

async function getJson(client, key) {
  try {
    const r = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const c of r.Body) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    if (err?.name === 'NoSuchKey') return null;
    throw err;
  }
}

// ── pg_dump COPY text format ──────────────────────────────────────────────────
/** Decode one field of PostgreSQL's COPY text format. `\N` is NULL. */
function decodeCopyField(raw) {
  if (raw === '\\N') return null;
  return raw.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e) => {
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }[e] ?? e;
  });
}

/**
 * Stream a dump and return the target rows of `public.questionnaire_forms`.
 * Reads to the END even after the block is found: GCM verifies its auth tag only
 * at the end of the stream, and a restore from an unverified backup is not one.
 */
async function extractFormRows(client, monthly, ids) {
  const manifest = await getJson(client, `backups/manifests/monthly/${monthly}-manifest.json`);
  const encrypted = Boolean(manifest?.encryption);
  // ⚠️ NOT `manifest.s3Key`: a promoted monthly's manifest still names the DAILY
  // object it was copied from, and dailies expire after 7 days (observed 2026-09-24:
  // NoSuchKey on `backups/daily/2026-08-01-…`). The manifest supplies the IV and
  // auth tag; the object is the monthly copy.
  const key = `backups/monthly/${monthly}-app_db.sql.gz${encrypted ? '.enc' : ''}`;
  log(`  object: ${key} (${encrypted ? `encrypted, ${manifest.encryption.algorithm}` : 'plaintext'})`);

  const obj = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const stages = [obj.Body];
  if (encrypted) {
    const hex = process.env.BACKUP_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) throw new Error('BACKUP_ENCRYPTION_KEY missing or not 64 hex chars');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), Buffer.from(manifest.encryption.ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(manifest.encryption.authTagHex, 'hex'));
    stages.push(decipher);
  }
  /*
   * `pipeline`, NOT `.pipe()`. The GCM auth tag is checked in the decipher's final(),
   * and `.pipe()` does not forward errors between stages. Probed 2026-09-24 with a
   * one-bit-flipped tag: `.pipe()` surfaced it only as an UNHANDLED 'error' event that
   * killed the process — loud, but outside any code that could report it — while
   * `pipeline` destroyed every stage and REJECTED its promise (the good tag resolved
   * after all 6,000 lines). The promise is awaited below, so "VERIFIED" is printed
   * only once the tag has actually been checked.
   */
  const text = new PassThrough();
  const done = pipeline(...stages, createGunzip(), text);
  done.catch(() => {}); // observed by the `await done` below; this only prevents an early unhandled rejection
  const lines = createInterface({ input: text, crlfDelay: Infinity });

  let columns = null;
  let inBlock = false;
  let blockRows = 0;
  const found = new Map();
  for await (const line of lines) {
    if (!inBlock) {
      const m = /^COPY public\.questionnaire_forms \((.+)\) FROM stdin;$/.exec(line);
      if (m) {
        columns = m[1].split(', ').map((c) => c.replace(/^"|"$/g, ''));
        inBlock = true;
      }
      continue;
    }
    if (line === '\\.') { inBlock = false; continue; }
    if (columns && inBlock) {
      blockRows++;
      const fields = line.split('\t').map(decodeCopyField);
      const row = Object.fromEntries(columns.map((c, i) => [c, fields[i]]));
      if (ids.includes(row.id)) found.set(row.id, row);
    }
  }
  // A bad auth tag, a corrupt gzip or a dropped connection destroys `text` with the
  // error, and readline re-throws it from the `for await` above — observed on Node
  // 20.20.2 (the VPS) and 24 with a one-bit-flipped tag (13-73 code review, 2026-09-25):
  // the loop THREW before this line was reached. Either way nothing below runs.
  await done;
  if (!columns) throw new Error(`${key}: no COPY public.questionnaire_forms block`);
  log(`  stream read to end${encrypted ? ' — GCM auth tag VERIFIED' : ''}; block held ${blockRows} form row(s)`);
  return { columns, found };
}

// ── shape check ───────────────────────────────────────────────────────────────
function shapeOf(schemaText) {
  if (schemaText == null) return { sections: 0, questions: 0, geopoint: 0, parsed: false };
  const schema = JSON.parse(schemaText);
  const sections = schema.sections ?? [];
  const questions = sections.flatMap((s) => s.questions ?? []);
  return {
    parsed: true,
    sections: sections.length,
    questions: questions.length,
    geopoint: questions.filter((q) => q.type === 'geopoint').length,
  };
}

// ── SQL literal for a COPY-text value, cast to the CURRENT column type ─────────
function literal(value, col) {
  if (value === null || value === undefined) return 'NULL';
  const quoted = `'${String(value).replaceAll("'", "''")}'`;
  const type =
    col.data_type === 'ARRAY' ? `${col.udt_name.slice(1)}[]`
    : col.data_type === 'USER-DEFINED' ? col.udt_name
    : col.data_type;
  return `${quoted}::${type}`;
}

// ── main ──────────────────────────────────────────────────────────────────────
const client = s3();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const stops = [];
const statements = [];

try {
  await db.query('BEGIN TRANSACTION READ ONLY'); // ⛔ preflight cannot write
  const { rows: current } = await db.query(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'questionnaire_forms'`,
  );
  const currentCols = new Map(current.map((c) => [c.column_name, c]));

  // (Not `Object.groupBy` — that is Node 21+, and the VPS runs Node 20.)
  const byMonthly = new Map();
  for (const t of targets) byMonthly.set(t.monthly, [...(byMonthly.get(t.monthly) ?? []), t]);
  for (const [monthly, group] of byMonthly) {
    log(`\n▶ monthly/${monthly} — ${group.map((t) => t.id.slice(0, 13)).join(', ')}`);
    const { columns, found } = await extractFormRows(client, monthly, group.map((t) => t.id));

    for (const t of group) {
      const tag = `${t.id.slice(0, 13)}…`;
      const row = found.get(t.id);
      if (!row) { stops.push(`${tag}: NOT in monthly/${monthly}`); continue; }

      const shape = shapeOf(row.form_schema);
      log(`  ${tag}: ${row.form_id} ${row.version} (was ${row.status}) — ` +
          `${shape.sections} sections / ${shape.questions} questions / ${shape.geopoint} geopoint`);
      const e = t.expect;
      if (row.form_id !== e.formId || row.version !== e.version ||
          shape.sections !== e.sections || shape.questions !== e.questions || shape.geopoint !== e.geopoint) {
        stops.push(`${tag}: backup row does not match 13-69's record ${JSON.stringify(e)}`);
        continue;
      }

      // Preflight, read-only, against the database this SQL would be applied to.
      const q = async (sql, params) => (await db.query(sql, params)).rows[0];
      const refs = Number((await q(`SELECT count(*) AS n FROM submissions WHERE questionnaire_form_id = $1`, [t.id])).n);
      const idTaken = await q(`SELECT 1 AS x FROM questionnaire_forms WHERE id = $1`, [t.id]);
      const pairTaken = await q(`SELECT id FROM questionnaire_forms WHERE form_id = $1 AND version = $2`, [row.form_id, row.version]);
      const hashTaken = await q(`SELECT id FROM questionnaire_forms WHERE file_hash = $1`, [row.file_hash]);
      const uploader = await q(`SELECT 1 AS x FROM users WHERE id = $1`, [row.uploaded_by]);
      log(`    referencing submissions now: ${refs}`);
      if (idTaken) stops.push(`${tag}: a questionnaire_forms row with this id ALREADY exists`);
      if (pairTaken) stops.push(`${tag}: (form_id, version) already held by ${pairTaken.id} — uq_forms_form_id_version`);
      if (hashTaken) log(`    ⚠️ file_hash already held by ${hashTaken.id} (app-level DUPLICATE_FORM only; no DB constraint checked)`);
      if (!uploader) stops.push(`${tag}: uploaded_by ${row.uploaded_by} is not in users — the FK would refuse the insert`);
      if (refs === 0) log(`    ⚠️ NO submission references this form today — restoring it recovers nothing (needs a ruling)`);

      // Build the INSERT over the columns BOTH the backup and today's table have.
      const lost = columns.filter((c) => !currentCols.has(c));
      if (lost.length) log(`    columns in the backup but not today (dropped): ${lost.join(', ')}`);
      const missingRequired = [...currentCols.values()].filter(
        (c) => !columns.includes(c.column_name) && c.is_nullable === 'NO' && c.column_default == null,
      );
      if (missingRequired.length) {
        stops.push(`${tag}: today's table requires ${missingRequired.map((c) => c.column_name).join(', ')} which the backup lacks`);
      }
      const cols = columns.filter((c) => currentCols.has(c));
      const values = cols.map((c) => {
        if (c === 'status') return `'archived'`; // ⛔ AC6 — never published
        if (c === 'updated_at') return 'now()';
        return literal(row[c], currentCols.get(c));
      });
      statements.push(
        `-- ${row.form_id} ${row.version} — ${t.id}\n` +
        `-- from monthly/${monthly}; ${shape.sections} sections / ${shape.questions} questions / ${shape.geopoint} geopoint;\n` +
        `-- ${refs} submission(s) reference it as of this run; was '${row.status}', restored 'archived'.\n` +
        `INSERT INTO questionnaire_forms (${cols.map((c) => `"${c}"`).join(', ')})\nVALUES (${values.join(', ')});\n`,
      );
    }
  }
  await db.query('ROLLBACK');
} finally {
  await db.end();
}

if (stops.length) {
  log(`\n⛔ STOPPED — nothing emitted:\n  - ${stops.join('\n  - ')}`);
  process.exit(1);
}

const ids = targets.map((t) => `'${t.id}'`).join(', ');
process.stdout.write(
  `-- Story 13-73 AC6 — restore orphaned form schemas as ARCHIVED.\n` +
  `-- Generated ${new Date().toISOString()} by apps/api/scripts/restore-orphaned-form-schemas.mjs.\n` +
  `-- ⛔ NOT APPLIED by the generator. Apply: psql -v ON_ERROR_STOP=1 -f <this file>\n\n` +
  // 13-73 code review: every value is a plain '…' literal, which is only
  // backslash-transparent under standard_conforming_strings = on (the default, and
  // prod's value on 2026-09-25). Pinned in the file, as pg_dump pins it, so a session
  // with it off cannot silently rewrite a backslash inside a form schema.
  `BEGIN;\nSET LOCAL standard_conforming_strings = on;\n\n${statements.join('\n')}\n` +
  `-- Post-conditions, inside the transaction: every restored row is archived, and\n` +
  `-- its submissions now resolve a schema. A failed check aborts the whole restore.\n` +
  `DO $$\nBEGIN\n` +
  `  IF EXISTS (SELECT 1 FROM questionnaire_forms WHERE id::text IN (${ids}) AND status <> 'archived') THEN\n` +
  `    RAISE EXCEPTION 'a restored form is not archived';\n  END IF;\n` +
  `  IF (SELECT count(*) FROM questionnaire_forms WHERE id::text IN (${ids}) AND form_schema IS NOT NULL) <> ${targets.length} THEN\n` +
  `    RAISE EXCEPTION 'a restored form has no schema';\n  END IF;\nEND $$;\n\n` +
  `SELECT f.id, f.form_id, f.version, f.status,\n` +
  `       (SELECT count(*) FROM submissions s WHERE s.questionnaire_form_id = f.id::text) AS now_resolving\n` +
  `  FROM questionnaire_forms f WHERE f.id::text IN (${ids});\n\n` +
  `COMMIT;\n`,
);
log('\n✅ SQL emitted to stdout — review it, then hand to adjudication/operator to apply.');
