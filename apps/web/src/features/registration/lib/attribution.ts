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

/** The single plain-language channel list (no per-station sub-picker — AC2.4). */
export const ACQUISITION_CHANNELS = [
  'Radio',
  'TV',
  'Word of mouth',
  'Association / cooperative',
  'Search engine',
  'Facebook',
  'Instagram',
  'Twitter / X',
  'Other',
] as const;

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

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
