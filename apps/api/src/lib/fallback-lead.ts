/**
 * Story 13-3 (AC2/AC3) — Static-fallback CALLBACK lead: validation + the canonical record shape.
 *
 * The Cloudflare-cached fallback page captures name + phone + LGA when the home box is degraded
 * (AC2.2 — a callback request, NOT a half-registration: "we'll text you a link to finish"). This
 * PURE module is the source of truth for the lead's validated shape, so the eventual Epic 11 / 13-2
 * importer round-trips these leads (`imported_unverified`) using the SAME mapping the edge Function
 * captures with. No DB / no Cloudflare deps here — just input → {ok, lead | errors}.
 */

export interface FallbackLeadInput {
  fullName?: unknown;
  phone?: unknown;
  lgaCode?: unknown;
}

export interface FallbackLead {
  fullName: string;
  phone: string; // normalised +234…
  lgaCode: string;
  channel: 'static_fallback'; // attribution (aligns with 13-1 campaign_source)
  capturedAt: string; // ISO 8601 — passed in (callers stamp it; keeps this pure/total)
}

export type FallbackLeadResult =
  | { ok: true; lead: FallbackLead }
  | { ok: false; errors: string[] };

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

const MAX = 120;

/** Validate + normalise a raw fallback submission into the canonical lead. PURE + total. */
export function normalizeFallbackLead(input: FallbackLeadInput, capturedAt: string): FallbackLeadResult {
  const errors: string[] = [];

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().slice(0, MAX) : '';
  if (fullName.length < 2) errors.push('name is required');

  const phoneRaw = typeof input.phone === 'string' ? input.phone.trim() : '';
  const phone = phoneRaw ? normalizePhoneNg(phoneRaw) : null;
  if (!phone) errors.push('a valid Nigerian phone number is required'); // dedup + re-contact key

  const lgaCode = typeof input.lgaCode === 'string' ? input.lgaCode.trim().slice(0, MAX) : '';
  if (!lgaCode) errors.push('LGA is required');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    lead: { fullName, phone: phone as string, lgaCode, channel: 'static_fallback', capturedAt },
  };
}
