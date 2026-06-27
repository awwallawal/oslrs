# Runbook — oyoskills.com → fallback failover (Story 13-3, launch protection)

**Goal:** during the radio jingle, oyoskills.com serves the **real wizard normally**, and **fails over** to the email-first capture page if the box can't cope — so a surge never produces a dead site, and no intent is lost. **NOT a permanent redirect** (that would replace real registration with a 2-field callback).

**Architecture:** oyoskills.com → Cloudflare (proxied) → one origin (nginx → app on :3000). Fallback lives independently at the Cloudflare edge: `https://oslsr-fallback.pages.dev`.

**Capacity context (load test 2026-06-27):** the 1-core box sustained 50–100 concurrent with **0 errors**, degrading by *latency* (p95 185→648ms), not failure. With the planned **2-vCPU/4GB resize** the box should comfortably hold a normal surge; failover is insurance for a true outage (crash / pm2-restart blip / total overload → 52x).

> **Plan note (2026-06-27):** Cloudflare **Custom Error Pages require a paid plan (Pro+, ~$20/mo)** — confirmed with Cloudflare support. Given the budget + the resize (which makes a hard origin-failure unlikely), the **free manual flip is the primary failover**; the paid auto error-page is **optional**. The error page only fires on actual 5xx/52x anyway — not the *slow-but-up* case the box is more likely to show.

---

## ① PRIMARY (free) — Manual flip via a Cloudflare Redirect Rule

A **toggleable redirect rule** is safer than swapping the apex DNS (no record edit, instant on/off). Keep it **DISABLED** normally; **ENABLE** it the moment the box is in trouble (slow or down), **DISABLE** when healthy.

**One-time setup (do before the jingle):** Cloudflare → **oyoskills.com** → **Rules → Redirect Rules** (a.k.a. *Single Redirects*; available on Free) → **Create rule**:
- **When:** Hostname equals `oyoskills.com` (add `www.oyoskills.com` if used).
- **Then:** Dynamic/Static redirect → URL `https://oslsr-fallback.pages.dev/` → **302 (temporary)** → preserve query string off.
- **Save, then DISABLE the rule** (leave it parked, ready to toggle).

**During the jingle:** if monitoring shows trouble → **toggle the rule ON** (oyoskills.com → fallback in seconds) → **toggle OFF** when the box recovers.

> **Alt (if Redirect Rules aren't available on your plan):** DNS swap — **oyoskills.com** → **DNS** → change the proxied apex/`www` record to **CNAME → `oslsr-fallback.pages.dev`** (proxied/orange); **record the original A-record value first** so revert is exact.

## ② OPTIONAL (Pro ~$20/mo) — automatic Cloudflare Custom Error page

If you later upgrade to Pro and want **hands-off** failover on a true outage: the ready-to-upload asset is `cloudflare-fallback/5xx.html` (live at `https://oslsr-fallback.pages.dev/5xx.html`, carries the `::CLOUDFLARE_ERROR_500S_BOX::` token). Set it via **Rules → Custom Error Rules + Custom Error Assets** (the current model): upload the asset, then a rule matching **origin status 500–599 → serve custom error page**. Skipped for launch (cost + the resize lowers the need).

## Monitoring during the jingle (so you know when to toggle ①)

- **Telegram is CRITICAL-only** (cpu>90, mem>90, **api_p95>350ms** — lowered from 500 by Story 13-8 so a *graceful slowdown* pages, not just emails); warnings (p95 250–350) go to a ≤30-min **email digest**.
- **⚠️ False-positive note (Story 13-8):** routine **backup/email** runs can block the event loop ~700ms → a critical p95 page. **Schedule backups OUTSIDE the jingle window**, correlate any page with the dashboard. The 350 threshold is launch-window — **relax to 500 post-launch**.
- Watch the **Operations dashboard** (`getSystemHealth` CPU/RAM + `getTraffic`) live during the jingle — the **primary signal** for when to toggle the flip.
- Telegram delivery verified working 2026-06-27 via `scripts/uat-trigger-critical-alert.ts`.

## ✅ Dry-run rehearsal (BEFORE the jingle — this is what makes you "sure")

Rehearses the **manual flip (①)** end-to-end:
1. **Set up ①** (the parked redirect rule, disabled).
2. **(Optional) simulate the outage** (operator, Tailscale): `ssh oslsr-home-app 'pm2 stop oslsr-api'` — or skip and test the flip with the box up (the flip works either way).
3. **Toggle the redirect rule ON.**
4. **Verify:** load `https://oyoskills.com` → it should land on the fallback → submit a test lead.
5. **Confirm capture:** `npx wrangler kv key list --namespace-id 7e5702d9a06b43499ab75f0b7da39bf5 --remote` → the test lead is there.
6. **Toggle the rule OFF** (+ `pm2 start oslsr-api` if you stopped it) → confirm oyoskills.com serves the real wizard again. **Time the toggle** so you know the flip latency on the day.

If the rehearsal captures a lead end-to-end, the failover is **verified**, not hoped.
