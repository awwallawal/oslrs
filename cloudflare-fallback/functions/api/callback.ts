/**
 * Story 13-3 (AC2.3) — Cloudflare Pages Function: the origin-independent callback capture.
 *
 * Runs at the Cloudflare edge (NOT the home box), so it keeps capturing leads even when
 * `oslsr-home-app` is degraded. Writes name + phone + LGA to Workers KV (`env.LEADS_KV`); the
 * operator drains KV → the Epic 11 / Story 13-2 import path (`imported_unverified`) — see README.md.
 *
 * The validation/normalisation MIRRORS the TESTED canonical source `apps/api/src/lib/fallback-lead.ts`
 * (keep the two in sync — that lib is unit-tested; this edge copy is intentionally dependency-free so
 * it bundles standalone for Pages).
 */
interface KVNamespace {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface Env {
  LEADS_KV: KVNamespace;
}
interface PagesContext {
  request: Request;
  env: Env;
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

function normalizePhoneNg(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  let local: string | null = null;
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^234\d{10}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) local = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) local = digits;
  if (!local || !/^[789]\d{9}$/.test(local)) return null;
  return `+234${local}`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost(ctx: PagesContext): Promise<Response> {
  let input: { fullName?: unknown; email?: unknown; phone?: unknown; lgaCode?: unknown } = {};
  try {
    input = (await ctx.request.json()) as typeof input;
  } catch {
    return json({ ok: false, errors: ['invalid request'] }, 400);
  }

  // MIRRORS apps/api/src/lib/fallback-lead.ts (email-first; phone optional) — keep in sync; the
  // api-side parity test guards against drift.
  const errors: string[] = [];
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().slice(0, 120) : '';
  if (fullName.length < 2) errors.push('name is required');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 254) : '';
  if (!email || !isValidEmail(email)) errors.push('a valid email is required');
  let phone: string | null = null;
  const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (phoneRaw) {
    phone = normalizePhoneNg(phoneRaw);
    if (!phone) errors.push('phone number is not a valid Nigerian mobile');
  }
  const lgaCode = typeof input.lgaCode === 'string' ? input.lgaCode.trim().slice(0, 120) : '';
  if (!lgaCode) errors.push('LGA is required');
  if (errors.length > 0) return json({ ok: false, errors }, 400);

  const lead = {
    fullName,
    email,
    phone,
    lgaCode,
    channel: 'static_fallback' as const,
    capturedAt: new Date().toISOString(),
  };
  // Key sorts by time + carries the email (the required re-contact key) for easy KV drain → 13-2
  // import. 30-day TTL. The KV write is wrapped: this runs during origin degradation, so a KV
  // hiccup must return a friendly 503 (the page asks the user to retry), never an unhandled 500.
  try {
    await ctx.env.LEADS_KV.put(`lead:${lead.capturedAt}:${lead.email}`, JSON.stringify(lead), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  } catch {
    return json({ ok: false, errors: ['could not save right now — please try again in a moment'] }, 503);
  }
  return json({ ok: true }, 200);
}
