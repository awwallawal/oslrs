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
3. **9-38** account-provisioning **keystone** (~3–5d) — after 9-18 (hooks `submitWizard`); ships the `respondents.user_id` link + `GET /me/registration-status` read-model
4. **9-39** entry-IA ∥ **9-40** dashboard rewrite (~2–4d / ~4–6d) — **parallel**, both after 9-38

**Parallel track — run WHILE 9-18 cooks (different surfaces, low overlap):**
- **9-21** route-registration integration test — do *before* 9-39 changes routing
- **9-22 → 9-23** operator-audit helper → publish-path convergence (9-22 first; 9-23 validated **hygiene, not a 9-18 blocker** — pairs with the Q.M. surface 9-17 touches; bundle with 9-17 if a dev is already there)
- **9-24** local-db-drift prevention
- **prep-typecheck-operator-scripts** — static-check the prod-mutating Tailscale scripts
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

---

## Phase 3 — Post-launch public enhancement

- **9-32** public account settings + NDPA self-service rights (depends on 9-38 + 9-39)

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
- Epic 10 → 10-5 (DSA) before the rest.

_See: [[field-readiness-sequence-2026-05-31]], [[journey-before-mechanism]], `sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md`._
