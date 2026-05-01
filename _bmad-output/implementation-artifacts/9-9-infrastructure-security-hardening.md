# Story 9.9: Infrastructure Security Hardening — Tailscale, OS Patching, Field-Readiness, WAF (Expanded Scope per SCP-2026-04-22)

Status: in-progress

<!--
REGENERATED 2026-04-25 by Bob (SM) per SCP-2026-04-22 §A.5 + epics.md §Story 9.9.

This story file was originally created 2026-04-12 with a Cloudflare-only scope (6 ACs, P0/P1/P2 prioritization). SCP-2026-04-22 expanded the scope to 10 subtasks after the Mon 2026-04-20 distributed SSH brute-force incident. The regenerated structure below carries the 10-subtask matrix; subtasks #1 (Tailscale + SSH hardening) and #2 (OS patching) are already DONE per Change Log entries 2026-04-23 + 2026-04-25 respectively.

Preservation discipline:
  • All Change Log entries from the original file preserved verbatim
  • File List "Tailscale Hardening Subtask (2026-04-23)" block preserved verbatim
  • New File List block added for OS upgrade subtask (2026-04-25)
  • Original Cloudflare-focused Dev Notes preserved as "Original Field-Readiness Assessment (2026-04-12)" subsection — the B+ assessment + Cloudflare-as-2-problems-solved insight is institutional knowledge that should not be lost
  • Field Readiness Certificate cross-reference added (FRC items #1 and #5 are this story)
-->

## Story

As the **Super Admin / platform operator**,
I want **the production VPS hardened against the 2026-04-20 distributed SSH brute-force vector and the broader infrastructure surface tightened ahead of the Transfer phase — Tailscale operator-access overlay (✅ done), OS patching cadence (✅ done), public port audit, app-layer rate-limit audit, backup client-side encryption, alerting tier with push channel, log rotation, second super-admin (break-glass), SOC-style activity baseline, and Cloudflare WAF (domain-gated)**,
so that **the platform meets a B+ → A- security posture without requiring the `oyoskills.com` domain to land first, the field survey can launch under FRC item #1 + #5 coverage, and the Ministry inherits a defensible operational posture at Transfer**.

## Expanded Scope (per SCP-2026-04-22)

This story's scope was expanded from "Cloudflare WAF + alerting" (6 ACs) to **10 infrastructure-hardening subtasks** after Monday 2026-04-20 11:04 UTC sustained a distributed SSH brute-force attack from 14+ IPs (`2.57.122.x`, `144.31.234.20`, `92.118.39.x`, `45.227.254.170`, `172.93.100.236`, `43.128.106.113`, `118.194.234.8`, `103.189.235.33`, `213.209.159.231`, `2.57.121.25`, `45.148.10.50`, `64.89.160.135`) hammering port 22 with usernames `root`, `ubuntu`, `oyotradeministry`, `test`, `user`, `hadi`, `amssys`. CPU hit 100%; memory 82%. The Story 6-2 monitoring alert fired as designed, but **detection-to-response latency was 19 hours**.

The pre-existing 9-9 backlog scope (Cloudflare-only) was domain-gated on `oyoskills.com` and could not be deployed against the immediate threat. The SCP-2026-04-22 expansion put SSH lockdown at the top of the priority order — Tailscale + sshd hardening + fail2ban + DO Console architecture (per ADR-020 V8.2-a1) replaced the Cloudflare-first plan.

**Subtask state (as of 2026-04-25):**

| # | Subtask | Status | Authoritative source |
|---|---|---|---|
| 1 | Tailscale VPN + SSH lockdown | ✅ **Done 2026-04-23** | Change Log 2026-04-23 + File List "Tailscale Hardening Subtask" block + ADR-020 + `docs/emergency-recovery-runbook.md` |
| 2 | OS patching + scheduled monthly reboots | ✅ **Done 2026-04-25** | Change Log 2026-04-25 + File List "OS Upgrade Subtask" block + sprint-status.yaml §10 |
| 3 | Public port audit (`ss -tlnp`); close/restrict Portainer | ⏳ Backlog | AC#3 below |
| 4 | App-layer rate-limit audit on `/auth/*` endpoints | ⏳ Backlog | AC#4 below |
| 5 | Backup client-side encryption (AES-256 pre-S3) + quarterly restore drill | ⏳ Backlog | AC#5 below |
| 6 | Incident-response tier for CRITICAL alerts (Telegram push channel) | ✅ **Done 2026-05-01** | Telegram bot + `apps/api/src/services/alerting/telegram-channel.ts` + wiring in `alert.service.ts` + 11 tests + .env.example + runbook §1.8. Fires on every CRITICAL state transition, instant phone vibration. Email digest still fires for full audit trail. **NOT FRC #5** — see Field Readiness Certificate Impact section below for the 2026-04-27 FRC revision that demoted alerting to Ministry hand-off recommendation. AC#6 ships as zero-cost above-and-beyond improvement on top of the existing email-attentive workflow. |
| 7 | Logrotate for PM2 logs + journalctl retention | ⏳ Backlog | AC#7 below |
| 8 | Second super-admin account (break-glass) | ✅ **Done 2026-04-26** | `admin@oyoskills.com` created via staff-invite UI; Resend → ImprovMX → Gmail flow validated end-to-end via real activation email |
| 9 | SOC-style activity baseline / SSH log differentiation | ⏳ Backlog | AC#9 below |
| 10 | Cloudflare WAF/CDN + rate-limiting | ✅ **Done 2026-04-27** | DNS A oyoskills.com + CNAME www flipped grey → orange; SSL/TLS = Full (strict); Always Use HTTPS + Auto HTTPS Rewrites ON; WAF Managed Rules Always Active; WS through CF verified (101 status); real-IP middleware (`apps/api/src/middleware/real-ip.ts`) reads CF-Connecting-IP — verified `req.ip` = real client (197.211.52.65) post-deploy. Commits `4c2d909` + `bf98931` + `1383373` |

**Field Readiness Certificate impact:** Subtask #1 (done) covers FRC item #1 (Tailscale live + SSH public-port closed). Subtask #5 (backup AES-256 client-side encryption) is the CURRENT FRC item #5 per the **2026-04-27 cost-aware revision** in `epics.md` — push-channel alerting was demoted to Ministry hand-off recommendation, backup encryption was promoted in. Subtask #6 (Telegram push channel, done 2026-05-01) is a zero-cost above-and-beyond improvement, NOT field-blocking. Other subtasks are Tier B — can ship during the first weeks of field operation without blocking start.

## Acceptance Criteria

### Subtasks done (preserved as historical evidence)

1. **AC#1 — Tailscale VPN + SSH lockdown (DONE 2026-04-23):** Tailscale overlay deployed (laptop `100.113.78.101` + VPS `100.93.100.28`); sshd hardened across main file + both drop-ins (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `PubkeyAuthentication yes`); fail2ban installed + sshd jail active; DO Cloud Firewall SSH rule **dual-source `0.0.0.0/0` + `100.64.0.0/10`** (amended 2026-04-25 from original `100.64.0.0/10`-only after empirical discovery that DO Console depends on public-IP SSH via DOTTY/`droplet-agent`); emergency recovery runbook authored at `docs/emergency-recovery-runbook.md` (8 sections + panic-start block + quarterly drill). Verified post-2026-04-25 amendment: (a) public-IP SSH with password = `Permission denied (publickey)` (sshd primary control); (b) public-IP SSH with wrong key = `Permission denied` then fail2ban ban; (c) Tailscale SSH = no-prompt success; (d) DO Web Console reachable from any browser. **Authoritative state in ADR-020 V8.2-a1 (`_bmad-output/planning-artifacts/architecture.md` §"DO Console Access Vector").**

2. **AC#2 — OS patching baseline (DONE 2026-04-25):** Ubuntu 24.04.3 → 24.04.4; kernel 6.8.0-90 → 6.8.0-110; 49 packages upgraded including `systemd`, `apparmor`, `snapd`, `cloud-init`, `nodejs`, `openssh-server`. Pre-flight verified before reboot: `tailscaled` enabled-on-boot, PM2 startup hook (`pm2-root.service` via systemd) registered + `pm2 save` executed, Docker `restart: unless-stopped`. Reboot at 08:54:37 UTC. Post-reboot all services up; HTTPS health 200 with full sec2-3 CSP. Two snapshots taken: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`. **PM2 ↺ counter reset 916+ → 0 establishes baseline for Story 9-10 restart-loop investigation observability window.** Monthly reboot pre-flight checklist documented at runbook §6.1.

### Remaining subtasks (forward-planned)

3. **AC#3 — Public port audit & Portainer hardening:** Run `ss -tlnp` on the VPS and document every listening port + bound interface. Verify all non-public services (Postgres 5432, Redis 6379) are bound to `127.0.0.1` only. **Portainer's exposure must be reviewed:** if currently bound to `0.0.0.0:9000`, either rebind to `127.0.0.1` (operator accesses via `ssh -L 9000:127.0.0.1:9000`) OR keep public but add basic-auth via NGINX proxy. Capture audit output as `docs/port-audit-2026-04-XX.md` with one-line justification per listening port. DO Cloud Firewall ingress rules cross-checked against `ss -tlnp`; any public ports without firewall rules = misconfiguration; any firewall rules without listening ports = stale.

4. **AC#4 — App-layer rate-limit audit on `/auth/*` endpoints:** Inventory every `/api/v1/auth/*` and `/api/v1/staff/activate/*` endpoint and verify each has a per-IP rate limit configured in `apps/api/src/middleware/rate-limit.ts` (or equivalent). Confirm thresholds are aligned with PRD NFR4.4 (login: 5/15min, password reset: 3/hour, profile edit token: 3/NIN/day). Add unit tests that assert each endpoint enforces the documented limit (existing tests cover only the `loginRateLimiter` happy path). Capture findings + delta in `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts`.

5. **AC#5 — Backup client-side encryption + quarterly restore drill:** Modify `apps/api/scripts/backup-to-s3.sh` (or wherever the daily pg_dump lives) to encrypt the dump with AES-256 *before* upload to S3 — using `openssl enc -aes-256-cbc -salt -pbkdf2` with a key from a new env var `BACKUP_ENCRYPTION_KEY` (hex, 32 bytes, generated with `openssl rand -hex 32`, stored in `.env` on VPS only). Document the restore procedure (decrypt + restore) in `docs/infrastructure-cicd-playbook.md` Part 9. Run a one-shot restore drill against a scratch Postgres instance, capture output as evidence in Dev Notes. Schedule quarterly restore drills via runbook §6.1.

6. **AC#6 — Alerting tier with push channel (zero-cost improvement; NOT FRC #5 per 2026-04-27 revision):** Implement at least **one push-notification channel** for CRITICAL severity alerts emitted by the existing health-digest system (`apps/api/src/middleware/metrics.ts` + `apps/api/src/services/health-digest.service.ts`). Options: (a) Telegram bot (free, instant, no email cap), (b) WhatsApp Business API (Twilio or Meta direct), (c) SMS via Termii (Nigerian provider — same provider OSLSR may use later for SMS OTP per Decision 2.6, dual-purpose), (d) email-to-SMS gateway (cheap, slow, carrier-dependent). Pick (a) Telegram for MVP — fastest setup, no cost, works on operator's phone. Wire into `health-digest.service.ts` to fire CRITICAL on: API p95 >1000ms (sustained 5min), database connection failures (>3 in 1min), fail2ban ban-list size delta >10/hour (sudden brute-force spike), CSP violation rate >100/min. Document the alert routing matrix.

7. **AC#7 — Log rotation for PM2 + journalctl retention:** Configure `pm2-logrotate` module to rotate `/root/.pm2/logs/*.log` at 50MB or daily (whichever first), retain 14 rotations, compress with gzip. Configure `/etc/systemd/journald.conf` with `SystemMaxUse=2G`, `MaxRetentionSec=30d` (currently unbounded — risks filling `/` partition). Verify both with `pm2 logrotate --status` and `journalctl --disk-usage`. Capture configuration in runbook §1.4 + infrastructure playbook.

8. **AC#8 — Second super-admin account (break-glass):** Provision a second super-admin user account (e.g. `awwal-breakglass@oyotradeministry.com.ng`) with a strong password stored in the operator's password manager + a unique `id_ed25519` SSH key on a second physical device (ideally the operator's phone with Termius or similar). The account is **not used for daily operations** — it exists so that if the primary `awwallawal@gmail.com` account is locked out (forgotten password, lost phone, magic-link email compromised), the operator has a recovery path that doesn't require Awwal manually editing the database via DO Console. Document the break-glass account in runbook §1.5 with explicit "do not use for daily ops" warning + quarterly drill check that the credentials still work.

9. **AC#9 — SOC-style activity baseline / SSH log differentiation:** Establish a baseline of "normal" sshd activity post-2026-04-25 firewall amendment (which exposes public-IP SSH) so that anomalous patterns are visible. Run `journalctl -u ssh --since "2026-04-25"` weekly for 4 weeks, capture: (a) accepted-publickey rate per source IP class (operator IPs vs GH Actions IPs vs DO infrastructure IPs vs unknown — the unknowns are the brute-force tail), (b) Failed-publickey rate per source IP class, (c) fail2ban ban-list churn rate, (d) any successful logins outside the operator/CI IP classes (= P0 incident). Capture as `docs/ssh-activity-baseline-2026-05-XX.md` after 4 weeks of data; add to monthly review cadence.

10. **AC#10 — Cloudflare WAF/CDN + edge rate-limiting (DONE 2026-04-27):** Cloudflare free tier deployed per the original 2026-04-12 task plan (preserved verbatim in §"Original Field-Readiness Assessment (2026-04-12)" Dev Notes below). DNS A `oyoskills.com` + CNAME `www` flipped grey → orange; SSL/TLS = Full (strict); Always Use HTTPS + Auto HTTPS Rewrites enabled; WAF Managed Rules baseline Always Active; DDoS attenuation at CF edge; WS through CF proxy verified working (101 status). Real-IP plumbing via `apps/api/src/middleware/real-ip.ts` reads `CF-Connecting-IP` from verified CF edges; `req.ip` = real client (197.211.52.65) verified post-deploy on captcha + login events. Commits `4c2d909` + `bf98931` + `1383373`. **Follow-up open question** (separate from this story): with Cloudflare in front of public HTTP/S traffic, can the DO Cloud Firewall SSH rule be re-narrowed back to `100.64.0.0/10` + DO infrastructure ranges? Note: SSH doesn't flow through Cloudflare regardless (CF only proxies HTTP/HTTPS), so adding CF IPs to firewall does NOT help SSH — the answer is to deploy a self-hosted GH Actions runner inside the tailnet, then re-narrow. Tracked as a separate concern requiring its own story (recommend SM authoring as Story 9-14 or similar).

11. **AC#11 — Zero regressions:** Full test suite passes after each subtask. Baseline as of 2026-05-01: **4,193 tests** (+2 from Story 9-8 Task 7.1 allowlist additions). Maintained or grown by each subsequent subtask.

## Acceptance Criteria Priority Map

| AC | Status | Priority | Effort | FRC item | Why this priority |
|---|---|---|---|---|---|
| AC#1 (Tailscale + SSH) | ✅ Done | P0 | (delivered) | **#1** | Closed the active SSH brute-force vector |
| AC#2 (OS patching) | ✅ Done | P0 | (delivered) | — | 49 packages including `openssh-server` patched; PM2 ↺ baseline established |
| AC#3 (Port audit) | Backlog | P1 | 2-4 hours | — | Closes Portainer SPOF; cheap one-time audit |
| AC#4 (Auth rate-limit audit) | Backlog | P1 | 4-8 hours | — | Defence-in-depth on the most-attacked surface |
| AC#5 (Backup encryption) | Backlog | P1 | 1 day | — | Compliance + operator confidence; required for Transfer |
| AC#6 (Alerting push channel) | **Done 2026-05-01** | P1 (was P0) | ~3 hours actual | **n/a** (was #5) | Telegram bot live; instant push on every CRITICAL state transition; email digest preserved for audit trail. **NOT FRC #5** — that slot reassigned to AC#5 (backup encryption) on 2026-04-27. AC#6 ships as zero-cost above-and-beyond improvement. |
| AC#7 (Log rotation) | Backlog | P2 | 1 hour | — | Prevents disk-fill incident; cheap to do |
| AC#8 (2nd super-admin) | **Done 2026-04-26** | P1 | 30 min actual | — | `admin@oyoskills.com` break-glass account live; both super_admins receive system health digests |
| AC#9 (Activity baseline) | Backlog | P2 | 4 weeks elapsed (passive) | — | Establishes normal so anomalies are visible |
| AC#10 (Cloudflare) | **Done 2026-04-27** | P0 | ~2 hours actual (incl. real-IP plumbing dual-deploy) | — | DNS proxied + Full(strict) + WAF + real-IP middleware. See Postscript 3 in `docs/session-2026-04-21-25.md` for full mechanics + 4 lessons learned (#5-8) |

## Prerequisites / Blockers

- **AC#1, AC#2:** Already delivered. No blockers.
- **AC#3 (Port audit):** No blockers. Awwal can run `ss -tlnp` over SSH any time.
- **AC#4 (Auth rate-limit audit):** No blockers. Pure code work.
- **AC#5 (Backup encryption):** No blockers. Awwal generates `BACKUP_ENCRYPTION_KEY` and adds to VPS `.env`.
- **AC#6 (Alerting):** No blockers. Telegram bot setup is 5 minutes; integration is the bulk of the work.
- **AC#7 (Log rotation):** No blockers.
- **AC#8 (2nd super-admin):** No blockers — but operator must have a second physical device for the recovery key.
- **AC#9 (Activity baseline):** Passive — accumulates 4 weeks of data. **Long-pole calendar gate:** observation window opened 2026-04-25 by Story 9-9 OS-patching subtask; 4 weeks elapses ~2026-05-23. Story 9-9 closure cannot precede AC#9 done unless AC#9 is split into a follow-up story (9-9c). Recommend: keep 9-9 in-progress through May; close as a single batch when AC#9's baseline doc is written.
- **AC#10 (Cloudflare):** Blocked on `oyoskills.com` domain purchase — out of scope for this story; proceeds when domain lands.

## Tasks / Subtasks

### Subtask 1: Tailscale + SSH hardening — DONE 2026-04-23

✅ See Change Log entry 2026-04-23 + File List "Tailscale Hardening Subtask (2026-04-23)" block. **Authoritative as-deployed state: ADR-020 V8.2-a1 (architecture.md) + runbook §1.1 + §1.4 + §2.2 + §6.1.**

### Subtask 2: OS patching baseline — DONE 2026-04-25

✅ See Change Log entry 2026-04-25 + File List "OS Upgrade Subtask (2026-04-25)" block. Monthly-reboot pre-flight checklist captured in runbook §6.1.

### Subtask 3: Public port audit & Portainer hardening (AC#3)

- [ ] 3.1 SSH to VPS and run `ss -tlnp` — capture full output with column headers
- [ ] 3.2 Run `iptables -L -n` and `iptables -t nat -L -n` (Docker writes here directly, bypassing UFW) — capture
- [ ] 3.3 Cross-reference: every public-listening port (non-`127.0.0.1`) MUST have a corresponding DO Cloud Firewall ingress rule
- [ ] 3.4 Identify Portainer binding (likely `0.0.0.0:9000`). Decide:
  - **Option A (preferred):** rebind to `127.0.0.1:9000`; operator accesses via SSH tunnel `ssh -L 9000:127.0.0.1:9000 oslsr-home-app` then `http://localhost:9000`
  - **Option B (fallback):** keep public but add NGINX basic-auth proxy — adds complexity, weaker than Option A
- [ ] 3.5 Document audit output as `docs/port-audit-2026-04-XX.md` (date stamp at run)
- [ ] 3.6 Add to runbook §1.4 a one-liner per listening port + justification

### Subtask 4: App-layer rate-limit audit on `/auth/*` (AC#4)

- [ ] 4.1 Inventory `/api/v1/auth/*` and `/api/v1/staff/activate/*` endpoints — confirm via `apps/api/src/routes/auth.routes.ts` + `staff.routes.ts`
- [ ] 4.2 For each endpoint, identify the rate-limit middleware applied (per-IP, per-NIN, per-email)
- [ ] 4.3 Cross-check thresholds against PRD NFR4.4: login 5/15min, password reset 3/hour, profile edit token 3/NIN/day
- [ ] 4.4 Add `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — assert each documented endpoint enforces the documented limit; failure surfaces drift
- [ ] 4.5 Document delta + remediation in Dev Notes

### Subtask 5: Backup client-side encryption + restore drill (AC#5)

- [ ] 5.1 Add `BACKUP_ENCRYPTION_KEY` to `.env.example` (with comment noting it's a 32-byte hex from `openssl rand -hex 32`)
- [ ] 5.2 Generate the key on the VPS: `openssl rand -hex 32 | tee -a /root/oslsr-backup-key.txt` (also save to operator's password manager)
- [ ] 5.3 Modify `apps/api/scripts/backup-to-s3.sh` (or current daily-backup script):
  - Pre-upload: `pg_dump ... | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY | aws s3 cp ...`
  - Filename suffix: change from `.sql.gz` to `.sql.gz.enc`
- [ ] 5.4 Test restore against scratch Postgres: `aws s3 cp ... | openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY | psql ...`
- [ ] 5.5 Document restore procedure as `docs/infrastructure-cicd-playbook.md` Part 9 — Encrypted Backup Restore
- [ ] 5.6 Update existing monthly backup script if it differs from daily
- [ ] 5.7 Schedule quarterly restore drill in runbook §6.1
- [ ] 5.8 Capture one-shot restore drill output as Dev Notes evidence

### Subtask 6: Alerting tier with push channel (AC#6 — zero-cost above-and-beyond, NOT FRC) — DONE 2026-05-01

- [x] 6.1 Created Telegram bot via @BotFather; token recorded in operator's password manager + VPS `/root/oslrs/.env` as `TELEGRAM_BOT_TOKEN`.
- [x] 6.2 Operator's chat_id obtained via @userinfobot; recorded in VPS `.env` as `TELEGRAM_OPERATOR_CHAT_ID`. Heartbeat curl confirmed phone vibration end-to-end before any code shipped.
- [x] 6.3 Added `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` to `.env.example` with full setup recipe + setup-curl-test snippet. VPS `.env` updated by operator pre-deploy.
- [x] 6.4 Created `apps/api/src/services/alerting/telegram-channel.ts` — exports `sendCriticalTelegramAlert(ctx)` posting to `/sendMessage` with `{chat_id, text, disable_web_page_preview}`. Plain-text body (no parse_mode) avoids Markdown-escape pitfalls on metric keys with underscores/colons (e.g., `queue_waiting:email`). NEVER throws — network errors and HTTP non-2xx responses both swallowed at `warn` log level. Skips silently if either env var is unset (dev/test/local) or in test mode (`NODE_ENV=test` or `VITEST=true`).
- [x] 6.5 Wired into `apps/api/src/services/alert.service.ts` `queueAlert()` method — fires on every state transition into `critical`. Fire-and-forget pattern (`.catch()` on the promise) so a Telegram outage cannot break alert evaluation. Inherits the existing per-metric 5-min cooldown + 3/hour rate limit via the upstream `queueAlertWithCooldown` caller. Email digest still fires per its own 30-min cooldown for full audit trail. **Resolved transitions deliberately do NOT ping Telegram** — good news doesn't deserve a phone vibration.
- [x] 6.6 Created `apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — 10 tests covering: payload shape (URL, method, headers, body fields), escalation context (previousLevel), missing-token skip, missing-chat-id skip, NODE_ENV=test skip, VITEST skip, network-error swallow, non-2xx-response swallow, queue_waiting metric key with colon. Existing `alert.service.test.ts` 10/10 still pass — wiring did not regress the state machine.
- [x] 6.7 **Production heartbeat-test executed 2026-05-01 10:26:45 UTC.** Operator SSH'd to VPS via Tailscale, set TELEGRAM_* env vars, restarted pm2 with --update-env, ran heartbeat curl. Telegram API returned `{"ok":true,"message_id":4}`. Phone vibration confirmed end-to-end. Raw API response captured in (gitignored) `ssh_analysis.txt`. Channel layer is field-verified, not just code-complete.
- [x] 6.8 Documented alert routing matrix in `docs/emergency-recovery-runbook.md` §1.8 — channels in use, severity → channel matrix, what triggers a CRITICAL, quarterly drill, operator-changes-phone procedure, bot-token-leak rotation procedure. (Note: §1.6 was already taken by Project Email Architecture per 2026-04-26 ship; new §1.8 added at end of section 1.)
- [x] 6.9 **No FRC table update needed** — discovered via 2026-05-01 retrospective code review: FRC item #5 was already reassigned from alerting to backup encryption (AC#5) on 2026-04-27 per cost-aware roadmap revision. AC#6 implementation does NOT close an FRC item. Original Task 6.9 instruction to flip the FRC table is obsolete; epics.md FRC table requires no changes from this story.

### Subtask 7: Log rotation (AC#7)

- [ ] 7.1 `pm2 install pm2-logrotate` then `pm2 set pm2-logrotate:max_size 50M`, `pm2 set pm2-logrotate:retain 14`, `pm2 set pm2-logrotate:compress true`, `pm2 set pm2-logrotate:rotateInterval '0 0 * * *'`
- [ ] 7.2 Edit `/etc/systemd/journald.conf`: `SystemMaxUse=2G`, `MaxRetentionSec=30d`. Then `systemctl restart systemd-journald`
- [ ] 7.3 Verify: `pm2 logrotate --status` (or `pm2 conf pm2-logrotate`), `journalctl --disk-usage`
- [ ] 7.4 Add to runbook §1.4 — Log retention policy

### Subtask 8: Second super-admin account (AC#8)

- [ ] 8.1 Generate `awwal-breakglass@oyotradeministry.com.ng` user record via existing `pnpm --filter @oslsr/api db:seed --admin-from-env` flow with a distinct env-var-set
- [ ] 8.2 Store password in operator's password manager (Bitwarden / 1Password / etc.) tagged "OSLSR break-glass"
- [ ] 8.3 Generate a second `id_ed25519` SSH key for the operator's phone (Termius app or equivalent). Add public key to `/root/.ssh/authorized_keys` line 3 with comment `awwal-breakglass-phone-2026-04-XX`
- [ ] 8.4 Test: log in as breakglass account once via the app; confirm full super-admin dashboard accessible. Then *do not use this account again* for daily ops.
- [ ] 8.5 Test: SSH to VPS using phone + Termius via Tailscale (phone needs to be on the tailnet — see follow-up item below)
- [ ] 8.6 Document in runbook §1.5 — Key accounts: add break-glass row with explicit "do not use for daily ops" warning
- [ ] 8.7 Add quarterly drill check item: confirm break-glass credentials still work + password unchanged in manager

### Subtask 9: SOC-style activity baseline (AC#9)

- [ ] 9.1 Establish baseline via `journalctl -u ssh --since "2026-04-25" | grep -E "(Accepted|Failed)"` weekly for 4 weeks
- [ ] 9.2 Categorize source IPs:
  - **Operator** (Awwal's home/office IPs over time)
  - **GH Actions** (rotating GitHub IP ranges per `https://api.github.com/meta`)
  - **DO Infrastructure** (`162.243.0.0/16` and other DO ranges per ADR-020 §"DO Console Access Vector")
  - **fail2ban-banned** (sample from `fail2ban-client status sshd`)
  - **Unknown** (everything else — the brute-force tail)
- [ ] 9.3 Capture weekly snapshots in `docs/ssh-activity-baseline-week-N-2026-05-XX.md`
- [ ] 9.4 After 4 weeks: synthesize as `docs/ssh-activity-baseline-2026-05-XX.md` — establish "normal" volumes per category
- [ ] 9.5 Add monthly review cadence to runbook §6.1 — review baseline, flag anomalies
- [ ] 9.6 **Any successful login outside operator/CI categories = P0 incident** — document the incident response procedure in runbook §3 (Incident Response)

### Subtask 10: Cloudflare WAF/CDN (AC#10) — DONE 2026-04-27

- [x] 10.1 ~~Wait for `oyoskills.com` domain purchase (Story 9-2 dependency)~~ — **Done 2026-04-26 (Phase 1 email)**
- [x] 10.2 ~~Follow the original 2026-04-12 Cloudflare task plan~~ — **Done 2026-04-27**: DNS records flipped grey → orange; SSL/TLS = Full (strict); Always Use HTTPS + Automatic HTTPS Rewrites enabled; WAF Managed Rules baseline Always Active. Email DNS records (MX/SPF/DKIM/DMARC) verified DNS-only/grey-cloud — must remain so forever. WS through CF proxy verified working (101 status). Commits `4c2d909` (trust proxy whitelist) + `bf98931` (CF-Connecting-IP middleware, failed CI build) + `1383373` (CI build fix: `@types/proxy-addr` + 2-arg trust fn call). Real-client IP plumbing verified post-deploy: `req.ip` = `197.211.52.65` (real Nigerian-ISP IP) on captcha + login events, not CF edge IPs. Full mechanics + 4 lessons learned (#5-8) captured in `docs/session-2026-04-21-25.md` Postscript 3.
- [ ] 10.3 **Still open follow-up question:** with Cloudflare in front of public traffic, can the DO Cloud Firewall SSH rule be re-narrowed back to `100.64.0.0/10` + DO infrastructure ranges + Cloudflare IP ranges? Decision pending — ADR-020 V8.2-a1 §"DO Console Access Vector" trade-off matrix has the framing. Note: SSH traffic doesn't flow through Cloudflare regardless (CF only proxies HTTP/HTTPS), so adding CF IPs to firewall does NOT help SSH — the 100.64.0.0/10 + DO infra ranges remains the right answer for SSH lockdown when GH Actions self-hosted runner replaces public deploys.

### Subtask 11: Traceability (AC#11 — process hygiene)

- [ ] 11.1 `sprint-status.yaml`: 9-9 entry remains `in-progress` until all subtasks except AC#10 (domain-gated) are done. Single-line comment per subtask completion.
- [ ] 11.2 Field Readiness Certificate (epics.md): item #1 (Tailscale) already ✅ done in the FRC table. Per 2026-04-27 FRC revision, item #5 is now backup encryption (AC#5), NOT alerting (AC#6) — to be flipped when AC#5 ships, not by AC#6.

### Review Follow-ups (AI)

_(Populated 2026-05-01 by retrospective adversarial code review of AC#6 implementation. Per `feedback_review_before_commit.md`, code review is supposed to run BEFORE commit on uncommitted working tree — this AC#6 work was committed without that step (`9d4081b`), so review is retrospective. Findings categorized HIGH / MEDIUM / LOW; HIGH + most MEDIUM auto-fixed in the same commit, LOWs documented as backlog.)_

- [x] [AI-Review][HIGH] **F1: FRC framing factually wrong throughout AC#6 work.** AC#6 was tagged as "FRC item #5" in 6+ places (telegram-channel.ts JSDoc, runbook §1.8 header, sprint-status comment, story body Subtask Status Matrix + Field Readiness Certificate Impact + AC text + Priority Map + Subtask 6 header + 2 Change Log entries). FRC item #5 was actually demoted to Ministry hand-off recommendation on 2026-04-27 — the slot is now backup encryption (AC#5). All 6 sites corrected to "above-and-beyond, NOT FRC" framing. Two Change Log entries from earlier today (`Subtask 6 COMPLETE` + `AC#6 live-verification`) carry the stale claim — preserved as historical audit trail with a new correction entry above them documenting the discovery + scope of correction. [`apps/api/src/services/alerting/telegram-channel.ts:4` + `docs/emergency-recovery-runbook.md:173` + `_bmad-output/implementation-artifacts/sprint-status.yaml:331` + this story's Subtask Status Matrix + Field Readiness Certificate Impact + Tasks/Subtasks 6.x + Change Log]
- [x] [AI-Review][MEDIUM] **F2: `formatAlertMessage()` did not handle Invalid Date.** A caller passing `new Date(NaN)` would render the literal string "Invalid Date" in the alert. Now substitutes current time + flags the substitution in the message body so the malformed caller is visible. New test added (`telegram-channel.test.ts` test 11). [`apps/api/src/services/alerting/telegram-channel.ts:90-107`]
- [ ] [AI-Review][MEDIUM] **F3: Error response body logging may include caller chat_id (theoretical leak).** When Telegram API returns a non-2xx response, `body.substring(0, 200)` is logged at warn level. Telegram error descriptions historically don't echo chat_id back, but this is not contractually guaranteed. **Risk: low** (chat_id is the operator's own Telegram ID, not arbitrary user PII; only matters if logs are forwarded to a 3rd party like Sentry). **Defer:** add JSON-aware sanitization (parse body, log only `{ok, error_code, description}`) when adding any external log forwarding, OR sooner if security audit raises it. [`apps/api/src/services/alerting/telegram-channel.ts:65-73`]
- [x] [AI-Review][MEDIUM] **F4 / F10: No integration test for `alert.service.ts` → `telegram-channel.ts` wiring.** The 11 new telegram-channel tests cover the channel function in isolation; the 10 existing `alert.service.test.ts` tests don't extend to telegram. New test added asserting that a critical state transition fires `sendCriticalTelegramAlert` once via mocked module, AND that a resolved transition does NOT fire it. [`apps/api/src/services/__tests__/alert.service.test.ts`]
- [ ] [AI-Review][LOW] **F5: `disable_web_page_preview` is deprecated by Telegram Bot API.** Per Telegram Bot API v6.x, this field is deprecated in favor of `link_preview_options.is_disabled`. Still works (Telegram maintains backward compat indefinitely), but worth migrating in a future polish pass. [`apps/api/src/services/alerting/telegram-channel.ts:61`]
- [ ] [AI-Review][LOW] **F6: Alert message has no clickable URL for one-tap response.** "Investigate via SSH (Tailscale) or the System Health dashboard." mentions both paths but provides no URL. Could include the dashboard URL via `process.env.PUBLIC_APP_URL` so operator one-taps from notification. Low priority because Telegram's app-launch latency on a tap is not significantly faster than typing the URL or opening a bookmark. [`apps/api/src/services/alerting/telegram-channel.ts:100`]
- [ ] [AI-Review][LOW] **F7: Error logs lack tokenPrefix for multi-bot debug.** If multiple Telegram bots are ever configured (unlikely), log entries can't tell which bot failed. Could include `tokenPrefix: token.substring(0, 10)` in error log fields. Defer unless actually run multiple bots. [`apps/api/src/services/alerting/telegram-channel.ts:67-72,82-86`]
- [x] [AI-Review][LOW] **F8: Task 6.7 (production heartbeat-test) was marked deferred but live verification happened.** Operator executed heartbeat at 2026-05-01 10:26:45 UTC — Telegram API returned ok:true with message_id=4 — but Task 6.7 checkbox stayed `[ ]` in the story. Now `[x]` with the verification timestamp + raw API response reference inline.
- [ ] [AI-Review][LOW] **F9: `process.env` reads on every CRITICAL alert dispatch.** `process.env.TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPERATOR_CHAT_ID` re-read on each call. process.env reads are cheap (nanoseconds) and call frequency is rate-limited (max 3/hour/metric × ~7 metrics = ~21/hour theoretical), so this is sub-microsecond per hour. Defer optimization unless profiling surfaces real cost. [`apps/api/src/services/alerting/telegram-channel.ts:39-40`]

_(Below this divider: items added 2026-05-01 from a SECOND retrospective audit when operator pasted my own earlier Story 9-9 + 9-10 review back as a verification check. Honest accounting of what slipped through the first pass.)_

- [ ] [AI-Review][HIGH-Pending-SM] **9-9 H1: Split into 9-9a (4 done ACs) + 9-9b (5 backlog ACs).** Story is `in-progress` since 2026-04-25 with 5 of 10 ACs done — actual state is "partially shipped + outstanding backlog." Per `feedback_canonical_create_story_workflow.md`, all new stories authored via SM (Bob) `*create-story --yolo`; cannot ad-hoc create 9-9a/9-9b. Mitigation already applied: sprint-status.yaml comment honestly says "DONE 5/10". Action: invoke Bob for the formal split when next session resumes 9-9 work.
- [ ] [AI-Review][HIGH-Pending-SM] **9-9 H3: Author Story 9-14 — self-hosted GH Actions runner inside tailnet.** Architectural follow-up referenced in 5+ places (this story's 9-9 AC#10 follow-up + Story 9-10 AC#3 build resource pressure note + runbook §6.1 + ADR-020 trade-off matrix + memory) but has no story file. Unblocks SSH firewall re-narrowing back to `100.64.0.0/10` + DO infra ranges. Slot 9-14 is open (9-13 = TOTP MFA, already authored). Same blocker: requires SM authoring per canonical workflow.
- [x] [AI-Review][MEDIUM] **9-9 M3: 9-8 dependency overstated.** "AC#6 alerting routes CSP violation rate, so 9-8 enforcing-mode must land first" was too strong — AC#6 (Telegram) as built fires on cpu/memory/disk/queue/latency/db/redis, all independent of CSP enforcement state. CSP-violation-rate alert source is a deferred AC#6 follow-up. Wording softened in Dependencies section to "soft dependency only".
- [x] [AI-Review][LOW] **9-9 M4 [resolved as false alarm]: PRD V8.3 vs V8.2 reference.** Earlier I flagged "Story Risks §1 says PRD V8.3 NFR9; project memory says current PRD is V8.2 — verify which is canonical." Verified by reading prd.md header: **PRD is V8.3** (memory was stale; the architecture chain SCP-2026-04-22 + cost-aware revision iterated PRD past V8.2 → V8.3). No change needed in story. Memory file should be updated separately.
- [x] [AI-Review][LOW] **9-9 L2: AC#9 4-week passive baseline acknowledged as long-pole.** Added explicit calendar-gate note to Prerequisites section: observation window opened 2026-04-25; 4 weeks elapses ~2026-05-23; Story 9-9 closure cannot precede AC#9 done unless split into 9-9c. Keeps the long-pole visible.

## Dependencies

- **Story 9-7 (done)** — security baseline (nginx headers, TLS hardening); precedes any infrastructure hardening
- **Story 9-8 (review)** — CSP nginx rollout; **soft dependency only**. AC#6 alerting could route CSP-violation-rate alerts when 9-8 enforcing-mode lands, but as built (2026-05-01) AC#6 fires on the existing health-digest thresholds (cpu/memory/disk/queue/latency/db/redis) which are independent of CSP enforcement state. CSP-violation-rate alerts are a deferred AC#6 follow-up (require new metric collector). Tightening for enforcing-CSP can be a one-line follow-up after 9-8 closes.
- **Story 9-2 (deferred)** — `oyoskills.com` domain migration; **blocks AC#10 only**
- **No story dependencies for AC#3 through AC#9** — all are infrastructure-level and parallelisable

## Field Readiness Certificate Impact

This story is on the **Field Readiness Certificate (FRC §5.3.1)** at two items:

- **FRC item #1** (Tailscale live + SSH public-port closed) — ✅ **Satisfied 2026-04-23** by AC#1 + the 2026-04-25 firewall amendment (ADR-020 V8.2-a1: SSH primary control is sshd-key-only, firewall is dual-source defence-in-depth + DDoS attenuation; the FRC item reads correctly under the as-deployed posture even though "public-port closed" is no longer literal — the operative semantics is "public-port unauthenticated-attempts cannot succeed", which sshd hardening guarantees)
- **FRC item #5** — was originally "Alerting tier with at least one push channel live" → **REVISED 2026-04-27** to "Backup AES-256 client-side encryption + restore drill executed" (AC#5). Push-channel alerting demoted to Ministry hand-off recommendation per `docs/post-handover-security-recommendations.md`. AC#6 (Telegram, done 2026-05-01) is a zero-cost above-and-beyond improvement, not field-blocking. AC#5 backup encryption remains ⏳ **Outstanding** and IS field-blocking.

## Risks

1. **AC#1/AC#2 documentation drift.** The dual-source firewall posture (post-2026-04-25 amendment) is counter-intuitive — a future engineer reading "SSH firewall = 0.0.0.0/0" might "fix" it to tailnet-only and silently break Console + GH Actions. **Mitigation:** ADR-020 V8.2-a1 §"DO Console Access Vector" prominently flags this as a load-bearing decision; runbook §1.4 + §6.1 quarterly drill enforce the explanation. PRD V8.3 NFR9 documents the same.

2. **AC#6 channel choice locks in operator phone-number.** If we pick Telegram (recommended) and the operator changes phones, the chat_id needs updating. **Mitigation:** document chat_id retrieval in runbook §1.6; quarterly drill test sends a heartbeat alert to confirm channel still works.

3. **AC#5 backup encryption key loss.** If `BACKUP_ENCRYPTION_KEY` is lost AND the only copy is on the destroyed VPS, all encrypted backups become unreadable. **Mitigation:** mandatory password-manager copy + paper backup in physically secure location + test the restore procedure from password-manager-only key during quarterly drill.

4. **AC#3 Portainer rebinding could lock out current users.** If Portainer is currently in use by other team members on `0.0.0.0:9000`, rebinding to `127.0.0.1` requires them to set up SSH tunnels. **Mitigation:** announce 24h before rebinding; provide ssh-tunnel one-liner in announcement.

5. **AC#9 activity baseline takes 4 weeks elapsed.** This means subtask 9 cannot be "done" before week 4 of field operation. **Mitigation:** mark AC#9 explicitly as Tier B per FRC table — does not block field start; baseline accumulates during early field weeks.

6. **AC#10 (Cloudflare) is domain-gated.** Indefinite blocker until `oyoskills.com` lands. **Mitigation:** Story 9-9 stays `in-progress` indefinitely if AC#10 is the only outstanding item; this is acceptable because AC#10 is enhancement-not-baseline (the 2026-04-25 ADR-020 posture provides the security baseline without Cloudflare).

## File List

**Subtasks 1-2 (already delivered) — see preserved blocks below.**

**Subtask 6 (DONE 2026-05-01):**

- `apps/api/src/services/alerting/telegram-channel.ts` — **created** (sendCriticalTelegramAlert + formatAlertMessage)
- `apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — **created** (10 tests)
- `apps/api/src/services/alert.service.ts` — **modified** (import + queueAlert wires CRITICAL → Telegram fire-and-forget)
- `.env.example` — **modified** (TELEGRAM_BOT_TOKEN + TELEGRAM_OPERATOR_CHAT_ID with setup recipe)
- `docs/emergency-recovery-runbook.md` — **modified** (§1.7 credentials table + new §1.8 alert routing matrix)
- `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` — **modified** (Subtask 6 marked done, AC table updated, Change Log entry, this File List)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — **modified** (9-9 comment refreshed with AC#6 close-out)

**Subtasks 3-5, 7, 9 (forward-planned) — expected created/modified:**

- `docs/port-audit-2026-04-XX.md` — new (Subtask 3)
- `docs/ssh-activity-baseline-week-1-…-2026-05-XX.md` — new x4 (Subtask 9)
- `docs/ssh-activity-baseline-2026-05-XX.md` — new (Subtask 9 synthesis)
- `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` — new (Subtask 4)
- `apps/api/scripts/backup-to-s3.sh` (or current daily-backup script) — modified (Subtask 5)
- `docs/infrastructure-cicd-playbook.md` — modified (Part 9 backup encryption recipe)
- `docs/emergency-recovery-runbook.md` — modified (§1.4 logs, §6.1 quarterly drill expansion for backup-restore + activity-baseline)
- `_bmad-output/planning-artifacts/epics.md` — **NO modification** (FRC table item #5 was reassigned from alerting to backup encryption on 2026-04-27 — predates AC#6 work. AC#6 does NOT close any FRC item; the prior story plan to flip the table is obsolete.)

**Subtask 10 (Cloudflare, domain-gated) — see original 2026-04-12 task plan preserved in Dev Notes below.**

### File List — Tailscale Hardening Subtask (2026-04-23)

**VPS-side state changes (not committed to repo — infrastructure configuration):**

- `/etc/ssh/sshd_config` — three directives enforced (see Change Log entry above)
- `/etc/ssh/sshd_config.d/50-cloud-init.conf` — `PasswordAuthentication yes` → `no`
- `/etc/ssh/sshd_config.d/60-cloudimg-settings.conf` — verified already `no`
- `/root/.ssh/authorized_keys` — appended 2nd line (`awwallawal@gmail.com` public key)
- `/usr/lib/systemd/system/tailscaled.service` — installed + enabled via `curl -fsSL https://tailscale.com/install.sh | sh`
- `/usr/lib/systemd/system/fail2ban.service` — installed + enabled via `apt install -y fail2ban`
- DO Cloud Firewall "OSLRS" — SSH rule source: `100.64.0.0/10` (CGNAT) — **amended 2026-04-25 to dual-source `0.0.0.0/0` + `100.64.0.0/10`** per ADR-020 V8.2-a1
- DO droplet Tailscale hostname: `oslsr-home-app` (IP `100.93.100.28`)

**Laptop-side state changes (not committed to repo — local workstation configuration):**

- `C:\Users\DELL\.ssh\config` — new file with `oslsr-home-app` host definition, `IdentityFile ~/.ssh/id_ed25519`, `IdentitiesOnly yes`
- Tailscale Windows client installed + signed in to `lawalkolade@gmail.com`

**Repo files created:**

- `docs/emergency-recovery-runbook.md` — 8-section runbook + panic-start block + quarterly drill procedure (subsequently amended 2026-04-25 §1.1 + §1.4 + §2.2 + §6.1 with dual-source firewall + DOTTY-as-Console-mechanism)

**Follow-up items flagged for later (some now resolved by 2026-04-25 OS upgrade or by ADR-020 V8.2-a1):**

- Remove `github_actions_deploy` private key from laptop (should exist only in GitHub Secrets — hygiene)
- Take DO droplet snapshot named `tailscale-hardening-complete-2026-04-23` (runbook §6.1 item 1) — **superseded** by 2026-04-25 snapshots `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`
- Reset + save VPS root password to password manager (runbook §6.1 item 3)
- ~~Apply 51 pending OS updates + kernel 6.8.0-90 → 6.8.0-110 reboot (separate Story 9-9 subtask)~~ — **done 2026-04-25** (49 packages including kernel; see OS Upgrade Subtask File List below)
- ~~PM2 restart counter 916+ over 89 days — separate Story 9-10 investigation~~ — **observation window opened 2026-04-25** when reboot reset PM2 ↺ to 0; Story 9-10 takes it from here
- Self-hosted GitHub Actions runner inside tailnet → would allow re-narrowing firewall back to `100.64.0.0/10` + DO IPs (per ADR-020 V8.2-a1 §"DO Console Access Vector" trade-off matrix)

### File List — OS Upgrade Subtask (2026-04-25)

**VPS-side state changes:**

- Ubuntu 24.04.3 → 24.04.4 (49 packages upgraded including `systemd`, `apparmor`, `snapd`, `cloud-init`, `nodejs`, `openssh-server`)
- Kernel 6.8.0-90 → 6.8.0-110
- Reboot 08:54:37 UTC; uptime counter reset
- PM2 ↺ counter reset 916+ → 0 (Story 9-10 observability baseline)
- All Docker containers up post-reboot (`oslsr-redis`, `oslsr-postgres`, `portainer`); restart policy = `unless-stopped` confirmed pre-reboot
- `pm2 oslsr-api` online post-reboot (PM2 startup hook `pm2-root.service` + `pm2 save` confirmed pre-reboot)
- `tailscaled.service` enabled-on-boot confirmed pre-reboot
- HTTPS health endpoint 200 with full sec2-3 CSP confirmed post-reboot
- `fail2ban.service` + sshd jail active post-reboot

**Pre-flight verification (mandatory for every monthly reboot, per runbook §6.1):**

- `systemctl is-enabled tailscaled.service` → enabled
- `systemctl status pm2-root.service` → active
- `pm2 save` (idempotent — re-saves current process list to `~/.pm2/dump.pm2`)
- `docker inspect <container> --format '{{.HostConfig.RestartPolicy.Name}}'` → `unless-stopped` for all containers
- `cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf | grep -E '^(PasswordAuth|PermitRoot|PubkeyAuth)'` → consistent across files
- DO snapshot taken before `apt-get dist-upgrade` (`pre-os-upgrade-2026-04-25`)

**DO snapshots taken (retained for 30 days per DO default):**

- `pre-os-upgrade-2026-04-25` — pre-upgrade rollback point
- `clean-os-update-2026-04-25` — post-upgrade clean baseline

**Repo files modified:**

- `docs/emergency-recovery-runbook.md` — §1.1 (current state) + §1.4 (firewall + fail2ban semantics) + §2.2 (Console access path) + §6.1 (quarterly drill expanded with monthly-reboot pre-flight checklist) — all updated 2026-04-25 to reflect dual-source firewall + DOTTY architectural correction

## Dev Notes

### Why this story exists

During Story 9-8's dev-story session (2026-04-12), Awwal asked three questions:
1. "Does the site need more security work before field deployment?"
2. "How do you grade the security?"
3. "Can we push to the field?"

The answers (B+ overall grade, field-ready NOW with caveats, with infrastructure gaps that can be closed incrementally) warranted a dedicated story. SCP-2026-04-22 expanded that story's scope after the 2026-04-20 brute-force incident.

### As-deployed primary access control

Per ADR-020 V8.2-a1 (architecture.md), the **primary SSH access control is sshd-level key-only authentication**, not the network firewall. The firewall is dual-source `0.0.0.0/0` + `100.64.0.0/10` (defence-in-depth + DDoS attenuation only). This is a deliberate trade-off — see ADR-020 §"DO Console Access Vector" for the rationale and the future re-narrowing options. **AC#1 and AC#2 are done under this posture.**

### Pre-implementation: p95 false-alert fix (2026-04-12)

**Problem:** Production health-digest emails fired `api_p95_latency Critical 631` every 30 minutes. The VPS is low-traffic — fewer than 50 requests between digest intervals. A single slow request (cold PM2 restart, first DB connection, or SSR hydration probe) pushed p95 to 631ms with only ~20 samples in the rolling buffer. Statistically, p95 of 20 samples is noise, not signal.

**Fix:** `apps/api/src/middleware/metrics.ts` — `MIN_SAMPLES_FOR_P95 = 50`. Below this threshold `getP95Latency()` returns 0 (no alert). Above it, the existing rolling-buffer p95 calculation runs as before.

**Why this matters for 9-9:** AC#6 builds on the health-digest system. If the alerting baseline cries wolf every 30 minutes, the new push channel inherits the noise — exactly the alert-fatigue anti-pattern. The 50-sample minimum makes sure the alerts that DO fire are real.

**Files changed:**
- `apps/api/src/middleware/metrics.ts` — `MIN_SAMPLES_FOR_P95` threshold + test helpers
- `apps/api/src/middleware/__tests__/metrics.test.ts` — 7 tests (new file)
- `packages/config/package.json` — added `zod` dependency
- `pnpm-lock.yaml` — lockfile update

### Original Field-Readiness Assessment (2026-04-12)

> **PRESERVED FROM ORIGINAL STORY** — this assessment underpinned the 2026-04-23 + 2026-04-25 deployments. The Cloudflare-as-2-problems-solved insight remains correct for AC#10 when domain lands.

**Current Grade: B+** (assessed after Stories sec2-1 through sec2-4 + 9-7 + 9-8). Code-level security is genuinely strong (A-); gaps were infrastructure (B-) and operational (C+). 25+ security stories/fixes across 9 epics.

**Field-Readiness Assessment: READY** — Site was field-ready for current use case (Oyo State labour & skills registry, government staff + registered enumerators). Rationale:

1. Attack surface bounded — no payment processing, PII limited to NIN/name/phone, credentialed user base (not open internet)
2. Code-level security comprehensive — RBAC + JWT + Zod + CORS + rate limiting + CSP + fraud detection
3. Remaining gaps about SCALE not BASELINE — WAF/DDoS matter when you're a target
4. Recovery is fast — CSP rollback in 2 min, nginx backup-restore automatic, DO snapshots
5. CSP Report-Only IS field monitoring — `/api/v1/csp-report` collects real signal
6. VPS headroom — 26% RAM as of 2026-03-03

**The "Cloudflare solves two problems at once" insight (preserved for AC#10):**

| Gap | Without Cloudflare | With Cloudflare (free tier) |
|---|---|---|
| WAF | nginx exposes Express directly; SQL injection / XSS / path traversal in URL params reach the app (Zod catches most but not all) | CF's managed WAF rules filter OWASP Top 10 attack patterns at the edge before traffic hits the VPS |
| DDoS | Rate limiting exists per-endpoint but a volumetric L3/L4 flood saturates the 2GB VPS's bandwidth | CF absorbs volumetric traffic at their edge; only clean requests reach the VPS. "Under Attack Mode" adds a JS challenge during active attacks |
| CDN | All static assets served from the single VPS in DigitalOcean's datacenter | CF caches static assets at 300+ edge locations globally; reduces VPS bandwidth and improves LCP for geographically distant users |
| Bot detection | None | CF's Bot Fight Mode identifies and challenges automated traffic |
| Analytics | None beyond PM2 logs | CF dashboard shows request volume, bandwidth, threat map, cached vs uncached ratio |
| Cost | $0 | $0 (free tier) |
| Time to implement | N/A | 30-60 minutes (DNS change + dashboard config) |

**The only gotcha:** Let's Encrypt cert renewal through Cloudflare requires either a Page Rule to bypass CF cache on `.well-known/acme-challenge/` OR switching certbot from HTTP-01 to DNS-01 challenge (using CF's DNS API token). AC#10 Subtask 10.2 covers this when domain lands.

**Why "B+" in practice:** The grade is relative to the site's threat model, not an abstract security standard:
- Government labour registry — not financial / healthcare / defense; PII is sensitive but not high-value
- User base is credentialed — public users self-register but access is limited
- "A-" code security: an attacker past infrastructure faces 5+ independent code-level defenses; chaining bypasses is a high bar
- "C+" operational: the real risk isn't that an attacker gets in, but that we **don't notice** for hours/days. AC#6 (alerting) addresses this.

### References

- Security Hardening Phase 2 (2026-04-04): sec2-1 through sec2-4 in sprint-status.yaml
- Story 9-7 (done 2026-04-11): nginx headers + TLS hardening, code review 11 findings all resolved
- Story 9-8 (in-progress): CSP nginx mirror, parity test, Report-Only deployed
- Pre-field security sweep (2026-04-06): `security-sweep-pre-field-2026-04-06` in sprint-status.yaml
- Architecture ADR-020 V8.2-a1: `_bmad-output/planning-artifacts/architecture.md` §ADR-020 + §"DO Console Access Vector"
- Architecture Decision 2.7: `architecture.md` §"Authentication & Security" Decision 2.7
- PRD V8.3 NFR9: `_bmad-output/planning-artifacts/prd.md` §NFR9 (rewritten 2026-04-25 to align with as-deployed dual-source firewall)
- Emergency recovery runbook: `docs/emergency-recovery-runbook.md`
- Infrastructure playbook: `docs/infrastructure-cicd-playbook.md` (Parts 1-6, to be extended with Parts 7-9)
- Project memory: VPS credentials (`project_vps_credentials.md`), backup storage (`project_backup_storage.md`), db:push:force data loss lesson (`feedback_db_push_force.md`)

## Dev Agent Record

### Agent Model Used

_(Populated when each subtask enters dev.)_

### Debug Log References

_(Populated during implementation.)_

### Completion Notes List

_(Populated during implementation.)_

### Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-04-12 | Story created as backlog with full security posture assessment + 6 tasks (2 P0 + 1 P1 + 2 P2 + 1 traceability). Field-readiness assessment: READY with Cloudflare recommended within first week. | Capture 9-8 session security assessment so no nuance is lost when resources become available |
| 2026-04-12 | **Pre-implementation fix: p95 latency false-alert suppression.** `apps/api/src/middleware/metrics.ts` — added `MIN_SAMPLES_FOR_P95 = 50` threshold. `getP95Latency()` now returns 0 when sample count < 50, preventing a single slow request on the low-traffic VPS from triggering Critical health-digest alerts (was: stuck at 631ms). Added `resetLatencyBuffer()` + `recordLatencySample()` test helpers. New `apps/api/src/middleware/__tests__/metrics.test.ts` — 7 tests covering zero/below-threshold/at-threshold/outlier/exact-production-scenario cases. | Production health-digest emails fired repeated `api_p95_latency Critical 631` alerts every 30 min. Root cause: on a low-traffic VPS, a single slow request (cold start or DB connection init) dominates the p95 with < 20 samples in the rolling buffer. The 50-sample minimum makes the statistic meaningful before it can trigger alerts. Directly addresses the C+ operational security grade — false-positive alert fatigue erodes trust in the monitoring system. |
| 2026-04-12 | **Bugfix: added missing `zod` dependency to `@oslsr/config` package.** `packages/config/package.json` + `pnpm-lock.yaml` updated. | Runtime import error when `@oslsr/config` consumers used zod schemas — dependency was consumed but not declared in the package's own `package.json`. |
| 2026-04-23 | **Subtask COMPLETE — Tailscale + SSH hardening (P0, per SCP 2026-04-22 scope expansion).** Tailscale installed on VPS (`oslsr-home-app` @ `100.93.100.28`) + laptop (`desktop-qe4lplq` @ `100.113.78.101`) under `lawalkolade@gmail.com` Free tier. Personal `id_ed25519` public key appended to `/root/.ssh/authorized_keys` (2 lines total: `github-actions-deploy` + `awwallawal@gmail.com`). Laptop `~/.ssh/config` created with `IdentitiesOnly yes` directive. `sshd_config` main + both drop-ins (`50-cloud-init.conf`, `60-cloudimg-settings.conf`) consistently set to `PasswordAuthentication no` + `PermitRootLogin prohibit-password` + `PubkeyAuthentication yes`. DO Cloud Firewall "OSLRS" SSH rule source narrowed from `0.0.0.0/0` + `::/0` to `100.64.0.0/10` (Tailscale CGNAT range only). fail2ban installed + enabled (default config: maxretry 5, bantime 10m, jail:sshd). Verified: (1) public-IP SSH → `Connection timed out` (2) key-disabled SSH → `Permission denied (publickey)` (3) Tailscale SSH → immediate login no password prompt. Emergency recovery runbook authored at `docs/emergency-recovery-runbook.md` (8 sections + panic-start block + quarterly drill). DO Web Console timed out on current ISP — confirmed as ISP WebSocket filtering issue, not VPS-side (both `serial-getty@ttyS0.service` and `droplet-agent.service` verified active). Alternative break-glass paths documented: DO Recovery Console + DO Snapshot + DO Support ticket. | Monday 2026-04-20 11:04 UTC brute-force attack from 14+ distributed IPs (`2.57.122.x`, `144.31.234.20`, `92.118.39.x`, `45.227.254.170`, `172.93.100.236`, `43.128.106.113`, `118.194.234.8`, `103.189.235.33`, `213.209.159.231`, `2.57.121.25`, `45.148.10.50`, `64.89.160.135`) hammering port 22 trying `root`, `ubuntu`, `oyotradeministry`, `test`, `user`, `hadi`, `amssys` drove CPU to 100% + Memory to 82% — monitoring alert fired as designed (Story 6-2), but detection-to-response was 19 hours. Pre-existing Story 9-9 backlog task (Cloudflare-only) didn't cover SSH surface; SCP 2026-04-22 expanded scope to include Tailscale + OS patching + port audit + app-layer rate-limit audit + backup encryption + alerting tier + logrotate + second super-admin + activity baseline + Cloudflare (domain-gated). This entry records completion of the P0 subtask; remaining 9 subtasks deferred to Bob's formal Story 9-9 regeneration after SCP-driven PRD/Architecture/UX amendments. |
| 2026-04-25 | **Subtask COMPLETE — OS patching baseline (P0).** Ubuntu 24.04.3 → 24.04.4; kernel 6.8.0-90 → 6.8.0-110; 49 packages upgraded including `systemd`, `apparmor`, `snapd`, `cloud-init`, `nodejs`, `openssh-server`. Pre-flight verified before reboot: `tailscaled` enabled-on-boot, PM2 startup hook (`pm2-root.service` via systemd) registered + `pm2 save` executed, Docker `restart: unless-stopped`. Reboot at 08:54:37 UTC. Post-reboot all services up; HTTPS health 200 with full sec2-3 CSP. Two snapshots taken: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`. PM2 ↺ counter reset 916+ → 0 establishes baseline for Story 9-10 restart-loop investigation observability window. | OS update backlog had grown to 51 packages including kernel during the run-up to field survey. The existing C+ operational grade flagged "no patching cadence" as a real risk; doing this subtask before AC#6 alerting establishes a clean baseline for the new alert thresholds. The PM2 ↺ reset is the deliberate side-effect — Story 9-10's restart-loop investigation needs a known-zero starting point. |
| 2026-04-25 | **Architectural finding — DO Console is SSH-based.** Empirical discovery during 2026-04-23 → 2026-04-25 Console outage investigation: when the SSH firewall was `100.64.0.0/10`-only (per original 2026-04-23 deployment), DO Console timed out. journalctl evidence on `oslsr-home-app` revealed `droplet-agent` (DOTTY) connects via SSH from DO infrastructure IP ranges (e.g. `162.243.0.0/16`). When firewall was widened to dual-source `0.0.0.0/0` + `100.64.0.0/10`, Console immediately worked. **The original 2026-04-23 ISP/WebSocket-filtering hypothesis was wrong.** Architecture ADR-020 amended (V8.2-a1) with new §"DO Console Access Vector" subsection capturing the correction; runbook §1.1, §1.4, §2.2, §6.1 all updated; PRD V8.3 NFR9 + Operator Access bullet rewritten. Firewall is now defence-in-depth + DDoS attenuation; sshd-level key-only auth is the primary access control; fail2ban is load-bearing second-line defence. **This is the as-deployed posture going into Story 9-9 forward subtasks.** | Ensures future engineers understand the wide-open SSH firewall as a load-bearing decision (not laziness). Critical for AC#3 (port audit) interpretation, AC#4 (auth rate-limit audit) threat model, AC#9 (activity baseline) source-IP categorisation, and AC#10 (Cloudflare) future re-narrowing decisions. |
| 2026-04-25 | **Story regenerated by Bob (SM) per SCP-2026-04-22 §A.5.** Original 6-AC Cloudflare-only structure refactored to 10-subtask expanded scope (8 remaining + 2 done). All preceding Change Log entries preserved verbatim. File List "Tailscale Hardening Subtask (2026-04-23)" preserved verbatim; new File List block added for "OS Upgrade Subtask (2026-04-25)". Original 2026-04-12 Field-Readiness Assessment preserved as Dev Notes subsection (the B+ assessment + Cloudflare-as-2-problems-solved insight are institutional knowledge). Status: `backlog → in-progress`. | A.5 special-handling instruction: do NOT delete or rewrite the Change Log; ADD new entries for the regenerated structure. Preservation discipline ensures the Tailscale + OS-upgrade subtask evidence remains the canonical record. |
| 2026-05-01 | **Status-discipline pass + AC#10 stale-qualifier cleanup.** AC#10 heading "(DOMAIN-GATED)" → "(DONE 2026-04-27)" with full Cloudflare deployment evidence + commit hashes (`4c2d909`, `bf98931`, `1383373`). AC#11 baseline updated 4,191 → 4,193 (Story 9-8 Task 7.1 added 2 tests). Self-hosted GH Actions runner re-narrowing follow-up flagged as separate SM-authored story (recommend Story 9-14). | BMAD methodology hygiene — keep status documents accurately reflect as-shipped state. Stale qualifiers misdirect future operators. |
| 2026-05-01 | **Second-pass retrospective audit (operator-initiated 2026-05-01 evening)** — operator pasted my own earlier Story 9-9 + 9-10 review back as a verification check, surfacing 5 Story 9-9 items that slipped through the first status-discipline pass. **Auto-fixed 3 items + resolved 1 false-alarm + tracked 2 as `[Pending-SM]`**: M3 (9-8 dependency overstated wording softened), L2 (AC#9 4-week passive baseline acknowledged as long-pole — closure cannot precede ~2026-05-23 unless split into 9-9c), M4 (PRD V8.3 vs V8.2 reference verified — PRD is V8.3, memory was stale, no change needed). Tracked as `[Pending-SM]` (cannot ad-hoc create stories per `feedback_canonical_create_story_workflow.md`): H1 (split into 9-9a done + 9-9b backlog), H3 (author Story 9-14 self-hosted GH Actions runner). All 5 items now visible in Review Follow-ups (AI) section above. | Genuine "session closed" requires honest accounting; the earlier "all done" claim was premature. This entry brings 9-9 to documented-state-aligned status with explicit SM blockers visible. |
| 2026-05-01 | **Retrospective adversarial code review of AC#6** — surfaced 9 findings (1 HIGH F1 / 4 MEDIUM F2-F4-F10 + F3 / 4 LOW F5-F9). HIGH F1 (FRC framing factually wrong throughout) auto-fixed across 6 sites including production code JSDoc, runbook §1.8 header, sprint-status.yaml comment, and 6 places in this story file. MEDIUM F2 (Invalid Date handling) auto-fixed with defensive isNaN check + new test. MEDIUM F4/F10 (no integration test for telegram wiring) auto-fixed with new alert.service.ts test verifying critical-fires-telegram + resolved-does-not-fire. MEDIUM F3 (chat_id leak risk in error logs) downgraded to LOW backlog (theoretical risk only). LOWs F5/F6/F7/F9 documented as backlog in Review Follow-ups (AI). LOW F8 (Task 6.7 unchecked despite live verification) auto-fixed. Per `feedback_review_before_commit.md`, code review should run BEFORE commit on the uncommitted tree — AC#6 was committed without that step (`9d4081b`); this entry corrects the process violation retrospectively. **Process lesson: any future AC implementation runs `/code-review` workflow on the uncommitted tree before `git commit`, not after.** | Closes the AC#6 ship-without-review gap. The FRC framing error was the most significant find — would have propagated as institutional knowledge if not caught. The pre-commit code review discipline that was already established for other stories now formally applies to security work too. |
| 2026-05-01 | **AC#6 FRC framing CORRECTION** (retrospective discovery from same-day code review). The two preceding Change Log entries — "Subtask 6 COMPLETE" (4f430bc-era story update) and "AC#6 live-verification" — both claim `FRC item #5 closed/satisfied`. **This is factually wrong.** FRC item #5 was reassigned from "alerting tier with push channel" to "Backup AES-256 client-side encryption + restore drill" on 2026-04-27 per the cost-aware roadmap revision recorded in `_bmad-output/planning-artifacts/epics.md:235,243,248-249`. AC#6 implementation does NOT close any FRC item; it ships as a zero-cost above-and-beyond improvement on top of the existing email-attentive workflow. Correction propagated to: production code JSDoc (telegram-channel.ts:4), runbook §1.8 header, sprint-status.yaml comment, story Subtask Status Matrix + Field Readiness Certificate Impact + AC text + Priority Map + Subtask 6 header + 6.9 task, and File List. Historical Change Log entries below this correction are preserved verbatim per Bob (SM)'s A.5 preservation discipline — the truth lives in this correction. | Avoid propagating a false claim into institutional knowledge. AC#6 remains a real improvement (closes the 19-hour 2026-04-20 detection-to-response gap), it is just NOT field-blocking — the framing matters for sequencing decisions about what must ship before field survey vs what ships during. |
| 2026-05-01 | **CI Node 24 final cleanup — bumps 2 actions with stable Node 24 tags.** `actions/github-script@v7` → `@v9` (Node 24 since v8) + `treosh/lighthouse-ci-action@v11` → `@v12` (Node 24). Both used only in the lighthouse job. Caveat: github-script v9 had ESM/breaking changes (new getOctokit factory pattern) — our inline script uses `github.rest.issues.createComment(...)` which may need a tweak. CI run will surface any issue. If lighthouse comment-posting fails, deploy still proceeds (lighthouse is post-test summary, not gate). | Closes the LAST 2 Node 20 deprecation warning sources (only present on lighthouse job). After this commit, expect zero Node 20 deprecation annotations across all CI runs. |
| 2026-05-01 | **CI Node 24 SHA-pin closure.** Replaced `actions/upload-artifact@v5`, `actions/download-artifact@v5`, `pnpm/action-setup@v4` with full-SHA pins to current `main` branch commits where each action declares `using: node24` in its action.yml. Pinned SHAs: upload-artifact `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, download-artifact `484a0b528fb4d7bd804637ccb632e47a0e638317`, pnpm/action-setup `26f6d4f2c533a43e6b5da0b4a5dd983f98f7b49a`. Removed `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env var from both ci-cd.yml + e2e.yml — no longer needed because all action declarations are now Node 24. Bonus: SHA-pinning is GitHub's recommended security best practice (avoids supply-chain attacks via tag mutation). Pin comments document re-evaluation trigger (when each action publishes a tagged Node 24 release, likely v6.x line). Single atomic commit. | Closes the deprecation warning eliminate-everything-today path. The earlier env-var bridge was a bridge — the SHA pins are the destination. |
| 2026-05-01 | **AC#6 live-verification.** Operator SSH'd to VPS via Tailscale, set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` in `/root/oslrs/.env`, ran `pm2 restart oslsr-api --update-env`, executed heartbeat curl. Telegram API returned `{"ok":true, "message_id":4, ...}` at 2026-05-01 10:26:45 UTC. Phone vibration confirmed end-to-end. **FRC item #5 is now field-verified, not just code-complete.** Bot `@oslsr_alerts_bot`. Token + chat_id stored in operator's password manager + VPS `.env` only — never in repo. Raw API response captured in (gitignored) `ssh_analysis.txt`. | Validates the channel layer in production, completing the runtime side of AC#6 that the same-day code commit could not prove on its own. |
| 2026-05-01 | **Subtask 6 COMPLETE — Telegram push channel for CRITICAL alerts (AC#6, FRC item #5).** Created `apps/api/src/services/alerting/telegram-channel.ts` (sendCriticalTelegramAlert) with 10-test coverage (`__tests__/telegram-channel.test.ts` — payload shape, escalation context, missing-token skip, missing-chat-id skip, NODE_ENV=test skip, VITEST skip, network-error swallow, non-2xx-response swallow, queue_waiting metric key with colon). Wired into `apps/api/src/services/alert.service.ts` `queueAlert()` — fires on every state transition into `critical`, fire-and-forget, inherits per-metric 5-min cooldown + 3/hour rate limit from upstream `queueAlertWithCooldown` caller. Resolved transitions deliberately do NOT ping Telegram. Email digest preserved per its own 30-min cooldown for full audit trail. Operator validated transport end-to-end via curl heartbeat from VPS before any code shipped (phone vibrated within 1-3 sec). `.env.example` extended with `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` (with full setup recipe + curl verification snippet). Runbook `docs/emergency-recovery-runbook.md` §1.7 credentials table + new §1.8 alert routing matrix (channels in use, severity → channel matrix, CRITICAL thresholds reference, quarterly drill, operator-changes-phone procedure, bot-token-leak rotation). Tests: 10/10 new + 10/10 existing alert.service unchanged + full API suite 1,833 passed + 7 skipped (1,840 total — +10 net from telegram tests, zero regressions). | **FRC item #5 closed** — field-readiness-blocking alerting tier delivered. The 2026-04-20 incident's 19-hour detection-to-response gap is now closed at the channel level. CRITICAL alerts → operator's phone vibrates in 1-3 seconds. fail2ban + CSP-violation-rate alert sources deferred as follow-up (require new metric collectors not yet in place). FRC table flip in `epics.md` deferred to next SM sprint-planning pass to keep canonical authoring flow. |
