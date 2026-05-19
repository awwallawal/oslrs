# Story 9.20: Pre-viral capacity prep — Resend Pro + Cloudflare on oyotradeministry + Web Analytics

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Surfaced during 2026-05-16 capacity-planning conversation when the
operator outlined plans to push the site on social media + blogs to go
viral. The current configuration has three real bottlenecks that will
silently break under spike load:

  1. Resend free tier (100 emails/day) → magic-link emails fail at limit
  2. oyotradeministry.com.ng has NO Cloudflare proxy → no DDoS protection,
     no edge cache, all traffic hits the 2GB droplet directly
  3. Zero analytics installed → cannot measure viral spike or attribution

This story bundles the three pre-spike operational changes as one
deliverable because they are interdependent (Cloudflare-on-second-domain
enables analytics-on-both-domains; both are useless without the email
capacity to back them up).

NOT a code-heavy story — most work is SaaS configuration. But authored
as a Story (not a prep-task) per Awwal's 2026-05-19 directive: real
data drove these decisions, and they deserve canonical tracking so the
next handover-receiver understands what was done and why.
-->

## Story

As the **Super Admin preparing for a social media + blog campaign to drive public registrations**,
I want **the email-delivery, edge-proxy, and analytics infrastructure upgraded to absorb a 100× traffic spike without silent failures**,
So that **the viral push converts to actual completed registrations instead of bouncing off a fail-closed Resend daily limit, a DDoS-exposed droplet, or an analytics-blind funnel I cannot debug**.

## Acceptance Criteria

### Part A — Resend Pro tier upgrade

1. **AC#A1 — Resend plan upgraded from Free to Pro**: $20/mo, 50,000 emails/month, 1000 emails/day per recipient cap (vs 100/day total on Free). Verify via resend.com → Settings → Billing showing the Pro plan active.
2. **AC#A2 — DNS DKIM/SPF records confirmed on `oyoskills.com`**: already verified delivering since 2026-05-14 launch; this AC just re-confirms before the spike so a misconfiguration is caught early. Send a test email through `apps/api/scripts/dashboard.ts` or via the magic-link request flow + check resend.com logs.
3. **AC#A3 — Project memory note updated**: `MEMORY.md` Production Deployment section gains a note "Resend Pro tier active since 2026-MM-DD; 50k/mo email budget."

### Part B — Cloudflare proxy on `oyotradeministry.com.ng`

4. **AC#B1 — Cloudflare DNS zone added for `oyotradeministry.com.ng`**: same Cloudflare account already managing `oyoskills.com`. New zone created via Cloudflare dashboard.
5. **AC#B2 — Nameserver migration**: WhoGoHost nameservers (`nsa.whogohost.com`, `nsb.whogohost.com`) → Cloudflare nameservers at the WhoGoHost registrar's DNS config. Verify propagation via `nslookup -type=NS oyotradeministry.com.ng 1.1.1.1` returning Cloudflare nameservers.
6. **AC#B3 — A records pointing through Cloudflare proxy**: `@` → `159.89.146.93` (proxy ON / orange cloud); `www` → same. NGINX `server_name` directive already accepts both `oyotradeministry.com.ng` + `www.oyotradeministry.com.ng` (confirmed 2026-05-13 via SSH `nginx -T`).
7. **AC#B4 — Cloudflare SSL mode set to Full (Strict)**: matches `oyoskills.com` configuration. Verifies the droplet's Let's Encrypt cert covers the hostname (it does — cert subject `CN=oyotradeministry.com.ng` issued 2026-04-XX).
8. **AC#B5 — End-to-end verification post-migration**: `curl https://oyotradeministry.com.ng/api/v1/health` returns the existing `{"status":"ok"}` JSON; `Server:` header now `cloudflare` (was `nginx`). Both domains behave identically.

### Part C — Cloudflare Web Analytics on both domains

9. **AC#C1 — Cloudflare Web Analytics enabled for `oyoskills.com`**: free tier (Cloudflare Web Analytics is free even off paid plans). Beacon ID generated; `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"<id>"}'></script>` paste-block produced.
10. **AC#C2 — Cloudflare Web Analytics enabled for `oyotradeministry.com.ng`**: distinct beacon ID. Same script-tag pattern.
11. **AC#C3 — Beacon `<script>` tag added to `apps/web/index.html` `<head>`**: BOTH beacon tags present (Cloudflare serves the correct beacon based on the domain the page loads from). data-attribute approach keeps it CSP-safe; verify Helmet CSP allows `static.cloudflareinsights.com` in `script-src` (might need `apps/api/src/middleware/security.ts` CSP update + nginx CSP mirror per Story 9-8 parity rule).
12. **AC#C4 — First 24h of analytics data verified**: traffic appears in the Cloudflare dashboard for both domains within 24h. Memory note added recording the launch date.

### Part D — Operational verification + memory consolidation

13. **AC#D1 — Pre-viral checklist** documented in `docs/runbooks/pre-viral-push-checklist.md`: includes the resource-monitoring commands from Story 9-19's CLI, the Resend-quota check, the DO snapshot recipe, and the rollback procedure.
14. **AC#D2 — Memory entries added**: `project_cloudflare_dual_domain.md` and update existing `project_security_posture.md` to reflect new B+ → A- posture (per memory `30 min to A- (Cloudflare)`).

## Tasks / Subtasks

- [ ] **Task 1 (Part A) — Resend Pro upgrade** (AC: #A1, #A2, #A3)
  - [ ] 1.1: Log into resend.com → Settings → Billing → upgrade to Pro
  - [ ] 1.2: Send a test magic-link via `pnpm pin-public-form --list` UI flow OR via the wizard end-to-end
  - [ ] 1.3: Verify delivery in resend.com logs + measure latency (target <5s)
  - [ ] 1.4: Update `MEMORY.md` + project_security_posture entry

- [ ] **Task 2 (Part B) — Cloudflare migration of `oyotradeministry.com.ng`** (AC: #B1-B5)
  - [ ] 2.1: Cloudflare dashboard → Add Site → `oyotradeministry.com.ng` → Cloudflare scans existing DNS via WhoGoHost
  - [ ] 2.2: Review scanned records; ensure A records present + proxy (orange cloud) ON for `@` and `www`
  - [ ] 2.3: WhoGoHost dashboard → change nameservers from WhoGoHost to Cloudflare (provided in step 2.1)
  - [ ] 2.4: Wait 15-60 min for propagation; verify via `nslookup -type=NS oyotradeministry.com.ng 1.1.1.1`
  - [ ] 2.5: Cloudflare SSL/TLS → set encryption mode to **Full (Strict)**
  - [ ] 2.6: Curl test from operator laptop confirms `Server: cloudflare` header
  - [ ] 2.7: Smoke test: open https://oyotradeministry.com.ng/ in browser, confirm site loads + login still works

- [ ] **Task 3 (Part C) — Cloudflare Web Analytics on both domains** (AC: #C1, #C2, #C3, #C4)
  - [ ] 3.1: Cloudflare dashboard → Analytics & Logs → Web Analytics → Add site `oyoskills.com` → copy beacon snippet
  - [ ] 3.2: Cloudflare dashboard → Add site `oyotradeministry.com.ng` → copy beacon snippet
  - [ ] 3.3: Edit `apps/web/index.html` `<head>` — add both `<script>` tags (defer + data-cf-beacon attributes)
  - [ ] 3.4: Update Helmet CSP `script-src` directive in `apps/api/src/middleware/security.ts` to allow `https://static.cloudflareinsights.com`. Mirror in nginx CSP per Story 9-8 parity rule.
  - [ ] 3.5: Update CSP report-only assertions in `apps/api/src/__tests__/csp-parity.test.ts` (the test already enumerates allowed script-src origins).
  - [ ] 3.6: Run `pnpm --filter @oslsr/web vitest run` + tsc + lint
  - [ ] 3.7: Commit + push. Verify Cloudflare dashboard shows traffic within 24h.

- [ ] **Task 4 (Part D) — Pre-viral checklist + memory** (AC: #D1, #D2)
  - [ ] 4.1: Author `docs/runbooks/pre-viral-push-checklist.md` with the checklist from Story 9-16-onward planning + Story 9-19 dashboard recipe
  - [ ] 4.2: Add `project_cloudflare_dual_domain.md` memory + update `project_security_posture.md`

## Dev Notes

### Why this is one Story not three

The three parts are interdependent for the operator's mental model:

- Without Resend Pro → emails fail under load even with great DDoS protection
- Without Cloudflare → DDoS exposure could take the site down BEFORE the email volume matters
- Without Analytics → no visibility into whether the push actually worked

Author them together; assign dev time as one block; close them together.

### Cost summary

- Resend Pro: $20/month ongoing (₦18-30k/mo at current FX)
- Cloudflare: FREE (zone-level proxy + Web Analytics both on free tier)
- Total ongoing: $20/mo
- One-time: ~30-60 min of operator config time

Per memory note `Hand-off strategy: TURNKEY PACKAGE` — these costs are bounded < ₦100k project-lifetime, reimbursable via D2 §6 retainer clause.

### Dependencies

- **Story 9-8** — nginx CSP mirror parity. AC#C3's CSP update must mirror server-side + nginx-side.
- **Story 9-15** — telegram alerts. NOT affected (telegram channel runs independently of Cloudflare).
- **Memory `project_turnkey_handover_strategy.md`** — this story is the operational arm of the turnkey strategy's email-anchor design.

### Risks

1. **Cloudflare migration causes brief downtime** during nameserver propagation. Mitigation: do the migration during off-peak hours (West Africa night: 02:00-06:00 WAT). Real downtime typically <60 sec; users may see "DNS_PROBE_FINISHED_NXDOMAIN" briefly.
2. **CSP-blocking the beacon script**: Helmet's strict CSP may reject `static.cloudflareinsights.com` until the directive is added. Mitigation: AC#C3 explicitly calls this out.
3. **Cloudflare proxy breaks WebSocket upgrade**: oyotradeministry already supports `wss://` per nginx config; Cloudflare proxy honors the Upgrade header by default. Verify post-migration that `/socket.io/` still works (Story 4-2 messaging real-time feature).
4. **Resend Pro tier auto-renew**: if billing card fails, downgrade to Free silently. Mitigation: monitoring in Story 9-19 Part C digest can flag this.

### Pre-impl notes for the dev agent

This story is mostly operational; the only code changes are:
- `apps/web/index.html` (~6 lines added: two `<script>` tags)
- `apps/api/src/middleware/security.ts` (~1 line added to script-src CSP directive)
- `nginx/oslsr.conf` on VPS (~1 line added to mirror the CSP directive per Story 9-8 parity)
- `apps/api/src/__tests__/csp-parity.test.ts` (assertion update)
- `docs/runbooks/pre-viral-push-checklist.md` (new, ~100 lines)

Effort: ~half-day operator work (Resend + Cloudflare setup) + ~half-day code work (script tag + CSP + test + docs). Could be done same-day.

## File List

(Populated by dev agent. Expected:)
- `apps/web/index.html` (modified)
- `apps/api/src/middleware/security.ts` (modified)
- `apps/api/src/__tests__/csp-parity.test.ts` (modified)
- `nginx/oslsr.conf` on VPS (modified — out-of-repo)
- `docs/runbooks/pre-viral-push-checklist.md` (new)
- `MEMORY.md` (memory entry additions)
