# F-024 Origin-Lock Operator Runbook — retire `oyotradeministry.com.ng` from the origin + lock to Cloudflare

**Owner:** Awwal (operator) · **Authored:** 2026-06-07 by Bob (SM) · **Finding:** F-024 (R2, `sec-r2-20260603`)
**Story:** 9-9 subtask #11 · **Source:** `sprint-change-proposal-2026-06-06-security-r2-remediation.md` (addendum) + memory `project_security_r2_remediation`
**🚦 GATE:** This MUST be complete before the Phase-2 Cohort blasts + social push (the blasts point traffic at the origin; F-024 gates them per `docs/roadmap-to-launch.md`).

> **What this fixes:** `oyotradeministry.com.ng` resolves **grey/direct** to the origin `159.89.146.93`, so anyone can hit the origin around Cloudflare. This runbook de-points that domain, then locks the origin to Cloudflare-only, then rotates the (now-public) IP.

---

## §0 — Pre-flight (read fully before touching anything)

**Verified facts (2026-06-06):**
- Origin IP: **`159.89.146.93`**.
- `oyotradeministry.com.ng` + `www` → NS **WhoGoHost** (`nsa/nsb.whogohost.com`), **grey/direct** to origin.
- `oyoskills.com` + `www` → NS **Cloudflare** (the only CF zone), **proxied/orange**.
- Both domains currently serve the **identical app** via **one** nginx `server` block + **one** 4-SAN Let's Encrypt cert; `certbot.timer` active; authenticator = **`--nginx` (HTTP-01 on port 80)**.
- **No email** is hosted on `oyotradeministry.com.ng` to preserve (all project email is on oyoskills).

**Sequence is load-bearing — do NOT reorder:**
`§1 de-point` → `§2 dev commit (9-9 step 2)` → `§3 firewall lock` → `§4 IP rotate` → `§5 verify`.
Locking the firewall (§3) **before** de-pointing (§1–§2) would 403 every real `oyotradeministry.com.ng` user.

**Cert-strategy decision (make this call before §3):**
- **Option A (recommended): keep LE, leave port 80 open to all.** Firewall locks **only 443** to Cloudflare; port 80 stays open so `certbot --nginx` HTTP-01 renewal keeps working. Simplest; one residual: port 80 still reachable (but it only 301s to HTTPS).
- **Option B: Cloudflare Origin Certificate.** Issue a 15-yr CF Origin Cert, set CF SSL = Full(strict), then firewall **both 80+443** to Cloudflare. Removes the LE/port-80 dependency entirely. More steps.
- **Option C: certbot DNS-01** (Cloudflare API token) then firewall 80+443. Avoids inbound-80 dependency without CF Origin Cert.
- ⚠️ **Trap:** with LE `--nginx`, locking port 80 to CF-only **breaks renewal in ≤90 days.** Pick A, B, or C consciously — never "deny all on 80/443" while on LE+port-80.

---

## §1 — De-point `oyotradeministry.com.ng` (WhoGoHost)

**Goal:** stop the domain sending real users to the origin; redirect to the brand.

1. Log in to **WhoGoHost** → DNS / domain management for `oyotradeministry.com.ng`.
2. Set up **URL forwarding / redirect** → `https://oyoskills.com`, type **302 (Temporary / Found)** for **both** `oyotradeministry.com.ng` and `www.oyotradeministry.com.ng`.
   - ⚠️ **302, NOT 301.** A 301 is cached semi-permanently by browsers; if you ever reuse `oyotradeministry.com.ng` for another project, returning visitors keep redirecting to oyoskills until their cache clears. 302 keeps reuse clean.
   - If WhoGoHost only offers forwarding via an A-record to a parking/redirect host, that's fine — the requirement is simply: **it must NOT resolve to `159.89.146.93`.**
3. **Keep the domain registered** (BOT/transfer asset — do not let it lapse). Leave MX/email records untouched (none in use, but no need to disturb).

**Verify (§1):**
```
dig @1.1.1.1 +short oyotradeministry.com.ng     # must NOT return 159.89.146.93
curl -sI http://oyotradeministry.com.ng          # expect 302 → https://oyoskills.com
curl -sI https://oyotradeministry.com.ng         # expect 302/redirect to oyoskills (allow DNS/TLS propagation)
```
Allow propagation (WhoGoHost TTL). Do not proceed to §3 until `dig` no longer shows the origin IP.

**Rollback (§1):** restore the prior A record(s) pointing `oyotradeministry.com.ng` → `159.89.146.93` at WhoGoHost.

---

## §2 — Repo/deploy commit  *(DEV AGENT — Story 9-9, NOT an operator step)*

This is the one code change; it is a **9-9 Tasks/Subtasks** item executed by a dev agent + CI, **not** a console action. Operator role here = trigger/confirm the deploy and watch it go green.

Scope (see 9-9 step-2 tasks): drop `oyotradeministry.com.ng` + `www` from nginx `server_name` in `infra/nginx/oslsr.conf` **and** from `CORS_ORIGIN`; reissue the LE cert for `oyoskills.com` only (Option A/C) **or** install a CF Origin Cert (Option B). nginx is CI-deployed (backup → `nginx -t` → reload); never hand-edit the VPS copy.

**Verify (§2):** after deploy, `curl -sI https://oyoskills.com` → 200 via Cloudflare (`cf-ray` present); CI deploy green; `nginx -t` passed in the deploy log.

**Rollback (§2):** `git revert` the commit → CI redeploys prior config (the deploy step restores `oslsr.conf.bak` on `nginx -t` failure automatically).

---

## §3 — Lock the origin to Cloudflare (DO Cloud Firewall)

**Do ONLY after §1 + §2 are verified.** Per the cert decision: Option A locks **443 only**; Option B/C lock **80 + 443**.

1. **Re-fetch the current Cloudflare IP ranges** at execution time (they change):
   ```
   curl -s https://www.cloudflare.com/ips-v4
   curl -s https://www.cloudflare.com/ips-v6
   ```
   (Snapshot captured 2026-06-06 — re-verify before applying:
   v4: `173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22`
   v6: `2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32`)
2. In the **DO Cloud Firewall "OSLRS"** inbound rules: replace the `0.0.0.0/0 + ::/0` source on **443** (and **80** if Option B/C) with the Cloudflare v4 + v6 ranges above.
3. **Leave SSH (22)** as-is (`0.0.0.0/0` + `100.64.0.0/10` for GH Actions + Tailscale — per ADR-020). Do NOT lock 22 here.
4. **Option A only:** leave **port 80 open to all** (LE HTTP-01 renewal needs it).

**Verify (§3):**
```
# From a NON-Cloudflare host (e.g. laptop NOT via the site), hit the origin IP directly:
curl -sI --resolve oyoskills.com:443:159.89.146.93 https://oyoskills.com   # expect timeout/blocked
# Through Cloudflare (normal):
curl -sI https://oyoskills.com                                            # expect 200 + cf-ray
# Deploy path still works (SSH 22 open):  trigger a trivial CI deploy → green.
# Cert renewal dry-run (Option A/C):  ssh root@oslsr-home-app 'certbot renew --dry-run'  → success.
```

**Rollback (§3):** restore the `0.0.0.0/0 + ::/0` source on 80/443 in the DO firewall. (Instant; no deploy needed.)

---

## §4 — Rotate the origin IP

`159.89.146.93` is publicly known (CT logs + the assessors + historical DNS), so the lock isn't complete until the IP changes.

1. **DO Reserved IP** swap (assign a new reserved IP to the droplet and release the old), **or** snapshot → rebuild on a new IP. Prefer reserved-IP swap (less downtime).
2. Update Cloudflare's origin A/AAAA records (`oyoskills.com` proxied) to the **new** origin IP.
3. Update the DO Cloud Firewall + any monitoring/Tailscale references if they pin the old IP. (Tailscale uses the tailnet IP `100.93.100.28` — unaffected.)

**Verify (§4):**
```
curl -sI https://oyoskills.com            # 200 via CF on the new origin
ssh root@oslsr-home-app 'hostname'        # Tailscale access intact (tailnet IP, not public)
```

**Rollback (§4):** reserved-IP swap is reversible; re-point CF A record to the prior IP if needed (only possible if the old IP wasn't released — release it only after §5 passes).

---

## §5 — End-state verification matrix

| Check | Command | Expected |
|---|---|---|
| oyotradeministry de-pointed | `dig @1.1.1.1 +short oyotradeministry.com.ng` | not the origin IP |
| oyotradeministry redirects | `curl -sI https://oyotradeministry.com.ng` | 302 → oyoskills |
| oyoskills via CF | `curl -sI https://oyoskills.com` | 200 + `cf-ray` |
| direct-origin blocked | `curl --resolve oyoskills.com:443:<new-ip> https://oyoskills.com` | timeout/blocked |
| cert renewal | `certbot renew --dry-run` | success |
| deploy path | trivial CI deploy | green (SSH 22 reachable) |
| app health via CF | `curl -s https://oyoskills.com/api/v1/health` | `{status:'ok'}` |

When all green → mark 9-9 subtask #11 (F-024) **done** + flip the FRC/roadmap gate line.

---

## §6 — Traps recap
- **302 not 301** (future-reuse safety).
- **Never firewall port 80 to CF-only while on LE `--nginx`** — renewal breaks (Option A keeps 80 open; B/C remove the dependency).
- **Don't lock SSH (22)** in this change — GH Actions deploys + DO Console depend on it (ADR-020).
- **HSTS:** a 1-yr `includeSubDomains` HSTS was served on `oyotradeministry.com.ng` → any future project on that domain must serve valid HTTPS.
- **Sequence:** de-point (§1–§2) BEFORE firewall lock (§3) BEFORE IP rotate (§4). Don't release the old reserved IP until §5 passes.
- **Gate:** all of this before the Phase-2 blasts.
