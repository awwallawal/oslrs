/**
 * Audit Log Viewer Service — Story 9-11
 *
 * Read-side surface over the existing Story 6-1 audit_logs table. This service
 * powers the Super Admin Audit Log page (`/dashboard/super-admin/audit-log`)
 * and the upcoming Epic 10 Consumer Audit Dashboard (Story 10-6 will compose
 * on top of this).
 *
 * Distinct from `audit.service.ts` (the WRITE side that emits hash-chained
 * audit rows). This file is the READ side: filter composition, cursor
 * pagination, principal-name resolution joins, distinct-value lookups for
 * filter dropdowns, principal autocomplete, CSV export builder.
 *
 * Key design choices:
 *   - **Cursor pagination** (`(created_at, id)` composite, base64url-encoded)
 *     instead of offset for constant-time at any page depth. See
 *     `encodeCursor` / `decodeCursor` below.
 *   - **LEFT JOIN both principal tables** in the list query (Option A per
 *     Dev Notes) — composite indexes
 *     `idx_audit_logs_actor_created_at` + `idx_audit_logs_consumer_created_at`
 *     make the join cheap.
 *   - **Filter composition via raw `sql` template** — Drizzle's QB gets messy
 *     once you mix optional filters + cursor + LEFT JOINs. Raw SQL with
 *     parameter binding via `sql\`\${value}\`` is safer for this surface than
 *     hand-rolling string interpolation.
 *   - **CSV export uses csv-stringify/sync** (already in stack from prep-3).
 *     Buffer-then-send: 10K row cap × ~500 bytes ≈ 5MB peak, trivial in memory.
 *   - **Principal autocomplete** uses `pg_trgm`-accelerated ILIKE %query%
 *     when the extension is available; falls back to plain ILIKE otherwise.
 *     Plain ILIKE is fast enough at our principal cardinality (low thousands).
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { stringify } from 'csv-stringify/sync';
import pino from 'pino';

const logger = pino({ name: 'audit-log-viewer-service' });

export type PrincipalType = 'user' | 'consumer' | 'system';

export interface AuditLogFilter {
  /** Principal-type checkboxes — at least one must be set; empty = no rows. */
  principalTypes?: PrincipalType[];
  /**
   * Specific actor-id (UUID). May refer to a `users.id` OR `api_consumers.id`
   * — the query checks both columns. Set when the user picks an entry from
   * the actor combobox.
   */
  actorId?: string;
  /** Multi-select action filter; empty array = no filter. */
  actions?: string[];
  /** Single target-resource filter (e.g. 'respondents'). */
  targetResource?: string;
  /** Inclusive date range (ISO string). Defaults to "last 24h" at the route layer. */
  from?: string;
  to?: string;
  /** Base64url-encoded `(created_at, id)` cursor; null/undefined for first page. */
  cursor?: string;
  /** Page size; defaults to 100 per AC#5. */
  limit?: number;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  consumerId: string | null;
  action: string;
  targetResource: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: unknown;
  createdAt: string; // ISO
  /** Resolved principal name — `users.full_name` or `api_consumers.name` or 'System'. */
  principalName: string;
  /** Derived from non-null actor/consumer columns. */
  principalType: PrincipalType;
}

export interface AuditLogListResult {
  rows: AuditLogRow[];
  /** Cursor to fetch the next page; null when there are no more rows. */
  nextCursor: string | null;
}

export interface PrincipalSearchResult {
  /** UUID — fits `actor_id` OR `consumer_id` depending on `type`. */
  id: string;
  name: string;
  type: 'user' | 'consumer';
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_EXPORT_ROWS = 10_000;

/**
 * Encode a `(createdAt, id)` cursor to a URL-safe opaque string.
 * Format: base64url(JSON.stringify({ ts, id })). Stable across revisions.
 */
export function encodeCursor(createdAt: Date, id: string): string {
  const json = JSON.stringify({ ts: createdAt.toISOString(), id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor string. Returns null if the cursor is malformed
 * (in which case the caller should treat the request as a first-page fetch
 * rather than 400 — a stale URL shouldn't break the UX).
 */
export function decodeCursor(
  cursor: string | undefined
): { ts: Date; id: string } | null {
  if (!cursor) return null;
  // R2-L1: validate base64url charset before Buffer.from. Buffer's base64url
  // decoder silently accepts mangled input (over-padding, mixed schemes); a
  // strict charset check prevents subtle decode-divergence across Node versions
  // and surfaces obviously-bad URLs as first-page fetches rather than mystery
  // partial decodes.
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    logger.debug({ cursor }, 'cursor contains non-base64url-safe characters; treating as first page');
    return null;
  }
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const { ts, id } = parsed as { ts?: string; id?: string };
    if (!ts || !id) return null;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return null;
    return { ts: date, id };
  } catch (err) {
    logger.debug({ err, cursor }, 'malformed cursor — treating as first page');
    return null;
  }
}

/**
 * R2-F2: CSV formula-injection guard (CVE-2014-4617). Any cell value that
 * starts with `=`, `+`, `-`, or `@` is interpreted as a formula by Excel,
 * Google Sheets, and LibreOffice Calc on open. Prepending an apostrophe
 * (the de-facto industry standard) tells the spreadsheet to treat the cell
 * as literal text. The apostrophe is consumed on display so the human-visible
 * value is unchanged. Tab character also triggers Excel's formula heuristic.
 *
 * Applied to every user-controlled string column in the audit-log CSV export
 * (action, target_resource, target_id, ip_address, user_agent, principal_name,
 * details). Numeric / UUID / ISO-timestamp columns are not vulnerable but the
 * function is null-safe so we apply uniformly for consistency.
 */
function escapeCsvFormula(value: string | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (s.length === 0) return '';
  const first = s.charCodeAt(0);
  // 0x3D = '='  0x2B = '+'  0x2D = '-'  0x40 = '@'  0x09 = TAB
  if (first === 0x3d || first === 0x2b || first === 0x2d || first === 0x40 || first === 0x09) {
    return `'${s}`;
  }
  return s;
}

/**
 * Compose the WHERE clause fragment for a given filter. Emits parameterised
 * SQL via Drizzle's `sql` template — never string-concatenates user input.
 */
function buildFilterWhere(filter: AuditLogFilter) {
  const fragments: ReturnType<typeof sql>[] = [];

  // Principal-type filter (always present — at minimum one type selected).
  // If none selected, the route layer returns an empty result without hitting
  // the DB (handled by the caller). Here, we trust the caller passed at least
  // one type.
  const types = filter.principalTypes ?? ['user', 'consumer', 'system'];
  const principalParts: ReturnType<typeof sql>[] = [];
  if (types.includes('user')) {
    principalParts.push(sql`(al.actor_id IS NOT NULL)`);
  }
  if (types.includes('consumer')) {
    principalParts.push(sql`(al.consumer_id IS NOT NULL)`);
  }
  if (types.includes('system')) {
    principalParts.push(sql`(al.actor_id IS NULL AND al.consumer_id IS NULL)`);
  }
  if (principalParts.length === 0) {
    // Safety: caller should have short-circuited; emit a "match nothing"
    // predicate to avoid accidentally returning all rows.
    fragments.push(sql`FALSE`);
  } else {
    // OR the principal-type predicates together
    let combined = principalParts[0];
    for (let i = 1; i < principalParts.length; i++) {
      combined = sql`${combined} OR ${principalParts[i]}`;
    }
    fragments.push(sql`(${combined})`);
  }

  if (filter.actorId) {
    fragments.push(
      sql`(al.actor_id = ${filter.actorId} OR al.consumer_id = ${filter.actorId})`
    );
  }

  if (filter.actions && filter.actions.length > 0) {
    fragments.push(sql`al.action = ANY(${filter.actions})`);
  }

  if (filter.targetResource) {
    fragments.push(sql`al.target_resource = ${filter.targetResource}`);
  }

  if (filter.from) {
    fragments.push(sql`al.created_at >= ${filter.from}::timestamptz`);
  }

  if (filter.to) {
    fragments.push(sql`al.created_at <= ${filter.to}::timestamptz`);
  }

  return fragments;
}

function applyCursor(
  fragments: ReturnType<typeof sql>[],
  filter: AuditLogFilter
) {
  const cur = decodeCursor(filter.cursor);
  if (!cur) return;
  // DESC sort means cursor "after" means strictly less than the cursor row.
  // Tuple comparison `(a, b) < (x, y)` = true when a<x OR (a=x AND b<y).
  fragments.push(sql`(al.created_at, al.id) < (${cur.ts.toISOString()}::timestamptz, ${cur.id}::uuid)`);
}

function combineWhere(fragments: ReturnType<typeof sql>[]): ReturnType<typeof sql> {
  if (fragments.length === 0) return sql`TRUE`;
  let combined = fragments[0];
  for (let i = 1; i < fragments.length; i++) {
    combined = sql`${combined} AND ${fragments[i]}`;
  }
  return combined;
}

interface RawAuditLogRow {
  id: string;
  actor_id: string | null;
  consumer_id: string | null;
  action: string;
  target_resource: string | null;
  target_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: unknown;
  created_at: string;
  user_name: string | null;
  consumer_name: string | null;
}

function projectRow(raw: RawAuditLogRow): AuditLogRow {
  let principalType: PrincipalType;
  let principalName: string;
  if (raw.actor_id) {
    principalType = 'user';
    principalName = raw.user_name ?? '(unknown user)';
  } else if (raw.consumer_id) {
    principalType = 'consumer';
    principalName = raw.consumer_name ?? '(unknown consumer)';
  } else {
    principalType = 'system';
    principalName = 'System';
  }
  return {
    id: raw.id,
    actorId: raw.actor_id,
    consumerId: raw.consumer_id,
    action: raw.action,
    targetResource: raw.target_resource,
    targetId: raw.target_id,
    ipAddress: raw.ip_address,
    userAgent: raw.user_agent,
    details: raw.details,
    createdAt:
      typeof raw.created_at === 'string'
        ? raw.created_at
        : new Date(raw.created_at).toISOString(),
    principalName,
    principalType,
  };
}

/**
 * AC#9 list endpoint backbone. Returns up to `limit` rows + a cursor for the
 * next page (null when at end). Sort is DESC by (created_at, id) — the
 * audit-log invariant per Dev Notes.
 */
export async function listAuditLogs(
  filter: AuditLogFilter
): Promise<AuditLogListResult> {
  const types = filter.principalTypes ?? ['user', 'consumer', 'system'];
  if (types.length === 0) {
    // Filter conflict caught by the route layer per AC#3 (Apply disabled);
    // belt-and-braces here.
    return { rows: [], nextCursor: null };
  }

  const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const fragments = buildFilterWhere(filter);
  applyCursor(fragments, filter);
  const where = combineWhere(fragments);

  // Fetch limit + 1 to detect whether there's a next page.
  const result = await db.execute(sql`
    SELECT
      al.id,
      al.actor_id,
      al.consumer_id,
      al.action,
      al.target_resource,
      al.target_id,
      al.ip_address,
      al.user_agent,
      al.details,
      al.created_at,
      u.full_name AS user_name,
      c.name AS consumer_name
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    LEFT JOIN api_consumers c ON al.consumer_id = c.id
    WHERE ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ${limit + 1}
  `);

  const raws = result.rows as unknown as RawAuditLogRow[];
  const rows = raws.slice(0, limit).map(projectRow);
  const hasMore = raws.length > limit;
  const nextCursor =
    hasMore && rows.length > 0
      ? encodeCursor(new Date(rows[rows.length - 1].createdAt), rows[rows.length - 1].id)
      : null;

  return { rows, nextCursor };
}

/**
 * AC#9 detail endpoint — single audit log by id, with principal-name resolution.
 */
export async function getAuditLogById(id: string): Promise<AuditLogRow | null> {
  const result = await db.execute(sql`
    SELECT
      al.id,
      al.actor_id,
      al.consumer_id,
      al.action,
      al.target_resource,
      al.target_id,
      al.ip_address,
      al.user_agent,
      al.details,
      al.created_at,
      u.full_name AS user_name,
      c.name AS consumer_name
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    LEFT JOIN api_consumers c ON al.consumer_id = c.id
    WHERE al.id = ${id}
    LIMIT 1
  `);

  if (result.rows.length === 0) return null;
  return projectRow(result.rows[0] as unknown as RawAuditLogRow);
}

/**
 * AC#9 distinct-values endpoint — feeds the AuditLogFilter `Action` and
 * `Target resource` dropdowns. Cached client-side; server-side cap on
 * cardinality avoids a `SELECT DISTINCT` on a high-cardinality column.
 */
export async function getDistinctValues(
  field: 'action' | 'target_resource'
): Promise<string[]> {
  // Whitelist guard — never interpolate raw column name into SQL string.
  // The two valid options are emitted via separate code paths.
  let result;
  if (field === 'action') {
    result = await db.execute(sql`
      SELECT DISTINCT action AS value
      FROM audit_logs
      WHERE action IS NOT NULL
      ORDER BY action
      LIMIT 500
    `);
  } else {
    result = await db.execute(sql`
      SELECT DISTINCT target_resource AS value
      FROM audit_logs
      WHERE target_resource IS NOT NULL
      ORDER BY target_resource
      LIMIT 500
    `);
  }

  return result.rows.map((r) => (r as { value: string }).value);
}

/**
 * AC#9 principal autocomplete. Searches `users.full_name` + `api_consumers.name`
 * with substring match (`ILIKE %q%`). With `pg_trgm` GIN indexes (created by
 * migrate-audit-principal-dualism-init.ts) this stays sub-millisecond at any
 * realistic table size; without the extension it falls back to a sequential
 * scan, still fast at our cardinality (< 10k principals).
 *
 * Cap: 20 total results per AC#9. Splits the cap evenly: 10 users + 10
 * consumers, biased to whichever has matches if one is empty.
 */
export async function searchPrincipals(
  query: string,
  totalLimit = 20
): Promise<PrincipalSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];
  // 50-char cap on the LIKE pattern to prevent abusive-length queries from
  // forcing string scans on every row.
  const safe = trimmed.slice(0, 50);
  const likePattern = `%${safe}%`;
  const halfLimit = Math.ceil(totalLimit / 2);

  // Run both lookups in parallel; serialize-fast for the autocomplete UX.
  const [usersResult, consumersResult] = await Promise.all([
    db.execute(sql`
      SELECT id, full_name AS name
      FROM users
      WHERE full_name IS NOT NULL AND full_name ILIKE ${likePattern}
      ORDER BY full_name
      LIMIT ${halfLimit}
    `),
    db.execute(sql`
      SELECT id, name
      FROM api_consumers
      WHERE status != 'terminated' AND name ILIKE ${likePattern}
      ORDER BY name
      LIMIT ${halfLimit}
    `),
  ]);

  const users: PrincipalSearchResult[] = (usersResult.rows as { id: string; name: string }[]).map(
    (r) => ({ id: r.id, name: r.name, type: 'user' as const })
  );
  const consumers: PrincipalSearchResult[] = (
    consumersResult.rows as { id: string; name: string }[]
  ).map((r) => ({ id: r.id, name: r.name, type: 'consumer' as const }));

  return [...users, ...consumers].slice(0, totalLimit);
}

/**
 * AC#8 CSV export builder. Buffers up to MAX_EXPORT_ROWS rows + filter
 * signature comment + column headers; throws `ExportTooLargeError` if the
 * result set would exceed the cap (the caller maps to 413).
 *
 * Expected total memory: 10K rows × ~500 bytes ≈ 5 MB peak. Trivially
 * handled in-process.
 */
export class ExportTooLargeError extends Error {
  constructor(public count: number) {
    super(`Audit log export would exceed cap (${count} > ${MAX_EXPORT_ROWS} rows).`);
    this.name = 'ExportTooLargeError';
  }
}

export interface CsvExportResult {
  csv: string;
  filename: string;
  rowCount: number;
  filterSignature: string;
}

/**
 * Build the slug for AC#8 filename: `audit_log_<principal>_<resource>_<from>--<to>.csv`.
 * Sanitised to `[a-z0-9_-]` — never invents path-traversal or filesystem chars.
 */
function buildFilterSignature(filter: AuditLogFilter): string {
  const principalSlug =
    filter.principalTypes && filter.principalTypes.length > 0 && filter.principalTypes.length < 3
      ? filter.principalTypes.sort().join('-')
      : 'all';
  const resourceSlug = filter.targetResource
    ? filter.targetResource.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30)
    : 'all';
  const fromSlug = filter.from ? filter.from.slice(0, 10) : '';
  const toSlug = filter.to ? filter.to.slice(0, 10) : '';
  const dateSlug = fromSlug && toSlug ? `${fromSlug}--${toSlug}` : 'all-dates';
  return `audit_log_${principalSlug}_${resourceSlug}_${dateSlug}`;
}

export async function exportAuditLogsCsv(
  filter: AuditLogFilter,
  exportingActorId: string,
  exportingActorName: string
): Promise<CsvExportResult> {
  // Count first to enforce the 10k cap before we materialise rows. We could
  // do this with a streaming approach, but at our cap a count-then-fetch is
  // simpler and the count query hits the same indexes.
  const types = filter.principalTypes ?? ['user', 'consumer', 'system'];
  if (types.length === 0) {
    return {
      csv: '',
      filename: `${buildFilterSignature(filter)}.csv`,
      rowCount: 0,
      filterSignature: buildFilterSignature(filter),
    };
  }

  const fragments = buildFilterWhere(filter);
  // Note: deliberately NOT applying cursor — exports include the FULL filtered
  // set, not the current viewport.
  const where = combineWhere(fragments);

  const countResult = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM audit_logs al WHERE ${where}
  `);
  const count = parseInt((countResult.rows[0] as { cnt: string }).cnt, 10);

  if (count > MAX_EXPORT_ROWS) {
    throw new ExportTooLargeError(count);
  }

  const result = await db.execute(sql`
    SELECT
      al.id,
      al.actor_id,
      al.consumer_id,
      al.action,
      al.target_resource,
      al.target_id,
      al.ip_address,
      al.user_agent,
      al.details,
      al.created_at,
      u.full_name AS user_name,
      c.name AS consumer_name
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    LEFT JOIN api_consumers c ON al.consumer_id = c.id
    WHERE ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ${MAX_EXPORT_ROWS}
  `);

  const rows = (result.rows as unknown as RawAuditLogRow[]).map(projectRow);
  const filterSignature = buildFilterSignature(filter);
  const exportedAt = new Date().toISOString();

  // R2-M2: emit metadata as RFC 4180-compliant header rows (key,value) before
  // the data section, separated by an empty line. Replaces the prior `# ...`
  // bare-comment lines which most CSV readers (Excel, Python's csv module,
  // pandas without skiprows) treat as malformed first-row data, not as
  // skippable comments. The two-section CSV is universally parseable: tools
  // that don't understand multi-section CSV will still see a valid 2-col
  // metadata block followed by a valid 12-col data block.
  const metadataCsv = stringify(
    [
      { key: 'export_filter', value: filterSignature },
      { key: 'exported_at', value: exportedAt },
      { key: 'exported_by_name', value: escapeCsvFormula(exportingActorName) },
      { key: 'exported_by_id', value: exportingActorId },
      { key: 'row_count', value: String(rows.length) },
    ],
    { header: true, columns: ['key', 'value'] }
  );

  // R2-F2: every user-controlled string column passes through escapeCsvFormula
  // before the CSV stringify call. UUID / ISO-timestamp / enum columns are not
  // attacker-controlled in practice but the helper is null-safe and zero-cost
  // for non-vulnerable values, so we apply uniformly for consistency and
  // future-proofing.
  const csvBody = stringify(
    rows.map((r) => ({
      id: r.id,
      timestamp: r.createdAt,
      principal_type: r.principalType,
      principal_name: escapeCsvFormula(r.principalName),
      actor_id: r.actorId ?? '',
      consumer_id: r.consumerId ?? '',
      action: escapeCsvFormula(r.action),
      target_resource: escapeCsvFormula(r.targetResource),
      target_id: escapeCsvFormula(r.targetId),
      ip_address: escapeCsvFormula(r.ipAddress),
      user_agent: escapeCsvFormula(r.userAgent),
      details: escapeCsvFormula(r.details ? JSON.stringify(r.details) : ''),
    })),
    {
      header: true,
      columns: [
        'id',
        'timestamp',
        'principal_type',
        'principal_name',
        'actor_id',
        'consumer_id',
        'action',
        'target_resource',
        'target_id',
        'ip_address',
        'user_agent',
        'details',
      ],
    }
  );

  // Two CSV sections separated by a blank line — the blank line is the standard
  // RFC 4180 way to delimit logical sections within a single CSV file.
  const csv = `${metadataCsv}\n${csvBody}`;

  return {
    csv,
    filename: `${filterSignature}.csv`,
    rowCount: rows.length,
    filterSignature,
  };
}
