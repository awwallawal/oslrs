# Story 9.13: Super Admin TOTP MFA Enrollment & Verification

Status: ready-for-dev

<!--
Created 2026-04-27 by John (PM) per session direction with Awwal — surfaced as confirmed-not-hypothetical gap during external security assessment review.

Closes: super_admin password-only login + magic-link recovery surface. Magic-link is "weak 2FA" (something-you-have = email access) but does NOT meet TOTP-grade authentication for accounts that touch every respondent record.

Sources:
  • External security assessment 2026-04-27 (`ssh_analysis.txt` lines 65-67) — flagged as Medium-High gap
  • Architecture ADR-015 (Google OAuth retired, magic-link primary) — confirmed no MFA path exists
  • Story 6-1 audit log infrastructure — TOTP events flow through hash-chained audit
  • PM-session 2026-04-27 cost-aware roadmap decision: TOTP chosen specifically because it incurs ZERO ongoing cost (no SMS, no Twilio, no third-party). Authenticator app is the right answer.

Independent / parallelisable. No hard dependencies on Wave 0/1/2/3/4 stories.
-->

## Story

As the **Super Admin / platform operator**,
I want **TOTP-based multi-factor authentication enrolled and enforced on all super_admin accounts, with backup codes for recovery**,
so that **a compromised super_admin password (phishing, credential stuffing, password reuse) cannot single-step authenticate against accounts that have read/write access to every respondent record across all 33 LGAs**.

## Background — why this surfaced now

Pre-2026-04-27 the project's auth posture was: password (bcrypt) + hCaptcha + JWT issuance + magic-link recovery. ADR-015 retired Google OAuth, leaving magic-link as the only "second factor" — and magic-link is **something-you-have = email access**, not a true TOTP.

For *normal* user accounts (enumerator, supervisor, public registrant) password + hCaptcha + magic-link is defensible. For **super_admin accounts touching every respondent record across 33 LGAs**, the bar should be higher: TOTP authenticator app. This is the standard NDPA-aligned posture for accounts with full PII scope.

**Cost-aware framing (per PM session 2026-04-27):** TOTP is chosen specifically because it incurs **zero ongoing cost**. SMS-based 2FA was rejected (~₦500-2000/mo via Twilio); WhatsApp business API rejected (similar cost). Authenticator apps (Google Authenticator, Authy, 1Password, Bitwarden) are free for users. Server-side libraries (`otplib`, `qrcode`) are open-source. Total incremental project cost: **₦0**.

**Active super_admin accounts as of 2026-04-26 (per MEMORY.md):**
1. `awwallawal@gmail.com` (Builder primary)
2. `admin@oyoskills.com` (break-glass, created via staff-invite UI 2026-04-26)

Both must enroll within the 7-day grace period (AC#5).

## Acceptance Criteria

1. **AC#1 — TOTP enrollment endpoint** (`POST /api/v1/auth/mfa/enroll`):
   - Generates a 32-character base32 secret via `otplib`
   - Returns: `secret` (base32) + `provisioningUri` (otpauth://totp/OSLRS:<email>?secret=...&issuer=OSLRS) + `qrCodeDataUri` (PNG data URI from `qrcode` npm)
   - Generates 8 single-use backup codes (10-digit numeric); stores hashed (bcrypt) in `user_backup_codes` table
   - Returns plaintext backup codes ONCE in response body; never retrievable again
   - Auth: requires authenticated super_admin session + password re-confirmation in request body (defence against session-hijack-during-enrollment)

2. **AC#2 — TOTP verification endpoint** (`POST /api/v1/auth/mfa/verify`):
   - Accepts 6-digit TOTP code
   - Verifies via `otplib` with 30-second window + 1-step skew tolerance (RFC 6238 §5.2)
   - Sets `mfa_verified_at` flag in session/JWT claims on success → unlocks normal API access for that session
   - On failure: 401 + audit log + increments per-user TOTP-attempt counter
   - **Replay protection**: rejects a TOTP code that's already been redeemed within its 30-second window

3. **AC#3 — Login flow integration** (`POST /api/v1/auth/login`):
   - When user has `mfa_enabled = true`, response is 2-step:
     - Step 1: returns `{ requires_mfa: true, mfa_challenge_token }` — JWT NOT issued
     - `mfa_challenge_token` is short-lived (5 min TTL, Redis-backed)
   - Step 2: client submits `mfa_challenge_token + totp_code` to `POST /api/v1/auth/login/mfa`
   - JWT issuance gated on successful TOTP — only then does the auth controller emit access+refresh tokens
   - Existing magic-link recovery flow remains untouched (defence-in-depth: lost-device → admin recovery, not magic-link bypass)

4. **AC#4 — Backup code redemption** (`POST /api/v1/auth/login/mfa-backup`):
   - Accepts 10-digit backup code in lieu of TOTP
   - Validates against bcrypt-hashed `user_backup_codes`; sets `used_at` on consumed row
   - Audit log: `mfa.backup_code_used` event with full context
   - Email notification to user: "Backup code used. Remaining: N" — flags compromise possibility
   - When all 8 codes consumed, login still works via TOTP, but warning banner appears on dashboard urging regeneration

5. **AC#5 — Mandatory enrollment grace period for existing super_admins**:
   - Migration sets `mfa_enabled = false` and `mfa_grace_until = NOW() + 7 days` for all existing super_admin accounts at deploy time
   - Email notification at deploy: "MFA enrollment required by <date>. Enroll at /super-admin/security/mfa."
   - During grace period: login proceeds normally, but dashboard shows persistent banner counting down
   - After grace period: login redirects to forced enrollment page; no JWT issued until enrollment completes
   - **Both** Builder primary (`awwallawal@gmail.com`) and break-glass (`admin@oyoskills.com`) must enroll

6. **AC#6 — Disable / regenerate flows**:
   - `POST /api/v1/auth/mfa/disable`: requires password + current TOTP (defence: stolen session can't disable)
   - `POST /api/v1/auth/mfa/regenerate-codes`: requires password + current TOTP; consumes all old codes; returns new 8 codes once
   - Both events audit-logged with full context

7. **AC#7 — Rate limiting on TOTP attempts**:
   - 5 failed TOTP submissions per `user_id` per 15 min → temporary lockout (15 min)
   - Lockout audit-logged + email notification to user
   - Per-IP rate limit ALSO enforced (10/min) BEFORE per-user lockout to prevent attacker-induced DoS via wrong-code spam against legitimate operator
   - Reuses existing rate-limit middleware pattern from Story 7-4 / 7-6

8. **AC#8 — Audit log integration**:
   - All MFA events: `mfa.enrolled` / `mfa.verify_success` / `mfa.verify_failure` / `mfa.backup_used` / `mfa.disabled` / `mfa.regenerated` / `mfa.lockout` / `mfa.grace_expired_redirect`
   - Each emits via `auditService.log()` per Story 6-1 hash-chain pattern
   - Includes: user_id, action, IP (real client via CF-Connecting-IP), user-agent, timestamp, success/failure metadata

9. **AC#9 — UI: enrollment wizard**:
   - New page: `/super-admin/security/mfa` (sidebar item under Settings)
   - 4-step wizard: (1) Generate Secret + show QR → (2) Open Authenticator App + Scan → (3) Enter test code (validates AC#2) → (4) Show backup codes ONCE with download/print + checkbox "I have saved my backup codes"
   - Confirm-enrollment button disabled until checkbox ticked
   - Forced-enrollment route variant after grace expires uses identical wizard but cannot be dismissed (no nav, banner: "MFA enrollment required to continue")

10. **AC#10 — Tests**:
    - TOTP secret generation + base32 format validation
    - Provisioning URI format conformance (RFC 6238)
    - 30-second window verification + 1-step skew tolerance
    - Replay protection (same code rejected within window)
    - Backup code single-use enforcement (race condition: two simultaneous requests, only one wins)
    - Per-user + per-IP rate limit independence
    - Audit log emission for all 8 event types
    - Grace period redirect logic (login before/after `mfa_grace_until`)
    - **Target**: ~35-40 new tests; existing 4,191-test baseline maintained

11. **AC#11 — Operator runbook update**:
    - `docs/emergency-recovery-runbook.md` new section §1.8: "MFA Recovery — lost authenticator device"
    - Recovery procedure: 2nd super_admin uses backend admin tool to reset target user's MFA flag to `false`; both events audit-logged
    - NTP-tightness verification step (server clock skew breaks TOTP) — `timedatectl status` should show `synchronized: yes`
    - Both super_admin emails enrolled before runbook is signed off

## Dependencies

- **No blocking story dependencies** — independent of all Wave 0/1/2/3/4 stories
- **Builds on**: existing JWT issuance (apps/api/src/services/auth.service.ts), audit log infrastructure (Story 6-1), rate-limit middleware (Stories 7-4 / 7-6)
- **Architecture**: aligns with ADR-015 (auth-flow simplification post-Google-OAuth retirement) — adds TOTP layer above magic-link without disturbing existing flows
- **Libraries to add** (zero recurring cost): `otplib` (~50KB), `qrcode` (~250KB) — both MIT-licensed, actively maintained, zero-config

## Field Readiness Certificate Impact

**Tier B per FRC §5.3.1** — does NOT strictly block field-survey start. Magic-link recovery + password + hCaptcha is field-survivable for the 7-14 day grace-period window if needed.

**Recommended slot:** ship in Wave 0 alongside CI-hygiene stories. Reasoning: ~1-2 days effort, zero cost, closes a confirmed (not hypothetical) gap, and getting both super_admin accounts enrolled before field survey is operationally simpler than enrolling under field conditions.

**Could promote to FRC if** State ICT pre-handover review explicitly requires TOTP for privileged accounts (likely an ask given NDPA Article 39 alignment). Watch for that signal during Schedule 1 finalization with Iris.

## Tasks / Subtasks

### Task 1 — Schema migration (AC#1, AC#5)
1.1. Add columns to `users` table: `mfa_enabled BOOLEAN NOT NULL DEFAULT false`, `mfa_secret TEXT NULL` (encrypted at rest via existing AES-256 pattern from Story 9-9 AC#5 if shipped — else stored plaintext with comment to upgrade), `mfa_grace_until TIMESTAMPTZ NULL`, `mfa_locked_until TIMESTAMPTZ NULL`
1.2. Create new table `user_backup_codes`: `id UUID PK, user_id UUID FK, code_hash TEXT NOT NULL, used_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ DEFAULT NOW()`
1.3. Index: `(user_id, used_at)` partial WHERE used_at IS NULL — for fast unused-code lookups
1.4. Migration sets `mfa_grace_until = NOW() + interval '7 days'` for all `users` rows where `role_id IN (SELECT id FROM roles WHERE name = 'super_admin')` AND `status = 'active'`

### Task 2 — Service layer (AC#1-#7)
2.1. `apps/api/src/services/mfa.service.ts`: enrollSecret, verifyCode (with replay protection via Redis SET key=`mfa:replay:<userId>:<code>` EX=30), redeemBackupCode (atomic UPDATE...WHERE used_at IS NULL RETURNING), disableMfa, regenerateBackupCodes, checkRateLimit
2.2. Replay protection: Redis key `mfa:replay:<user_id>:<code>` with 30-sec TTL — second submission of same code returns 401
2.3. Lockout: Redis counter `mfa:fail:<user_id>` increment + check threshold; on 5th failure set `mfa_locked_until` in DB; clear on successful verify

### Task 3 — Controller + routes (AC#1-#6)
3.1. `apps/api/src/controllers/mfa.controller.ts` — enroll, verify, login-mfa, login-mfa-backup, disable, regenerate-codes
3.2. Mount under `apps/api/src/routes/auth.routes.ts` — group `/mfa/*` under existing `/auth` namespace
3.3. Auth controller `login` handler modified to branch on `mfa_enabled` — return `requires_mfa: true, mfa_challenge_token` instead of access/refresh

### Task 4 — Login flow + grace period middleware (AC#3, AC#5)
4.1. `apps/api/src/middleware/mfa-grace.ts` — checks if user is super_admin, mfa_enabled=false, mfa_grace_until < NOW; if all true, redirect to enrollment endpoint
4.2. Wire into protected route stack BEFORE controllers; emits `mfa.grace_expired_redirect` audit event
4.3. Frontend: Add interceptor in `apps/web/src/lib/axios.ts` to detect `requires_mfa` response → redirect to `/auth/mfa-challenge` page

### Task 5 — UI: enrollment + challenge pages (AC#9)
5.1. `apps/web/src/features/security/mfa/pages/MfaEnrollmentPage.tsx` — 4-step wizard
5.2. `apps/web/src/features/security/mfa/pages/MfaChallengePage.tsx` — login-flow step-2 page (TOTP entry + "Use backup code instead" link)
5.3. `apps/web/src/features/security/mfa/components/QrCodeDisplay.tsx` — renders provisioning QR + manual-entry secret fallback
5.4. `apps/web/src/features/security/mfa/components/BackupCodesDisplay.tsx` — shows codes once, download/print/copy buttons + confirmation checkbox
5.5. Sidebar entry under Super Admin > Settings > Security > MFA
5.6. Banner component at dashboard root: counts down grace period, dismissible only after enrollment

### Task 6 — Tests + runbook (AC#10, AC#11)
6.1. API service tests: 20-25 tests covering enroll/verify/replay/lockout/backup/disable/regenerate/grace
6.2. Controller integration tests: 8-10 tests covering 2-step login flow + force-enrollment redirect
6.3. Web component tests: 8-10 tests covering wizard steps + challenge page
6.4. Update `docs/emergency-recovery-runbook.md` §1.8 — MFA Recovery procedure
6.5. Update `docs/team-context-brief.md` — note new auth posture for context-resumption clarity
6.6. Update MEMORY.md if new patterns surface (e.g., otplib quirks, NTP requirements)

## Technical Notes

### Library choice: otplib over speakeasy

`speakeasy` was the historical default but is unmaintained as of 2024. `otplib` is actively maintained, has TypeScript types out of the box, and is the de-facto npm replacement. Both implement RFC 6238 identically. **Choose `otplib`.**

### Time skew tolerance — why 1 step

RFC 6238 §5.2 recommends ±1 step (30 sec) tolerance to handle:
- Client clock drift (mobile devices)
- Server clock drift (mitigated by systemd-timesyncd on Ubuntu 24.04 — already running)
- Network latency between code generation and submission

Higher tolerance (±2 steps = 90 sec) is too generous; opens replay window. Lower (±0 steps = strict) frustrates legitimate users. ±1 is the standard.

### NTP requirement — load-bearing

If server clock drifts >30 sec, every TOTP code becomes invalid. `systemd-timesyncd` on Ubuntu 24.04 is already running by default (verified via 2026-04-25 OS upgrade). Add explicit `timedatectl status` check to runbook §1.8 — the kind of thing that fails silently after a kernel-related clock reset.

### Backup code threat model

Users WILL save backup codes in plain-text (Notes app, password manager, sometimes screenshot). That's the **intended** tradeoff: backup codes are recovery-from-lost-device, not perfect-secrecy. Document this in runbook so operators don't expect them to behave like passwords.

### Why password re-confirmation on enroll/disable/regenerate

Defence-in-depth against session hijack. If attacker steals session cookie, they can act as user — but enrolling MFA from their device would lock the legitimate user out, AND disabling MFA would silently downgrade. Requiring password re-confirmation on these specific endpoints adds a layer the stolen session can't bypass without also having the password.

### Per-IP rate limit BEFORE per-user lockout — DoS prevention

Without per-IP rate limit, an attacker can lock out a legitimate operator by spamming wrong TOTP codes against their account. Per-IP limit (10/min) gates the attacker BEFORE the per-user counter (5/15-min) trips the lockout. Per-user lockout is 15 min, NOT permanent — permanent would be a DoS vector.

### MFA recovery via 2nd super_admin — break-glass design

Lost device → cannot generate TOTP. Backup codes consumed → no fallback. Recovery: 2nd super_admin uses backend admin tool to reset target user's `mfa_enabled = false`, both events audit-logged. This is why having TWO active super_admin accounts (Builder + admin@oyoskills.com break-glass per MEMORY.md) is load-bearing for this story.

If we ever drop to a single active super_admin, MFA recovery requires direct DB access — document as runbook escape valve.

## Risks

1. **Both super_admins enrolling simultaneously could miss the grace deadline** if one is unavailable (travel, illness). **Mitigation**: 7 days is generous; rollout email triggered at deploy time gives explicit deadline.
2. **otplib API surface differs from speakeasy** — code review must verify provisioning URI format manually rather than copy-pasting older patterns. **Mitigation**: integration test asserts URI conformance to `otpauth://totp/<issuer>:<account>?secret=<base32>&issuer=<issuer>` exactly.
3. **Replay-protection Redis key collision under load** is theoretically possible (same user submitting same code twice in <30s). **Mitigation**: Redis SET NX EX=30 — atomic; second writer gets nil and is rejected.
4. **NTP drift on VPS** would silently invalidate all TOTP — undetectable from app side until a wave of "MFA broken" reports arrives. **Mitigation**: runbook §1.8 explicit `timedatectl status` check; consider monitoring delta.
5. **User loses backup codes AND device simultaneously** = locked out, requires DB-direct recovery. **Mitigation**: documented escape valve; backup-code download is mandatory checkbox in enrollment wizard.

## Dev Agent Record

### Agent Model Used

_(Populated when story enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### File List

**Created:**
- `apps/api/src/services/mfa.service.ts`
- `apps/api/src/controllers/mfa.controller.ts`
- `apps/api/src/middleware/mfa-grace.ts`
- `apps/api/src/db/migrations/<timestamp>_add_mfa_columns.sql`
- `apps/web/src/features/security/mfa/pages/MfaEnrollmentPage.tsx`
- `apps/web/src/features/security/mfa/pages/MfaChallengePage.tsx`
- `apps/web/src/features/security/mfa/components/QrCodeDisplay.tsx`
- `apps/web/src/features/security/mfa/components/BackupCodesDisplay.tsx`
- Tests for AC#10 (~35-40 new)

**Modified:**
- `apps/api/src/controllers/auth.controller.ts` — login handler 2-step branch
- `apps/api/src/routes/auth.routes.ts` — mount /mfa/*
- `apps/api/src/db/schema/users.ts` — new columns
- `apps/api/src/db/schema/index.ts` — `userBackupCodes` table
- `apps/web/src/lib/axios.ts` — `requires_mfa` interceptor
- `apps/web/src/features/super-admin/components/Sidebar.tsx` — new MFA settings entry
- `docs/emergency-recovery-runbook.md` — new §1.8
- `docs/team-context-brief.md` — auth posture note
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `MEMORY.md` (if new patterns surface)

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-27 | Story created by John (PM) per Awwal cost-aware roadmap session. Status `ready-for-dev`. 11 ACs covering TOTP enroll/verify/login-flow/backup-codes/grace-period/disable/regenerate/rate-limit/audit/UI/runbook. Tier B per FRC §5.3.1; recommended Wave 0 slot alongside CI-hygiene stories. otplib + qrcode npm dependencies added; ZERO ongoing cost. | External security assessment 2026-04-27 flagged super_admin password-only login as Medium-High gap; ADR-015 confirmed magic-link is the only "second factor" today; for accounts touching every respondent record this is below NDPA-aligned bar. TOTP chosen specifically because SMS/Twilio rejected on cost grounds (Awwal funding from pocket, ₦15K→₦26K domain miss eroded trust in cost estimates). |
