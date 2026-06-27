/**
 * Story 13-3 (AC2/AC3) — Static-fallback CALLBACK lead: validation + the canonical record shape.
 *
 * The Cloudflare-cached fallback page captures a callback when the home box is degraded (AC2.2 — a
 * callback request, NOT a half-registration). Re-contact is by EMAIL — the registry's universal
 * channel (magic-link; 100% of the self-serve population provides one), and the only channel that
 * works today (SMS/Termii is blocked on KYC). PHONE is OPTIONAL: kept as the dedup key against the
 * phone-keyed association imports + a future SMS channel, but never required.
 *
 * PURE module (no DB / no Cloudflare deps) — the eventual Epic 11 / 13-2 importer round-trips these
 * leads (`imported_unverified`) using the SAME mapping the edge Function captures with.
 */

export interface FallbackLeadInput {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  lgaCode?: unknown;
}

export interface FallbackLead {
  fullName: string;
  email: string; // REQUIRED — the re-contact channel (magic-link link emailed here)
  phone: string | null; // OPTIONAL — dedup key + future SMS; null when not given
  lgaCode: string;
  channel: 'static_fallback'; // attribution (aligns with 13-1 campaign_source)
  capturedAt: string; // ISO 8601 — passed in (callers stamp it; keeps this pure/total)
}

export type FallbackLeadResult =
  | { ok: true; lead: FallbackLead }
  | { ok: false; errors: string[] };

/** Pragmatic email check (not RFC-exhaustive): local@domain.tld, no whitespace. */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

/**
 * Normalise a Nigerian mobile to `+234XXXXXXXXXX` (mirrors the sheet's "+234 on import" discipline,
 * association-condensed-sheet-spec.md:29). Returns null when it can't be a valid NG mobile.
 */
export function normalizePhoneNg(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  let local: string | null = null;
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^234\d{10}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) local = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) local = digits;
  if (!local || !/^[789]\d{9}$/.test(local)) return null; // NG mobile prefixes 7/8/9
  return `+234${local}`;
}

const NAME_MAX = 120;
const EMAIL_MAX = 254;

/** Validate + normalise a raw fallback submission into the canonical lead. PURE + total. */
export function normalizeFallbackLead(input: FallbackLeadInput, capturedAt: string): FallbackLeadResult {
  const errors: string[] = [];

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().slice(0, NAME_MAX) : '';
  if (fullName.length < 2) errors.push('name is required');

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, EMAIL_MAX) : '';
  if (!email || !isValidEmail(email)) errors.push('a valid email is required'); // the re-contact channel

  // Phone is OPTIONAL — only an error when supplied AND unparseable.
  const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : '';
  let phone: string | null = null;
  if (phoneRaw) {
    phone = normalizePhoneNg(phoneRaw);
    if (!phone) errors.push('phone number is not a valid Nigerian mobile');
  }

  const lgaCode = typeof input.lgaCode === 'string' ? input.lgaCode.trim().slice(0, NAME_MAX) : '';
  if (!lgaCode) errors.push('LGA is required');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    lead: { fullName, email, phone, lgaCode, channel: 'static_fallback', capturedAt },
  };
}
