# OSLSR Security Findings Register (auditor-facing, in-repo)

**Purpose:** the single, repo-resident record mapping every external/internal security finding → our disposition + rationale + verification pointer. A future auditor (or a re-test of the same audit) reads **this file** — it does not require the original assessment package (which lives outside the repo and will not travel at BOT transfer).

**🔁 MAINTENANCE RULE (enforced):** every `fix(sec): F-XXX` commit — or any disposition change — updates that finding's row here **in the same change** (flip to `Fixed-in-<hash>`). This register is the assessor's **1:1 retest map**; do not let a fix land without updating its row. (Mirror of the Planning-Artifact-Discipline rule in `project-context.md`.)

**Disposition vocabulary:** `Fixed-in-<commit>` · `In-story <id>` (authored, ready-for-dev) · `Accepted` (with rationale) · `Deferred-operator` (runbook ref) · `Already-clean` (verified) · `Open` (no disposition yet — needs a decision).

---

## R2 — `sec-r2-20260603` (white-box pinned to commit `f2b9695`; infra from live host)

Severities are the **assessor's calibrated** ratings (subagent "High"s downgraded where contingent; see calibration note). Two Highs, no Critical. Aggregate posture at assessment time: **WEAK**.

| ID | Title | Sev | Disposition | Rationale / notes | Verify |
|----|-------|-----|-------------|-------------------|--------|
| F-011 | Reset token stored plaintext (Redis+DB) | **High** | ✅ **Fixed-in-`4fee9b9`** | sha256 at rest (Redis key + DB col) + hash-before-lookup; review-clean | test: 64-hex at rest, e2e reset ok |
| F-024 | Origin reachable around Cloudflare | **High** | Deferred-operator (`docs/f-024-origin-lock-runbook.md`) + dev step-2 (9-9 #11) | `oyotradeministry.com.ng` grey/direct → origin; gates Phase-2 blasts | runbook §5 matrix |
| F-005 | Fail-open to dev mode if `NODE_ENV` unset | Medium | In-story 9-45 | **LATENT, not active** — prod confirms NODE_ENV=production (dev routes 404, CSP enforced); fix = fail-closed boot | test: unset → non-zero exit |
| F-007 | Marketplace reveal — bulk PII via account fan-out | Medium | In-story 9-41 | **downgraded High→Medium** after open-by-design confirmed (control = registration+audit+caps, not role gate) | 9-41 AC#1–#8 |
| F-008 | CSV formula injection in exports | Medium | In-story 9-43 | `sanitizeCell()` on every cell | test: `=HYPERLINK` → `'`-prefixed |
| F-009 | Unbounded CSV export (egress + DoS) | Medium | In-story 9-43 | cap + stream | test: over-cap → 413/stream |
| F-010 | View-As read-only bypass via URL substring | Medium | In-story 9-45 | wire real `blockMutationsInViewAs`; delete dead inline copy | test: `?x=/view-as/end` → 403 |
| F-012 | Logout doesn't positively revoke refresh token | Medium | In-story 9-42 | positive `revokeAllUserTokens` | test: post-logout token rejected |
| F-013 | Export audit log fire-and-forget / swallowed | Medium | In-story 9-43 | transactional + fail-closed | test: audit-fail → no data sent |
| F-014 | No step-up reauth on privileged mutations | Medium | In-story 9-45 | `requireFreshReAuth`, unconditional for role change | test: stale → 401 |
| F-016 | Upload: client MIME/filename reflected in headers | Medium | In-story 9-44 | server-side Content-Type + sanitized filename | test: spoofed → normalized |
| F-017 | Upload: type validation trusts client MIME | Medium | In-story 9-44 | ext AND mime + magic-byte sniff | test: mismatch → reject |
| F-001 | CSP allows `style-src 'unsafe-inline'` | Low | **In-story 9-47** (fix elected, spike-first) | R1 finding; fix ELECTED over Accept-Low 2026-06-07. Spike resolves element-vs-attribute + nginx-static-header constraints; outcome may be partial (hash `<style>` + retain `style-src-attr`) — see 9-47 | 9-47 spike → AC#3 |
| F-004 | Inconsistent/dead `localStorage` token reads | Low | In-story 9-42 | in-memory token + lint ban | test: lint fails on localStorage auth key |
| F-006 | Committed scratch/logs + `.env.bak` on host | Low | **Already-clean (repo) + minor operator** | repo history verified: only `.env.example` ever committed; `.gitignore` covers `.env*`/`*.pem`/`*.key`. **Host-side `.env.bak.*` deletion = small operator task** (see note B). optional `gitleaks` | git log --all clean |
| F-018 | forgot-password timing enumeration | Low | In-story 9-42 | queue/`setImmediate` equalize latency | test: equal-latency branches |
| F-019 | Reset rate-limit IP-only / spec mismatch | Low | In-story 9-42 | **middleware is IP-only → real fix, not just "verify"** (service-layer already email-keyed; the *middleware* is the gap) | test: email-keyed + max |
| F-020 | Public `/verify/:id` returns staff PII + signed photo URL | Low | In-story 9-43 | minimize fields + proxy photo | test: minimized payload |
| F-021 | `updateRole` lacks server-side rank cap (latent) | Low | In-story 9-45 | `assignedRole <= actorRole` in service | test: over-rank → reject |
| F-022 | Refresh token not rotated / no reuse detection | Low | In-story 9-42 | rotate + family-revoke on replay | test: replay → family revoked |
| F-025 | SSH (22) exposed to public internet | Low | **Accepted / deferred-operator** | sshd key-only + fail2ban; 22 public *by design* for GH Actions deploys (ADR-020); full-close gated on self-hosted-runner-in-tailnet follow-up | sshd -T; ADR-020 |
| F-026 | Prod runtime hygiene (tsx, uncommitted NODE_ENV, drift) | Low | Split: code In-story 9-45 + operator | NODE_ENV injected by pm2 start-wrapper (works) but **uncommitted** (fragile); runs `tsx` not `node dist`. operator: commit `NODE_ENV=production` + `node dist` | runbook / 9-9 |
| F-002 | Internal header leak (`x-proxy-upstream`) | Info | In-story 9-45 | strip internal `x-*` at edge | test: header absent |
| F-003 | Dev artifacts in prod client bundle | Info | In-story 9-45 | strip dev/localhost from build | build check |
| F-023 | `uploadSelfie` reads wrong JWT field (fails closed) | Info | In-story 9-42 | `.userId` → `.sub` | test: route succeeds w/ token |
| OPS-RL-1 | IPv6 rate-limit bypass (`operations-rate-limit.ts` keyGenerator) | Low *(local)* | In-story 9-42 | locally discovered 2026-06-06 (not R2); wrap IP in `ipKeyGenerator` | test: IPv6 bucketed |
| OPS-2 | Staff `invitationToken` stored + looked up RAW at rest | Medium *(local)* | ✅ **Fixed-in-`8ba810a`** | locally discovered 2026-06-07 via the F-011 class-sweep (not R2); same class as F-011 — DB/backup leak → activation hijack of a not-yet-activated staff invite (token nulled on activation, `auth.service.ts:175`). `hashInvitationToken()` at 3 store sites + 2 lookup sites, mirror F-011. **Deploy: flushes in-flight invitations (raw→hashed cutover, 24h TTL) — operator re-sends `invited` users.** | test: hash-at-rest + store-path plaintext-email |

### Notes & reconciliations (read these — they correct earlier session framing)

**A. F-001 is newly surfaced into our tracking** — the remediation brief's tiers never listed it, so it was in **no story**. It needs a disposition decision: (i) **Accept-Low** with rationale (Tailwind/shadcn inject runtime inline styles; nonce/hash migration is non-trivial; `script-src` + `frame-ancestors 'self'` already contain the risk; defense-in-depth only) — *recommended*; or (ii) fold a nonce/hash CSP-style task into 9-45. **PM/operator call.** — **RESOLVED 2026-06-07: Awwal elected the FIX (not Accept-Low) → carved into Story 9-47 (CSP style-src nonce/hash hardening, spike-first). Note the realistic outcome may be partial (hash `<style>` + retain `style-src-attr 'unsafe-inline'`) — 9-47 spike decides.**

**B. F-006 nuance** — the *repo* git-history is verified clean (only `.env.example`). The finding's "`.env.bak` secret backups" refers to **host-side** files on the VPS (`/root/oslrs/.env.bak.*`) — a small **operator** cleanup (delete them), not a code/git task. Don't conflate the two.

**C. F-005 / F-026 / NODE_ENV reconciliation** — an earlier operator-track note said "NODE_ENV unset at runtime." **More precisely (per assessor live check):** NODE_ENV is **effective at runtime = production** (dev routes 404, CSP enforced) — *injected by the pm2 start-wrapper* — but it is **not in `.env` and not committed**. So **F-005 is LATENT** (the fail-open path exists in code but isn't active) and **F-026 is the real hygiene gap** (uncommitted env + `tsx`). Fix both as defense, but neither is "actively running in dev mode in prod."

**D. Severity calibration (assessor, for reproducibility):** subagent "High"s for View-As (F-010), CSV injection (F-008), unbounded export (F-009), logout/refresh (F-012/F-022) were downgraded to Medium/Low (actor already trusted / victim action required / indirect mitigation). F-007 downgraded High→Medium after open-by-design. **Retained Highs: F-011, F-024 only.** Our story framing occasionally calls F-007 "High-by-product-decision" — the *assessor's calibrated* severity is **Medium**; this register is canonical on severity.

**E. Non-finding note — pm2 `oslsr-api ↺=111`** (investigated 2026-06-06): **BENIGN.** Every rotated error log contains only `ERR_ERL_KEY_GEN_IPV6` (→ OPS-RL-1); zero crash signatures; every restart preceded by graceful `server.shutdown` → deploy/reload-driven, not crashes. **No restart-stability action needed; Story 9-10 inquiry closed.** Recorded here so the decision has a permanent, auditor-visible home.

**F. F-011 class-sweep result (2026-06-07, Amelia/dev).** The brief's F-011 instruction ("hash any other bearer secret stored raw") was executed across the codebase. **Hashed-safe:** magic-link (`token_hash`), password-reset (this fix), marketplace `editToken` (`marketplace-edit.service.ts`), sms-otp, mfa. **Found raw → OPS-2** (`users.invitationToken`, see row above). **Dead column:** `users.emailVerificationToken` — schema-only, no reader/writer post-9-12 (superseded by magic-link) → scheduled for drop in Story 9-46 (idempotent migration). The sweep is therefore complete: every raw bearer secret is either hashed, scheduled (OPS-2), or dead-and-being-removed.

---
_Maintained by: SM/dev per the maintenance rule above · R2 register authored 2026-06-07 (Bob/SM) from `…/security-assessment/FINDINGS-REGISTER.md` + findings/ folder._
