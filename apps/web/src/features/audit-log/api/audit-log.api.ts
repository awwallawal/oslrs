/**
 * Story 9-11 — Audit Log Viewer API client.
 *
 * Wraps the 5 super-admin endpoints mounted at `/api/v1/admin/audit-logs/*`.
 * Backend service: `apps/api/src/services/audit-log-viewer.service.ts`.
 * Backend routes: `apps/api/src/routes/audit-log-viewer.routes.ts`.
 */
import { apiClient, getAuthHeaders, API_BASE_URL, ApiError } from '../../../lib/api-client';

export type PrincipalType = 'user' | 'consumer' | 'system';

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
  createdAt: string;
  principalName: string;
  principalType: PrincipalType;
}

export interface AuditLogListResult {
  rows: AuditLogRow[];
  nextCursor: string | null;
}

export interface PrincipalSearchResult {
  id: string;
  name: string;
  type: 'user' | 'consumer';
}

/**
 * Request shape for list / export. Matches the backend schemas in
 * `audit-log-viewer.routes.ts`.
 */
export interface AuditLogFilter {
  principalTypes?: PrincipalType[];
  actorId?: string;
  actions?: string[];
  targetResource?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function buildQueryString(filter: AuditLogFilter): string {
  const params = new URLSearchParams();
  if (filter.principalTypes && filter.principalTypes.length > 0) {
    params.set('principal', filter.principalTypes.join(','));
  }
  if (filter.actorId) params.set('actorId', filter.actorId);
  if (filter.actions && filter.actions.length > 0) {
    params.set('action', filter.actions.join(','));
  }
  if (filter.targetResource) params.set('targetResource', filter.targetResource);
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.cursor) params.set('cursor', filter.cursor);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function listAuditLogs(filter: AuditLogFilter): Promise<AuditLogListResult> {
  const response = await apiClient(`/admin/audit-logs${buildQueryString(filter)}`);
  return response.data;
}

export async function getAuditLogDetail(id: string): Promise<AuditLogRow> {
  const response = await apiClient(`/admin/audit-logs/${encodeURIComponent(id)}`);
  return response.data;
}

export async function getDistinctValues(
  field: 'action' | 'target_resource'
): Promise<string[]> {
  const response = await apiClient(`/admin/audit-logs/distinct/${field}`);
  return response.data;
}

export async function searchPrincipals(query: string): Promise<PrincipalSearchResult[]> {
  if (!query.trim()) return [];
  const response = await apiClient(
    `/admin/audit-logs/principals/search?q=${encodeURIComponent(query.trim())}`
  );
  return response.data;
}

export interface ExportFilter {
  principalTypes?: PrincipalType[];
  actorId?: string;
  actions?: string[];
  targetResource?: string;
  from?: string;
  to?: string;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  rowCount: number;
}

/**
 * AC#8 CSV export. Uses raw fetch (not apiClient) because the response is a
 * binary CSV blob, not JSON. Maps 413 → "Refine filters", 429 → rate-limit toast
 * via the calling mutation hook.
 */
export async function exportAuditLogs(filter: ExportFilter): Promise<ExportResult> {
  const body: Record<string, unknown> = {};
  if (filter.principalTypes && filter.principalTypes.length > 0) {
    body.principal = filter.principalTypes;
  }
  if (filter.actorId) body.actorId = filter.actorId;
  if (filter.actions && filter.actions.length > 0) body.action = filter.actions;
  if (filter.targetResource) body.targetResource = filter.targetResource;
  if (filter.from) body.from = filter.from;
  if (filter.to) body.to = filter.to;

  const response = await fetch(`${API_BASE_URL}/admin/audit-logs/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed: { message?: string; code?: string; details?: unknown } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON error body — fall through
    }
    throw new ApiError(
      parsed?.message ?? 'Export failed',
      response.status,
      parsed?.code,
      parsed?.details
    );
  }

  const blob = await response.blob();
  const cd = response.headers.get('Content-Disposition') ?? '';
  const filename = parseContentDispositionFilename(cd);
  const rowCount = Number.parseInt(
    response.headers.get('X-Audit-Log-Row-Count') ?? '0',
    10
  );

  return { blob, filename, rowCount };
}

/**
 * R3-H1: robust Content-Disposition `filename` extraction.
 *
 * Per RFC 6266 + RFC 5987 + RFC 2183, a Content-Disposition header may carry:
 *   - `filename="quoted-text"`           (RFC 2183 — ASCII)
 *   - `filename=unquoted-token`          (RFC 2183 — token chars only, no spaces)
 *   - `filename*=UTF-8''percent-encoded` (RFC 5987 — full UTF-8 support)
 *
 * Modern servers commonly emit BOTH `filename=` (legacy fallback) AND `filename*=`
 * (preferred). RFC 6266 §4.3 mandates `filename*` wins when both are present.
 *
 * The previous regex (`/filename="?([^";]+)"?/i`) failed in two ways:
 *   1. Greedy match could capture across the `;` separator if the filename was
 *      unquoted with a trailing space — undefined behaviour territory.
 *   2. Ignored `filename*=` entirely — non-ASCII filenames silently degraded
 *      to the generic fallback.
 *
 * This helper scans for both forms, prefers the RFC 5987 variant per spec,
 * and decodes percent-encoded bytes through `decodeURIComponent` (UTF-8 only;
 * other charsets fall back to the legacy `filename=` if available).
 */
function parseContentDispositionFilename(cd: string): string {
  const FALLBACK = 'audit_log.csv';
  if (!cd) return FALLBACK;

  // Try RFC 5987 first (preferred per RFC 6266 §4.3).
  // Format: `filename*=charset'lang'percent-encoded-bytes`
  const star = cd.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (star) {
    const charset = (star[1] ?? '').toUpperCase();
    const encoded = star[2].trim();
    if (charset === '' || charset === 'UTF-8') {
      try {
        const decoded = decodeURIComponent(encoded);
        if (decoded.length > 0) return decoded;
      } catch {
        // malformed percent-encoding — fall through to RFC 2183 path
      }
    }
  }

  // Fall back to RFC 2183 plain `filename=`. Handle quoted + unquoted forms.
  // Quoted form: filename="some name with spaces.csv"
  const quoted = cd.match(/filename\s*=\s*"([^"]*)"/i);
  if (quoted && quoted[1].length > 0) return quoted[1];

  // Unquoted token form: filename=audit_log.csv (no spaces, no specials)
  const token = cd.match(/filename\s*=\s*([^;\s]+)/i);
  if (token && token[1].length > 0) return token[1];

  return FALLBACK;
}
