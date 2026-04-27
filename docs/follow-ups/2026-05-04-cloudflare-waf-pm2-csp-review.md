# Follow-up — 2026-05-04 — Cloudflare WAF + PM2 ↺ trend + post-Phase-2 CSP review

**Run on or after:** 2026-05-04 (1 week post-Phase-3 ship)
**Owner:** Awwal
**Originating context:** Session 2026-04-26→27 Phase 3 closure (commits `4c2d909` + `1383373`). Three watchers were promised "in 1 week" — they need VPS + Cloudflare-dashboard access, so a remote agent can't do them; this is the manual checklist.

## Why now

- 7-day post-Phase-3 baseline established by 2026-05-04. Enough WAF events to spot patterns.
- 9-day post-OS-upgrade-reboot baseline for Story 9-10 PM2 ↺ trend (reset to 0 at 2026-04-25 08:54 UTC).
- 8-day post-Phase-2-deploy CSP signal — confirms whether the dual-domain bundle introduced any new violations.

---

## Part (a) — Cloudflare WAF event review

Open Cloudflare dashboard → `oyoskills.com` zone → **Security → Events**.

Filter:
- **Time range:** Last 7 days
- **Action:** All (block, challenge, log)

What to capture:

1. **Total event count** for the 7-day window.
2. **Top 5 rules by event count** (rule name + action + count).
3. **Any rule with >50 events/day** — flag and investigate (could be either real probing OR a false positive against a legitimate flow).
4. **Top 5 source ASN/countries** — if traffic is coming heavily from one ASN/country that doesn't match Nigerian-user-base expectations, note it.
5. **Any events on `/api/v1/auth/*` or `/api/v1/csp-report`** — these are the most-targeted endpoints by attackers; CF should be filtering noise here.

Pass criteria:
- No rule blocking >100 events/day on legitimate paths (would suggest false-positive)
- No surge of unblocked-but-suspicious activity on auth endpoints
- No events suggesting Cloudflare itself is breaking app functionality (e.g., POST request bodies being stripped — a known Free-tier WAF quirk)

If pattern detected → open Story 9-9 follow-up subtask OR file a CF support ticket.

---

## Part (b) — PM2 ↺ trend snapshot for Story 9-10

```bash
ssh root@oslsr-home-app
```

Then on VPS:

```bash
# 1. Current restart counter + uptime
pm2 show oslsr-api | grep -E "restarts|uptime|created at"

# 2. Recent deploy commits (excluded from spontaneous-restart count)
cd /root/oslrs && git log --since="2026-04-25 08:54" --pretty=format:"%h %ai %s" main

# 3. Cross-reference: when did each ↺ event happen? (PM2 logs of process boots)
pm2 logs oslsr-api --lines 5000 --nostream 2>&1 | grep -E "server_start|workers.initialized" | head -20

# 4. Memory + load snapshot — secondary signal that ↺ might be memory-leak driven
pm2 list
free -h
top -bn1 | head -15
```

What to capture:

1. **↺ counter at snapshot** vs **deploy count from step 2** → spontaneous-restart rate = ↺ minus deploys.
2. **Days elapsed** since 2026-04-25 08:54 UTC reboot.
3. **Spontaneous-restart rate per week** = (spontaneous restarts × 7) / days elapsed.

Pass criteria (per Story 9-10 AC#3 target):
- Spontaneous-restart rate **<5 per week** = healthy, can promote Story 9-10 to `done` with empty AC#2 (no fix needed).
- Spontaneous-restart rate **5-15 per week** = investigate; look at PM2 logs around each ↺ for crash signature; suspected hypothesis is ioredis reconnect churn from sec2-2 factory gaps. Open Story 9-10 active dev work.
- Spontaneous-restart rate **>15 per week** = definite bug; root-cause and fix.

Output target: `_bmad-output/implementation-artifacts/9-10-pm2-restart-loop-investigation.md` AC#1 trajectory section.

---

## Part (c) — Post-Phase-2 CSP violation digest

```bash
# On VPS — pull all CSP violations since 2026-04-26 (Phase 2 deploy)
pm2 logs oslsr-api --lines 10000 --nostream 2>&1 | grep csp_violation
```

What to capture:

1. **Total csp_violation event count** since 2026-04-26.
2. **Unique tuples** of `(violatedDirective, blockedUri, sourceFile)` — group by these three columns.
3. For each unique tuple, classify per Story 9-8 AC#6:
   - **Legitimate** → add to Helmet `cspDirectives` + nginx CSP string (must update both, parity test enforces). E.g. a new third-party SDK URL.
   - **Bug** → fix the code (remove an inline script tag, externalize a `<style>`, etc.).
   - **Noise** → document rationale (browser extension, ad blocker injection, security scanner). Add to suppression list.

Pass criteria:
- **Zero unclassified violations** = Story 9-8 AC#6 satisfied.
- Then proceed to Story 9-8 AC#7: single-line nginx promotion `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in `infra/nginx/oslsr.conf`. CI deploys it. Run `curl -sI https://oyoskills.com/` to verify enforcing header is live.

Special attention items from this session that showed up as violations:
- 2 pre-Phase-2 violations on `https://www.oyoskills.com/` calling `https://oyotradeministry.com.ng/api/v1/auth/refresh` — these were the cert-only-but-no-config window noise. Should NOT recur post-Phase-2.

---

## Reporting

After running all three parts:

- If everything is clean → drop a 1-line entry in `MEMORY.md` Session Notes: `Post-Phase-3 review 2026-05-04: WAF clean, PM2 ↺ rate <5/wk, CSP violations zero or all classified.`
- If anything needs action → open the relevant story file (9-8, 9-9, 9-10) Change Log entry + sprint-status.yaml comment.

Then delete this checklist file (or move to `docs/follow-ups/done/`).
