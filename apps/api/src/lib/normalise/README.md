# Input Normalisation Library

Centralised normalisation utilities for input boundaries (submission ingest,
secondary-data import, public registration, staff provisioning).

Built as part of `prep-input-sanitisation-layer` (FRC item #4) to eliminate
ITF-SUPA-style data hygiene problems before they reach the database. Consumed
by future stories (11-2 Import Service, 9-12 Public Wizard) at their
implementation time.

## Design contract

Every normaliser:

- accepts `unknown` input and never throws
- returns `{ value, warnings }` where `value` is the canonical form (or empty
  string / `null` on hard failure) and `warnings` is a list of stable,
  greppable warning codes
- treats warnings as **non-blocking** — the caller is expected to merge them
  into `respondents.metadata.normalisation_warnings` (or an equivalent JSONB
  field) for audit, while still using the canonical value

Stable warning codes mean the audit-log viewer (Story 9-11) can filter and
aggregate by code without parsing free-form messages.

## Modules

### `email.ts` — `normaliseEmail(input: unknown)`

- Lowercases + trims
- Detects domain typos against `typo-dictionary.json` (config, not code —
  updates do not require a deploy)
- Warning codes:
  - `empty_input`
  - `invalid_format` (missing `@` or `@` at boundary)
  - `missing_tld` (domain has no `.`)
  - `suspected_typo:<bad>-><fix>` (domain matched dictionary)

### `phone.ts` — `normaliseNigerianPhone(input: unknown)`

- Returns canonical E.164: `+234XXXXXXXXXX`
- Strips spaces / dashes / parens / dots before parsing
- Accepts `0XXX...`, `+234XXX...`, `234XXX...` prefixes
- Warning codes:
  - `empty_input`
  - `non_numeric`
  - `unknown_format` (no recognised prefix)
  - `wrong_length:expected_10_got_N`
  - `unknown_mobile_prefix:<NN>` (NSN[0..2] not in `{70,80,81,90,91}`)

### `name.ts` — `normaliseFullName(input: unknown)`

- Trims + collapses whitespace + title-cases
- Preserves compound surnames (`adeyemi-bolade` → `Adeyemi-Bolade`)
- Warning codes:
  - `empty_input`
  - `all_caps` (input was all-upper with ≥3 letter run)
  - `single_word` (likely missing surname)

### `date.ts` — `normaliseDate(input: unknown, format?: 'DMY'|'MDY'|'YMD'|'auto')`

- Default `format = 'DMY'` (Nigerian convention)
- ISO-8601 `YYYY-MM-DD` is fast-pathed regardless of `format`
- Two-digit year heuristic: > 50 → 19xx, ≤ 50 → 20xx
- Returns `{ value: Date | null, warnings }`
- Warning codes:
  - `empty_input` / `unparseable_format` / `non_numeric_components`
  - `invalid_iso_date` / `invalid_month:<N>` / `invalid_day:<N>` / `invalid_date_components`
  - `ambiguous_date` (auto mode, day ≤ 12 ∧ month ≤ 12; defaulted to DMY)
  - `two_digit_year_expanded`

### `trade.ts` — `normaliseTrade(input: unknown)`

- Maps free-text trade names to canonical vocabulary (case-insensitive,
  whitespace-collapsed)
- Unmapped inputs return the trimmed verbatim value with `[unmapped]` warning
  for super-admin curation
- Warning codes:
  - `empty_input`
  - `[unmapped]`

## Importing

Use the barrel:

```typescript
import {
  normaliseEmail,
  normaliseNigerianPhone,
  normaliseFullName,
  normaliseDate,
  normaliseTrade,
  type NormaliseResult,
  type NormaliseDateResult,
  type DateFormat,
} from '../lib/normalise/index.js';
```

## Wiring pattern (for downstream story consumption)

The standard wiring at an input boundary:

```typescript
const emailRes = normaliseEmail(rawEmail);
const phoneRes = normaliseNigerianPhone(rawPhone);
const nameRes = normaliseFullName(rawName);
const dateRes = normaliseDate(rawDob, 'DMY');

const allWarnings = [
  ...emailRes.warnings.map((w) => `email:${w}`),
  ...phoneRes.warnings.map((w) => `phone:${w}`),
  ...nameRes.warnings.map((w) => `name:${w}`),
  ...dateRes.warnings.map((w) => `dob:${w}`),
];

const persisted = {
  email: emailRes.value,
  phoneNumber: phoneRes.value,
  fullName: nameRes.value,
  dateOfBirth: dateRes.value,
  metadata: allWarnings.length
    ? { ...(existingMetadata ?? {}), normalisation_warnings: allWarnings }
    : (existingMetadata ?? null),
};
```

The field-prefixed warning codes (`email:suspected_typo:...`) keep audit-log
filtering simple — one stable string per `(field, code)` tuple.

## Hand-off to specific stories

### Story 11-2 (Import Service)

The PDF / CSV / XLSX parsers in 11-2 should call the normalisers on every
parsed row before the dedupe / persist step. The parser layer is the right
place because data hygiene varies wildly across source formats; one
normalisation pass at parser output guarantees canonical data hits the DB.

For ITF-SUPA-style sources where field formats are unknown, use
`normaliseDate(value, 'auto')` and surface `ambiguous_date` warnings in the
import dry-run preview UI.

### Story 9-12 (Public Wizard)

The wizard's server-side validation layer should consume the shared zod
schemas exported from `packages/types/src/normalised.ts`
(`NormalisedEmailSchema`, `NigerianPhoneSchema`, etc.) for declarative
form validation that piggybacks on these normalisers.

The frontend Email-Typo Detection UX (Sally's Form Pattern A.3) is a separate
real-time UX layer that surfaces warnings to the user as they type. That
layer can call these same normalisers via a thin client-side wrapper, or
via a dedicated `/api/v1/normalise/email` endpoint — Story 9-12 picks.

### Submission ingest (Epic 3) and Staff Provisioning (Epic 1)

Already wired by `prep-input-sanitisation-layer` itself. See
`apps/api/src/services/submission-processing.service.ts` (`findOrCreateRespondent`)
and `apps/api/src/services/staff.service.ts` (`createManual` + `processImportRow`).

## Extending the typo dictionary

Edit `typo-dictionary.json`. The file is JSON config read at module load
(`readFileSync` at startup), so adding a new typo entry takes effect on the
next process start (no rebuild required, but a `pm2 restart` is needed).

## Extending the trade vocabulary

Currently hardcoded in `trade.ts` (`TRADE_VOCABULARY`). The seed list is a
conservative set of common Nigerian artisan trades. Extension path:

1. Run the back-fill failure report (`pnpm --filter @oslsr/api report:backfill-failures`)
   to surface accumulated `[unmapped]` rows.
2. Super-admin reviews and decides canonical / synonym mappings.
3. Update `TRADE_VOCABULARY` and ship.

A future story can move the vocabulary to a DB-backed table for live curation
without redeploys, but that's deliberately out of scope here.
