# OSLRS Roadmap to Launch — canonical sequencing

**Owner:** Awwal (Builder) · **Maintained via:** Bob (SM) · **Created:** 2026-06-06
**Purpose:** the single, ordered path from "where we are" to "public survey launched, then hardened, then future epics." Supersedes ad-hoc sequencing in chat. When a story flips `done`, strike it here.

> **The reframe:** "finish everything" is three tiers, not one queue.
> **A. Launch critical path** (Phases 0–2) — what must be true to fire the blasts.
> **B. Post-launch + hygiene** (Phases 3–4) — valuable, not launch-gating.
> **C. Future epics** (Phase 5) — separate initiatives (API governance, multi-source import).
> Tiers B and C must **not** delay Tier A.

---

## Phase 0 — Close the nearly-done (now; mostly operator/validation gates)

These are `review` or operator-gated — they need a decision or a validation, not dev time.

| Story | State | Action to close |
|---|---|---|
| 9-30 CSP analytics unblock | review | 24h validation (zero new csp_violation + first Cloudflare rows) → done. *Gates field + Cohort A analytics.* |
| 9-12 public wizard | review | Operator: revoke Google OAuth creds + the first-respondent UAT (effectively done) → done + FRC#3 flip |
| 9-28 Cohort A recovery | review | Operator **decision** → resolve |
| 9-25 MFA-reminder idempotency | ready | Quick — but **re-confirm it's still needed** (it was to unblock 9-13's flip; 9-13 is already done) |

---

## Phase 1 — Perfect the wizard + public journey (critical path, ~3–4 wks)

**9-18 is the long pole — start it first, today.** Everything downstream waits on it.

**Critical chain:**
1. **9-17** form-pin UI on Q.M. (~1–1.5d) — small; start in parallel with 9-18 kickoff
2. **9-18** wizard NIN-first + section-as-step (**~7–11d — the bottleneck**). Success metric: **Step-4 stall <30%** on the 9-19 dashboard within 7d of deploy.
   - **9-54 → 9-55** (NEW 2026-06-10 — emerged from the 9-18 Part-A/F review + prod verification; **launch-gating**; both after 9-18's questionnaire surface): **9-54** forms-engine fidelity — runtime `calculate`/`age` eval + group-relevance migration + publish-time validator + **choice-field wizard dedup value-mapping** (folded from the Part-E review — gender/lga/consent are re-asked because their value vocabularies mismatch the wizard's; needs a mapping layer, not a naive alias add); *also closes a live dropped-`consent_basic` identity gate*. **→ 9-55** minor age-gate (floor 15 + ILO Art.6 apprenticeship carve-out + NDPA guardian consent), depends-on 9-54. ~2–3d each. Author via `*create-story` when 9-18 ships.
3. **9-38** account-provisioning **keystone** (~3–5d) — after 9-18 (hooks `submitWizard`); ships the `respondents.user_id` link + `GET /me/registration-status` read-model
4. **9-39** entry-IA ∥ **9-40** dashboard rewrite (~2–4d / ~4–6d) — **parallel**, both after 9-38

**Parallel track — run WHILE 9-18 cooks (different surfaces, low overlap):**
- **9-21** route-registration integration test — do *before* 9-39 changes routing
- **9-22 → 9-23** operator-audit helper → publish-path convergence (9-22 first; 9-23 validated **hygiene, not a 9-18 blocker** — pairs with the Q.M. surface 9-17 touches; bundle with 9-17 if a dev is already there)
- **9-24** local-db-drift prevention
- **prep-typecheck-operator-scripts** — static-check the prod-mutating Tailscale scripts
- **Security-hardening track (R2 assessment `sec-r2-20260603`) — gates the blasts, parallel to 9-18:** ~~9-42 (auth/token)~~ ✅ **DONE+deployed 2026-06-08** (`5bbb824`..`164ff6b`; F-011/012/018/019/022/023/004 + OPS-RL-1/OPS-2) · **9-48 (refresh-token lifecycle: hash-at-rest OPS-3 + M1 rotation grace + L3 reset-atomic) — NEW launch-gate, carved from the 9-42 review** · 9-41 (reveal accountability) · 9-43 (export) · 9-44 (upload) · 9-45 (access-control/boot) · 9-9 origin-lock (F-024, operator). All green before the Phase 2 🚦 gate. **9-48 MUST land before any blast** (hard hash-only cutover = forced global re-login; ≈0 pre-traffic, painful after). _See SCPs `…-2026-06-06-security-r2-remediation.md` + `…-2026-06-08-refresh-token-lifecycle-hardening.md`._
- **Operator (continuous):** Resend Pro + Termii account signups — needed for Phase 2

---

## Phase 2 — Field-readiness + go live (~1 wk, gated on Phase 1)

- **9-20** pre-viral capacity prep — *blocks the social push*
- **9-27** re-engagement blasts + **9-28** Cohort A blast — fire **after** 9-18 + the journey harmonization (a blasted user who logs in must meet a coherent front, not "Start Survey")
- Enumerators → field · marketing / social push

### 🚦 Launch gate (definition of done for the launch)
Fire the blasts only when **all** are green:
- wizard **Step-4 stall <30%** (9-18, measured on the 9-19 dashboard)
- **coherent public journey shipped** (9-38 + 9-39 + 9-40)
- **capacity** ready (9-20) · **analytics live** (9-30) · **blast infra** live (Resend Pro + Termii)
- **form fidelity + minor safeguarding** (9-54 ✅ **done 2026-06-14** → 9-55 next): runtime `calculate`/`age` eval + group-relevance migration + publish-time validator (closes the dropped `consent_basic` identity gate) [✅ shipped + prod re-pinned in 9-54] + floor-15 age-gate with ILO apprenticeship carve-out & NDPA guardian consent [9-55, **ready-for-dev**, depends-on 9-54 — closes the wizard/forms UI loop before 9-56]. _Emerged from the 9-18 review; verified against prod 2026-06-10._
- **support traceability** (9-56): support can resolve a registrant by the **Reference ID** the success screen now shows them (or by email/phone) and see status / whether the magic-link email was sent — registry search currently matches name/NIN only. _Lightweight operability gate; emerged 2026-06-14 from the 9-54 reference-ID swap (commit `0f03a42`). Parallel-track — does NOT gate the Phase-1 critical path._
- **zero open R2 security findings** (`sec-r2-20260603`): **BOTH Highs now closed** — F-011 ✅ (`4fee9b9`) + **F-024 ✅ 2026-06-09** (origin-locked: de-point + 443→CF firewall + CF Origin Cert + AOP mTLS; known-IP accepted-residual). Dev gate stories: **9-42 ✅ done** · **9-48** (refresh-token lifecycle, NEW) · 9-41 (F-007 reveal) · 9-43 · 9-44 · 9-45. **Scorecard: both Highs done; remaining gate = dev stories 9-48 + 9-41 + 9-43 + 9-44 + 9-45.** _Rationale: the blasts point traffic at the origin + reveal endpoint; launch with zero security debt. (9-49 access-token in-memory = POST-LAUNCH, NOT a gate — register note G / ADR-022.)_

---

## Phase 3 — Post-launch public enhancement

- **9-32** public account settings + NDPA self-service rights (depends on 9-38 + 9-39)
- **9-49** access-token client storage hardening (in-memory + silent refresh; Option C per ADR-022) — **depends-on 9-48** (M1 grace window); closes the residual XSS-at-rest exposure F-004 left. Launch posture = Option A (sessionStorage) accepted; this is the post-launch upgrade. _NOT a gate._
- **`marketplace-contact-broker-relay` — DORMANT/PARKED** (9-36/9-37 pattern). Brokers employer↔candidate contact so raw PII never leaves until the candidate replies → collapses harvest value to ~0. **NOT a launch gate:** F-007 the *finding* is closed by 9-41; this is defense-in-depth *beyond* a closed finding. **Pull triggers (any):** `getSuspiciousDevices` alerts sustained > threshold post-launch · per-profile-cap rejections climbing · Ministry requests stronger PII-minimization · operator-pool > 1. New channel (~dev-weeks); current messaging is supervisor↔enumerator only. _See SCP `sprint-change-proposal-2026-06-06-security-r2-remediation.md`._

## Phase 4 — Hygiene / debt (interleave or one cleanup sprint; non-blocking)

- **9-35** backup-promotion `.enc` fix (~30 min; cron-day-1 only)
- **prep-export-row-cap-and-redirect** export hardening
- **9-9** infrastructure-security-hardening — close the AC#9 SOC-style baseline when bandwidth (already field-ready; not blocking)
- **9-36 / 9-37** — **DORMANT.** Leave in backlog; pull in *only* if their documented revisit triggers fire (deliberate per the 9-34 `/code-review-triage` lesson — do **not** gold-plate to "finish everything")

## Phase 5 — Future epics (separate initiatives, post-survey)

- **Epic 11** (11-2 → 11-3 → 11-4) — multi-source import; do *if/when* the Ministry needs dataset (e.g. ITF-SUPA PDF) ingestion
- **Epic 10** — API governance for external consumers: **10-5** (`review` → done) first, then 10-1 / 10-2 / 10-3 / 10-4 / 10-6

---

## Sequencing principles
1. **Front-load and protect 9-18** — longest, riskiest (UX + a real success metric); the whole journey waits on it. Don't let Phase-0 closures or hygiene delay its kickoff.
2. **Parallelism is the speed lever** — the hygiene track + operator prep fully overlap 9-18; Phase 1 is ~3 wks wall-clock, not the day-sum.
3. **Refuse "do it all at once"** — Tiers B/C never gate Tier A. Launch = Phases 0–2.
4. **Operator gates are the silent blockers** — knock out Phase 0 (9-12 / 9-28 / 9-30) so they don't lurk under the dev work.

## Dependency quick-reference (validated 2026-06-06)
- 9-38 → after 9-18 (`submitWizard` hook). 9-39, 9-40 → after 9-38 (read-model). 9-32 → after 9-38/9-39.
- 9-23 → after 9-22; **independent of 9-18** (publish *timestamp* metadata, not form discovery). Pairs with 9-17's Q.M. surface.
- 9-27 → deploy-gated on 9-18 + Resend Pro. 9-20 → before social push. 9-30 → before field + Cohort A analytics.
- 9-54 → after 9-17 (pin/validate) + 9-18 (questionnaire surface). 9-55 → after 9-54. Both **launch-gating**.
- 9-56 → extends Epic 5 registry (5-5 / 5-3 detail) + 6-1 audit; soft-dep 9-38 (status vocabulary, not blocking); independent of 9-18. **Launch-gating (lightweight, parallel-track).**
- Epic 10 → 10-5 (DSA) before the rest.

_See: [[field-readiness-sequence-2026-05-31]], [[journey-before-mechanism]], `sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md`._
