/**
 * Story 9-50 — Expiry Monitoring framework (one framework, three source adapters).
 *
 * Surfaces a server-computed days-until-expiry countdown for every time-sensitive piece
 * of infrastructure so no silent lapse (cert → CF 526, domain → total outage incl. email,
 * token → integration failure) can take the platform down. Rides `GET /system/health`
 * (MonitoringService.getSystemHealth) and the existing alert pipeline (alert.service.ts).
 *
 * Adapters (keyed by `kind`): `cert` (local .pem files), `domain` (RDAP registration expiry),
 * `manual` (operator-declared). Adding a kind/item is ADDITIVE — no type/dashboard/alert change.
 *
 * Hard rule (AC#1): every adapter is FAIL-OPEN. A failing source yields a `status:'error'`
 * item and NEVER throws into getSystemHealth (which is polled and must stay fast).
 */
import { readFile } from 'node:fs/promises'; // async — never block the polled getSystemHealth path (L3)
import { basename } from 'node:path';
import { X509Certificate } from 'node:crypto';
import pino from 'pino';
import type { MonitoredExpiry } from '@oslsr/types';

const logger = pino({ name: 'expiry-monitor' });

/** Thresholds mirror alert.service `expiry` config (60 warning / 30 critical, direction below). */
export const EXPIRY_WARNING_DAYS = 60;
export const EXPIRY_CRITICAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 5000;
const RDAP_OK_CACHE_MS = 12 * 60 * 60 * 1000; // ≥12h for a resolved result (AC#4)
const RDAP_ERR_CACHE_MS = 60 * 60 * 1000; // shorter negative cache so a blip retries within the hour

/** Default monitored certs — the two manual F-024 certs (no auto-renewal). `.pem` only. */
const DEFAULT_CERTS: Array<{ name: string; path: string }> = [
  { name: 'cloudflare-origin', path: '/etc/ssl/cloudflare/oyoskills-origin.pem' },
  { name: 'cloudflare-aop-ca', path: '/etc/ssl/cloudflare/origin-pull-ca.pem' },
];
const DEFAULT_DOMAINS = ['oyoskills.com'];

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ── pure helpers (exported for tests + reuse) ────────────────────────────────

/** Whole days from `now` until `expiresAt` (can be negative once expired). */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Status from days-remaining. Matches the ALERT thresholds (critical <30, warning <60) so the
 * dashboard colour and the alert never disagree — note this means exactly 60 days renders `ok`
 * ("matching the alert" in AC#7 takes precedence over its inclusive "amber 30–60d" wording). (L1)
 */
export function statusFromDays(days: number): 'ok' | 'warning' | 'critical' {
  if (days < EXPIRY_CRITICAL_DAYS) return 'critical';
  if (days < EXPIRY_WARNING_DAYS) return 'warning';
  return 'ok';
}

/** Assemble a MonitoredExpiry; a null/invalid `expiresAt` → `error` (can't-determine is itself worth knowing). */
export function buildExpiry(
  name: string,
  kind: MonitoredExpiry['kind'],
  expiresAt: Date | null,
  detail: string,
  now: Date,
): MonitoredExpiry {
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return { name, kind, expiresAt: null, daysUntilExpiry: null, status: 'error', detail };
  }
  const days = daysUntilExpiry(expiresAt, now);
  return { name, kind, expiresAt: expiresAt.toISOString(), daysUntilExpiry: days, status: statusFromDays(days), detail };
}

// ── cert adapter (AC#3) ──────────────────────────────────────────────────────

function configuredCerts(): Array<{ name: string; path: string }> {
  const env = (process.env.CERT_MONITOR_PATHS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (env.length === 0) return DEFAULT_CERTS;
  return env.map((p) => ({ name: basename(p).replace(/\.pem$/i, ''), path: p }));
}

export async function certAdapter(now: Date): Promise<MonitoredExpiry[]> {
  return Promise.all(
    configuredCerts().map(async ({ name, path }) => {
      const itemName = `cert:${name}`;
      if (!path.toLowerCase().endsWith('.pem')) {
        // .pem ONLY — never read a .key (Origin Cert key is 600 root).
        return buildExpiry(itemName, 'cert', null, `refused non-.pem path: ${path}`, now);
      }
      try {
        const cert = new X509Certificate(await readFile(path, 'utf8'));
        return buildExpiry(itemName, 'cert', new Date(cert.validTo), path, now);
      } catch (err) {
        return buildExpiry(itemName, 'cert', null, `unreadable: ${errMsg(err)}`, now);
      }
    }),
  );
}

// ── domain adapter (AC#4) ────────────────────────────────────────────────────

interface RdapCacheEntry {
  at: number;
  result: MonitoredExpiry;
}
// Bounded by DOMAIN_MONITOR_LIST (keys are configured domains, never user input) — this
// module-global cannot grow unboundedly. Cleared between tests via _clearRdapCache. (L5)
const rdapCache = new Map<string, RdapCacheEntry>();

/** Test seam — clear the RDAP cache between cases. */
export function _clearRdapCache(): void {
  rdapCache.clear();
}

function configuredDomains(): string[] {
  const env = (process.env.DOMAIN_MONITOR_LIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_DOMAINS;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

async function fetchDomainExpiry(domain: string, now: Date): Promise<MonitoredExpiry> {
  // M2: runs inside the polled getSystemHealth path. The live RDAP hop is bounded by BOTH the
  // 5s AbortController AND the 12h success-cache, so a real fetch happens ~once/12h (+ cold start);
  // every other poll returns the cached result instantly. Acceptable for a 1–2 domain list.
  const name = `domain:${domain}`;
  const cached = rdapCache.get(domain);
  if (cached) {
    const ttl = cached.result.status === 'error' ? RDAP_ERR_CACHE_MS : RDAP_OK_CACHE_MS;
    if (now.getTime() - cached.at < ttl) return cached.result;
  }

  let result: MonitoredExpiry;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/rdap+json' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      result = buildExpiry(name, 'domain', null, `RDAP HTTP ${res.status}`, now);
    } else {
      const json = (await res.json()) as { events?: RdapEvent[] };
      const event = (json.events ?? []).find((e) => e.eventAction === 'expiration');
      const exp = event?.eventDate ? new Date(event.eventDate) : null;
      result = exp
        ? buildExpiry(name, 'domain', exp, `RDAP registration expiry (${domain})`, now)
        : buildExpiry(name, 'domain', null, 'RDAP returned no expiration event', now);
    }
  } catch (err) {
    // Timeout / unsupported TLD / network — best-effort, never block or throw.
    result = buildExpiry(name, 'domain', null, `RDAP unavailable: ${errMsg(err)}`, now);
  }

  rdapCache.set(domain, { at: now.getTime(), result });
  return result;
}

export async function domainAdapter(now: Date): Promise<MonitoredExpiry[]> {
  return Promise.all(configuredDomains().map((d) => fetchDomainExpiry(d, now)));
}

// ── manual adapter (AC#5) ────────────────────────────────────────────────────

interface ManualItem {
  name?: string;
  kind?: string; // operator JSON — coerced against VALID_KINDS at use (L4)
  expiresAt?: string;
  detail?: string;
}

const VALID_KINDS = ['cert', 'domain', 'manual'] as const;
/** Coerce an operator-supplied kind to a valid one (unknown → 'manual', so it still renders). */
function coerceKind(k: string | undefined): MonitoredExpiry['kind'] {
  return (VALID_KINDS as readonly string[]).includes(k ?? '') ? (k as MonitoredExpiry['kind']) : 'manual';
}

export function manualAdapter(now: Date): MonitoredExpiry[] {
  const raw = process.env.MONITORED_EXPIRIES;
  if (!raw || raw.trim() === '') return [];
  let items: ManualItem[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('MONITORED_EXPIRIES must be a JSON array');
    items = parsed;
  } catch (err) {
    return [buildExpiry('manual:config', 'manual', null, `invalid MONITORED_EXPIRIES: ${errMsg(err)}`, now)];
  }
  return items.map((it, i) => {
    const name = `manual:${it.name ?? `item-${i}`}`;
    const kind = coerceKind(it.kind);
    const exp = it.expiresAt ? new Date(it.expiresAt) : null;
    return buildExpiry(name, kind, exp, it.detail ?? 'operator-declared', now);
  });
}

// ── registry + aggregation (AC#1) ────────────────────────────────────────────

type Adapter = (now: Date) => MonitoredExpiry[] | Promise<MonitoredExpiry[]>;

const ADAPTERS: Array<{ kind: MonitoredExpiry['kind']; run: Adapter }> = [
  { kind: 'cert', run: certAdapter },
  { kind: 'domain', run: domainAdapter },
  { kind: 'manual', run: manualAdapter },
];

/**
 * Run every adapter, each wrapped so a crash becomes a single `error` item — getExpiries
 * NEVER throws (AC#1). Returned flat for the health payload + the dashboard card.
 */
export async function getExpiries(now: Date = new Date()): Promise<MonitoredExpiry[]> {
  const groups = await Promise.all(
    ADAPTERS.map(async ({ kind, run }) => {
      try {
        return await run(now);
      } catch (err) {
        logger.warn({ event: 'expiry.adapter_failed', kind, error: errMsg(err) });
        return [buildExpiry(`${kind}:adapter`, kind, null, `adapter crashed: ${errMsg(err)}`, now)];
      }
    }),
  );
  return groups.flat();
}
