/**
 * OSLRS Cloudflare Analytics — CLI
 *
 * Pulls a single-command snapshot of what is happening on the live sites,
 * across TWO complementary Cloudflare datasets:
 *
 *   1. Web Analytics (RUM)  — page-views / visits / top paths / countries,
 *      keyed off the in-page beacon (apps/web/index.html). Best for the
 *      conversion FUNNEL (which pages people land on, where they drop).
 *      Captures only JS-enabled browsers. Account-scoped.
 *
 *   2. Zone Analytics (server-side) — total requests / bandwidth / cache
 *      ratio / HTTP status mix / threats blocked / top countries, measured
 *      at the edge for EVERY request through the proxy (incl. no-JS clients,
 *      bots, raw API hits). Best for spotting a VIRAL SPIKE or a DDoS.
 *      Zone-scoped — one zone per domain.
 *
 * IMPORTANT (post-F-024, 2026-06-07): only ONE Cloudflare zone exists —
 * `oyoskills.com`. `oyotradeministry.com.ng` was RETIRED to a 302 redirect
 * → oyoskills.com (it is NOT a CF zone, has no zone analytics, serves no
 * pages). All real traffic + the conversion funnel live on oyoskills.com.
 * The single RUM beacon (account-scoped) captures it; zone analytics is the
 * oyoskills zone only (no ministry zone exists — the dead domain has none, 9-53).
 *
 * --- Setup (one-time) -------------------------------------------------------
 * Account ID + the oyoskills Zone ID are already wired as defaults below
 * (they are identifiers, not secrets — see ssh_analysis.txt 2026-05-19).
 * You normally only need to supply the TOKEN:
 *
 *   CLOUDFLARE_API_TOKEN=...           # REQUIRED — the only secret
 *   CLOUDFLARE_ACCOUNT_TAG=...         # optional override (default: oyoskills account)
 *   CLOUDFLARE_ZONE_TAG_OYOSKILLS=...  # optional override (default: oyoskills zone)
 *
 * A token already exists (broad read "Cloudflare Agent Token", 2026-05-19)
 * with Account Analytics:Read + zone Analytics:Read — sufficient for this.
 *
 * --- Usage ------------------------------------------------------------------
 *   pnpm tsx apps/api/scripts/cf-analytics.ts                 # last 7 days
 *   pnpm tsx apps/api/scripts/cf-analytics.ts --days 1        # last 24h
 *   pnpm tsx apps/api/scripts/cf-analytics.ts --days 30       # last 30 days
 *   pnpm tsx apps/api/scripts/cf-analytics.ts --json          # raw JSON (for piping)
 *
 * No DB / Redis connection — safe to run from a laptop. Read-only.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import {
  fetchRum,
  fetchZoneDays,
  CF_DEFAULT_ACCOUNT_TAG,
  CF_DEFAULT_ZONE_OYOSKILLS,
} from '../src/lib/cloudflare-analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, '../../../.env') });

// Non-secret identifiers default to the OSLRS account + oyoskills zone (see lib).
const DEFAULT_ACCOUNT_TAG = CF_DEFAULT_ACCOUNT_TAG;
const DEFAULT_ZONE_OYOSKILLS = CF_DEFAULT_ZONE_OYOSKILLS;

// ─── Color helpers (no chalk dep — matches dashboard.ts house style) ─────────
const ESC = '\x1b[';
const c = {
  reset: `${ESC}0m`,
  bold: (s: string) => `${ESC}1m${s}${ESC}0m`,
  dim: (s: string) => `${ESC}2m${s}${ESC}0m`,
  green: (s: string) => `${ESC}32m${s}${ESC}0m`,
  yellow: (s: string) => `${ESC}33m${s}${ESC}0m`,
  red: (s: string) => `${ESC}31m${s}${ESC}0m`,
  cyan: (s: string) => `${ESC}36m${s}${ESC}0m`,
  gray: (s: string) => `${ESC}90m${s}${ESC}0m`,
};

// ─── Arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  let days = 7;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') days = Math.max(1, Number(argv[++i] ?? '7') || 7);
    else if (a === '--json') json = true;
  }
  return { days, json };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

// GraphQL transport + fetch queries live in ../src/lib/cloudflare-analytics.ts
// (shared with the operator dashboard). This script owns only the ANSI render.

// ─── Renderers ───────────────────────────────────────────────────────────────
function h(title: string) {
  console.log(`\n${c.bold(c.cyan(`━━━ ${title} `))}${c.cyan('━'.repeat(Math.max(0, 50 - title.length)))}`);
}

function renderRum(rum: any) {
  h('Web Analytics (RUM / page-views)');
  if (!rum) {
    console.log(c.gray('  (no data — beacon may be new, or no JS traffic in window)'));
    return;
  }
  const total = rum.total?.[0];
  console.log(`  Page views: ${c.bold(fmt(total?.count ?? 0))}   Visits: ${c.bold(fmt(total?.sum?.visits ?? 0))}`);

  console.log(c.dim('\n  By host:'));
  for (const r of rum.byHost ?? []) {
    console.log(`    ${(r.dimensions.requestHost || '(unknown)').padEnd(34)} ${fmt(r.count).padStart(8)} views  ${fmt(r.sum?.visits ?? 0).padStart(7)} visits`);
  }

  console.log(c.dim('\n  Top pages:'));
  for (const r of (rum.byPath ?? []).slice(0, 12)) {
    const p = `${r.dimensions.requestHost}${r.dimensions.requestPath}`;
    console.log(`    ${p.slice(0, 48).padEnd(48)} ${fmt(r.count).padStart(8)}`);
  }

  console.log(c.dim('\n  Top countries:'));
  for (const r of (rum.byCountry ?? []).slice(0, 8)) {
    console.log(`    ${(r.dimensions.countryName || '??').padEnd(20)} ${fmt(r.count).padStart(8)}`);
  }
}

function renderZone(label: string, days: any[], windowNote: string) {
  h(`Zone Analytics — ${label} ${c.gray(`(${windowNote})`)}`);
  if (!days || days.length === 0) {
    console.log(c.gray('  (no data — free-plan retention is limited; try a shorter --days)'));
    return;
  }

  // Aggregate across the daily rollups.
  let requests = 0;
  let bytes_ = 0;
  let cachedRequests = 0;
  let threats = 0;
  let pageViews = 0;
  let uniques = 0;
  const statusMap = new Map<number, number>();
  const countryMap = new Map<string, number>();
  for (const d of days) {
    const s = d.sum ?? {};
    requests += s.requests ?? 0;
    bytes_ += s.bytes ?? 0;
    cachedRequests += s.cachedRequests ?? 0;
    threats += s.threats ?? 0;
    pageViews += s.pageViews ?? 0;
    uniques += d.uniq?.uniques ?? 0;
    for (const st of s.responseStatusMap ?? []) statusMap.set(st.edgeResponseStatus, (statusMap.get(st.edgeResponseStatus) ?? 0) + (st.requests ?? 0));
    for (const ct of s.countryMap ?? []) countryMap.set(ct.clientCountryName, (countryMap.get(ct.clientCountryName) ?? 0) + (ct.requests ?? 0));
  }

  const ratio = requests > 0 ? ((cachedRequests / requests) * 100).toFixed(1) : '0.0';
  console.log(`  Requests: ${c.bold(fmt(requests))}   Bandwidth: ${c.bold(bytes(bytes_))}   Page views: ${c.bold(fmt(pageViews))}   Uniques: ${c.bold(fmt(uniques))}`);
  console.log(`  Cache hit ratio: ${c.bold(`${ratio}%`)}  ${c.gray('(higher = less load on the droplet)')}`);
  console.log(c.dim('  Threats blocked: ') + (threats > 0 ? c.yellow(fmt(threats)) : c.green('0')));

  console.log(c.dim('\n  HTTP status:'));
  for (const [code, count] of [...statusMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    const col = code >= 500 ? c.red : code >= 400 ? c.yellow : c.green;
    console.log(`    ${col(String(code))}  ${fmt(count).padStart(8)}`);
  }

  console.log(c.dim('\n  Top countries:'));
  for (const [country, count] of [...countryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${(country || '??').padEnd(20)} ${fmt(count).padStart(8)}`);
  }

  // Per-day requests sparkline-ish line.
  console.log(c.dim('\n  Requests by day:'));
  for (const d of days) {
    console.log(`    ${d.dimensions.date}   ${fmt(d.sum?.requests ?? 0).padStart(8)}  ${c.gray(`${((d.sum?.threats ?? 0) > 0 ? `${d.sum.threats} threats` : '')}`)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { days, json } = parseArgs(process.argv.slice(2));

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_TAG || DEFAULT_ACCOUNT_TAG;
  const zoneOyoskills = process.env.CLOUDFLARE_ZONE_TAG_OYOSKILLS || DEFAULT_ZONE_OYOSKILLS;
  // Single CF zone: oyoskills.com. (oyotradeministry.com.ng was retired to a 302 redirect, F-024 — no zone exists.)

  if (!token) {
    console.error(c.red('\n❌ CLOUDFLARE_API_TOKEN missing from .env.'));
    console.error(c.gray('   This is the ONLY value you need — account + zone IDs are wired as defaults.'));
    console.error(c.gray('   A broad "Cloudflare Agent Token" already exists (Account Analytics:Read +'));
    console.error(c.gray('   Zone Analytics:Read). Add its secret to .env as:  CLOUDFLARE_API_TOKEN=...'));
    console.error(c.gray('   (or mint a narrow one at https://dash.cloudflare.com/profile/api-tokens)'));
    process.exit(1);
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // Zone analytics (httpRequests1dGroups) uses date-only filters (daily rollups).
  const zoneStartDate = startISO.slice(0, 10);
  const zoneEndDate = endISO.slice(0, 10);
  const zoneWindowNote = `${zoneStartDate} → ${zoneEndDate}, daily`;

  console.log(c.bold(`\n🌩  Cloudflare Analytics — last ${days} day(s)`));
  console.log(c.gray(`   ${startISO}  →  ${endISO}`));

  const out: Record<string, unknown> = { window: { startISO, endISO, days } };

  // RUM (account-scoped, both hosts in one beacon)
  if (accountTag) {
    try {
      const rum = await fetchRum(token, accountTag, startISO, endISO);
      out.rum = rum;
      if (!json) renderRum(rum);
    } catch (err) {
      out.rumError = String(err);
      if (!json) console.log(c.red(`\n  Web Analytics error: ${String(err)}`));
    }
  } else if (!json) {
    console.log(c.gray('\n  (CLOUDFLARE_ACCOUNT_TAG not set — skipping Web Analytics)'));
  }

  // Zone analytics per domain
  for (const [label, zoneTag] of [
    ['oyoskills.com', zoneOyoskills],
  ] as const) {
    if (!zoneTag) {
      if (!json) console.log(c.gray(`\n  (zone tag for ${label} not set — skipping)`));
      continue;
    }
    try {
      const zone = await fetchZoneDays(token, zoneTag, zoneStartDate, zoneEndDate);
      out[`zone_${label}`] = zone;
      if (!json) renderZone(label, zone, zoneWindowNote);
    } catch (err) {
      out[`zoneError_${label}`] = String(err);
      if (!json) console.log(c.red(`\n  Zone error (${label}): ${String(err)}`));
    }
  }

  if (json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('');
  }
}

// Only run when executed directly (lets unit tests import pure helpers).
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === __filename) {
  main().catch((err) => {
    console.error(c.red(`\nFatal: ${String(err)}`));
    process.exit(1);
  });
}

export { parseArgs, fmt, bytes };
