# Story 9.27 Part B: SMS re-engagement blast via Termii

Status: ready-for-dev (DEV-WAIT — see Sequencing below)

<!--
Authored 2026-05-31 by Bob (SM) via canonical *create-story --yolo workflow.

This is a SIBLING story to the existing `_bmad-output/implementation-
artifacts/9-27-multi-channel-reengagement.md` (the multi-channel
campaign master story). The master file has Part A shipped (commit
`696ab72` 2026-05-22) and Parts B/C/D/E/F at high-level outline. This
sibling expands Part B into implementation-ready scope.

Why a sibling file rather than amending the master in-place:
  - Master 9-27 is already ~600 lines with Part A's full spec
  - Adding 30+ Part B ACs in-place would push it past 1500 lines
  - Sibling keeps the dev-agent's reading surface focused (Amelia
    reads ONE file, not a 4-Part anthology)
  - Cross-reference: master 9-27 § Part B gains a pointer to this file
  - File-naming precedent: 9-28 is a SIBLING to 9-27 covering Cohort A
    decision. Sibling-pattern is established in this project.

PATH DECISION CONTEXT: Awwal confirmed Path 2 + Termii 2026-05-31.
Path 1 (quick + fragile, manual Bitly + no opt-out tracking) was
deliberated and rejected 2026-05-22 then re-confirmed today. Termii
recommended over Sendchamp / BulkSMSNigeria on the basis of (a)
Nigerian-native pricing (~₦2/SMS pay-as-you-go), (b) simple HTTP POST
endpoint that drops into our existing `HttpSMSProvider` class with
ZERO code changes to the service layer (only env-var config), (c)
inbound STOP-webhook support for NCC-compliant opt-out tracking.

STRATEGIC SEQUENCING (locked 2026-05-31, per project_field_readiness_
sequence_2026_05_31.md memory): this story is authored NOW but does
NOT ship live until AFTER Story 9-18 ships. Dev work can start
anytime; live blast deployment waits for the wizard redesign so that
clicks from the SMS land users on a low-friction wizard, not the
current high-stall version.
-->

## Story

As the **Super Admin operating OSLSR's recovery campaigns**,
I want **a Termii-backed SMS blast script + project-hosted URL shortener + STOP opt-out tracking + per-send audit, mirroring the Story 9-27 Part A email-blast discipline**,
So that **the 11 phone-only Cohort A respondents (unreachable via email) AND the 267 Cohort B drafts (reachable via both channels) can be contacted on the empirically-highest-engagement channel for the Nigerian market (95-98% SMS open rate vs 20-30% email), with NCC-compliant opt-out enforcement, with a cost ceiling under ₦1000 for the full blast, and with full audit-trail defense if a recipient later questions the contact**.

## Background — why this story, why now

### The cohort math

Per 2026-05-31 cohort refresh (`docs/vps-snapshots/2026-05-31/cohort-refresh.txt`):

| Group | Email-reachable | Phone-reachable | Notes |
|---|---|---|---|
| Cohort A (hemorrhaged pre-9-26) | 51 | 63 (100%) | **11 phone-only are unique-to-SMS** |
| Cohort B (Cat 1 dedup'd) | 267 | 267 (~100%) | Same recipients, channel choice |
| Cat 1 (completed; reserve for referral) | 57 | 73 | Future Story 9-31+ candidate |

The "11 phone-only Cohort A" subset is the SMS channel's empirically-defensible justification — those 11 cannot be reached at all without SMS. The 267 Cohort B duplicate-with-email cohort gives SMS its volume + measurement opportunity (cross-channel-coordination per Part D).

### Channel performance baseline (Nigerian market)

| Channel | Open rate | Click rate | Cost/recipient |
|---|---|---|---|
| Email | 20-30% (NG) | 2-5% | ~$0 (Resend Pro) |
| **SMS** | **95-98% within 3 min** | **19-29%** | **₦1-3 / segment** |
| WhatsApp | 80-95% | 15-25% | ₦5-15 / message |

Source: industry benchmarks captured in earlier session transcript (2026-05-22 line 9388-9390). For Cohort B (267 recipients) the expected completions per blast ≈ email: 5-15 / SMS: 30-60. SMS could 4-6× the email channel's recovery yield.

### Why this story authoring NOT live deploy

Per 2026-05-31 strategic sequencing locked by Awwal (memory: `project_field_readiness_sequence_2026_05_31.md`), wizard redesign (9-16 → 9-17 → 9-18) ships BEFORE any blast. Re-engagement that lands users on the current 63%-Step-4-stall wizard reproduces the original problem. Story 9-18 fixes the wizard; the blast goes once the wizard is friction-low. Dev work on this Part B can proceed in parallel (NOT blocked by wizard work — different file paths, different test surfaces); live deployment waits.

### What's already shipped (do not re-author)

- `apps/api/src/services/sms.service.ts` (Story 9-12) — `SMSService.send(to, message)` + `HttpSMSProvider` + `MockSMSProvider`. **No service-layer changes in this story.**
- `MagicLinkService.issueToken({ purpose: 'wizard_resume' })` (Story 9-12 MR-8) — issues 72h-TTL magic-link tokens for wizard resume. Reused here.
- `MagicLinkService.buildMagicLinkUrl(token, 'wizard_resume')` — produces `https://oyoskills.com/auth/magic?token=<plaintext>&purpose=wizard_resume`. Reused here as the SHORTENER'S TARGET URL (we shorten that long URL to fit SMS's 160-char budget).
- `AUDIT_ACTIONS.OPERATOR_REENGAGEMENT_EMAIL_SENT` (Story 9-27 Part A) — pattern to mirror for the new SMS-specific audit action.
- `_reengagement-email-blast.ts` (Story 9-27 Part A, post-2026-05-31 refactor with two-template branching + Cat1 exclusion) — **the canonical mirror pattern** for the SMS blast script.

## Acceptance Criteria

### Part 1 — SMS blast script

1. **AC#B1 — One-shot script at `apps/api/scripts/_reengagement-sms-blast.ts`.** Mirrors the structure of `apps/api/scripts/_reengagement-email-blast.ts` (Part A) verbatim where possible. Mandatory `--dry-run` first invocation; live run requires `--confirm-i-am-not-dry-running`. Operator-gated; not wired into any worker / cron / CI path.

2. **AC#B2 — `KNOWN_FLAGS` typo defense.** Exported set of known flags rejects any unknown (typo-defense gates against `--dry-rn` accidentally slipping past the live-run check). Mirrors Part A AC pattern at `_reengagement-email-blast.ts:49-58`. Flags: `dry-run`, `confirm-i-am-not-dry-running`, `confirm-termii-pro-active`, `rate-per-minute`, `since`, `lga`, `max-recipients`, `cohort` (NEW — selects `cohort-b` or `cohort-a-phone-only`), `help`.

3. **AC#B3 — `--help` produces inline usage** mirroring Part A's `HELP_TEXT` block at `_reengagement-email-blast.ts:60-75`. Documents the `--cohort` flag values + the Termii Pro confirm-threshold semantics.

4. **AC#B4 — Cohort selection via `--cohort` flag.** Two modes:
   - `--cohort cohort-b` (default): selects wizard_drafts with phone, NOT yet completed, NOT opted-out. Cohort = 267 per 2026-05-31 refresh.
   - `--cohort cohort-a-phone-only`: selects respondents with phone, NO submissions row, NOT opted-out, AND `email IS NULL OR NOT IN (sent-email-cohort)`. Cohort = 11 per 2026-05-31 refresh.
   The two cohorts get different copy (per AC#B7 + AC#B8).

5. **AC#B5 — Cohort SQL for `cohort-b`** mirrors the Part A pattern post-refactor but selects via phone instead of email:
   ```typescript
   const conditions = [
     sql`${wizardDrafts.formData}->>'phone' IS NOT NULL`,
     sql`${wizardDrafts.formData}->>'phone' != ''`,
     gt(wizardDrafts.expiresAt, sql`NOW()`),
     // Cat1 exclusion — same logic as email script, joined on phone
     sql`NOT EXISTS (
       SELECT 1 FROM respondents r
       INNER JOIN submissions s ON s.respondent_id = r.id
       WHERE r.phone_number = ${wizardDrafts.formData}->>'phone'
     )`,
     // STOP opt-out exclusion
     sql`NOT EXISTS (
       SELECT 1 FROM respondents r
       WHERE r.phone_number = ${wizardDrafts.formData}->>'phone'
         AND (r.metadata->'sms_opted_out')::boolean = true
     )`,
   ];
   ```
   Returns `{ id, phone, formData, createdAt, expiresAt, currentStep }` rows. Limit by `--max-recipients` (default 300 — covers the 267 with buffer).

6. **AC#B6 — Cohort SQL for `cohort-a-phone-only`**:
   ```typescript
   const conditions = [
     isNotNull(respondents.phoneNumber),
     sql`${respondents.phoneNumber} != ''`,
     // No submissions row — the canonical Cohort A definition
     sql`NOT EXISTS (SELECT 1 FROM submissions s WHERE s.respondent_id = ${respondents.id})`,
     // No email or no usable email — must be SMS-exclusive
     sql`NOT EXISTS (
       SELECT 1 FROM magic_link_tokens mlt
       WHERE mlt.respondent_id = ${respondents.id} AND mlt.email IS NOT NULL
     )`,
     // STOP opt-out exclusion
     sql`COALESCE((${respondents.metadata}->'sms_opted_out')::boolean, false) = false`,
   ];
   ```
   Returns the 11 phone-only Cohort A respondents. NOTE: this query may evolve once Story 9-28 Path B Phase A confirms whether those 11 will eventually have email reachability — re-verify at impl time.

7. **AC#B7 — Two-template branching by `current_step` (Cohort B only)** mirrors the Part A post-refactor pattern:
   - Step 4-5 (high-progress, target ~120 chars):
     ```
     Oyo Skills Registry: Hi {firstName}, your profile is 90% done. Finish in 2 min: ovr.ng/r/{code} STOP to opt out.
     ```
   - Step 1-3 (low-progress, target ~130 chars):
     ```
     Oyo Skills Registry: Hi {firstName}, your registration is saved. Continue: ovr.ng/r/{code} STOP to opt out.
     ```
   Branch on `HIGH_PROGRESS_STEP_THRESHOLD = 4` (same constant as Part A). Both templates target single-segment delivery (160-char budget; GSM-7 charset).

8. **AC#B8 — Cohort A phone-only template (audit-safe wording).** Per the operator-confirmed Story 9-28 Path B Option 2 framing ("Complete your skills profile" — factually accurate without admission of underlying cause):
   ```
   Oyo Skills Registry: Hi {firstName}, complete your skills profile in 2 min: ovr.ng/r/{code} STOP to opt out.
   ```
   ~110 chars. Single segment. **Operator confirmation required at impl time** — Iris (legal) may want to review the SMS copy before any live send.

9. **AC#B9 — Per-send audit event `OPERATOR_REENGAGEMENT_SMS_SENT`** (NEW audit action; bumps audit-action count — verify exact count at impl time given uncommitted Story 9-30 Part F may also bump it). Audit fields:
   - `actorId: null` (operator-script, no user JWT)
   - `targetResource: 'wizard_drafts'` for Cohort B; `'respondents'` for Cohort A phone-only
   - `targetId: row.id`
   - `details`: `{ phone: maskedPhone, draft_id_or_respondent_id, sent_at, channel: 'sms', provider: 'termii', cohort, current_step (cohort-b only), provider_message_id, sender_id, template_label, short_code }`
   - `ipAddress: operatorHost` (per the Part A pattern at `_reengagement-email-blast.ts:322`)
   - `userAgent: 'tsx scripts/_reengagement-sms-blast.ts (rate=N cohort=X)'`

10. **AC#B10 — `--rate-per-minute` ceiling.** Default 10. Maximum 60 (Termii's documented per-minute rate ceiling per Termii docs — verify at impl time). The script enforces this delay between sends (mirrors Part A AC pattern). Hard-coded constant `MAX_RATE_PER_MINUTE = 60`; rejects values above this at parse-args time.

11. **AC#B11 — `--confirm-termii-pro-active` fail-fast** when cohort size ≥ Termii free-tier daily limit (TBD — Termii's free tier is reported as 50 SMS/day; the threshold constant is `TERMII_FREE_TIER_DAILY_LIMIT = 50` + `TERMII_PRO_CONFIRM_THRESHOLD = 40`). If cohort ≥ 40 (i.e., approaching or exceeding free tier), operator must pass `--confirm-termii-pro-active` to proceed. Mirrors Part A's `--confirm-resend-pro-active` pattern.

12. **AC#B12 — Phone masking in dry-run output.** `maskPhone()` helper analogous to `maskEmail()` from Part A. Pattern: `+2348012345678` → `+234801****678` (keep country code + first 3 digits of local + last 3 digits + asterisks in between). Implemented as a pure function with unit tests. Dry-run output line format mirrors Part A's:
    ```
    +234801****678   Adewale     step=4 tpl=90%-done  draft=<uuid>  created=2026-05-19T13:45:57.702Z
    ```

13. **AC#B13 — First-name extraction.** `firstNameFrom(fullName)` reused via import from the email-blast module — DO NOT duplicate. Post-9-18 Part F backfill, this becomes `firstName = respondents.first_name ?? firstNameFrom(formData.fullName)` (mirror the Part A two-source fallback Awwal asked for in Part F AC#F3). For draft-only rows (Cohort B) without a respondents row yet, fallback to `formData.givenName ?? firstNameFrom(formData.fullName) ?? 'there'`.

14. **AC#B14 — STOP opt-out check at send time** (defense in depth — even if cohort SQL filtered, race condition between query and send could miss a fresh opt-out). Immediately before each send, the script re-queries `respondents.metadata->>'sms_opted_out'` for the recipient's phone; if true, skip the send + log `event: 'reengagement_sms.skipped_opt_out'`. No audit event for skipped sends (the OPT-OUT itself was already audited when the user STOP'd).

15. **AC#B15 — Exit codes** mirror Part A: 0 on successful run (live or dry), 1 on config error / prerequisite failure / any per-send failure during live. Failed sends emit `event: 'reengagement_sms.send_failed'` with structured error per-recipient.

### Part 2 — Project-hosted URL shortener

16. **AC#B16 — New Drizzle schema table `short_links`** at `apps/api/src/db/schema/short-links.ts`:
    ```typescript
    export const shortLinks = pgTable('short_links', {
      id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
      code: text('code').notNull().unique(),  // 6-8 char base62
      targetUrl: text('target_url').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),  // 72h default — matches magic-link TTL
      clickCount: integer('click_count').notNull().default(0),
      lastClickedAt: timestamp('last_clicked_at', { withTimezone: true }),
      // Optional attribution metadata
      createdBy: text('created_by'),  // 'reengagement-sms-blast' / 'reengagement-email-blast' / 'manual' / etc.
      campaign: text('campaign'),     // 'cohort-b-sms' / 'cohort-a-sms' / etc.
    }, (table) => ({
      codeIdx: index('idx_short_links_code').on(table.code),
      expiryIdx: index('idx_short_links_expires_at').on(table.expiresAt),
    }));
    ```
    Migration runner at `apps/api/src/db/migrations/migrate-short-links-init.ts` follows the canonical Story 11-1 migration pattern.

17. **AC#B17 — `ShortLinkService` at `apps/api/src/services/short-link.service.ts`** exposes:
    - `static async create(targetUrl: string, opts?: { ttlMs?: number; createdBy?: string; campaign?: string }): Promise<{ code: string; shortUrl: string }>` — generates a unique base62 code (6-8 chars), persists row, returns `{ code, shortUrl: '${PUBLIC_APP_URL}/r/${code}' }`. Default TTL 72h matching `MagicLinkService.TTL_MS_BY_PURPOSE.wizard_resume`.
    - `static async resolve(code: string): Promise<{ targetUrl: string; expired: boolean } | null>` — looks up row, returns target_url + expired flag (computed from expires_at vs NOW). Increments `click_count` + sets `last_clicked_at` only on non-expired hits. Returns null if code doesn't exist.
    - `static generateCode(length = 7): string` — pure function generating base62 (a-zA-Z0-9). Uses `crypto.randomBytes`. Collision-detect in `create()` via the unique constraint + retry-up-to-3-times on collision.
    - All methods use Pino structured logging: `event: 'short_link.created' | 'short_link.resolved' | 'short_link.expired' | 'short_link.collision_retry'`.

18. **AC#B18 — Redirect route `GET /r/:code`** at `apps/api/src/routes/short-link.routes.ts`. Mounted at the APP ROOT (not under `/api/v1`) so the resulting URL is `https://oyoskills.com/r/<code>` — keeps the user-facing URL short. Behavior:
    - Valid + non-expired code → HTTP 302 redirect to `targetUrl`. Increment click count.
    - Valid + expired code → HTTP 410 Gone with friendly HTML page: *"This link has expired. If you need a new one, contact support@oyoskills.com."*
    - Unknown code → HTTP 404 with friendly HTML page: *"Link not found. Check the URL or contact support@oyoskills.com."*
    - The route is PUBLIC (no auth required). Helmet CSP applies (the redirected URL must be in `connect-src` or `script-src` as appropriate — both Cohort A and Cohort B targets are `oyoskills.com/auth/magic?...` which is same-origin, so CSP is a non-issue).

19. **AC#B19 — Rate limiting on the redirect route.** `redirectRateLimit` middleware: 60 req/min per IP. Prevents enumeration attacks (someone trying random codes to find valid ones). Mounted before the route handler. Mirrors the existing `marketplaceRateLimit` pattern.

20. **AC#B20 — Background cleanup job for expired rows.** New BullMQ worker `short-link-cleanup.worker.ts` runs daily at 02:00 UTC. Deletes `short_links` rows where `expires_at < NOW() - INTERVAL '7 days'` (7-day buffer keeps the analytics-attribution data warm without unbounded growth). Logs `event: 'short_link.cleanup_completed'` with `deletedCount`.

### Part 3 — STOP opt-out infrastructure

21. **AC#B21 — `respondents.metadata.sms_opted_out: boolean` field** is set via TypeScript schema extension only (matches existing JSONB schema-flexible pattern; no DB migration). Default `false` / absent. Set to `true` when:
    (a) inbound STOP-keyword webhook fires (AC#B22), OR
    (b) operator manually sets via `apps/api/scripts/_sms-opt-out.ts` helper script (AC#B25).

22. **AC#B22 — Inbound STOP webhook route `POST /api/v1/sms/inbound-webhook`** at `apps/api/src/routes/sms-webhook.routes.ts`. Termii (per their docs) POSTs delivery + reply events to this endpoint. Payload structure (Termii spec — VERIFY AT IMPL TIME):
    ```json
    {
      "type": "incoming",
      "sender": "+2348012345678",
      "message": "STOP",
      "received_at": "2026-06-01T14:23:00Z",
      "sms_id": "<termii-message-id>"
    }
    ```
    Handler logic:
    - Verify Termii webhook signature (X-Termii-Signature header — see AC#B23).
    - Normalize incoming message body: trim, uppercase. If matches `STOP` / `UNSUBSCRIBE` / `OPT OUT` / `OPT-OUT` (canonical opt-out keywords per NCC + GSMA recommendations), proceed.
    - Find respondent by `respondents.phone_number = sender` (normalized to E.164). If found, atomically update `metadata = jsonb_set(metadata, '{sms_opted_out}', 'true')` + emit `OPERATOR_SMS_OPT_OUT_RECEIVED` audit event.
    - Always return HTTP 200 (even if respondent not found — don't leak existence).

23. **AC#B23 — Webhook signature verification.** Termii signs webhook payloads with HMAC-SHA256 of the body + a webhook secret (configured in Termii dashboard + saved to `.env` as `TERMII_WEBHOOK_SECRET`). Middleware `verifyTermiiSignature` checks header before any business logic. Failed signature → HTTP 401 + log `event: 'sms_webhook.signature_invalid'`. Pattern mirrors the existing CSP-report endpoint at `apps/api/src/app.ts:120-121` (registered BEFORE Helmet so it cannot be CSP-blocked).

24. **AC#B24 — Webhook rate-limit + observability.** `smsWebhookRateLimit`: 30 req/min per IP (Termii's edge IPs are documented; rate-limit applies regardless). Pino logs: `event: 'sms_webhook.received' | 'sms_webhook.opt_out_processed' | 'sms_webhook.unknown_sender' | 'sms_webhook.non_opt_out_message'`.

25. **AC#B25 — Operator-side manual opt-out helper** `apps/api/scripts/_sms-opt-out.ts` for the case where Termii webhook misfires OR a user phones support directly to request opt-out. Usage: `tsx scripts/_sms-opt-out.ts --phone +2348012345678 --confirm-i-am-not-dry-running`. Sets `respondents.metadata.sms_opted_out = true` + emits `OPERATOR_SMS_OPT_OUT_MANUAL` audit event with `details.operator_marker: 'manual_runbook'`.

### Part 4 — Termii configuration + .env coordination

26. **AC#B26 — `.env.example` Termii block** with all variables documented:
    ```
    # Termii SMS (Story 9-27 Part B)
    # Sign up at https://termii.com → register with admin@oyoskills.com (canonical-anchor pattern)
    # Top up at least ₦1000 + register OYOSKILLS as sender ID (₦0-2000 one-time)
    SMS_PROVIDER=http              # flips to Termii config; 'mock' for dev
    SMS_API_URL=https://api.ng.termii.com/api/sms/send
    SMS_API_KEY=<termii_api_key>
    SMS_SENDER_ID=OYOSKILLS         # 11-char max per Nigerian network rules
    TERMII_WEBHOOK_SECRET=<from_termii_dashboard>
    TERMII_CHANNEL=generic         # generic | dnd | whatsapp — defer to operator at signup
    ```
    Documented in playbook `docs/infrastructure-cicd-playbook.md` (new Pitfall entry — number TBD at impl time).

27. **AC#B27 — Zero changes to `apps/api/src/services/sms.service.ts`.** The `HttpSMSProvider` class at `apps/api/src/services/sms.service.ts:43` is already correctly shaped for Termii — `apiUrl` + `apiKey` + `senderId` config + `POST` with `{ to, from, sms }` body matches Termii's documented schema. The whole SMS service surface is reused as-is. This story DOES NOT TOUCH that file.

28. **AC#B28 — Pre-flight Termii config validation.** Blast script's startup checks: `SMS_PROVIDER === 'http'` AND `SMS_API_URL` non-empty AND `SMS_API_KEY` non-empty AND `SMS_SENDER_ID` non-empty AND `SMSService.isEnabled() === true`. If any fails, exit with code 1 + structured log `event: 'reengagement_sms.config_invalid'` listing the missing vars.

### Part 5 — Tests

29. **AC#B29 — Unit tests at `apps/api/scripts/__tests__/_reengagement-sms-blast.test.ts`** mirror Part A's structure (~30 tests target):
    - `parseArgs`: same coverage matrix as Part A + `--cohort` flag validation + `--rate-per-minute` ceiling (rejects > 60) + `--confirm-termii-pro-active` parsing
    - `KNOWN_FLAGS`: contains all 9 flags + size assertion (catches future-PR drift)
    - `maskPhone`: 6+ cases (E.164 NG / short / malformed / empty / very long / non-NG)
    - `firstNameFrom`: re-export from email-blast — no duplication; existing tests cover
    - `buildSmsMessage(firstName, shortUrl, currentStep, cohort)`: branching tests covering Step 4-5 high-progress / Step 1-3 low-progress / cohort-a-phone-only paths; character-count assertions (each template within 160 chars including STOP suffix); audit-safe framing assertion (no apology / no admission / no `data loss` / no `bug` / no `issue`)
    - Threshold boundary: step=3 low-progress, step=4 high-progress (matches Part A boundary test)

30. **AC#B30 — Unit tests at `apps/api/src/services/__tests__/short-link.service.test.ts`** (~12 tests):
    - `create()` happy-path (returns code + URL)
    - `create()` with custom TTL (verifies expires_at math)
    - `create()` with createdBy + campaign attribution
    - `generateCode()` produces base62 chars only (regex `/^[a-zA-Z0-9]+$/`)
    - `generateCode()` length is 6-8 chars by default
    - `resolve()` happy-path (returns target_url, increments click_count)
    - `resolve()` increments click_count idempotently across multiple hits
    - `resolve()` expired returns `{ targetUrl, expired: true }` but does NOT increment click_count
    - `resolve()` unknown code returns null
    - Collision-retry: mock collision once, verify retry succeeds (uses test-only `__forceCollision` flag)
    - Collision-retry: 3 consecutive collisions throws (canary test for the limit)
    - Cleanup-job query semantics: rows older than 7d past expires_at are eligible

31. **AC#B31 — Integration tests at `apps/api/src/routes/__tests__/short-link.routes.test.ts`** (~8 tests):
    - GET /r/:code → 302 to target_url (with `Location` header)
    - GET /r/:code increments click_count
    - GET /r/:code with expired code → 410 Gone HTML
    - GET /r/:code with unknown code → 404 HTML
    - Rate-limit kicks in after 60 requests in 1 minute per IP → 429
    - Helmet CSP applied to the response
    - Both `oyotradeministry.com.ng/r/<code>` and `oyoskills.com/r/<code>` route correctly (dual-domain coverage)
    - Path injection attempt `GET /r/../admin/users` → 404 (router escape protection)

32. **AC#B32 — Webhook integration tests at `apps/api/src/routes/__tests__/sms-webhook.routes.test.ts`** (~10 tests):
    - POST /api/v1/sms/inbound-webhook with valid Termii signature + STOP body → 200 + opt-out flag set + audit event
    - With invalid signature → 401
    - With unknown sender → 200 (no respondent found, no opt-out set, no audit event)
    - With non-STOP message body → 200 (logged, no opt-out)
    - With STOP / UNSUBSCRIBE / OPT-OUT / OPT OUT message variants (4 cases — each sets opt-out)
    - With STOP in mixed case + leading/trailing whitespace → normalized + accepted
    - Rate-limit hits at 30 req/min → 429
    - Duplicate STOP from same sender → idempotent (already-opt-out → no second audit event)

33. **AC#B33 — Cohort SQL test at `apps/api/scripts/__tests__/_reengagement-sms-blast.cohort.test.ts`** (~6 tests): seed test DB with mixed Cohort A + B + Cat 1 + opt-out states, run cohort SQL for both `--cohort` values, assert correct row sets returned. Distinct test file (mirror the pattern from Part A's integration tests at `apps/api/scripts/__tests__/_reengagement-email-blast.cohort.test.ts` if it exists; if not, this story creates the convention).

### Part 6 — Cross-channel coordination spec (forward-compat for Part D)

34. **AC#B34 — `wizard_drafts.metadata.last_reengagement_at: ISO 8601 string` + `metadata.last_reengagement_channel: 'email' | 'sms' | 'whatsapp'`** fields written on EVERY successful send (both Part A email blast — retrofit — and Part B SMS blast). Part B implements this; Part A gets a one-line retrofit via a Task 6 sub-task.

35. **AC#B35 — Day-2-rule filter** (forward-compat, NOT enforced by Part B today): cohort SQL for SMS blast adds an OPTIONAL `--respect-cross-channel-cooldown` flag that, when set, excludes drafts where `metadata.last_reengagement_at > NOW() - INTERVAL '12 hours'` AND `metadata.last_reengagement_channel != 'sms'`. Flag is documented but not the default (operator opts in). Part D (future story) will make this the default and add the WhatsApp branch.

### Part 7 — Documentation + memory

36. **AC#B36 — Runbook entry at `docs/infrastructure-cicd-playbook.md`** documenting:
    - Termii signup process (canonical-anchor email pattern)
    - Sender-ID registration steps
    - Webhook URL setup in Termii dashboard
    - Top-up workflow for production
    - Dry-run discipline (mandatory first --dry-run)
    - Live blast SOP (--confirm-i-am-not-dry-running + --confirm-termii-pro-active)
    - Manual opt-out helper script usage (AC#B25)
    - Common-failure recovery (Termii API timeout / rate-limit / sender-ID rejected)

37. **AC#B37 — Memory entry** at `feedback_reengagement_sms_termii.md`:
    - Path 2 decision rationale (locked 2026-05-31)
    - Termii vs alternatives (Sendchamp / BulkSMSNigeria)
    - Cost model (₦1-3/SMS, free-tier 50/day, Pro tier TBD)
    - Sequencing rationale (does NOT ship until 9-18 ships)
    - Cross-link to `project_field_readiness_sequence_2026_05_31.md`

## Tasks / Subtasks

- [ ] **Task 1: URL shortener foundation (AC: #B16, #B17, #B18, #B19, #B20)** — pre-requisite for the blast script
  - [ ] 1.1: Author `apps/api/src/db/schema/short-links.ts` per AC#B16 (Drizzle schema + indexes)
  - [ ] 1.2: Author migration runner `apps/api/src/db/migrations/migrate-short-links-init.ts` (canonical Story 11-1 pattern: idempotent + CHECK constraints + 4-gate seed safety)
  - [ ] 1.3: Author `apps/api/src/services/short-link.service.ts` per AC#B17 — `create()` + `resolve()` + `generateCode()` + collision-retry
  - [ ] 1.4: Author `apps/api/src/routes/short-link.routes.ts` per AC#B18 + register at app root (NOT under /api/v1)
  - [ ] 1.5: Author `apps/api/src/middleware/redirect-rate-limit.ts` per AC#B19
  - [ ] 1.6: Author BullMQ worker `apps/api/src/workers/short-link-cleanup.worker.ts` per AC#B20
  - [ ] 1.7: Unit tests per AC#B30 + integration tests per AC#B31 (~20 tests total in Task 1)
  - [ ] 1.8: Verify dual-domain access (oyotradeministry.com.ng/r/<code> AND oyoskills.com/r/<code>) per dual-server-name nginx config

- [ ] **Task 2: STOP opt-out infrastructure (AC: #B21, #B22, #B23, #B24, #B25)** — pre-requisite for AC#B14 send-time check
  - [ ] 2.1: TypeScript schema extension for `respondents.metadata.sms_opted_out` (no DB migration; JSONB)
  - [ ] 2.2: Webhook signature verifier middleware `apps/api/src/middleware/verify-termii-signature.ts` per AC#B23
  - [ ] 2.3: Webhook rate-limit middleware `apps/api/src/middleware/sms-webhook-rate-limit.ts` per AC#B24
  - [ ] 2.4: Webhook route handler `apps/api/src/routes/sms-webhook.routes.ts` per AC#B22 (register BEFORE Helmet so unblocked)
  - [ ] 2.5: New audit actions `OPERATOR_SMS_OPT_OUT_RECEIVED` + `OPERATOR_SMS_OPT_OUT_MANUAL` (count bumps appropriately)
  - [ ] 2.6: Manual opt-out helper script `apps/api/scripts/_sms-opt-out.ts` per AC#B25
  - [ ] 2.7: Webhook integration tests per AC#B32 (~10 tests)

- [ ] **Task 3: SMS blast script (AC: #B1-#B15)** — uses Task 1 short links + Task 2 opt-out check
  - [ ] 3.1: Scaffold `apps/api/scripts/_reengagement-sms-blast.ts` mirroring Part A structure at `_reengagement-email-blast.ts`
  - [ ] 3.2: Implement parseArgs + KNOWN_FLAGS + HELP_TEXT (AC#B1-B3)
  - [ ] 3.3: Implement `--cohort` switch + cohort-b SQL (AC#B4, B5)
  - [ ] 3.4: Implement cohort-a-phone-only SQL (AC#B6)
  - [ ] 3.5: Implement two-template `buildSmsMessage(firstName, shortUrl, currentStep, cohort)` (AC#B7, B8) — branches on cohort then on currentStep
  - [ ] 3.6: Wire short-link creation: for each row, call `ShortLinkService.create(targetUrl, { ttlMs: 72h, createdBy: 'reengagement-sms-blast', campaign: '<cohort>-sms' })` → use returned code in template
  - [ ] 3.7: Implement per-send audit event `OPERATOR_REENGAGEMENT_SMS_SENT` (AC#B9) — new audit action added to AUDIT_ACTIONS enum
  - [ ] 3.8: Implement send-time STOP opt-out re-check (AC#B14) + skip-and-log path
  - [ ] 3.9: Implement rate-limit per-minute delay + ceiling enforcement (AC#B10, B11)
  - [ ] 3.10: Implement maskPhone helper (AC#B12) + dry-run output format
  - [ ] 3.11: Wire firstName extraction reusing email-blast module (AC#B13 — IMPORT, do not duplicate)
  - [ ] 3.12: Pre-flight config validation (AC#B28) + fail-fast
  - [ ] 3.13: Unit tests per AC#B29 + cohort SQL tests per AC#B33 (~30+6 tests)

- [ ] **Task 4: Termii .env coordination (AC: #B26, #B27, #B28)**
  - [ ] 4.1: Update `.env.example` with Termii block per AC#B26
  - [ ] 4.2: Operator-side: signup at termii.com, register OYOSKILLS sender ID, generate API key, save to VPS `.env` (waits for operator action; documented as runbook step)
  - [ ] 4.3: Verify zero changes to `sms.service.ts` per AC#B27 — `HttpSMSProvider` already-Termii-shaped

- [ ] **Task 5: Cross-channel coordination scaffolding (AC: #B34, #B35)** — forward-compat for Part D
  - [ ] 5.1: Implement `wizard_drafts.metadata.last_reengagement_at` + `last_reengagement_channel` write on each Part B SMS send
  - [ ] 5.2: One-line retrofit to Part A email-blast: also write the same fields (so Part D's filter logic works against both Part A + Part B history)
  - [ ] 5.3: Implement `--respect-cross-channel-cooldown` flag in SMS blast (opt-in for Part B; default-on in future Part D)

- [ ] **Task 6: Documentation + memory + sprint-status**
  - [ ] 6.1: Runbook entry per AC#B36 — add new Pitfall entry to `docs/infrastructure-cicd-playbook.md` documenting Termii setup + dry-run discipline + common failure modes
  - [ ] 6.2: Memory file per AC#B37 — `feedback_reengagement_sms_termii.md` at `~/.claude/projects/.../memory/`
  - [ ] 6.3: Update master 9-27 story file (`9-27-multi-channel-reengagement.md`) Part B section: add a cross-reference pointer to THIS file at the top of Part B for canonical implementation detail
  - [ ] 6.4: Update sprint-status.yaml for 9-27 entry: note Part B authored as sibling file 9-27-part-b-sms-via-termii.md

- [ ] **Task 7: Pre-merge review (BMAD code-review workflow on uncommitted tree)**
  - [ ] 7.1: Per project `feedback_review_before_commit.md`: run `/bmad:bmm:workflows:code-review` (or `/code-review`) on the uncommitted working tree before commit. Auto-fix HIGH/MEDIUM findings; defer LOW with rationale per established Story 9-12 / 9-17 / 9-30 / 9-27 Part A discipline.
  - [ ] 7.2: Verify Termii API contract assumption — manually test against Termii's actual `/api/sms/send` endpoint with a real API key + a single test phone (operator-led, not in dev test suite). Capture the actual request/response shape; if differs from AC#B27 assumption (`{ to, from, sms }`), adjust the HttpSMSProvider body construction. Story can ship only after this confirmation.

- [ ] **Task 8: Pre-deploy gate (sequence enforcement)**
  - [ ] 8.1: Story 9-18 MUST be `done` before this Part B is deployed to prod. Confirm sprint-status reflects 9-18 done before flipping this story to `in-progress` for dev work? — NO, actually dev can START anytime (no file-path overlap with 9-18). DEPLOY (live blast) is the gate. Document this in Dev Agent Record once 9-18 done.

## Dev Notes

### Why Termii vs alternatives

| Provider | Why considered | Why Termii won |
|---|---|---|
| **Termii** | Nigerian-native, simple HTTP API, inbound STOP webhook | Selected. ~₦2/SMS pay-as-you-go, OYOSKILLS sender-ID supported, zero code change to `HttpSMSProvider` |
| Sendchamp | Nigerian-native, Twilio-like SDK | More expensive (~₦4/SMS), no inbound webhook (manual opt-out review required) |
| BulkSMSNigeria | Cheapest option (~₦1/SMS) | No documented inbound webhook; sender-ID registration delays |
| Twilio | Global, highest reliability | Per-message cost ~$0.075 = ~₦100/SMS (50× Termii) — economically irrational |

### Why URL shortener (vs Bitly / TinyURL)

| Service | Why considered | Why hosted |
|---|---|---|
| **Project-hosted** | Full control, attribution, no external dependency | Selected. 267-recipient blast = 267 unique URLs (each magic-link is unique). Free-tier shorteners have ≤10/month limits. Per-link cost adds up. |
| Bitly | Ubiquitous, branded short codes | Free tier 10 links/month — insufficient for 267-recipient blast. Paid tier $35/mo — economically irrational for one-off. |
| TinyURL | Free unlimited | No analytics, no expiry control, no attribution — no good for audit-defense |
| Cloudflare Workers + custom domain | Modern, free at scale | Operationally bigger than what we need; project-hosted Postgres table is simpler and reuses existing infra |

### How this story interacts with Story 9-18 Part F (surname-split)

Part F adds `givenName` + `familyName` as explicit columns at write time, and a backfill operator-runbook for the existing 136 respondents. AC#B13 above codifies the canonical first-name resolution: `respondents.first_name ?? formData.givenName ?? firstNameFrom(formData.fullName) ?? 'there'`. This resolution order is FORWARD-COMPATIBLE with Part F — once Part F's backfill runs, `respondents.first_name` is the canonical given-name; until then, `formData.fullName` parsing is the fallback (with the known Yoruba surname-first caveat documented in `feedback_cohort_a_disposition_decision.md`).

### How this story interacts with Story 9-30 (CSP fix)

Story 9-30 unblocked Cloudflare Web Analytics by adding `cloudflareinsights.com` to `connect-src`. The new `GET /r/:code` redirect routes do NOT make any client-side fetches — they're a server-side 302. CSP impact is zero. No Helmet/nginx changes needed in this story.

### Sequencing — strict no-deploy-before-9-18

Per `project_field_readiness_sequence_2026_05_31.md` memory:

```
9-16 magic-link login         → ships first
9-17 form pin + Pattern C     → ships second
9-18 wizard NIN-first + Parts A-F → ships third (8-12 dev-days)
   ↓
THIS STORY (9-27 Part B SMS)  → ships AFTER 9-18 (live blast); dev work can start anytime
```

Dev work on Part B can begin in parallel with 9-16/9-17/9-18 dev — no file-path overlap (different scripts, different services, different routes). Live deploy of the blast waits for the wizard. Cohort A blast (Story 9-28 capability already shipped) also waits per the same logic.

### Cost ceiling

- 267 Cohort B + 11 Cohort A phone-only = 278 SMS recipients
- Single-segment delivery target (≤160 chars, GSM-7)
- At Termii ~₦2/SMS = **~₦556 total for the blast**
- Operator pre-loads ₦1000 to Termii account = 80% buffer for retry / failures / opt-out webhook test
- Per-recipient cost economics dominated by URL shortener attribution (which is free, project-hosted) NOT SMS pricing

### Project Structure Notes

Aligns with monorepo conventions:
- Backend services at `apps/api/src/services/*.service.ts`
- Backend routes at `apps/api/src/routes/*.routes.ts`
- Operator scripts at `apps/api/scripts/_*-blast.ts` (underscore prefix = operator-only)
- Schemas at `apps/api/src/db/schema/*.ts`
- Migrations at `apps/api/src/db/migrations/migrate-*-init.ts`
- Tests co-located in `__tests__/` subdirs per project convention

### Testing standards summary

- Backend tests use vitest at `apps/api/src/.../__tests__/*.test.ts`
- Test runner: `pnpm --filter @oslsr/api test` (NEVER `pnpm vitest run` from root for cross-package; per memory)
- Cohort SQL tests require a real DB (use the same `beforeAll`/`afterAll` pattern as Story 11-1 audit tests)
- Mocks of SMS provider: use the existing `MockSMSProvider` from `sms.service.ts` (NO new mocking infra needed)

### References

- [Source: apps/api/scripts/_reengagement-email-blast.ts] — Part A canonical pattern; mirror its structure
- [Source: apps/api/src/services/sms.service.ts] — SMS infrastructure (do not modify)
- [Source: apps/api/src/services/magic-link.service.ts] — `MagicLinkService.issueToken({ purpose: 'wizard_resume' })` reused for token issuance
- [Source: _bmad-output/implementation-artifacts/9-27-multi-channel-reengagement.md § "Part B — SMS channel"] — the high-level Part B outline this story expands
- [Source: ~/.claude/projects/.../memory/project_field_readiness_sequence_2026_05_31.md] — sequencing rationale
- [Source: ~/.claude/projects/.../memory/feedback_cohort_a_disposition_decision.md] — Cohort A Path B Option 2 wording (mirror for Cohort A phone-only template)
- [Source: ~/.claude/projects/.../memory/feedback_install_analytics_before_launch.md] — cousin lesson about installed-but-dark infrastructure
- [Source: docs/vps-snapshots/2026-05-31/cohort-refresh.txt] — cohort numbers used in this story (267 + 51 split)
- [Source: _bmad-output/implementation-artifacts/9-30-csp-connect-src-cloudflare-analytics-unblock.md] — Story 9-30 (CSP fix) — context for analytics measurement of the future blast
- [Source: _bmad-output/implementation-artifacts/9-28-cohort-a-step4-recovery-decision.md] — Path B Option 2 wording reference for the 11 phone-only Cohort A template
- [Source: docs/infrastructure-cicd-playbook.md] — runbook (to be extended with the Termii setup entry per AC#B36)

## Dev Agent Record

### Agent Model Used

(to be populated by dev-story)

### Termii API Contract Verification (Task 7.2)

(to be populated — operator-led manual test of Termii's actual `/api/sms/send` response shape vs the assumed `{ to, from, sms }` body in `HttpSMSProvider.send`)

### Debug Log References

(to be populated)

### Completion Notes List

(to be populated)

### File List

(to be populated — expected: ~12 new files across schema/migration/service/route/middleware/worker/script/tests; ~3 modified files: .env.example, audit.service.ts AUDIT_ACTIONS enum, master 9-27 story cross-reference; ~1 retrofit to _reengagement-email-blast.ts for Task 5.2 cross-channel metadata write)

### Review Follow-ups (AI)

(to be populated post-code-review)

### Pre-deploy Gate (Task 8.1)

Live blast deployment GATED on Story 9-18 done. Sprint-status reflects this dependency. Operator confirms gate satisfaction before any `--confirm-i-am-not-dry-running` invocation in prod.
