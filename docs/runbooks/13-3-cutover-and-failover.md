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

**Also in the same one-time setup (Story 13-46 AC6) — arm the registration-scoped WAF rate-limit rule.** You are already in the Cloudflare rules UI for the redirect above, so do both in one sitting: **Security → WAF → Rate limiting rules → `registration-wizard-burst`**, matching `POST /api/v1/registration/wizard`, 30 req/min/IP, action **Managed Challenge**. Full spec and the reasoning (including why *challenge*, not *block*, under carrier CGNAT) are in `pre-viral-push-checklist.md` §1a. ⚠️ The older instruction to scope WAF rules "to exclude `/api/*`" was **corrected on 2026-08-20** — it excluded the very endpoint the jingle points at. **Bot Fight Mode stays OFF** (9-20, unchanged).

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

## ✅ Attribution liveness dry run (Story 13-46 AC9) — **DISCHARGED 2026-08-21**

Same rehearsal session as above — one sitting, not two.

**Why this exists.** The "How did you hear about us?" capture chain is complete in code and has executed on prod **zero times**: `campaign_source` was present on **0 of 82** submissions when 13-46 was drafted, and **25 of 291** by 2026-08-13 (all from the public wizard — enumerator rows are correctly NULL, there is no acquisition question on the staff form). The jingle is the first traffic that will ever exercise it at volume. A capture path that has never run on prod data is the shape this project keeps getting burned by.

**Steps:**
1. Complete **one live public registration** through the real pinned public form, selecting **"Radio"**.
2. Confirm the WRITE:
   ```sql
   SELECT raw_data->'campaign_source'->>'channel' FROM submissions WHERE id = '<id>';  -- expect 'Radio'
   ```
3. Confirm the READ — **this half is not optional.** `ReportService.getCampaignBreakdown()` must return that row. A row that lands but never appears in the breakdown is the `getCampaignFunnel` failure all over again (computed, never consumed). Prove the number a human will actually read.
4. 🚨 **Teardown — CHILD-FIRST, and LONGER than "respondent + submission".**
   ⚠️ **The story's own AC9 wording ("delete that respondent + submission BY ID") is incomplete for the PUBLIC WIZARD path**, and following it literally leaves orphans. The wizard also provisions a `users` row (passwordless provisioning in `auth.service.ts`), a magic-link token, a draft, and — since 13-46 — a `campaign_sends` ledger row. Use the chain already verified against the code on 2026-08-06 in `enumerator-prod-smoke-and-golive-gate.md` §B.4:
   ```sql
   DELETE FROM fraud_detections     WHERE submission_id IN (SELECT id FROM submissions WHERE respondent_id = '<RID>');
   DELETE FROM marketplace_profiles WHERE respondent_id = '<RID>';
   DELETE FROM magic_link_tokens    WHERE respondent_id = '<RID>' OR lower(email) = '<TEST_EMAIL>';
   DELETE FROM submissions          WHERE respondent_id = '<RID>';
   DELETE FROM respondents          WHERE id = '<RID>';
   DELETE FROM wizard_drafts        WHERE lower(email) = '<TEST_EMAIL>';
   DELETE FROM users                WHERE lower(email) = '<TEST_EMAIL>';   -- wizard path only
   DELETE FROM campaign_sends       WHERE lower(email) = '<TEST_EMAIL>';   -- ⚠️ see below
   ```
   - **`magic_link_tokens`: delete on `respondent_id` OR `email`, never on one alone.**
   - ⚠️ **`campaign_sends` matters more than it looks since Story 13-46.** The new per-address throttle READS that ledger, so a leftover row for the test address SUPPRESSES a real thank-you to that address for the whole `MARKETING_CONTACT_GAP_DAYS` window. Harmless for a `+tag` address; a genuine outage for a real one.
   - **READ THE `DELETE n` COUNTS. A `DELETE 0` is a failed teardown, not a clean one.**
   - **NEVER "restore to baseline"** — the baseline is a tripwire, not a restore target, and deleting down to a count destroys live registry data. Re-measure after teardown; a figure that moved because an unrelated real registration arrived mid-run is CORRECT and must be left alone (that happened on 2026-08-13).
5. **Tag the rows before creating them**, per the established convention: surname **`ZZSMOKE`**, the `7000000001x` NIN sentinel series (§F ledger — `…10` and `…11` are used, **next unused `70000000012`**), phones `0800000001x` (next `+2348000000014`), and a `+tag` email the operator controls. Teardown is then a `WHERE` clause instead of archaeology.
6. ⚠️ **Real email sends immediately.** Prod holds the real Resend key and the 9-63 dev-credential isolation does NOT apply. A captured address fires the confirmation AND the thank-you — which is the point (it proves delivery), but it means the address must be one you control.
7. Record the date, the submission id and both results here.

⚠️ **If the jingle will use per-station vanity links** (`oyoskills.com/fresh` → 302 → **`/register?ref=fresh`**), extend this dry run to cover a UTM/`?ref` arrival too — that path has also never executed on prod, and a URL read on air cannot be retrofitted afterwards.

> 🔴 **TARGET CORRECTED 2026-08-21 (John/PM) — this line previously read `/?ref=fresh`, and that target captures NOTHING.** `parseUtm` is called from exactly one place, `WizardPage.tsx:172`, mounted at `/register`; every homepage CTA is a bare `<Link to="/register">` that discards the query string, so an apex `?ref` dies at the first click. Rules built from the old wording would have been live, verified-as-redirecting, and attributing nothing — [[pattern-ship-a-fix-that-never-fires]] at the exact moment the money is being spent. The redirect target is **`/register?ref=<slug>`**. Owned by Story **13-63** (AC1–AC3), which replaces this conditional with the actual rules, the committed slug registry and its run record.

| Date | Submission id | (a) stored channel | (b) in breakdown | Torn down |
|---|---|---|---|---|
| 2026-08-21 | `01a0253d-bae4-769a-ab1c-491585cdc04f` (`OSL-2026-9F4TRH`) | ✅ `Radio` — `{"utm": {}, "channel": "Radio"}` | ✅ `Radio\|1` returned by the breakdown | ✅ child-first, all traces 0 |

**Run record (evidence, not claims).** Prod SHA `fd5fe2e`. Operator: Awwal (registered through the live
wizard); verification + teardown by Claude, read-only until the teardown.

- **Baseline before:** 327 respondents · 286 submissions · 25 with `campaign_source` · **0 `Radio`**
- **Test identity:** `Tunde ZZSMOKE` · NIN `70000000017` · `lawalkolade+13-46@gmail.com`
- **After teardown, RE-MEASURED (not restored to a number):** 327 · 286 · 25 · `Radio` gone

✅ **The write landed, and the breakdown query returned it.**

🔴 **BUT THE "A HUMAN WILL ACTUALLY READ IT" HALF IS *NOT* DISCHARGED — corrected 2026-08-21.**
Assertion (b) was verified by running `getCampaignBreakdown`'s exact SQL. The function itself has
**ZERO callers** anywhere in `apps/` — no controller, route, script or component invokes it (verified
by grep; the only other mention is a comment). So the number is computed and returns `Radio|1`, and
**nobody can see it**. That is precisely the `getCampaignFunnel` shape AC9 warned about — computed,
never consumed — reproduced one layer down in the very check meant to catch it. Tracked as residual
**R9**; the fix is Story 13-63 AC4. Before this run, `Radio` had **never once** been selected on prod: the 25 existing rows
were Other(10), UTM-only(7), Facebook(4) and one each of Search engine / Word of mouth / Instagram /
Association.

🔴 **FINDING 1 — AC9's own teardown wording was INCOMPLETE, and this run proved it.** The
public-wizard path created **four** rows that "delete that respondent + submission BY ID" would have
orphaned: `users` (1), `magic_link_tokens` (1), `marketplace_profiles` (1) and `campaign_sends` (1).
The child-first chain above deletes them; `DELETE 0` on `fraud_detections` and `wizard_drafts` is
correct for this path (no GPS, and the draft never persisted).

🔴 **FINDING 2 — one registration sends THREE emails, not one.** Magic link + reference
confirmation + the thank-you outreach, all confirmed delivered. The story's Context §4 says "N
simultaneous registrations become N provider HTTP calls on the API's own event loop" — it is **3N**,
so the event-loop capacity argument is three times sharper than written. Only the outreach is
`thankyou-referral` (marketing → capped + per-address throttled by 13-46); the other two are
transactional and stay deliberately uncapped, which is what AC1's category-awareness protects.

⏱️ **Context §4's synchronous-send timing reproduced exactly:** submission `16:53:17.676Z`,
`campaign_sends` row `16:53:18.039Z` — **0.36 s later, same request.**

⚠️ **`campaign_sends` must be deleted at teardown or the next real thank-you to that address is
suppressed** for the whole `MARKETING_CONTACT_GAP_DAYS` window — the 13-46 throttle reads that ledger.

⚠️ **Since Story 13-46 the acquisition control has a real `— Select —` placeholder and an explicit "Prefer not to say".** When measuring the answer rate afterwards, scope it to **public rows only** — staff captures were never asked the question, and including them dilutes the rate with people who could not have answered:
```sql
SELECT count(*) FILTER (WHERE s.raw_data->>'campaign_source' IS NOT NULL)::numeric
       / NULLIF(count(*),0) AS answered_rate
FROM submissions s JOIN respondents r ON r.id = s.respondent_id
WHERE r.source = 'public' AND s.submitted_at >= '<AC10 DEPLOY>';
```
