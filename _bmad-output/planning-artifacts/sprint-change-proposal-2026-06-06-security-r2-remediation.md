# Sprint Change Proposal — Security Assessment R2 Remediation

**Date:** 2026-06-06
**Author:** John (PM) · facilitated via `correct-course` workflow (incremental mode)
**Owner / Decision-maker:** Awwal (Builder)
**Trigger artifact:** Authorized white-box security assessment R2 — tag `sec-r2-20260603`, findings pinned to commit `f2b9695`
**Source docs:** `C:\Users\DELL\Desktop\security-assessment\EXECUTIVE-SUMMARY.md`, `REMEDIATION-BRIEF.md`, `findings/F-007-marketplace-reveal-no-authz.md`
**Companion SCP (same day):** `sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md`
**Canonical sequencing touched:** `docs/roadmap-to-launch.md` (Phase 1 track + Phase 2 🚦 gate + Phase 3 parked story)

---

## Section 1 — Issue Summary

An authorized white-box security assessment (R2) of the OSLSR platform produced a split verdict:

- **Engineering / security maturity: B+** (above most commercial — MFA, token revocation, hash-chained audit, consent fail-closed, strong CSP, no IDOR in respondent/messaging paths).
- **Current live risk posture: WEAK (~C)** — two open **Highs** plus a Medium/Low tail mean real, unaddressed risk *today*.

**Why it is a sprint change, not a backlog footnote:** the canonical `roadmap-to-launch.md` does not account for the assessment, and **Phase 2 fires the Cohort A/B blasts + social push directly at the two surfaces the findings expose** — the origin (F-024) and the marketplace reveal endpoint (F-007). Driving marketing traffic at an unhardened origin and an unbounded reveal endpoint is the precise moment the open Highs bite.

**Evidence (HEAD-reconciliation performed 2026-06-06 — findings re-verified against current tree, not assumed from `f2b9695`):**
- **F-011 — CONFIRMED OPEN.** `apps/api/src/services/password-reset.service.ts:161` writes the raw reset token as the Redis key; `:169` writes raw `passwordResetToken` to the DB; validation (`:187`) looks up by raw token. The 9-16 magic-link work did not touch this path. *(Side-effect: F-019's "key by normalized email" is already satisfied at lines 58/85 — F-019 partially self-closed.)*
- **F-007 — CONFIRMED OPEN.** `apps/api/src/routes/marketplace.routes.ts:28` — `POST /profiles/:id/reveal` is `authenticate + verifyCaptcha` with **no `authorize`**; `apps/api/src/middleware/reveal-rate-limit.ts:59` collects the device fingerprint but explicitly *"don't enforce, just observe."* Per-user 50/24h is the only cap — defeated by account fan-out.
- **F-024 — live-host state**, not reconcilable from the repo; requires the Tailscale origin-firewall check before it can be marked closed.

**Product decision settled during analysis (F-007):** marketplace contact reveal stays **open by design** (any registered user; accountability via registration + audit + rate limit, *not* a role gate). The original "restrict to verified employer role?" question is resolved: **open**, because the harm is *corpus reconstruction + off-purpose spam on consented data*, addressed by caps + anomaly alerting + progressive friction, not by gating access.

---

## Section 2 — Impact Analysis

### Epic Impact
- **Epic 9** (`Platform Polish … Security Hardening … Field-Survey UX Readiness`) absorbs the change. Its title already covers security; **no new epic is required.**
- **Story 9-9** (`infrastructure-security-hardening`, in-progress) is the standing home for the infra/operator findings (F-024/025/026/006).
- No future epic is invalidated; no epic becomes obsolete.

### Story Impact
- **5 new dev stories** added to Epic 9 (9-41…9-45) — all launch-gating.
- **4 new subtasks** appended to Story 9-9 (F-024/025/026/006) — operator/infra, gating.
- **1 new parked/dormant story** (`marketplace-contact-broker-relay`) — Phase 3, non-gating.
- No existing in-flight story (9-18, 9-38, 9-39, 9-40) is disturbed — the security track runs on different surfaces and parallels the 9-18 critical path.

### Artifact Conflicts
- **PRD:** No conflict. F-007 hardening is consistent with FR17–FR19 + the two-stage consent model; F-011/F-024 sit under NFR4 security. **No PRD rewrite.**
- **Architecture:** Light-touch note only — F-024 ties to ADR-020 / Cloudflare decisions (origin-lock); no new architectural decisions required.
- **UX:** F-007's *gating* slice is server-side and invisible. The progressive-friction rungs touch reveal UX only marginally; covered inside 9-41. **No UX spec rewrite for launch.**
- **Canonical sequencing (`roadmap-to-launch.md`):** **primary edit** — Phase 1 security track, Phase 2 🚦 gate line, Phase 3 parked relay.
- **`epics.md` FRC table:** add item #7 (zero open R2 findings).
- **`sprint-status.yaml`:** add 6 new keys under `epic-9`.

### Technical Impact
- Code: ~5 themed stories, each with one atomic commit + test per F-ID (per the remediation brief's Definition of Done).
- Infra: DigitalOcean cloud-firewall change (origin-lock) + git-history scrub (`git filter-repo`) — operator actions via Tailscale.
- Timeline: the security track adds an estimated **~1–2 dev-weeks** to the Phase 2 gate versus a Highs-only gate. Accepted deliberately under the "zero security debt at launch" bar (Section 3).

---

## Section 3 — Recommended Approach

**Selected path: Option 1 — Direct Adjustment** (add within existing Epic 9; amend the launch gate). Rollback (Option 2) and MVP-reduction (Option 3) were both evaluated **Not Viable** — there is no bad work to revert, and the MVP is sound (the assessment praised its fundamentals); cutting scope ships *less* of a still-vulnerable surface without closing anything.

**Decision bar (set by Builder): "zero security debt at launch."** For a system holding government PII at public scale, this consciously overrides the roadmap's default anti-gold-plating instinct — *for security findings specifically*. That principle exists to prevent polishing unrequested features, not to defer closing known vulnerabilities before exposing citizen data.

**The load-bearing distinction — *closing a finding* ≠ *building its enhancement*:**
- Once the F-007 access-control hardening (9-41) ships, **F-007 the finding is CLOSED → zero debt.**
- The **messaging-relay north-star** is *defense-in-depth beyond a closed finding*, not an open vulnerability. It is a **new channel** (current messaging is supervisor↔enumerator, team-gated — not a drop-in reuse; ~dev-weeks). It is therefore **parked dormant** (9-36/9-37 pattern) with concrete, data-driven revisit triggers — captured in the canonical artifacts so it cannot be lost, without gating launch or gold-plating.

**Tiering (honours roadmap principle #3 — Tiers B/C never gate Tier A):**
| Bucket | Items |
|---|---|
| **🚦 Launch gate** | F-011, F-024 (Highs); **full F-007 hardening** (load-bearing controls + friction rungs + purpose-binding); Tier-2/3 dev tail (F-005/008/009/010/013/014/016/017/020/021/022/023/002/003/004/012/018/019) |
| **Parked dormant (Phase 3, concrete triggers)** | `marketplace-contact-broker-relay` (F-007 relay north-star) |
| **Deferred (Ministry/Operate — unchanged, NOT reopened)** | push-channel SMS/WhatsApp alerting (cost-rejected), boutique pentest (~₦200–300K), DPIA filing fee |

**Effort:** Low–Medium (additive). **Risk:** Low (does not disturb the 9-18 critical path; runs in parallel). **Timeline:** +~1–2 dev-weeks to the Phase 2 gate, accepted.

**Residual / not-yet-tested (honesty carry-over from the assessment):** Round 3 live exploitation, `npm audit` CVE scan, secrets-in-git-history scan (F-006 closes the cleanup, but a dedicated scan is recommended), business-logic abuse, SSRF deep-dive, rate-limit stress test. These are recommendations, not gate items, and route to `docs/post-handover-security-recommendations.md`.

---

## Section 4 — Detailed Change Proposals

### 4.1 — New Epic 9 dev stories (finding→story map)
> One atomic commit **per F-ID** within each story; each test-gated (fails on old behavior, passes on new). SM finalizes IDs/AC via `*create-story`.

| Story | Findings | Gate | Key tasks |
|---|---|---|---|
| **9-41 Marketplace Reveal Accountability Hardening** | F-007 (full) | 🚦 | **alerting-first** (`getSuspiciousDevices` + viewer-velocity → `alert.service.ts` Telegram) → **per-profile cap** (~3–5 distinct viewers/window) → **enforce fingerprint** (`reveal-rate-limit.ts:59` observe→enforce) → **global circuit-breaker** (degrade to step-up/human review, never hard-block) → **progressive friction** (CAPTCHA→phone OTP→MFA) → **purpose-binding** (acceptable-use declaration above a volume threshold). Keep consent-fail-closed (404) + CAPTCHA intact. |
| **9-42 Auth, Token & Session Hardening** | F-011, F-012, F-018, F-019, F-022, F-023, F-004 | 🚦 | hash reset tokens at rest (copy `magic-link.service.ts` pattern; class-sweep all `*Token` raw secrets); positive logout invalidation; equalize forgot-pw latency; refresh-token rotation + reuse-detection; fix `uploadSelfie` `.userId`→`.sub` (live 401) + test; move in-memory token reads off `localStorage` + lint-ban |
| **9-43 Export & Reporting Data-Safety** | F-008, F-009, F-013, F-020 | 🚦 | central `sanitizeCell()` (prefix `'` on `= + - @`/tab/CR for **every** cell); hard CSV row cap + stream (not buffer); `logPiiAccessTx` awaited + fail-closed export + `audit.pii_log_failed` alert; minimize public `GET /verify/:id` + proxy photo |
| **9-44 Upload Pipeline Hardening** | F-016, F-017 | 🚦 | `Content-Type` from server-side allowlist; sanitize filename + `filename*=UTF-8''`; XLSForm filter ext **AND** mime; magic-byte sniff on receipt/evidence path |
| **9-45 Platform Access-Control & Boot** | F-005, F-010, F-014, F-021, F-002, F-003 | 🚦 | fail-closed on unset `NODE_ENV`; fix View-As read-only (method + exact route, wire real `blockMutationsInViewAs`, delete dead inline substring); step-up `requireFreshReAuth` on role-change/deactivate/destructive admin (unconditional, not `rememberMe`-gated); server-side rank cap in `updateRole`; strip internal `x-*` at edge; strip dev/localhost artifacts from prod bundle |

### 4.2 — Story 9-9 subtask additions (operator/infra)
- **F-024** 🚦 — origin-lock: DO firewall → Cloudflare published IPs (or Cloudflare Tunnel), Authenticated Origin Pulls (mTLS), rotate origin IP afterward.
- **F-025** 🚦 — restrict port 22 to `tailscale0`/admin IP; confirm `PasswordAuthentication no`.
- **F-026** 🚦 — commit `NODE_ENV=production` to deployed env (pairs with F-005); run compiled `node dist` in prod (not `tsx`).
- **F-006** 🚦 **+ blocks any public repo push** — confirm `.env`/`.env.bak.*`/scratch+log files gitignored AND scrubbed from history (`git filter-repo`).

### 4.3 — `roadmap-to-launch.md` Phase 2 🚦 gate (append one line)
```
- zero open R2 security findings (sec-r2-20260603): Highs F-011 + F-024, full F-007
  reveal-accountability hardening, and the Tier-2/3 dev tail all closed — Stories
  9-41…9-45 + 9-9 origin-lock. Rationale: the blasts point traffic at the origin +
  reveal endpoint; launch with zero security debt.
```

### 4.4 — `roadmap-to-launch.md` Phase 1 parallel track (append)
```
- Security-hardening track (R2 assessment) — gates the blasts, parallel to 9-18:
  9-41 (reveal accountability) · 9-42 (auth/token) · 9-43 (export) · 9-44 (upload)
  · 9-45 (access-control/boot) · 9-9 origin-lock (F-024, operator).
```

### 4.5 — `roadmap-to-launch.md` Phase 3 parked relay (append)
```
- marketplace-contact-broker-relay — DORMANT/PARKED (9-36/9-37 pattern). Brokers
  employer↔candidate contact so raw PII never leaves until the candidate replies →
  collapses harvest value to ~0. NOT a launch gate: F-007 the *finding* is closed by
  9-41; this is defense-in-depth beyond a closed finding. Pull triggers (any):
  getSuspiciousDevices alerts sustained > threshold post-launch · per-profile-cap
  rejections climbing · Ministry requests stronger PII-minimization · operator-pool > 1.
  New channel (~dev-weeks); current messaging is supervisor↔enumerator only.
```

### 4.6 — `sprint-status.yaml` new keys (under `epic-9`)
```
9-41-marketplace-reveal-accountability-hardening: backlog
9-42-auth-token-session-hardening: backlog
9-43-export-reporting-data-safety-hardening: backlog
9-44-upload-pipeline-hardening: backlog
9-45-platform-access-control-boot-hardening: backlog
marketplace-contact-broker-relay: backlog   # PARKED/DORMANT — Phase 3, pull on documented triggers (SCP-2026-06-06-security)
```

### 4.7 — `epics.md` FRC table (add item #7)
```
| 7 | Zero open R2 security findings (sec-r2-20260603) — Highs + full F-007 hardening + Tier-2/3 dev tail closed | 9-41…9-45 + 9-9 | ⏳ Backlog |
```

---

## Section 5 — Implementation Handoff

**Change scope classification: MODERATE** — backlog reorganization + new story authoring; requires SM/PO coordination. Not Major (no PRD/architecture replan), not Minor (more than a direct dev edit).

**Handoff plan:**
| Recipient | Responsibility |
|---|---|
| **Bob (SM)** | Author stories 9-41…9-45 + the parked `marketplace-contact-broker-relay` via canonical `*create-story --yolo`; append F-024/025/026/006 subtasks to the 9-9 story file; flip the 6 new keys into `sprint-status.yaml` |
| **PM/Builder** | Apply the `roadmap-to-launch.md` edits (4.3–4.5) + `epics.md` FRC item #7 (4.7) — or delegate to SM in the same pass |
| **Dev agent** | Implement per story; one atomic commit per F-ID (`fix(sec): <F-ID> <summary>`); reply with commit hash per finding for assessor retest; "already fixed in `<commit>`" where HEAD has moved (e.g., re-verify F-019 status) |
| **Operator (Awwal, via Tailscale)** | F-024 origin-lock, F-025 SSH, F-026 prod env + `node dist`, F-006 git-history scrub |

**Execution order across findings (assessor-endorsed):** **F-011 → F-024** first (smallest, move off WEAK fastest) → then 9-41 (internally: alerting → per-profile cap → fingerprint → global breaker → friction → purpose-binding) → then the rest of the Tier-2/3 tail. All green before the Phase 2 🚦 gate.

**Success criteria:**
- Every gated F-ID closed with a passing regression test; full suite green; no existing control weakened (consent gate, parameterized SQL, MFA, session/token revocation intact).
- `roadmap-to-launch.md` Phase 2 gate shows the security line; `epics.md` FRC item #7 flips ✅ when all gated findings close.
- Assessor retest maps 1:1 to commit hashes.
- Parked relay recorded in `sprint-status.yaml` + roadmap Phase 3 with concrete triggers (durable, not chat-only).

**Deferred, NOT reopened (decision preserved):** SMS/WhatsApp push alerting, boutique pentest, DPIA filing fee → `docs/post-handover-security-recommendations.md`.

---

## Addendum — Operator-track live verification (2026-06-06/07, via Tailscale)

The operator findings were re-verified against the live host before scheduling. Results materially refine §4.2:

- **F-006 (git secrets): ~CLEAN — dropped from launch gate.** Full history scan shows only `.env.example` ever committed; `.gitignore` covers `.env*`/`*.pem`/`*.key`/`secrets.json`. No history rewrite or secret rotation required. Optional `gitleaks`/`trufflehog` scan as belt-and-braces only. (It gated *repo-going-public*, never the blasts.)
- **F-025 (public SSH): mitigated by design.** sshd is key-only (`passwordauthentication no`, `permitrootlogin without-password`) + fail2ban. Port 22 stays public to permit GH Actions deploys; full-close remains tied to the existing **self-hosted-runner-in-tailnet** 9-9 subtask. Not new work.
- **F-026 (NODE_ENV/tsx): CONFIRMED open.** `NODE_ENV` is **unset at runtime**; prod runs `npx tsx src/index.ts`, not compiled `node dist`. Behavioral ripples (Helmet CSP enforce, Secure cookies, alert gating) → **folded into 9-45** with F-005 (fail-closed boot forces it). Not a live edit.
- **F-024 (origin-lock): ROOT CAUSE identified — and it is NOT a config one-liner.** `oyotradeministry.com.ng` is a **grey/direct A record → origin `159.89.146.93`** (DNS at WhoGoHost; `oyoskills.com` is the only Cloudflare zone). Both serve the identical app (one nginx block, 4 server_names, one LE 4-SAN cert). Any origin-lock to Cloudflare IPs (nginx *or* DO firewall) would 403 every real user on `oyotradeministry.com.ng` until it is taken off-origin. **Settled plan (9-9 subtask):** redirect-retire `oyotradeministry.com.ng` (keep registered as BOT asset; no email to preserve) → **302** to `oyoskills.com` at WhoGoHost (302 not 301 to preserve future reuse; 1yr HSTS includeSubDomains already served → any future project on it must be HTTPS) → drop it from nginx `server_name` + `CORS_ORIGIN` + reissue cert oyoskills-only → **then** lock DO firewall 80/443 to Cloudflare IPs (keep 22 on Tailscale) → rotate origin IP. nginx source of truth = `infra/nginx/oslsr.conf` (CI-deployed; never hand-edit the VPS copy).

### New finding (locally discovered, NOT in R2) — fold into 9-42
- **OPS-RL-1 — IPv6 rate-limit bypass.** `apps/api/src/middleware/operations-rate-limit.ts:29` uses a custom `keyGenerator` without express-rate-limit@8's `ipKeyGenerator` helper (`ERR_ERL_KEY_GEN_IPV6`) → IPv6 clients can bypass that limit. Non-fatal (logs at startup) but a real bypass. Add as a task to **9-42** with an IPv6 regression test.

### Bonus (not a security item)
- **`pm2 oslsr-api ↺=111` is BENIGN** — zero crash signatures in any log; all restarts are graceful (`server.shutdown`), deploy-driven. Closes the Story 9-10 restart inquiry.
