# Pre-Viral Push Checklist — OSLRS (oyoskills.com)

**Owner:** Awwal (operator) · **Created:** 2026-06-10 (Story 9-20 Part D) · **Run this before any social-media / blog / blast push.**

> **Purpose.** A go/no-go + monitoring + rollback checklist for the moment you intentionally drive traffic at the site. Consolidates the decisions reached in the 2026-06-10 capacity/security session. Keep in lockstep with `docs/pending-operator-actions.md` + `docs/roadmap-to-launch.md`.

---

## 0. Go / No-Go gate (all must be ✅ before you push)

| Item | State (2026-06-10) | How to confirm |
|---|---|---|
| **Email capacity** — Resend Pro | ⏳ **operator** | resend.com → Billing shows Pro (50k/mo). The Free 100/day cap fails magic-links under load. |
| **SMS capacity** — Termii | ⏳ **operator** | Termii account + sender ID approved (9-27 Part B). |
| **Origin locked** | ✅ done | `curl -sI --max-time 8 http://159.89.146.93` and `... :443` both **time out**; `https://oyoskills.com` → 200 + `cf-ray`. |
| **WAF + DDoS** | ✅ active | Cloudflare Managed Rules ON + always-on DDoS (free tier). |
| **Analytics live** | ✅ done | `pnpm tsx apps/api/scripts/cf-analytics.ts --days 7` returns rows (9-30 + 9-20). |
| **Capacity headroom** | check | VPS at rest: `pnpm --filter @oslsr/api dashboard` — RAM/CPU/disk green (Story 9-19). |
| 🔴 **Per-station vanity paths LIVE** (13-63 AC1–AC3) — **PAID RADIO ONLY; PERISHABLE** | ⏳ **operator** | Load one vanity URL in a browser: the final URL still carries `?ref=`, **and** `wizard_drafts.form_data.extras.utm.ref` then holds the slug. ⚠️ **Target is `/register?ref=<slug>`, NOT `oyoskills.com/?ref=<slug>`** — the apex form is dropped at the first click (`parseUtm` runs only at `WizardPage.tsx:172`, mounted at `/register`), so a rule pointed there redirects perfectly and attributes nothing. |
| **Write-path capacity evidence** at the modelled peak — **PAID PUSH ONLY** | ⏳ **Story 13-65 `ready-for-dev`** | 13-3's green load test measured a **read** (`GET /api/v1/forms/public-active`). One public registration fires **three** outbound emails, unbounded, on a 2GB VPS with no swap — the failure mode is an OOM kill, not a graceful degrade. **13-65** (`13-65-registration-sends-off-the-request-path`) discharges this by taking routes (a) **and** (b) together: queue all three sends onto the existing `email-notification` queue (at most **5** concurrent instead of unbounded), then run the write-path test **before and after** so the comparison is the evidence. ⚠️ **Claim only what it buys — bounded concurrency, durability, retry and backpressure; NOT CPU reduction and NOT event-loop isolation, because all 10 workers run in the API process.** ✅ **Option (c) still stands on its own**: a **written** peak estimate with its basis, bounded by 13-3's headroom, clears this row without 13-65. ⛔ An unstated estimate is not (c). See `roadmap-to-launch.md` gate item 7. |

⚠️ **The last two rows were added 2026-08-21 (John/PM) and gate PAID SPEND specifically** — radio and
paid social. A zero-cost push (blog post, organic social, the association sheet) is not held by them.
The vanity-path row is the only item in this checklist that **cannot be discharged after the fact**: a
URL read on air cannot be retrofitted, and with 11 stations on the buy it is the difference between
"radio worked" and knowing which of the 11 earned the naira. Canonical list:
`docs/roadmap-to-launch.md` § *Pre-flight gate*.

If any ⏳ → **do not push** until resolved.

---

## 1. Cloudflare posture (decisions — do NOT second-guess under pressure)

- **Bot Fight Mode = deliberately OFF.** Rationale: WAF Managed Rules + always-on DDoS already cover the baseline; the origin is locked; marginal benefit is modest; and it risks false-positives on future inbound automation (Epic-10 API consumers, uptime monitors). Email/SMS (Resend/Termii) are **outbound** — Bot Fight Mode never affected them.
- **If a real bot flood appears** (see §3 signal): add a **targeted WAF rate-limit rule** — surgical and reversible — instead of the blanket Bot Fight Mode toggle.
- 🔴 **CORRECTED 2026-08-20 (Story 13-46). The old wording here said "scoped to exclude `/api/*`", and following it literally would have been a NO-OP for the risk that matters.** The public registration endpoint is `POST /api/v1/registration/wizard` — it is **under `/api/*`**. Excluding `/api/*` excludes the exact path a jingle points the public at, which is also the path that fires outbound email as a side effect. Two things were wrong in the original rationale:
  - *"Email/SMS are **outbound** — Bot Fight Mode never affected them."* True of a blast; **false of a public WRITE endpoint that triggers outbound mail**. Every public registration fires a thank-you synchronously, so inbound traffic **causes** outbound sends and the inbound/outbound split does not partition the risk.
  - The remedy therefore has to be the **inverse**: a rule scoped **TO** the registration path, not away from it. See §1a.
- **IP rotation (F-024 §4) = optional.** Origin is 80+443 CF-only; the known IP exposes nothing. Don't bother unless belt-and-suspenders is wanted.

### 1a. Registration-scoped WAF rate-limit rule (Story 13-46 AC6) — ARM BEFORE THE JINGLE

**Bot Fight Mode stays OFF** (the decision above is unchanged). This is the surgical alternative that decision already prescribes, aimed at the one path that needs it.

| Field | Value |
|---|---|
| **Rule name** | `registration-wizard-burst` |
| **Match** | `http.request.method eq "POST" and http.request.uri.path eq "/api/v1/registration/wizard"` |
| **Rate** | 30 requests per 1 minute, **per IP** |
| **Action** | **Managed Challenge** (NOT block) |
| **Rollback** | Delete the rule in the CF dashboard — instant, no deploy (§4) |

**Why Managed Challenge and not Block — decided, not left open.** Nigerian carriers use CGNAT, so one IP is thousands of subscribers: a block refuses real listeners with no record of who was lost, which is the exact harm the 2026-08-07 hotfix removed at the app layer (36 recorded blocks across 5 carrier IPs, 27 in one morning). A managed challenge lets a real human through in a second and stops an unattended script.

**Why 30/min/IP.** The app-layer ceiling is 50 per IP per 15 minutes; this edge rule sits ABOVE it in volume and IN FRONT of it in position, so it only ever engages for traffic that is already implausible for one gateway — the app limiter remains the binding control for ordinary load. ⚠️ Assumption, not a measurement: no per-IP concurrency baseline has been taken (that is AC7's prod count, uncollected). **Reopen trigger:** any challenge shown to a real registrant, or the rule engaging on a day with no campaign.

⚠️ **This rule does not replace the app-layer controls, and cannot.** It cannot see an email address, so it cannot tell one actor minting many records from many people behind one carrier gateway. That is what `registrationEmailRateLimit` is for.

---

## 2. Live monitoring (during the push)

- **Edge traffic:** `pnpm tsx apps/api/scripts/cf-analytics.ts --days 1` (or the **Edge traffic** section of `pnpm --filter @oslsr/api dashboard` on the VPS). Watch: requests, cache-hit %, threats, top countries, HTTP status mix.
- **The signal that matters — real virality vs bot flood:** a **real** spike raises requests **and** RUM page-views together. **Requests up while page-views stay flat = bots/attack**, not virality (bots don't run the JS beacon). Today's baseline: ~half of request volume is already bots (NL/FR/GB high requests, near-zero page-views).
- **Automated tripwire (LIVE — Story 9-52):** `apps/api/scripts/cf-traffic-watch.ts` evaluates the daily Cloudflare summary and pages the **9-15 Telegram channel** on three signals — `requests_spike_low_pageviews`, `threats_spike` (≥150/day), `error_ratio` (≥30% 4xx+5xx). Per-kind 6h cooldown (one page per window, not per tick); gated by `isAlertSendEnabled` so it NEVER pages from dev/test.
  - **Schedule it (system cron on the VPS, every 15 min):**
    ```
    */15 * * * * cd /root/oslrs && pnpm --filter @oslsr/api exec tsx apps/api/scripts/cf-traffic-watch.ts >> /var/log/cf-watch.log 2>&1
    ```
  - **Dry-run anytime:** `pnpm --filter @oslsr/api exec tsx apps/api/scripts/cf-traffic-watch.ts --dry-run` (prints findings, dispatches nothing).
  - **⚠️ False-positive trap (the whole point of the design):** the `requests_spike` signal deliberately pairs **requests-UP with page-views-FLAT** — a real viral spike ALSO raises requests, so requests-alone is NOT the trigger (bots don't run the RUM beacon). Thresholds live in `apps/api/src/lib/cf-watch.ts` (`CF_WATCH_THRESHOLDS`); env overrides `CF_WATCH_COOLDOWN_MINUTES` / `CF_WATCH_WINDOW_DAYS`. Daily-granularity (free plan) → an early-warning TREND signal, not real-time DDoS (Cloudflare handles that layer).
- **VPS health:** `pnpm --filter @oslsr/api dashboard` — RAM/CPU/disk/queue + Resend daily-quota. CRITICAL alerts also go to Telegram (9-15).

---

## 3. If traffic spikes

1. **Classify it:** run `cf-analytics.ts --days 1`. Page-views rising with requests → real virality (good — watch capacity). Requests-only / threats-only / 4xx-flood → bot/attack.
2. **Bot/attack →** add a Cloudflare WAF **rate-limit rule**; consider challenging the offending countries/ASNs. Do NOT blanket-block.
   - 🔴 **CORRECTED 2026-08-20 (13-46): do NOT "exclude `/api/*`".** That was the old instruction here and it excludes `POST /api/v1/registration/wizard` — the public write path that a campaign points at and that fires outbound email per submission. Arm the registration-scoped rule in **§1a** instead (it is the one you want at 2am), and scope any *additional* rule to the paths actually being hit.
3. **Registrations being REFUSED (429 wall) →** this is the opposite failure and needs the opposite response. Story 13-46's burst breaker pages the 9-15 Telegram channel with submits / 429s / auto-sends / marketing-cap headroom in one message. A 429 wall means real listeners are bouncing off a limiter: raise `registrationRateLimit` / `wizardDraftRateLimit`, do NOT tighten anything. ⚠️ 9-52's edge tripwire is blind to this — a converting jingle is requests-UP *and* page-views-UP, deliberately not a trigger — so this alert is the only one that fires.
4. **Real virality + capacity pressure →** confirm Resend Pro headroom; watch RAM/CPU on the dashboard; the 2GB droplet build-spikes are deploy-only (don't deploy mid-push). Scale the droplet only if monitoring sustains red.
5. **Email failing →** check Resend daily quota in the dashboard; Pro tier is the fix. ⚠️ **Since 13-46 there is a second reason marketing mail stops: the MARKETING CAP.** If the 9-15 channel shows `MARKETING SEND CAP REACHED`, the quota is not the problem — `MARKETING_DAILY_CAP` / `MARKETING_MONTHLY_CAP` are. Transactional mail (magic links, password resets) is never capped and keeps flowing.

---

## 4. Rollback / safety

- **DO snapshot before a big push:** DigitalOcean → Droplet → Snapshots → take one (label `pre-push-YYYY-MM-DD`).
- **Firewall rollback:** if the :80/:443 CF-only lock ever blocks legitimate access, re-add `0.0.0.0/0` to the rule in the DO Cloud Firewall (instant, no deploy). _(See `docs/f-024-origin-lock-runbook.md`.)_
- **WAF rule rollback:** any rate-limit rule added in §3 is deletable in the CF dashboard instantly.

---

## 5. Notes / supersessions

- The original 9-20 "dual-domain analytics" plan is **void** — F-024 retired `oyotradeministry.com.ng` to a 302 redirect; **oyoskills.com is the single served domain + CF zone**. One RUM beacon covers everything.
- A `project_cloudflare_dual_domain.md` memory was planned (9-20 AC#D2) but is **obsolete** for the same reason — single-domain reality is captured in memories `reference-cloudflare-analytics-tooling` + `project-origin-lock-port80-residual`.
