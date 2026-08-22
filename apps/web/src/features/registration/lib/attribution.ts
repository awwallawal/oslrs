/**
 * Story 13-1 — Campaign attribution capture: config + pure helpers (single source of truth, AC2.3).
 *
 * The wizard captures two best-effort signals into the draft's forward-compat `form_data.extras`
 * slot — a UTM/`?ref` parse on entry (`extras.utm`) and an optional "How did you hear about us?"
 * answer on the Review step (`extras.acquisition`) — which the API merges into
 * `submissions.raw_data.campaign_source` at submit. NEITHER ever blocks a submit.
 *
 * Rollback (AC6.3): flip ATTRIBUTION_ENABLED to false + redeploy — the question hides and UTM
 * capture no-ops, with zero effect on the rest of the funnel (one-line, ≤2-min revert).
 */
export const ATTRIBUTION_ENABLED = true;

/**
 * The single plain-language channel list (no per-station sub-picker — AC2.4).
 *
 * ⚠️ ORDER IS DE-BIASED, AND THAT IS LOAD-BEARING (Story 13-46 AC10b). Radio used to be FIRST —
 * the exact channel a radio jingle exists to measure. First position anchors an answer, so the
 * instrument would have manufactured the very signal it was meant to detect, on the campaign that
 * matters most. The list is now ALPHABETICAL with `Other` pinned last (where a catch-all belongs),
 * which is a rule rather than a taste: nobody has to argue about position again, and Radio's place
 * falls out of the alphabet instead of out of what we hope to hear.
 *
 * ⚠️ DO NOT re-sort this by "most likely first", and do not restore Radio to the top.
 */
export const ACQUISITION_CHANNELS = [
  'Association / cooperative',
  'Facebook',
  'Instagram',
  'Radio',
  'Search engine',
  'TV',
  'Twitter / X',
  'Word of mouth',
  'Other',
] as const;

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

/**
 * Story 13-46 (AC10a) — AN EXPLICIT DECLINE, STORED AS A VALUE.
 *
 * THE BUG THIS FIXES: `<option value="">Prefer not to say</option>` used to be the FIRST option and
 * therefore pre-selected, so a person who never touched the control and a person who deliberately
 * declined produced the IDENTICAL stored result — no `campaign_source` key at all. Every
 * per-channel conclusion after the jingle would have rested on a denominator nobody could
 * reconstruct: we could not say what share of registrants even answered.
 *
 * With a real placeholder as the default, the three states finally separate:
 *   untouched → no key written  (was never answered)
 *   declined  → channel = this constant  (answered: "I'd rather not say")
 *   chosen    → channel = the channel
 *
 * ── HOW THE BREAKDOWN TREATS IT — DECIDED, NOT DISCOVERED (AC10a's warning) ──
 * A decline writes a VALUE, so decliners move INSIDE `getCampaignBreakdown`'s
 * `raw_data -> 'campaign_source' IS NOT NULL` filter (`report.service.ts`). Of the two options the
 * AC offers, this ships **decline as its OWN reported row**, not excluded.
 *
 * WHY: excluding it would drop decliners straight back into the same invisible bucket as the people
 * who ignored the question — re-creating the exact denominator loss this AC exists to close, one
 * layer further down. As its own row the response rate is computable
 * (answered = channels + declines) and the row is self-labelling, so no reader mistakes it for a
 * marketing channel.
 */
export const ACQUISITION_DECLINED = 'Prefer not to say';

/** The non-submitting placeholder. Its value is `''`, which writes NO key — that IS "untouched". */
export const ACQUISITION_PLACEHOLDER_LABEL = '— Select —';

/** True when the stored channel represents a deliberate decline rather than a channel. */
export function isDeclinedChannel(channel?: string | null): boolean {
  return channel === ACQUISITION_DECLINED;
}

export interface CapturedUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  ref?: string;
}

const MAX = 120; // cap each value so a crafted URL can't bloat the draft

/**
 * Parse the BOUNDED UTM/`?ref` allow-list from the URL (AC1.4 — never sweep arbitrary params).
 * Returns null when none are present (AC1.2 — best-effort, empty → no write).
 */
/** The bounded attribution payload carried in the SUBMIT body (mirrors the API's `campaignSource`). */
export interface CampaignSourcePayload {
  channel?: string;
  utm?: CapturedUtm;
}

/**
 * Map the draft's `extras` slot to the submit payload's `campaignSource` (added
 * 2026-07-30).
 *
 * WHY: attribution used to reach the server ONLY via the debounced wizard draft.
 * That failed twice over — the draft-step cap froze every autosave past step 5 so
 * `extras` could never persist at all, and even uncapped, the acquisition answer
 * is chosen on the Review step with Submit directly beneath it, so anyone
 * submitting inside the 2s debounce lost it silently. Carrying it in the payload
 * makes attribution independent of the draft, exactly as Story 13-23 did for
 * `questionnaireFormId`.
 *
 * Returns `undefined` when nothing was captured, so the key is omitted from the
 * body entirely rather than sent as an empty object (the server treats an empty
 * UTM as "no UTM" for the same reason: a hollow `campaign_source` row would
 * inflate the attributed count while reporting nothing).
 */
export function toCampaignSourcePayload(
  extras: Record<string, unknown> | undefined,
): CampaignSourcePayload | undefined {
  if (!extras) return undefined;
  const channel = boundedString(
    (extras.acquisition as { channel?: unknown } | undefined)?.channel,
    CHANNEL_MAX,
  );
  const utm = boundedUtm(extras.utm);
  const hasUtm = Object.keys(utm).length > 0;
  if (!channel && !hasUtm) return undefined;
  return { ...(channel ? { channel } : {}), ...(hasUtm ? { utm } : {}) };
}

/**
 * ⚠️ SANITISE — do not replace these with a cast (adjudication finding, 2026-07-31).
 *
 * `extras` is NOT trustworthy input. The draft schema declares it
 * `extras: z.record(z.unknown())` (`registration.controller.ts:111`), i.e. the
 * server stores whatever any client PUT there — it is the forward-compat slot, so
 * that looseness is deliberate and correct. But the SUBMIT field it now feeds is
 * `.strict()` and bounded (`registration.schema.ts` → `campaignSource`: channel
 * ≤64, utm allow-list of exactly source/medium/campaign/ref, each ≤120).
 *
 * Casting `extras.utm as CapturedUtm` asserted a shape nothing enforces, so a draft
 * carrying a fifth utm key, an over-long value, or a non-string would have made the
 * server reject the ENTIRE registration. Measured on the real schema:
 *   conforming            → SUBMIT OK
 *   utm w/ a 5th key      → 400 campaignSource.utm:unrecognized_keys
 *   value > 120 chars     → 400 campaignSource.utm.source:too_big
 *   channel > 64 chars    → 400 campaignSource.channel:too_big
 *   non-string value      → 400 campaignSource.utm.source:invalid_type
 * That contradicts this story's own invariant — *attribution is best-effort and
 * must NEVER block a submit* (AC2.2/AC6) — which `buildCampaignSource` upholds
 * server-side while the payload path reintroduced blocking one layer earlier, at
 * validation. Dropping a bad value costs one attribution row; rejecting the payload
 * costs the registration.
 *
 * Keep these bounds in step with the server schema; they are deliberately the same
 * numbers as `parseUtm`'s existing capture-time clamp.
 */
const CHANNEL_MAX = 64;

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Keep ONLY the four allow-listed keys, each a bounded string. Never widen without widening the server. */
function boundedUtm(value: unknown): CapturedUtm {
  const utm: CapturedUtm = {};
  if (!value || typeof value !== 'object') return utm;
  const source = value as Record<string, unknown>;
  for (const key of ['source', 'medium', 'campaign', 'ref'] as const) {
    const clean = boundedString(source[key], MAX);
    if (clean) utm[key] = clean;
  }
  return utm;
}

export function parseUtm(params: URLSearchParams): CapturedUtm | null {
  const utm: CapturedUtm = {};
  const src = params.get('utm_source');
  const med = params.get('utm_medium');
  const camp = params.get('utm_campaign');
  const ref = params.get('ref');
  if (src) utm.source = src.slice(0, MAX);
  if (med) utm.medium = med.slice(0, MAX);
  if (camp) utm.campaign = camp.slice(0, MAX);
  if (ref) utm.ref = ref.slice(0, MAX);
  return Object.keys(utm).length > 0 ? utm : null;
}
