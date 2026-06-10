/**
 * Cloudflare Analytics — shared fetch + aggregation lib.
 *
 * One source of truth for both:
 *   - the operator CLI deep-dive  (apps/api/scripts/cf-analytics.ts)
 *   - the operator dashboard CF section (apps/api/scripts/dashboard.ts)
 *
 * Two complementary datasets (see cf-analytics.ts header for the full rationale):
 *   - RUM / Web Analytics  (account-scoped `rumPageloadEventsAdaptiveGroups`)
 *     → page-views / visits / top pages / countries (the conversion funnel).
 *   - Zone Analytics       (zone-scoped `httpRequests1dGroups`, FREE-plan dataset)
 *     → requests / bandwidth / cache ratio / status mix / threats (traffic + attack).
 *
 * Network functions degrade gracefully: callers get `null` (no token) or a
 * thrown error they can catch. The pure `summarize*` helpers have no I/O and
 * are unit-tested.
 *
 * Identifiers (non-secret) default to the OSLRS account + oyoskills zone; the
 * only secret is CLOUDFLARE_API_TOKEN. `oyotradeministry.com.ng` is a 302
 * redirect post-F-024 (NOT a CF zone) — there is no second zone to read.
 */

const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

export const CF_DEFAULT_ACCOUNT_TAG = 'b6dc1b19258fba578dde1f109aa595f5';
export const CF_DEFAULT_ZONE_OYOSKILLS = '36d557ce1b85e94a349d0c94e9cc197a';

// ─── Raw GraphQL response shapes (loosely typed — Cloudflare's schema) ───────
interface RumGroup {
  count?: number;
  sum?: { visits?: number };
  dimensions?: { requestHost?: string; requestPath?: string; countryName?: string };
}
export interface RumAccountNode {
  total?: RumGroup[];
  byHost?: RumGroup[];
  byPath?: RumGroup[];
  byCountry?: RumGroup[];
}
interface ZoneStatusEntry {
  edgeResponseStatus: number;
  requests?: number;
}
interface ZoneCountryEntry {
  clientCountryName: string;
  requests?: number;
  threats?: number;
}
interface ZoneDaySum {
  requests?: number;
  bytes?: number;
  cachedRequests?: number;
  cachedBytes?: number;
  threats?: number;
  pageViews?: number;
  responseStatusMap?: ZoneStatusEntry[];
  countryMap?: ZoneCountryEntry[];
}
export interface ZoneDayRow {
  dimensions?: { date?: string };
  uniq?: { uniques?: number };
  sum?: ZoneDaySum;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface CloudflareRumSummary {
  pageViews: number;
  visits: number;
  byHost: Array<{ host: string; views: number; visits: number }>;
  topPages: Array<{ page: string; views: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

export interface CloudflareZoneSummary {
  windowLabel: string;
  requests: number;
  bytes: number;
  cachedRequests: number;
  cacheHitPct: number;
  threats: number;
  uniques: number;
  pageViews: number;
  status: Array<{ code: number; count: number }>;
  countries: Array<{ country: string; count: number }>;
  byDay: Array<{ date: string; requests: number; threats: number }>;
}

export interface CloudflareDashboardSummary {
  rum: CloudflareRumSummary | null;
  zone: CloudflareZoneSummary | null;
  rumError?: string;
  zoneError?: string;
}

// ─── GraphQL transport ───────────────────────────────────────────────────────
async function gql<T>(token: string, query: string): Promise<T> {
  const res = await fetch(CF_GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Cloudflare API HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(`Cloudflare GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  return body.data as T;
}

// ─── RUM / Web Analytics (account-scoped) ────────────────────────────────────
export async function fetchRum(token: string, accountTag: string, startISO: string, endISO: string): Promise<RumAccountNode | null> {
  const flt = `{ datetime_geq: "${startISO}", datetime_leq: "${endISO}" }`;
  const query = `
    query {
      viewer {
        accounts(filter: { accountTag: "${accountTag}" }) {
          total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: ${flt}) {
            count
            sum { visits }
          }
          byHost: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${flt}, orderBy: [count_DESC]) {
            count
            sum { visits }
            dimensions { requestHost }
          }
          byPath: rumPageloadEventsAdaptiveGroups(limit: 15, filter: ${flt}, orderBy: [count_DESC]) {
            count
            dimensions { requestPath requestHost }
          }
          byCountry: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${flt}, orderBy: [count_DESC]) {
            count
            dimensions { countryName }
          }
        }
      }
    }`;
  const data = await gql<{ viewer?: { accounts?: RumAccountNode[] } }>(token, query);
  return data?.viewer?.accounts?.[0] ?? null;
}

// ─── Zone Analytics (zone-scoped, FREE-plan daily rollups) ───────────────────
export async function fetchZoneDays(token: string, zoneTag: string, startDate: string, endDate: string): Promise<ZoneDayRow[]> {
  const flt = `{ date_geq: "${startDate}", date_leq: "${endDate}" }`;
  const query = `
    query {
      viewer {
        zones(filter: { zoneTag: "${zoneTag}" }) {
          httpRequests1dGroups(limit: 31, filter: ${flt}, orderBy: [date_ASC]) {
            dimensions { date }
            uniq { uniques }
            sum {
              requests
              bytes
              cachedRequests
              cachedBytes
              threats
              pageViews
              responseStatusMap { edgeResponseStatus requests }
              countryMap { clientCountryName requests threats }
            }
          }
        }
      }
    }`;
  const data = await gql<{ viewer?: { zones?: Array<{ httpRequests1dGroups?: ZoneDayRow[] }> } }>(token, query);
  return data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
}

// ─── Pure aggregation (unit-tested, no I/O) ──────────────────────────────────
export function summarizeRum(account: RumAccountNode | null): CloudflareRumSummary | null {
  if (!account) return null;
  const total = account.total?.[0];
  return {
    pageViews: total?.count ?? 0,
    visits: total?.sum?.visits ?? 0,
    byHost: (account.byHost ?? []).map((r) => ({
      host: r.dimensions?.requestHost ?? '(unknown)',
      views: r.count ?? 0,
      visits: r.sum?.visits ?? 0,
    })),
    topPages: (account.byPath ?? []).map((r) => ({
      page: `${r.dimensions?.requestHost ?? ''}${r.dimensions?.requestPath ?? ''}`,
      views: r.count ?? 0,
    })),
    topCountries: (account.byCountry ?? []).map((r) => ({
      country: r.dimensions?.countryName ?? '??',
      count: r.count ?? 0,
    })),
  };
}

export function summarizeZone(days: ZoneDayRow[] | null | undefined, windowLabel: string): CloudflareZoneSummary | null {
  if (!days || days.length === 0) return null;
  let requests = 0;
  let bytes = 0;
  let cachedRequests = 0;
  let threats = 0;
  let pageViews = 0;
  let uniques = 0;
  const statusMap = new Map<number, number>();
  const countryMap = new Map<string, number>();
  const byDay: CloudflareZoneSummary['byDay'] = [];

  for (const d of days) {
    const s = d.sum ?? {};
    requests += s.requests ?? 0;
    bytes += s.bytes ?? 0;
    cachedRequests += s.cachedRequests ?? 0;
    threats += s.threats ?? 0;
    pageViews += s.pageViews ?? 0;
    uniques += d.uniq?.uniques ?? 0;
    for (const st of s.responseStatusMap ?? []) {
      statusMap.set(st.edgeResponseStatus, (statusMap.get(st.edgeResponseStatus) ?? 0) + (st.requests ?? 0));
    }
    for (const ct of s.countryMap ?? []) {
      countryMap.set(ct.clientCountryName, (countryMap.get(ct.clientCountryName) ?? 0) + (ct.requests ?? 0));
    }
    byDay.push({ date: d.dimensions?.date ?? '?', requests: s.requests ?? 0, threats: s.threats ?? 0 });
  }

  return {
    windowLabel,
    requests,
    bytes,
    cachedRequests,
    cacheHitPct: requests > 0 ? Math.round((cachedRequests / requests) * 1000) / 10 : 0,
    threats,
    uniques,
    pageViews,
    status: [...statusMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    countries: [...countryMap.entries()].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
    byDay,
  };
}

// ─── Orchestrator for the operator dashboard ─────────────────────────────────
/**
 * Reads env, fetches both datasets, returns a compact summary. Returns `null`
 * when no token is configured (so the dashboard renders "section unavailable"
 * rather than erroring). Per-dataset failures degrade to a `*Error` string.
 */
export async function getCloudflareDashboardSummary(days = 7): Promise<CloudflareDashboardSummary | null> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return null;

  const accountTag = process.env.CLOUDFLARE_ACCOUNT_TAG || CF_DEFAULT_ACCOUNT_TAG;
  const zoneTag = process.env.CLOUDFLARE_ZONE_TAG_OYOSKILLS || CF_DEFAULT_ZONE_OYOSKILLS;

  const end = new Date();
  const startISO = new Date(end.getTime() - days * 86400000).toISOString();
  const endISO = end.toISOString();
  const startDate = startISO.slice(0, 10);
  const endDate = endISO.slice(0, 10);

  const result: CloudflareDashboardSummary = { rum: null, zone: null };

  const [rumRes, zoneRes] = await Promise.allSettled([
    fetchRum(token, accountTag, startISO, endISO),
    fetchZoneDays(token, zoneTag, startDate, endDate),
  ]);

  if (rumRes.status === 'fulfilled') result.rum = summarizeRum(rumRes.value);
  else result.rumError = String(rumRes.reason);

  if (zoneRes.status === 'fulfilled') result.zone = summarizeZone(zoneRes.value, `${startDate} → ${endDate}`);
  else result.zoneError = String(zoneRes.reason);

  return result;
}
