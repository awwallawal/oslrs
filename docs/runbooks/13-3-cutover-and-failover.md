# Runbook — oyoskills.com → fallback failover (Story 13-3, launch protection)

**Goal:** during the radio jingle, oyoskills.com serves the **real wizard normally**, and **automatically falls back** to the email-first capture page if the box fails — so a surge never produces a dead site, and no intent is lost. **NOT a permanent redirect** (that would replace real registration with a 2-field callback).

**Architecture:** oyoskills.com → Cloudflare (proxied) → one origin (nginx → app on :3000). Fallback lives independently at the Cloudflare edge: `https://oslsr-fallback.pages.dev`.

**Capacity context (load test 2026-06-27):** the 1-core box sustained 50–100 concurrent with **0 errors**, degrading by *latency* (p95 185→648ms), not failure. So the **primary path should hold** for a normal surge; failover is insurance for a true outage (crash / pm2-restart blip / total overload → 52x).

---

## ① Automatic — Cloudflare Custom 5xx Error Page (FREE, primary net)

When the origin returns **5xx / 52x** (down, timed out, overloaded-to-failure), Cloudflare serves a custom page on oyoskills.com that forwards visitors to the fallback.

1. **Deploy the error page** (it ships in `cloudflare-fallback/`): redeploy so it's live at `https://oslsr-fallback.pages.dev/5xx.html`:
   ```bash
   cd cloudflare-fallback && npx wrangler pages deploy --branch oslsr-fallback --commit-dirty=true
   ```
2. **Point Cloudflare at it:** dashboard → **oyoskills.com** zone → **Custom Pages** (under "Error Pages"/"Custom Pages") → **5xx Errors** → **Custom URL** = `https://oslsr-fallback.pages.dev/5xx.html` → **Publish**.
   - Cloudflare validates the `::CLOUDFLARE_ERROR_500S_BOX::` token (already embedded). Confirm in the dashboard which error codes it covers and that **520–524 (origin down/timeout)** are included.
3. Result: box down → Cloudflare serves the branded page on oyoskills.com → auto-forwards to the fallback form → lead captured to KV.

**Limitation:** fires on *errors*, not mere slowness. A graceful slowdown (p95 high, still 200-OK) won't trigger it — that's what ③ + monitoring are for.

## ③ Manual fast-flip (backstop — always have ready)

If you're watching and the box is *struggling but not erroring* (slow, climbing latency):
1. Cloudflare → **oyoskills.com** → **DNS** → edit the proxied record for the apex/`www` → temporarily **CNAME → `oslsr-fallback.pages.dev`** (proxied/orange). Propagates in seconds.
2. **Revert** to the origin when healthy.
> Keep this tab open during the first jingle. (A `signup.oyoskills.com` subdomain pre-pointed at the fallback is a cleaner variant if you want a stable public link to hand out.)

## Monitoring during the jingle (so you know to use ③)

- **Telegram is CRITICAL-only** (cpu>90, mem>90, **api_p95>350ms** — lowered from 500 by Story 13-8 so a *graceful slowdown* pages, not just emails); warnings (p95 250–350) go to a ≤30-min **email digest**.
- **⚠️ False-positive note (Story 13-8):** routine **backup/email** runs can block the event loop ~700ms → a critical p95 page. **Schedule backups OUTSIDE the jingle window**, and correlate any page with the Operations dashboard (real spike vs backup blip). The 350 threshold is a launch-window setting — **relax it back to 500 post-launch** (one-line revert in `alert.service.ts`).
- Watch the **Operations dashboard** (`getSystemHealth` CPU/RAM + `getTraffic`) live during the jingle as the primary signal.
- Telegram delivery verified working 2026-06-27 via `scripts/uat-trigger-critical-alert.ts`.

## ✅ Dry-run rehearsal (do this BEFORE the jingle — this is what makes you "sure")

1. **Set up ①** (above).
2. **Simulate the outage** (operator, Tailscale): `ssh oslsr-home-app 'pm2 stop oslsr-api'`.
3. **Verify:** load `https://oyoskills.com` → you should get the branded busy page → it forwards to the fallback → submit a test lead.
4. **Confirm capture:** `npx wrangler kv key list --namespace-id 7e5702d9a06b43499ab75f0b7da39bf5 --remote` → the test lead is there.
5. **Restore:** `ssh oslsr-home-app 'pm2 start oslsr-api'` → confirm oyoskills.com serves the real wizard again.
6. **Also rehearse ③:** do the CNAME flip + revert once, time it.

If the rehearsal captures a lead end-to-end, the failover is **verified**, not hoped.
