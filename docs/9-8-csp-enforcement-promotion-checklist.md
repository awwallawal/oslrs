# Story 9-8 — CSP Enforcement Promotion Checklist

**Purpose:** close out Story 9-8 (CSP nginx rollout) by promoting the nginx-layer CSP from `Content-Security-Policy-Report-Only` (live since 2026-04-11) to enforcing `Content-Security-Policy`. The change is a single `add_header` directive edit + nginx reload.

**Pre-requisite:** the Report-Only window has produced sufficient observation data (no real-user violations on legitimate pages) to confirm the policy is correct before flipping to enforcing.

**Estimated time:** 15 minutes including pre-flight verification and post-promotion smoke test.

---

## Section 1 — Pre-flight verification

### 1.1 Confirm CSP report endpoint has been silent

```bash
ssh root@oslsr-home-app

# Check the API logs for any CSP violations recorded by /api/v1/csp-report endpoint
pm2 logs oslsr-api --lines 1000 --nostream | grep -i "csp.*violation\|csp.report" | head -20

# OR check via journalctl if PM2 logs aren't long enough
journalctl --since "2026-04-11" --until "now" -u pm2-root | grep -i "csp.*violation" | head -20

# Check NGINX access log for hits to /api/v1/csp-report
sudo grep "POST /api/v1/csp-report" /var/log/nginx/access.log | wc -l
```

**Acceptance criterion:**
- `/api/v1/csp-report` POST count is **zero** OR all reports are from known-benign sources (browser extensions, dev tools).
- No reports from real user-agents on legitimate pages (`/`, `/dashboard`, `/marketplace`, `/login`, `/register`, etc.).

If reports are present:

- Read each one. Identify the violating directive.
- Decide: (a) update CSP to allow the legitimate source, OR (b) the violation is correct and should be enforced (the page in question shouldn't be loading that resource).
- Iterate on the policy in `infra/nginx/oslsr.conf` BEFORE promoting.

### 1.2 Confirm current Report-Only state on production

```bash
# From laptop or anywhere with public-IP reachability:
curl -sI https://oyotradeministry.com.ng/ | grep -i "content-security-policy"

# Expected output:
# content-security-policy-report-only: <large directive set>; report-uri /api/v1/csp-report; report-to csp-endpoint
```

The header should start with `content-security-policy-report-only:` (exact lowercase). If it shows `content-security-policy:` already, this story may already be promoted (sprint-status mismatch — investigate before changing).

### 1.3 Confirm 200-response CSP from Helmet (sec2-3) is the one being mirrored

```bash
curl -sI https://oyotradeministry.com.ng/api/v1/health | grep -i "content-security-policy"

# Expected output:
# content-security-policy: <17 directives>
```

The nginx Report-Only CSP should be a superset (or at minimum a subset that is intentionally narrower) of the Helmet CSP. Eyeball both and confirm.

### 1.4 Capture baseline (for rollback comparison)

Save the current full `infra/nginx/oslsr.conf` file as a backup:

```bash
cp infra/nginx/oslsr.conf infra/nginx/oslsr.conf.before-csp-promotion-$(date +%Y%m%d)
```

Or alternatively, the deploy step in CI keeps the previous config — see `.github/workflows/ci-cd.yml` for backup-test-reload pattern.

---

## Section 2 — Promotion (the actual change)

### 2.1 The single-line edit

Edit `infra/nginx/oslsr.conf` (the canonical production nginx config):

```bash
# Open the file
nano infra/nginx/oslsr.conf

# Find the existing Report-Only directive. It will look like:
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' ..." always;

# Change ONLY the header NAME from -Report-Only to enforcing:
add_header Content-Security-Policy "default-src 'self'; script-src 'self' ..." always;

# DO NOT touch the policy directives themselves; the policy should match what was Report-Only-tested.
# DO NOT remove the report-uri or report-to directives; we still want violation reporting in enforcing mode.

# Save (Ctrl+O, Enter) and exit (Ctrl+X)
```

### 2.2 Validate nginx config syntax

```bash
sudo nginx -t

# Expected output:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If syntax errors, **do not reload**. Fix the config first.

### 2.3 Commit the change to repo

```bash
git add infra/nginx/oslsr.conf
git commit -m "feat(nginx): promote CSP from Report-Only to enforcing (Story 9-8)

Story 9-8 complete: 14-day Report-Only window confirmed clean
(/api/v1/csp-report received zero real-user violations on legitimate pages).
Single header-name change Content-Security-Policy-Report-Only ->
Content-Security-Policy preserves all directives + report-to + report-uri.

Verification post-promotion:
- curl -sI https://oyotradeministry.com.ng/ shows content-security-policy header
- securityheaders.com grade A+ (was A on Report-Only)
- All static HTML pages (homepage, dashboard, marketplace, login, register)
  load without browser console CSP errors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push origin main
```

### 2.4 CI deploy applies the change to production

The CI deploy step in `.github/workflows/ci-cd.yml` includes:

```bash
sudo cp infra/nginx/oslsr.conf /etc/nginx/sites-available/oslsr
sudo nginx -t && sudo systemctl reload nginx
```

The `nginx -t` acts as a gate — if config is invalid, reload aborts and old config stays live (no site-down risk).

Wait for the CI run to go green. The deploy step's last line should read `✅ Successfully executed commands to all hosts.`

---

## Section 3 — Post-promotion verification

### 3.1 Confirm new header on production

```bash
curl -sI https://oyotradeministry.com.ng/ | grep -i "content-security-policy"

# Expected output:
# content-security-policy: <directives>; report-uri /api/v1/csp-report; report-to csp-endpoint

# CRITICAL: should NOT contain the substring "-report-only"
```

### 3.2 Browser walk-through (real user simulation)

Open browser DevTools Console (F12) and visit each page in turn:

| Page | URL | Expected |
|---|---|---|
| Homepage | `https://oyotradeministry.com.ng/` | No console errors |
| Marketplace search | `https://oyotradeministry.com.ng/marketplace` | No console errors; tile images load |
| Login | `https://oyotradeministry.com.ng/login` | No console errors; hCaptcha widget renders |
| Register | `https://oyotradeministry.com.ng/register` | No console errors; Google OAuth button + hCaptcha render |
| Dashboard (any role, post-login) | `https://oyotradeministry.com.ng/dashboard` | No console errors |
| Public Insights | `https://oyotradeministry.com.ng/insights` | Charts render; no console errors |
| ID Card verification | `https://oyotradeministry.com.ng/verify` (if applicable) | QR display + lookup work |

**Critical:** look for messages like:
- `Refused to load the script from '...' because it violates the following Content Security Policy directive`
- `Refused to apply inline style because it violates the following Content Security Policy directive`
- `Refused to connect to '...' because it violates the following Content Security Policy directive`

If ANY violation appears in DevTools, the promotion has broken something. **Roll back immediately** (Section 4) and investigate.

### 3.3 securityheaders.com grade

Visit: `https://securityheaders.com/?q=https%3A%2F%2Foyotradeministry.com.ng&followRedirects=on`

**Expected:** grade A+ (was A on Report-Only — promotion to enforcing should bump it).

### 3.4 Helmet ⇄ nginx CSP parity test

If the parity test exists (`csp-parity.test.ts` per Story 9-8 plan):

```bash
pnpm --filter @oslsr/api test csp-parity
```

Expected: passes. Both layers' policies are equivalent.

### 3.5 Confirm /api/v1/csp-report still receives reports (if any)

Even in enforcing mode, the `report-uri` directive instructs browsers to send violation reports. Monitor for the next 24 hours:

```bash
ssh root@oslsr-home-app
pm2 logs oslsr-api --lines 200 --nostream | grep -i "csp.*violation\|csp.report"
```

In enforcing mode, any violation reports indicate that something IS being blocked (which is what the policy is supposed to do). Each one needs investigation:

- Is it a legitimate user being blocked? → Bug — adjust CSP.
- Is it a malicious resource being blocked? → Working as intended.
- Is it a browser extension? → Acceptable; ignore or filter at the report endpoint.

---

## Section 4 — Rollback procedure (if needed)

If real user violations appear in §3.2 walk-through OR users report broken pages within the first 24 hours:

```bash
# Single-line revert: change the header name back
git revert <commit-hash-from-section-2.3>
git push origin main

# OR direct edit + manual deploy (if revert is messy):
nano infra/nginx/oslsr.conf
# Change Content-Security-Policy back to Content-Security-Policy-Report-Only
sudo nginx -t && sudo systemctl reload nginx

# Investigate the violations
# Update the CSP policy
# Re-test
# Re-promote when clean
```

The rollback window is short — `add_header` is the same line, just the header name flips. There is no schema migration, no data move, no irreversible state change. Rollback is functionally instantaneous.

---

## Section 5 — Closing the story

After §3 verification passes:

1. Update `_bmad-output/implementation-artifacts/9-8-content-security-policy-nginx-rollout.md` (or wherever Story 9-8 lives):
   - Status: `in-progress` → `done`
   - Add Change Log entry: "Promoted CSP from Report-Only to enforcing 2026-04-XX. 14-day Report-Only window observed zero real-user violations on legitimate pages. securityheaders.com grade A+. All ACs met."
   - Populate File List with the actual files modified

2. Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
   - `9-8-content-security-policy-nginx-rollout: in-progress` → `done`
   - Add comment: `# updated: 2026-04-XX - Story 9-8 → done. CSP promoted to enforcing.`

3. Optional: update `MEMORY.md` Key Patterns to remove the "9-8 in Report-Only mode awaiting browser self-test" line (which is now superseded).

---

## Section 6 — When you're done

This is your **second Field Readiness Certificate-adjacent item closed** (after Story 9-9 P0 Tailscale subtask). Story 9-8 was not strictly on the FRC 6-item gate, but it materially improves the field-survey security posture — going from A to A+ on securityheaders.com is a tangible Transfer-readiness signal.

**Next recommended Story 9-9 subtask after 9-8 closes:** alerting tier (FRC item #5), since that's the other field-survey-blocking item under your direct operational control without requiring create-story / dev-agent execution.

---

*Created: 2026-04-25*
*Cross-references: Story 9-8 (`_bmad-output/implementation-artifacts/9-8-content-security-policy-nginx-rollout.md`); Story 9-7 nginx forward-fix (which set the foundation); SCP-2026-04-22 §7 Completion Log; emergency-recovery-runbook.md*
