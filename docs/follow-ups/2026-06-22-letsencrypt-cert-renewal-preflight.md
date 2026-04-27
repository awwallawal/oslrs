# Follow-up — 2026-06-22 — Let's Encrypt cert auto-renewal pre-flight

**Run on or after:** 2026-06-22 (3 days before the 30-day-pre-expiry auto-renew window opens for the 2026-07-25 expiry)
**Owner:** Awwal
**Originating context:** Phase 2 cert SAN expansion 2026-04-26 (commit `9ece951`); Phase 3 Cloudflare proxy enabled 2026-04-27 (commits `4c2d909` + `1383373`). Cert at `/etc/letsencrypt/live/oyotradeministry.com.ng/` covers 4 domains and expires 2026-07-25.

## Why now

Auto-renew will fire at ~2026-06-25 (Let's Encrypt + certbot default = 30 days before expiry). If something has broken since the manual `certbot --nginx --expand` on 2026-04-26, the auto-renew silently fails and we discover it weeks later when nginx serves an expired cert. Pre-flight verification 3 days before catches the failure with time to fix.

**The specific concern:** Phase 3 added Cloudflare orange-cloud proxy in front of `oyoskills.com` and `www.oyoskills.com`. If the renewal uses HTTP-01 challenge (which `--nginx` plugin does by default), the challenge request needs to flow Let's Encrypt → Cloudflare edge → VPS nginx. If Cloudflare is configured to block the `.well-known/acme-challenge/` path (it shouldn't be, but worth verifying), the renewal fails for those two domains.

---

## Step 1 — Cert state snapshot

```bash
ssh root@oslsr-home-app
```

Then on VPS:

```bash
sudo certbot certificates | grep -A 10 oyotradeministry
```

What to verify:

- **Cert Name:** `oyotradeministry.com.ng`
- **Domains line includes all 4:** `oyotradeministry.com.ng`, `www.oyotradeministry.com.ng`, `oyoskills.com`, `www.oyoskills.com`
- **Expiry Date:** approximately `2026-07-25` (~33 days from run-date)
- **Certificate Path:** `/etc/letsencrypt/live/oyotradeministry.com.ng/fullchain.pem`

If SAN list is missing any domain → re-run the expand command:
```bash
sudo certbot certonly --nginx --cert-name oyotradeministry.com.ng \
  -d oyotradeministry.com.ng -d www.oyotradeministry.com.ng \
  -d oyoskills.com -d www.oyoskills.com \
  --expand --non-interactive
```

---

## Step 2 — Renewal timer health

```bash
sudo systemctl status certbot.timer
```

What to verify:

- **Active:** `active (waiting)` — the timer is loaded and will fire
- **Trigger:** next scheduled run is in the future (typically ~12 hours away, certbot.timer fires 2x daily and only renews when within 30-day window)

If the timer is inactive or missing:
```bash
sudo systemctl enable --now certbot.timer
sudo systemctl status certbot.timer
```

---

## Step 3 — Dry-run the renewal

```bash
sudo certbot renew --dry-run
```

What to look for in output:

- **`Cert not yet due for renewal`** if run too early (>30 days before expiry) — that's expected if 2026-06-22 is still outside the window. In that case, force the dry-run:
  ```bash
  sudo certbot renew --dry-run --force-renewal
  ```
- **`Congratulations, all renewals succeeded`** = pass. Renewal will succeed when it fires for real.
- **Any `Failed`** entry = investigate before the real auto-renew happens.

---

## Step 4 — Verify Cloudflare doesn't block ACME challenges

The HTTP-01 challenge requires Let's Encrypt servers to fetch `http://oyoskills.com/.well-known/acme-challenge/<token>` and `http://www.oyoskills.com/.well-known/acme-challenge/<token>`. Cloudflare proxy must pass these through.

Quick verification — from your laptop or any external network:
```bash
curl -I http://oyoskills.com/.well-known/acme-challenge/test-pre-flight-2026-06-22
```

Expected:
- **HTTP 404** from nginx (the file doesn't exist, but the request reached origin) → ✅ path is not blocked.
- **HTTP 200 from Cloudflare with HTML page** or **403/cache-block message** → ❌ Cloudflare is intercepting; renewal will fail. Add a CF Page Rule or WAF exception to allow `*/.well-known/acme-challenge/*` to pass through without modification.

Note: in CF's settings, **Cache → Configuration → Browser Cache TTL** should NOT cache `.well-known/acme-challenge/` responses. The default policy is fine; this is just a sanity-check item.

---

## Step 5 — Decision

| Outcome | Action |
|---|---|
| Steps 1-4 all pass | Nothing to do. Auto-renew will fire at ~2026-06-25 successfully. Drop a 1-line MEMORY.md note: `Cert auto-renew preflight 2026-06-22: passed. Next expiry 2026-07-25.` |
| Step 1 missing SAN | Re-run --expand command above. |
| Step 2 timer inactive | Enable timer. |
| Step 3 dry-run failed | Read the error. Most common causes: rate-limit hit (5 renewals/week per LE limit — unlikely for us), nginx config moved/broken, ACME validation HTTP path not reachable. Fix root cause then re-dry-run. |
| Step 4 CF blocking ACME path | Add CF Page Rule to bypass cache + WAF on `*/.well-known/acme-challenge/*`. Or fall back to DNS-01 challenge (requires Cloudflare API token + `python3-certbot-dns-cloudflare` package; bigger setup). |

---

## After running

Move this file to `docs/follow-ups/done/2026-06-22-letsencrypt-cert-renewal-preflight.md` (or delete it).

Add a Change Log entry to MEMORY.md "Infrastructure & Operational State" section noting the renewal is verified working.

If a fix was applied → also document in `docs/infrastructure-cicd-playbook.md` Pitfalls section or expand the existing cert-renewal section.

---

## Reference

- Cert SAN expansion that brought us to 4 domains: commit `9ece951` (2026-04-26), session-2026-04-21-25.md Postscript 2.
- Phase 3 Cloudflare proxy enable: commits `4c2d909` + `1383373` (2026-04-27), session-2026-04-21-25.md Postscript 3.
- Cert path: `/etc/letsencrypt/live/oyotradeministry.com.ng/` (path name preserved from initial issue; SAN list internally covers all 4 domains).
