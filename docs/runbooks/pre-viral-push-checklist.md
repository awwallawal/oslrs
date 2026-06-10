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

If any ⏳ → **do not push** until resolved.

---

## 1. Cloudflare posture (decisions — do NOT second-guess under pressure)

- **Bot Fight Mode = deliberately OFF.** Rationale: WAF Managed Rules + always-on DDoS already cover the baseline; the origin is locked; marginal benefit is modest; and it risks false-positives on future inbound automation (Epic-10 API consumers, uptime monitors). Email/SMS (Resend/Termii) are **outbound** — Bot Fight Mode never affected them.
- **If a real bot flood appears** (see §3 signal): add a **targeted WAF rate-limit rule** scoped to exclude `/api/*` — surgical and reversible — instead of the blanket Bot Fight Mode toggle.
- **IP rotation (F-024 §4) = optional.** Origin is 80+443 CF-only; the known IP exposes nothing. Don't bother unless belt-and-suspenders is wanted.

---

## 2. Live monitoring (during the push)

- **Edge traffic:** `pnpm tsx apps/api/scripts/cf-analytics.ts --days 1` (or the **Edge traffic** section of `pnpm --filter @oslsr/api dashboard` on the VPS). Watch: requests, cache-hit %, threats, top countries, HTTP status mix.
- **The signal that matters — real virality vs bot flood:** a **real** spike raises requests **and** RUM page-views together. **Requests up while page-views stay flat = bots/attack**, not virality (bots don't run the JS beacon). Today's baseline: ~half of request volume is already bots (NL/FR/GB high requests, near-zero page-views).
- **Automated tripwire:** Story **9-52** (cf-traffic-watch alert) will page this via the 9-15 Telegram channel once shipped. Until then, eyeball the command above periodically.
- **VPS health:** `pnpm --filter @oslsr/api dashboard` — RAM/CPU/disk/queue + Resend daily-quota. CRITICAL alerts also go to Telegram (9-15).

---

## 3. If traffic spikes

1. **Classify it:** run `cf-analytics.ts --days 1`. Page-views rising with requests → real virality (good — watch capacity). Requests-only / threats-only / 4xx-flood → bot/attack.
2. **Bot/attack →** add a Cloudflare WAF **rate-limit rule** (exclude `/api/*`); consider challenging the offending countries/ASNs. Do NOT blanket-block.
3. **Real virality + capacity pressure →** confirm Resend Pro headroom; watch RAM/CPU on the dashboard; the 2GB droplet build-spikes are deploy-only (don't deploy mid-push). Scale the droplet only if monitoring sustains red.
4. **Email failing →** check Resend daily quota in the dashboard; Pro tier is the fix.

---

## 4. Rollback / safety

- **DO snapshot before a big push:** DigitalOcean → Droplet → Snapshots → take one (label `pre-push-YYYY-MM-DD`).
- **Firewall rollback:** if the :80/:443 CF-only lock ever blocks legitimate access, re-add `0.0.0.0/0` to the rule in the DO Cloud Firewall (instant, no deploy). _(See `docs/f-024-origin-lock-runbook.md`.)_
- **WAF rule rollback:** any rate-limit rule added in §3 is deletable in the CF dashboard instantly.

---

## 5. Notes / supersessions

- The original 9-20 "dual-domain analytics" plan is **void** — F-024 retired `oyotradeministry.com.ng` to a 302 redirect; **oyoskills.com is the single served domain + CF zone**. One RUM beacon covers everything.
- A `project_cloudflare_dual_domain.md` memory was planned (9-20 AC#D2) but is **obsolete** for the same reason — single-domain reality is captured in memories `reference-cloudflare-analytics-tooling` + `project-origin-lock-port80-residual`.
