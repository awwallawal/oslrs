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

Validation pass 2026-04-29 (Bob, fresh-context mode 2): rebuilt to canonical template; fixed factual codebase references; preserved all substantive content.
-->

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the **Super Admin / platform operator**,
I want **TOTP-based multi-factor authentication enrolled and enforced on all super_admin accounts, with backup codes for recovery**,
so that **a compromised super_admin password (phishing, credential stuffing, password reuse) cannot single-step authenticate against accounts that have read/write access to every respondent record across all 33 LGAs**.

## Acceptance Criteria

1. **AC#1 — TOTP enrollment endpoint** (`POST /api/v1/auth/mfa/enroll`):
   - Generates a 32-character base32 secret via `otplib`
   - Returns: `secret` (base32) + `provisioningUri` (`otpauth://totp/OSLRS:<email>?secret=...&issuer=OSLRS`) + `qrCodeDataUri` (PNG data URI from `qrcode` npm)
   - Generates 8 single-use backup codes (10-digit numeric); stores hashed (bcrypt) in `user_backup_codes` table
   - Returns plaintext backup codes ONCE in response body; never retrievable again
   - Auth: requires authenticated super_admin session **plus** a valid re-auth window (reuse existing `POST /api/v1/auth/reauth` flow + `setReAuthValid()` middleware — defence against session-hijack-during-enrollment)

2. **AC#2 — TOTP verification endpoint** (`POST /api/v1/auth/mfa/verify`):
   - Accepts 6-digit TOTP code
   - Verifies via `otplib` with 30-second window + 1-step skew tolerance (RFC 6238 §5.2)
   - Sets `mfa_verified_at` flag in session/JWT claims on success → unlocks normal API access for that session
   - On failure: 401 + audit log + increments per-user TOTP-attempt counter
   - **Replay protection**: rejects a TOTP code that has already been redeemed within its 30-second window

3. **AC#3 — Login flow integration** (`POST /api/v1/auth/staff/login`):
   - When user has `mfa_enabled = true`, response is 2-step:
     - **Step 1**: `AuthService.loginStaff` returns `{ requires_mfa: true, mfa_challenge_token }` — JWT NOT issued
     - `mfa_challenge_token` is short-lived (5 min TTL, Redis-backed at `mfa:challenge:<token>` → `{ userId, email, exp }` with `EX=300`)
   - **Step 2**: client submits `mfa_challenge_token + totp_code` to `POST /api/v1/auth/login/mfa`
   - JWT issuance gated on successful TOTP — only then does the auth controller emit access+refresh tokens
   - Step-2 route composes `loginRateLimit + strictLoginRateLimit + verifyCaptcha` (mirrors `auth.routes.ts:21-26`)
   - Existing magic-link recovery flow remains untouched (defence-in-depth: lost-device → admin recovery, NOT magic-link bypass)
   - Public-user login (`/auth/public/login`) is **out of scope** — this story targets staff super_admin only

4. **AC#4 — Backup code redemption** (`POST /api/v1/auth/login/mfa-backup`):
   - Accepts 10-digit backup code in lieu of TOTP
   - Validates against bcrypt-hashed `user_backup_codes`; sets `used_at` on consumed row via atomic `UPDATE … WHERE used_at IS NULL RETURNING`
   - Audit log: `mfa.backup_used` event with full context
   - Email notification to user: "Backup code used. Remaining: N" — flags compromise possibility
   - When all 8 codes consumed, login still works via TOTP, but warning banner appears on dashboard urging regeneration

5. **AC#5a — Deploy-time grace migration**: Migration sets `mfa_enabled = false` and `mfa_grace_until = NOW() + interval '7 days'` for all active rows in `users` where `role_id IN (SELECT id FROM roles WHERE name = 'super_admin')`. Both `awwallawal@gmail.com` and `admin@oyoskills.com` rows updated.

6. **AC#5b — Deploy-time email notification**: At deploy completion, send "MFA enrollment required by `<ISO-date>`" email (subject + body) to every super_admin with `mfa_enabled = false`, via existing `EmailService`. Body links to `/dashboard/super-admin/security/mfa`.

7. **AC#5c — In-grace UX**: While `NOW() < mfa_grace_until` and `mfa_enabled = false`, login proceeds normally; dashboard renders a persistent banner counting down to the deadline. Banner is dismissible only by completing enrollment.

8. **AC#5d — Post-grace enforcement**: When `NOW() ≥ mfa_grace_until` and `mfa_enabled = false`, login redirects to forced-enrollment page; no JWT issued until enrollment completes. Audit event `mfa.grace_expired_redirect` emitted.

9. **AC#6 — Disable / regenerate flows**:
   - `POST /api/v1/auth/mfa/disable`: requires valid re-auth window + current TOTP (defence: stolen session can't disable without password proof and authenticator)
   - `POST /api/v1/auth/mfa/regenerate-codes`: requires valid re-auth window + current TOTP; consumes all old codes; returns new 8 codes once
   - Both events audit-logged with full context

10. **AC#7 — Rate limiting on TOTP attempts**:
    - 5 failed TOTP submissions per `user_id` per 15 min → temporary lockout (15 min via `users.mfaLockedUntil`)
    - Lockout audit-logged + email notification to user
    - Per-IP rate limit ALSO enforced (10/min) BEFORE per-user lockout to prevent attacker-induced DoS via wrong-code spam against legitimate operator
    - Per-IP middleware follows the canonical pattern at `apps/api/src/middleware/login-rate-limit.ts:25-110` (express-rate-limit + RedisStore + `prefix: 'rl:mfa:'` + `isTestMode()` skip)

11. **AC#8 — Audit log integration**:
    - All MFA events: `mfa.enrolled` / `mfa.verify_success` / `mfa.verify_failure` / `mfa.backup_used` / `mfa.disabled` / `mfa.regenerated` / `mfa.lockout` / `mfa.grace_expired_redirect`
    - Each emits via `AuditService.logAction()` (fire-and-forget) or `AuditService.logActionTx(tx, …)` (within `db.transaction()`) — see `apps/api/src/services/audit.service.ts:226,267`
    - Action names added to the typed `AUDIT_ACTIONS` const at `audit.service.ts:35-64`
    - Includes: user_id, action, IP (`req.ip` post-`real-ip.ts` middleware — already resolves `CF-Connecting-IP`), user-agent, timestamp, success/failure metadata

12. **AC#9 — UI: enrollment wizard**:
    - New page: `/dashboard/super-admin/security/mfa` (sidebar item appended to the `super_admin` array in `apps/web/src/features/dashboard/config/sidebarConfig.ts`)
    - 4-step wizard: (1) Generate Secret + show QR → (2) Open Authenticator App + Scan → (3) Enter test code (validates AC#2) → (4) Show backup codes ONCE with download/print + checkbox "I have saved my backup codes"
    - Confirm-enrollment button disabled until checkbox ticked
    - Forced-enrollment route variant after grace expires uses identical wizard but cannot be dismissed (no nav, banner: "MFA enrollment required to continue")
    - Challenge page (login step-2) handles error states explicitly: code expired, account locked-out (with countdown), clock-drift hint ("your authenticator may be a few seconds off — wait for next code")

13. **AC#10 — Tests**:
    - TOTP secret generation + base32 format validation
    - Provisioning URI format conformance (RFC 6238)
    - 30-second window verification + 1-step skew tolerance
    - Replay protection (same code rejected within window)
    - Backup code single-use enforcement (race condition: two simultaneous requests, only one wins)
    - Per-user + per-IP rate limit independence
    - Audit log emission for all 8 event types
    - Grace period redirect logic (login before/after `mfa_grace_until`)
    - Redis-backed integration tests use `beforeAll`/`afterAll` (per project integration-test pattern)
    - **Target**: ~35-40 new tests; existing 4,191-test baseline maintained

14. **AC#11 — Operator runbook update**:
    - `docs/emergency-recovery-runbook.md` new section `### 3.6 Lost authenticator device (MFA recovery)` — slotted next to existing `### 3.5 Lost laptop` in chapter §3 "Common incident scenarios"
    - Recovery procedure: 2nd super_admin uses backend admin tool to reset target user's MFA flag to `false`; both events audit-logged
    - NTP-tightness verification step (server clock skew breaks TOTP) — `timedatectl status` should show `synchronized: yes`
    - Both super_admin emails enrolled before runbook is signed off

## Tasks / Subtasks

- [ ] **Task 1 — Schema migration** (AC: #1, #5a)
  - [ ] 1.1 Add columns to `users` table at `apps/api/src/db/schema/users.ts`: `mfaEnabled BOOLEAN NOT NULL DEFAULT false`, `mfaSecret TEXT NULL`, `mfaGraceUntil TIMESTAMPTZ NULL`, `mfaLockedUntil TIMESTAMPTZ NULL`. **Do NOT conflate with existing `lockedUntil` column** (`users.ts:49`, used by Story 1.7 failed-login lockout — separate concern).
  - [ ] 1.2 New schema file `apps/api/src/db/schema/user-backup-codes.ts` (table `user_backup_codes`): `id UUID PK, user_id UUID FK, code_hash TEXT NOT NULL, used_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ DEFAULT NOW()`. **MUST NOT import from `@oslsr/types`** (drizzle-kit runs compiled JS — see Project Structure Notes).
  - [ ] 1.3 Append `export * from './user-backup-codes.js';` to `apps/api/src/db/schema/index.ts`.
  - [ ] 1.4 Partial index `(user_id, used_at)` WHERE `used_at IS NULL` for fast unused-code lookups.
  - [ ] 1.5 Migration body sets `mfa_grace_until = NOW() + interval '7 days'` for all `users` rows where `role_id IN (SELECT id FROM roles WHERE name = 'super_admin')` AND `status = 'active'`.
  - [ ] 1.6 Migration file location: `apps/api/drizzle/0008_add_mfa_columns.sql` (sequential 4-digit prefix per repo convention; reference pattern `apps/api/drizzle/0007_audit_logs_immutable.sql`). NOT `apps/api/src/db/migrations/` — that directory does not exist.
  - [ ] 1.7 Pre-flight: run `pnpm --filter @oslsr/api db:push:force:verbose` against a fresh local DB and inspect generated SQL — expect only `ALTER TABLE … ADD COLUMN` and `CREATE TABLE` statements; **abort if any `DROP` or `RENAME` appears** (per `feedback_db_push_force.md` — production data-loss incident).

- [ ] **Task 2 — Service layer** (AC: #1, #2, #4, #6, #7)
  - [ ] 2.1 Create `apps/api/src/services/mfa.service.ts` with: `enrollSecret`, `verifyCode`, `redeemBackupCode`, `disableMfa`, `regenerateBackupCodes`, `checkRateLimit`, `mintChallengeToken`, `consumeChallengeToken`.
  - [ ] 2.2 Replay protection: Redis `SET NX EX 30` with key `mfa:replay:<userId>:<code>` — second writer gets `nil` and is rejected.
  - [ ] 2.3 Per-user lockout: Redis counter `mfa:fail:<userId>` (`INCR` + `EXPIRE 900`); on 5th failure persist `users.mfaLockedUntil = NOW() + interval '15 min'` and emit `mfa.lockout`. Clear counter on successful verify.
  - [ ] 2.4 Challenge-token storage: Redis key `mfa:challenge:<token>` → `JSON({ userId, email, exp })` with `EX=300`. Token format: 32-byte random, base64url.
  - [ ] 2.5 Use `getRedisClient()` from `apps/api/src/lib/redis.ts:37` (singleton — already shared by all rate limiters; do NOT create a new connection).
  - [ ] 2.6 Backup code redemption uses atomic `UPDATE user_backup_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id` to win the race.
  - [ ] 2.7 `mfa_secret` storage: **Phase 1** plaintext with inline `// TODO(9-9): encrypt at rest once AES-256 helper from Story 9-9 AC#5 lands` marker. **Phase 2** backfill encryption when 9-9 ships. Do NOT invent an ad-hoc encryption helper.

- [ ] **Task 3 — Controller + routes + audit** (AC: #1, #2, #3, #4, #6, #8)
  - [ ] 3.1 New `apps/api/src/controllers/mfa.controller.ts` — handlers `enroll`, `verify`, `loginMfa`, `loginMfaBackup`, `disable`, `regenerateCodes`.
  - [ ] 3.2 Mount under `apps/api/src/routes/auth.routes.ts` in the existing `/auth` namespace — group `/mfa/*` and `/login/mfa`, `/login/mfa-backup`.
  - [ ] 3.3 Compose `strictLoginRateLimit + loginRateLimit + verifyCaptcha` on `/auth/login/mfa` step-2 (mirrors `auth.routes.ts:21-26`).
  - [ ] 3.4 Per-IP rate limit middleware for `/auth/mfa/verify`: clone `apps/api/src/middleware/login-rate-limit.ts:25-52` pattern with `prefix: 'rl:mfa:'`, `windowMs: 60_000`, `max: 10`.
  - [ ] 3.5 enroll/disable/regenerate-codes endpoints use the existing `authenticate` middleware **plus** require a valid re-auth window — reuse `POST /api/v1/auth/reauth` (`auth.routes.ts:101-104`, `auth.controller.ts:356-388`) and `setReAuthValid()` (`apps/api/src/middleware/sensitive-action.ts:128`). Do NOT re-implement password verification inside the MFA controller.
  - [ ] 3.6 Modify `AuthService.loginStaff` (`apps/api/src/services/auth.service.ts:227`) to branch on `users.mfaEnabled`: when true and not yet `mfa_verified_at` for this session, return `{ requires_mfa: true, mfa_challenge_token }` instead of access/refresh tokens. **Do NOT touch `loginPublic`** — public users out of scope.
  - [ ] 3.7 Add MFA actions to the typed `AUDIT_ACTIONS` const at `apps/api/src/services/audit.service.ts:35-64`:
        ```
        MFA_ENROLLED: 'mfa.enrolled',
        MFA_VERIFY_SUCCESS: 'mfa.verify_success',
        MFA_VERIFY_FAILURE: 'mfa.verify_failure',
        MFA_BACKUP_USED: 'mfa.backup_used',
        MFA_DISABLED: 'mfa.disabled',
        MFA_REGENERATED: 'mfa.regenerated',
        MFA_LOCKOUT: 'mfa.lockout',
        MFA_GRACE_EXPIRED_REDIRECT: 'mfa.grace_expired_redirect',
        ```
  - [ ] 3.8 Emit audit via `AuditService.logAction({...})` (fire-and-forget, `audit.service.ts:226`) outside transactions, or `AuditService.logActionTx(tx, {...})` (`audit.service.ts:267`) inside `db.transaction()`. Class is `AuditService`, not `auditService`; there is no `.log()` method.
  - [ ] 3.9 IP for audit: read `req.ip` after the existing `realIpMiddleware` has run (`apps/api/src/middleware/real-ip.ts:28-40` already resolves `CF-Connecting-IP`). Do NOT re-read headers.

- [ ] **Task 4 — Grace-period middleware + frontend interceptor** (AC: #3, #5b, #5c, #5d)
  - [ ] 4.1 New `apps/api/src/middleware/mfa-grace.ts`: when authenticated user has role super_admin AND `mfa_enabled = false` AND `mfa_grace_until < NOW()`, short-circuit with 403 + redirect-hint to forced-enrollment page; emit `mfa.grace_expired_redirect`.
  - [ ] 4.2 Wire into the protected route stack in `apps/api/src/app.ts` BEFORE controllers (after `authenticate`, before tenant guards).
  - [ ] 4.3 Email notification (AC#5b) at deploy: trigger via existing `EmailService` (`apps/api/src/services/email.service.ts` — pattern at `auth.controller.ts:283`); subject "MFA enrollment required by `<ISO-date>`"; body links to `/dashboard/super-admin/security/mfa`.
  - [ ] 4.4 Frontend `requires_mfa` handling: the project HTTP client is **fetch-based** at `apps/web/src/lib/api-client.ts:31` (NOT axios — there is no axios.ts). It throws `ApiError` on non-OK responses. Inspect the **success-shape** body in the login mutation hook (`apps/web/src/features/auth/hooks/useLogin.ts` or equivalent) — when `data.requires_mfa === true`, persist `mfa_challenge_token` in memory (NOT sessionStorage) and `navigate('/auth/mfa-challenge')`.

- [ ] **Task 5 — UI: enrollment + challenge pages + sidebar** (AC: #9)
  - [ ] 5.1 New dir `apps/web/src/features/security/mfa/` with `pages/`, `components/`, `hooks/`, `api/` subdirs (per project feature layout).
  - [ ] 5.2 `pages/MfaEnrollmentPage.tsx` — 4-step wizard.
  - [ ] 5.3 `pages/MfaChallengePage.tsx` — login step-2 (TOTP entry, "Use backup code instead" link, error states: code expired / locked-out with countdown / clock-drift hint).
  - [ ] 5.4 `components/QrCodeDisplay.tsx` — provisioning QR + manual-entry secret fallback.
  - [ ] 5.5 `components/BackupCodesDisplay.tsx` — codes shown once; download/print/copy buttons + confirmation checkbox.
  - [ ] 5.6 Add sidebar entry: append a new `NavItem` (label "MFA Settings", href `/dashboard/super-admin/security/mfa`, icon `Shield` from lucide-react) to the `super_admin` array in `apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156`. There is **no per-role `Sidebar.tsx`** — the sidebar is config-driven.
  - [ ] 5.7 Dashboard banner component: counts down grace period, dismissible only after enrollment.

- [ ] **Task 6 — Tests + runbook** (AC: #10, #11)
  - [ ] 6.1 API service tests (~20-25): enroll/verify/replay/lockout/backup/disable/regenerate/grace. Redis-backed integration tests use `beforeAll`/`afterAll` per project pattern, NOT `beforeEach`/`afterEach`.
  - [ ] 6.2 Controller integration tests (~8-10): 2-step staff login flow + force-enrollment redirect.
  - [ ] 6.3 Web component tests (~8-10): wizard steps + challenge page error states.
  - [ ] 6.4 Update `docs/emergency-recovery-runbook.md` — add `### 3.6 Lost authenticator device (MFA recovery)` directly after the existing `### 3.5 Lost laptop` (chapter §3 "Common incident scenarios"). Slot confirmed open by Bob 2026-04-29 verification; heading style `### N.M Title` matches §3.1–§3.5. No renumbering needed.
  - [ ] 6.5 Update `docs/team-context-brief.md` — note new auth posture for context-resumption clarity.
  - [ ] 6.6 Update MEMORY.md if new patterns surface (e.g. otplib quirks, NTP requirements).

## Dev Notes

### Background — Why This Surfaced Now

Pre-2026-04-27 the project's auth posture was: password (bcrypt) + hCaptcha + JWT issuance + magic-link recovery. ADR-015 (architecture.md:2713, rewritten 2026-04-24) retired Google OAuth, leaving magic-link as the only "second factor" — and magic-link is **something-you-have = email access**, not a true TOTP.

For *normal* user accounts (enumerator, supervisor, public registrant) password + hCaptcha + magic-link is defensible. For **super_admin accounts touching every respondent record across 33 LGAs**, the bar should be higher: TOTP authenticator app. This is the standard NDPA-aligned posture for accounts with full PII scope.

**Cost-aware framing** (per PM session 2026-04-27): TOTP is chosen specifically because it incurs **zero ongoing cost**. SMS-based 2FA was rejected (~₦500-2000/mo via Twilio); WhatsApp business API rejected (similar cost). Authenticator apps (Google Authenticator, Authy, 1Password, Bitwarden) are free for users. Server-side libraries (`otplib`, `qrcode`) are open-source. Total incremental project cost: **₦0**.

**Active super_admin accounts** as of 2026-04-26 (per MEMORY.md):
1. `awwallawal@gmail.com` (Builder primary)
2. `admin@oyoskills.com` (break-glass, created via staff-invite UI 2026-04-26)

Both must enroll within the 7-day grace period (AC#5a–5d).

### Dependencies

- **No blocking story dependencies** — independent of all Wave 0/1/2/3/4 stories.
- **Builds on**: existing JWT issuance (`apps/api/src/services/auth.service.ts`), audit log infrastructure (Story 6-1 — `apps/api/src/services/audit.service.ts`), rate-limit middleware pattern (`apps/api/src/middleware/login-rate-limit.ts`), re-auth flow (`apps/api/src/middleware/sensitive-action.ts:128`), real-IP resolver (`apps/api/src/middleware/real-ip.ts`), Redis singleton (`apps/api/src/lib/redis.ts:37`).
- **Architecture**: aligns with ADR-015 (auth-flow simplification post-Google-OAuth retirement) — adds TOTP layer above magic-link without disturbing existing flows.
- **Libraries to add** (zero recurring cost): `otplib` (~50KB), `qrcode` (~250KB) — both MIT-licensed, actively maintained, zero-config.

### Field Readiness Certificate Impact

**Tier B per FRC §5.3.1** — does NOT strictly block field-survey start. Magic-link recovery + password + hCaptcha is field-survivable for the 7-14 day grace-period window if needed.

**Recommended slot:** ship in Wave 0 alongside CI-hygiene stories. Reasoning: ~1-2 days effort, zero cost, closes a confirmed (not hypothetical) gap, and getting both super_admin accounts enrolled before field survey is operationally simpler than enrolling under field conditions.

**Could promote to FRC if** State ICT pre-handover review explicitly requires TOTP for privileged accounts (likely an ask given NDPA Article 39 alignment). Watch for that signal during Schedule 1 finalization with Iris.

### Technical Notes

#### Library choice: otplib over speakeasy

`speakeasy` was the historical default but is unmaintained as of 2024. `otplib` is actively maintained, has TypeScript types out of the box, and is the de-facto npm replacement. Both implement RFC 6238 identically. **Choose `otplib`.**

#### Time skew tolerance — why 1 step

RFC 6238 §5.2 recommends ±1 step (30 sec) tolerance to handle:
- Client clock drift (mobile devices)
- Server clock drift (mitigated by `systemd-timesyncd` on Ubuntu 24.04 — already running)
- Network latency between code generation and submission

Higher tolerance (±2 steps = 90 sec) is too generous; opens replay window. Lower (±0 steps = strict) frustrates legitimate users. ±1 is the standard.

#### NTP requirement — load-bearing

If server clock drifts >30 sec, every TOTP code becomes invalid. `systemd-timesyncd` on Ubuntu 24.04 is already running by default (verified via 2026-04-25 OS upgrade). Add explicit `timedatectl status` check to runbook §3.6 — the kind of thing that fails silently after a kernel-related clock reset.

#### Backup code threat model

Users WILL save backup codes in plain-text (Notes app, password manager, sometimes screenshot). That's the **intended** tradeoff: backup codes are recovery-from-lost-device, not perfect-secrecy. Document this in runbook so operators don't expect them to behave like passwords.

#### Why re-auth window on enroll/disable/regenerate

Defence-in-depth against session hijack. If attacker steals session cookie, they can act as user — but enrolling MFA from their device would lock the legitimate user out, AND disabling MFA would silently downgrade. Requiring a fresh re-auth window (via the existing `/auth/reauth` flow + `setReAuthValid()`) on these specific endpoints adds a layer the stolen session can't bypass without also having the password.

#### Per-IP rate limit BEFORE per-user lockout — DoS prevention

Without per-IP rate limit, an attacker can lock out a legitimate operator by spamming wrong TOTP codes against their account. Per-IP limit (10/min, `prefix: 'rl:mfa:'`) gates the attacker BEFORE the per-user counter (5/15-min) trips the lockout. Per-user lockout is 15 min, NOT permanent — permanent would be a DoS vector.

#### MFA recovery via 2nd super_admin — break-glass design

Lost device → cannot generate TOTP. Backup codes consumed → no fallback. Recovery: 2nd super_admin uses backend admin tool to reset target user's `mfa_enabled = false`; both events audit-logged. This is why having TWO active super_admin accounts (Builder + `admin@oyoskills.com` break-glass per MEMORY.md) is load-bearing for this story.

If the project ever drops to a single active super_admin, MFA recovery requires direct DB access — document as runbook escape valve.

#### Scope guard — `users.*` only, never `respondents.*`

MFA columns live exclusively on the `users` table (staff). The `respondents` table holds public-survey records and never carries an MFA flag. Public-user authentication remains password + magic-link (per ADR-015). Any temptation to extend MFA to `respondents` should be rejected as scope drift and routed through a separate SCP.

#### Challenge-token storage rationale — Redis vs DB column

Existing OTP and password-reset tokens live as DB columns (`users.passwordResetToken` at `users.ts:43-45`; OTP via `RegistrationService.verifyOtp`). The MFA challenge token is high-frequency, short-TTL (5 min), and never needs cross-restart durability — Redis with `EX=300` is the correct choice (faster + auto-expires), not a new DB column.

### Risks

1. **Both super_admins enrolling simultaneously could miss the grace deadline** if one is unavailable (travel, illness). **Mitigation**: 7 days is generous; rollout email triggered at deploy time gives explicit deadline.
2. **otplib API surface differs from speakeasy** — code review must verify provisioning URI format manually rather than copy-pasting older patterns. **Mitigation**: integration test asserts URI conformance to `otpauth://totp/<issuer>:<account>?secret=<base32>&issuer=<issuer>` exactly.
3. **Replay-protection Redis key collision under load** is theoretically possible (same user submitting same code twice in <30s). **Mitigation**: Redis `SET NX EX=30` — atomic; second writer gets nil and is rejected.
4. **NTP drift on VPS** would silently invalidate all TOTP — undetectable from app side until a wave of "MFA broken" reports arrives. **Mitigation**: runbook §3.6 explicit `timedatectl status` check; consider monitoring delta.
5. **User loses backup codes AND device simultaneously** = locked out, requires DB-direct recovery. **Mitigation**: documented escape valve; backup-code download is mandatory checkbox in enrollment wizard.

### Project Structure Notes

- **API services** live at `apps/api/src/services/<name>.service.ts`; controllers at `apps/api/src/controllers/<name>.controller.ts`; middleware at `apps/api/src/middleware/<name>.ts`; routes mounted via `apps/api/src/routes/<name>.routes.ts`. New MFA files conform to this layout (`mfa.service.ts`, `mfa.controller.ts`, `mfa-grace.ts`).
- **Drizzle migrations** live at `apps/api/drizzle/<NNNN>_<name>.sql` with sequential 4-digit prefixes. The next migration is `0008_add_mfa_columns.sql`. Reference pattern: `apps/api/drizzle/0007_audit_logs_immutable.sql`.
- **Schema barrel**: `apps/api/src/db/schema/index.ts` re-exports every table file. Add `userBackupCodes` table file `apps/api/src/db/schema/user-backup-codes.ts` and append `export * from './user-backup-codes.js';` to the barrel. New `users` columns added in-place at `apps/api/src/db/schema/users.ts`.
- **Drizzle constraint**: schema files MUST NOT import from `@oslsr/types`. drizzle-kit runs compiled JS and `@oslsr/types` exports `src/index.ts` directly with no `dist/` build. Inline any enum constants locally with a comment noting the canonical source. (Per MEMORY.md key pattern.)
- **CI db-push script**: project uses `pnpm --filter @oslsr/api db:push:force` (not `db:push`) to avoid drizzle-kit 0.21.x interactive prompt hangs. Use `db:push:force:verbose` for the migration pre-flight diff.
- **Web features** at `apps/web/src/features/<name>/{api,hooks,components,pages}` subdirs. New MFA dir: `apps/web/src/features/security/mfa/`.
- **Sidebar** is config-driven at `apps/web/src/features/dashboard/config/sidebarConfig.ts` with a role-keyed `Record<UserRole, NavItem[]>`. There is **no per-role `Sidebar.tsx`** component (e.g. `apps/web/src/features/super-admin/components/Sidebar.tsx` does not exist). New nav items append to the role's array.
- **HTTP client** is `apps/web/src/lib/api-client.ts` — a `fetch`-based wrapper that throws `ApiError` on non-OK responses. There is **no `axios.ts`** and **no interceptor pipeline**; response-shape branching (e.g. `requires_mfa: true`) happens in the calling mutation hook.
- **Login endpoints** are split: `POST /api/v1/auth/staff/login` for staff (super_admin lives here) and `POST /api/v1/auth/public/login` for public users. There is no unified `POST /api/v1/auth/login`. This story modifies `loginStaff` only.
- **Audit service**: class is `AuditService` (PascalCase, exported from `apps/api/src/services/audit.service.ts:115`). Public methods are `logAction({...})` (fire-and-forget, line 226), `logActionTx(tx, {...})` (transactional, line 267), and the PII-specific `logPiiAccess` / `logPiiAccessTx`. There is **no `.log()` method** and no lower-cased `auditService` instance.
- **Redis client**: use `getRedisClient()` from `apps/api/src/lib/redis.ts:37` (singleton, shared across rate limiters and services). For BullMQ workers use `createRedisConnection()` (`redis.ts:57`) — not relevant to MFA.
- **Real-IP resolution**: `req.ip` is already populated correctly post-`realIpMiddleware` (`apps/api/src/middleware/real-ip.ts:28-40`) for both Cloudflare-proxied (`CF-Connecting-IP`) and direct (`X-Forwarded-For`) traffic. Audit code reads `req.ip` directly; no header inspection needed.
- **Existing `users` columns to NOT confuse**: `lockedUntil` (line 49) is the failed-login lockout from Story 1.7. The new `mfaLockedUntil` is a separate concern and must use a distinct column name.

#### Variances from story v1 (corrected this pass)

- `apps/web/src/lib/axios.ts` → `apps/web/src/lib/api-client.ts` (does not use axios)
- `apps/web/src/features/super-admin/components/Sidebar.tsx` → `apps/web/src/features/dashboard/config/sidebarConfig.ts` (config-driven, no Sidebar.tsx)
- `apps/api/src/db/migrations/<timestamp>_*.sql` → `apps/api/drizzle/0008_*.sql` (sequential 4-digit, drizzle/ not src/db/migrations/)
- `POST /api/v1/auth/login` → `POST /api/v1/auth/staff/login` (split staff/public endpoints)
- `auditService.log()` → `AuditService.logAction()` / `AuditService.logActionTx()` (class name + method name)
- "rate-limit middleware pattern from Story 7-4 / 7-6" → `apps/api/src/middleware/login-rate-limit.ts` (canonical pattern reference)
- "password re-confirmation in request body" → reuse existing `POST /auth/reauth` + `setReAuthValid()` (don't re-implement)

### References

- Architecture ADR-015 (Public User Registration & Auth Strategy, retiring Google OAuth + establishing magic-link primary): [Source: _bmad-output/planning-artifacts/architecture.md:2713]
- Epics — Story 9-13 FRC tier slot + Wave 0 recommendation: [Source: _bmad-output/planning-artifacts/epics.md:246]
- Auth routes — staff vs public login split: [Source: apps/api/src/routes/auth.routes.ts:21-34]
- Auth routes — re-auth endpoint: [Source: apps/api/src/routes/auth.routes.ts:101-104]
- Auth controller — staff login handler (insertion point for 2-step MFA branch): [Source: apps/api/src/controllers/auth.controller.ts:117-157]
- Auth controller — refresh-token cookie pattern (for optional challenge-cookie): [Source: apps/api/src/controllers/auth.controller.ts:27-33]
- Auth service — `loginStaff` (modify here): [Source: apps/api/src/services/auth.service.ts:227]
- Audit service — `logAction` / `logActionTx` API + `AUDIT_ACTIONS` const: [Source: apps/api/src/services/audit.service.ts:35-64,226,267]
- Rate-limit middleware canonical pattern (clone for `prefix: 'rl:mfa:'`): [Source: apps/api/src/middleware/login-rate-limit.ts:25-110]
- Sensitive-action / re-auth window middleware: [Source: apps/api/src/middleware/sensitive-action.ts:128]
- Real-IP resolver (CF-Connecting-IP): [Source: apps/api/src/middleware/real-ip.ts:28-40]
- Redis singleton client: [Source: apps/api/src/lib/redis.ts:37]
- Users schema (add MFA columns; do NOT conflate with existing `lockedUntil`): [Source: apps/api/src/db/schema/users.ts:6-56]
- Schema barrel (append `userBackupCodes` export): [Source: apps/api/src/db/schema/index.ts:1-17]
- Drizzle migration directory + naming convention: [Source: apps/api/drizzle/0007_audit_logs_immutable.sql]
- API package db-push scripts: [Source: apps/api/package.json:18-20]
- Web HTTP client (fetch-based, no axios): [Source: apps/web/src/lib/api-client.ts:31-60]
- Sidebar config (append super_admin NavItem): [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts:142-156]
- MEMORY.md key patterns — drizzle schema cannot import `@oslsr/types`; integration tests use beforeAll/afterAll; db:push:force data-loss risk: [Source: MEMORY.md "Key Patterns"]
- External security assessment 2026-04-27 (gap origin): [Source: ssh_analysis.txt:65-67]

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
- `apps/api/src/db/schema/user-backup-codes.ts`
- `apps/api/drizzle/0008_add_mfa_columns.sql`
- `apps/web/src/features/security/mfa/pages/MfaEnrollmentPage.tsx`
- `apps/web/src/features/security/mfa/pages/MfaChallengePage.tsx`
- `apps/web/src/features/security/mfa/components/QrCodeDisplay.tsx`
- `apps/web/src/features/security/mfa/components/BackupCodesDisplay.tsx`
- Tests for AC#10 (~35-40 new)

**Modified:**
- `apps/api/src/controllers/auth.controller.ts` — `staffLogin` 2-step branch
- `apps/api/src/services/auth.service.ts` — `loginStaff` returns `requires_mfa` shape when applicable
- `apps/api/src/services/audit.service.ts` — `AUDIT_ACTIONS` extended with 8 MFA actions
- `apps/api/src/routes/auth.routes.ts` — mount `/mfa/*`, `/login/mfa`, `/login/mfa-backup`
- `apps/api/src/db/schema/users.ts` — new MFA columns
- `apps/api/src/db/schema/index.ts` — export `user-backup-codes`
- `apps/api/src/app.ts` — wire `mfa-grace` middleware into protected stack
- `apps/web/src/lib/api-client.ts` — (only if `requires_mfa` shape needs typing here; otherwise no change — handled in mutation hook)
- `apps/web/src/features/auth/hooks/useLogin.ts` (or equivalent) — branch on `requires_mfa`
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — append MFA NavItem to `super_admin` array
- `docs/emergency-recovery-runbook.md` — new MFA Recovery section
- `docs/team-context-brief.md` — auth posture note
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `MEMORY.md` (if new patterns surface)

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-27 | Story created by John (PM) per Awwal cost-aware roadmap session. Status `ready-for-dev`. 11 ACs covering TOTP enroll/verify/login-flow/backup-codes/grace-period/disable/regenerate/rate-limit/audit/UI/runbook. Tier B per FRC §5.3.1; recommended Wave 0 slot alongside CI-hygiene stories. otplib + qrcode npm dependencies added; ZERO ongoing cost. | External security assessment 2026-04-27 flagged super_admin password-only login as Medium-High gap; ADR-015 confirmed magic-link is the only "second factor" today; for accounts touching every respondent record this is below NDPA-aligned bar. TOTP chosen specifically because SMS/Twilio rejected on cost grounds (Awwal funding from pocket, ₦15K→₦26K domain miss eroded trust in cost estimates). |
| 2026-04-29 | Runbook section number corrected: §1.8 → §3.6 across AC#11, Task 6.4, Technical Notes (NTP), and Risks (#4). Heading style normalized to `### 3.6 Lost authenticator device (MFA recovery)` to match §3.1–§3.5 convention. | Bob verified the runbook structure: chapter §1 is "Current infrastructure state" (state/reference subsections only — §1.1 access paths, §1.2 tailnet, §1.3 SSH config, §1.4 security layers, §1.5 accounts, §1.6 email arch, §1.7 credentials). Break-glass procedures live in chapter §3 "Common incident scenarios" (§3.1 "I can't SSH" through §3.5 "Lost laptop"). MFA recovery is unambiguously a §3-class procedure — natural slot is §3.6, directly after §3.5 "Lost laptop" (its closest cousin: lost-thing → recovery procedure). §3.6 confirmed unused; no renumbering or cross-ref breakage. |
| 2026-04-29 | Validation pass (Bob, fresh-context mode 2 per `_bmad/bmm/workflows/4-implementation/create-story/checklist.md`). Rebuilt to canonical template structure: folded top-level Background / Dependencies / FRC Impact / Technical Notes / Risks under Dev Notes; moved Change Log + File List under Dev Agent Record; added Project Structure Notes subsection; added References subsection with `[Source: file:line]` cites; added Review Follow-ups (AI) placeholder; converted tasks to canonical `[ ] Task N (AC: #X)` checkbox format; split AC#5 into AC#5a / AC#5b / AC#5c / AC#5d for cleaner test handles. Fixed factual codebase references throughout: `axios.ts` → `api-client.ts` (fetch-based, no interceptor); `super-admin/components/Sidebar.tsx` → `dashboard/config/sidebarConfig.ts` (config-driven); `apps/api/src/db/migrations/<timestamp>_*.sql` → `apps/api/drizzle/0008_*.sql` (sequential prefix); `POST /auth/login` → `POST /auth/staff/login` (split endpoints); `auditService.log()` → `AuditService.logAction()` / `logActionTx()`; replaced "rate-limit pattern from Story 7-4/7-6" with concrete `apps/api/src/middleware/login-rate-limit.ts:25-110` reference; replaced bespoke "password re-confirmation in request body" with reuse of existing `/auth/reauth` flow + `setReAuthValid()` middleware. Added explicit guidance: `mfa_secret` Phase 1 plaintext + `TODO(9-9)` marker (since Story 9-9 AES-256 helper is backlog); db:push:force pre-flight diff sanity check; integration tests use `beforeAll/afterAll`; drizzle schema files must NOT import `@oslsr/types`; column-name guard against existing `users.lockedUntil`. All substantive content from v1 preserved. | Story v1 was authored without loading BMAD workflow files — surfaced structural drift (non-canonical top-level sections, narrative tasks instead of checkboxes) and content gaps (no Project Structure Notes, no References, factually incorrect file paths and API names that would have caused dev-agent disasters). |

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution.)_
