# Cloudflare-cached static fallback (Story 13-3 AC2)

A **standalone Cloudflare Pages site** — deliberately outside the monorepo build so it has **zero dependency on the home box** (`oslsr-home-app`). When the box is degraded during a radio spike, this page keeps capturing a **callback** (name + email + LGA, optional phone) at the edge; the operator later **emails** each person a secure link to finish the **real** wizard. A captured lead beats a timeout.

**Why email-first:** email is the registry's universal, working channel (magic-link; 100% of the self-serve population provides one), and the only one available today (SMS/Termii is KYC-blocked). Phone is optional — kept as a dedup key against the phone-keyed association imports + a future SMS channel.

| File | Role |
|------|------|
| `index.html` | The static callback page — official Oyo State branding (coat of arms), email-first, mobile-first, 33-LGA dropdown, consent + anti-phishing notice. Cloudflare-cached. |
| `oyo-coat-of-arms.svg` | The Oyo State coat of arms, shipped in the deploy so the government-authenticity signal survives origin degradation (not fetched from the home box). |
| `functions/api/callback.ts` | Cloudflare Pages Function — validates + writes the lead to Workers KV. Mirrors the **tested** `apps/api/src/lib/fallback-lead.ts` (a parity test guards drift). |

## Deploy (operator — ~10 min)
1. **Create a KV namespace:** `npx wrangler kv namespace create LEADS_KV` → note the id.
2. **Create the Pages project** (dashboard or `wrangler pages project create oslsr-fallback`); **bind** the KV namespace to the variable name **`LEADS_KV`** (Settings → Functions → KV bindings).
3. **Deploy:** `npx wrangler pages deploy cloudflare-fallback --project-name oslsr-fallback`.
4. **Caching:** the HTML + the SVG are static → served from the edge cache; `/api/callback` is a Function (never cached — it sets `cache-control: no-store`).

## Cutover trigger (AC2.4 — manual / health-gated; NO auto-failover)
The fallback is a **degradation affordance**, not the primary path. Engage it only when the box is unhealthy:
- **Manual (default):** point `oyoskills.com` (or a `signup.` subdomain) at the Pages project via a Cloudflare DNS/route flip when `getSystemHealth`/`getTraffic` show the box saturated, or a Cloudflare **Load Balancer** origin-health rule. Flip back when healthy.

## Draining leads → the registry (AC2.3)
Captured leads sit in KV (`lead:<iso>:<email>`, 30-day TTL). Two paths, **completed registration preferred**:
1. **Primary:** email each address a magic link to the real wizard (full attribution + consent). Restored intent, no second-tier row. Uses the working Resend channel.
2. **Fallback-of-the-fallback:** if never completed, drain KV → CSV (name/email/LGA/phone) → the Epic 11 / Story 13-2 import path as `imported_unverified`. Columns match `fallback-lead.ts` so it round-trips.

## DPIA (AC2.5)
A PII capture on a Cloudflare edge store is PII collection **outside the main wizard consent flow** — record it in **Appendix H (DPIA)**: data (name/email/LGA, optional phone), purpose (re-contact to complete registration), store (CF Workers KV, 30-day TTL), lawful basis (NDPA 6(1)(e) public task + the on-page notice). Same class of concern as the parked 13-1 pixels.
