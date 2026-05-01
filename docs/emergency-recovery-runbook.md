# OSLRS VPS — Emergency Recovery Runbook

**Owner:** Awwal (lawalkolade@gmail.com)
**System:** `oslsr-home-app` — DigitalOcean droplet, Ubuntu 24.04.4 LTS (kernel 6.8.0-110-generic), Ibadan/Oyo State Labour & Skills Registry production
**Last updated:** 2026-04-25
**Review cadence:** Quarterly, and after any infrastructure change

---

## 🚨 If you are reading this in a panic — start here

**Before anything else, try these in order. One of them almost always works.**

1. **SSH via Tailscale** (primary, always try first):

   ```
   ssh root@oslsr-home-app
   ```

2. **SSH via Tailscale IP directly** (if MagicDNS flaky):

   ```
   ssh root@100.93.100.28
   ```

3. **Tailscale daemon restart on laptop** (system tray icon → right-click → Exit, then relaunch from Start menu) — fixes 80% of "Tailscale seems broken" moments.

4. **DO Web Console** — `https://cloud.digitalocean.com/droplets` → click **oslsr-home-app** → **Console**. If it times out, try incognito window or different browser (Chrome ↔ Firefox ↔ Edge). ISP WebSocket filtering is the common cause.

5. **DO Recovery Console** — droplet page → sidebar **Recovery** → **Boot from Recovery ISO**. Always works even when normal Console doesn't. Use this as primary fallback during field survey.

6. **DO Snapshot restore** — if VPS unbootable or catastrophically misconfigured. Loses all data since snapshot; use as last non-support resort.

7. **DO Support ticket** — `https://cloud.digitalocean.com/support`. Response 4–12 hours. Include droplet ID and specific error message.

---

## 1. Current infrastructure state (as of 2026-04-23)

### 1.1 Access paths configured

| Path | Status | How it works |
|---|---|---|
| **Tailscale SSH** (primary) | ✅ Active | Laptop → Tailscale mesh → VPS. Key auth only. Firewall: SSH (TCP 22) reachable from `0.0.0.0/0` + `::/0` AND `100.64.0.0/10` — public reachability is intentional **defence-in-depth shape**, not primary control. Primary control is sshd `PasswordAuthentication no` + key-only + fail2ban. Firewall widened from `100.64.0.0/10`-only to current state on 2026-04-25 to permit GitHub Actions deploys (long-term plan: self-hosted runner inside tailnet, then re-narrow). |
| **DO Web Console** | ✅ Active (post 2026-04-25 firewall widening) | Browser-based terminal. **CRITICAL: Console works by establishing an SSH session from DO's own infrastructure IP ranges to your droplet's port 22.** This means the SSH firewall must permit DO's IP space (currently covered by `0.0.0.0/0`). Earlier "ISP WebSocket filtering" theory was incorrect — Console was failing because the firewall was `100.64.0.0/10`-only and blocked DO's own Console SSH endpoint. If you ever re-narrow the firewall (Story 9-9 follow-up), add DO's published IP ranges (`https://digitalocean.com/geo/google.csv` or DO API) alongside `100.64.0.0/10`, OR accept that Console becomes unavailable as part of the trade-off. |
| **DO Recovery Console** | ✅ Available (verification pending) | Separate feature from regular Console. Boots recovery OS. Likely shares the SSH-port dependency of regular Console (verify in next quarterly drill — runbook §7). |
| **DO Droplet Snapshot** | ✅ 2 in store | `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25` (latter is canonical good-known state). Re-snapshot weekly during field survey, monthly during steady state. |
| **Public IP SSH** | ⚠️ Reachable to sshd, but key-only | Firewall (DO Cloud Firewall "OSLRS") permits SSH from `0.0.0.0/0` + `::/0` + `100.64.0.0/10`. Public reachability is intentional defence-in-depth shape — required for GitHub Actions CI deploys + DO Web Console. **Primary control is sshd-level key-only authentication** (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`). fail2ban is load-bearing second-line defence. Brute-force attempts CANNOT succeed but DO reach sshd and consume nominal CPU; fail2ban bans repeat offenders. Long-term plan: self-hosted GitHub Actions runner inside tailnet, then re-narrow firewall to `100.64.0.0/10` + DO IP ranges only (Story 9-9 follow-up subtask). |

### 1.2 Machines on Tailscale tailnet

| Device name | Tailscale IP | OS | Role |
|---|---|---|---|
| `oslsr-home-app` | `100.93.100.28` | Ubuntu 24.04 | The VPS (production) |
| `desktop-qe4lplq` | `100.113.78.101` | Windows 11 | Awwal's laptop |

Add phone + secondary laptop later for redundancy.

### 1.3 SSH configuration

**On laptop (`C:\Users\DELL\.ssh\`):** clean post-2026-04-25, 5 files

- `id_ed25519` / `id_ed25519.pub` — Awwal's personal key (created 2026-01-19)
- `config` — maps `oslsr-home-app` to `id_ed25519` via `IdentitiesOnly yes`
- `known_hosts` / `known_hosts.old` — cached fingerprints + pre-Tailscale historical entries
- _(Removed 2026-04-25):_ `github_actions_deploy` private+public removed; CI deploy key now lives only in GitHub Secrets (canonical). Quarterly rotation cadence per §4 still applies.
- _(Removed 2026-04-25):_ `config.txt` orphan from Notepad save — only `config` (no extension) is read by SSH.

**On VPS (`/root/.ssh/authorized_keys`):**

- Line 1: `ssh-ed25519 ... github-actions-deploy` — CI deploy key (DO NOT REMOVE; breaks deployments)
- Line 2: `ssh-ed25519 ... awwallawal@gmail.com` — Awwal's personal key

**sshd config state:**

```
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
```

Both `/etc/ssh/sshd_config.d/50-cloud-init.conf` and `60-cloudimg-settings.conf` verified consistent (`PasswordAuthentication no`).

### 1.4 Other security layers

- **fail2ban** — installed, active, watching sshd journal (default config: maxretry 5, bantime 10m). **Load-bearing second-line defence** post-2026-04-25 firewall amendment (no longer nominal insurance — see §1.1 + §2.2 + ADR-020 §"DO Console Access Vector"). Steady-state ban-list non-emptiness is health, not anomaly.
- **DO Cloud Firewall "OSLRS"** — SSH (22/tcp) inbound permitted from **both** `0.0.0.0/0` (+ `::/0`) **and** `100.64.0.0/10` (Tailscale CGNAT). The `0.0.0.0/0` source is intentional and load-bearing — required for GitHub Actions CI deploys (`appleboy/ssh-action`) and DO Web Console (SSH-based via DOTTY/`droplet-agent` from DO infrastructure IPs). Firewall is **defence-in-depth + DDoS attenuation**, not the primary access control. Primary control = sshd-level key-only authentication (see §1.3). Other ports per app needs.
- **Helmet CSP** on app layer — full sec2-3 CSP enforcing on 200 responses

### 1.5 Key accounts & contacts

| Account | Auth method | Notes |
|---|---|---|
| DigitalOcean | `lawalkolade@gmail.com` + Google SSO + TOTP 2FA | Droplet owner. Set up 2FA if not already. |
| Tailscale | `lawalkolade@gmail.com` + Google SSO | Free Personal tier. Admin console: `https://login.tailscale.com/admin/machines`. |
| GitHub | personal account | Owns `github_actions_deploy` private key in Secrets. |
| Resend | lawalkolade@gmail.com | Transactional email sender. **Sending domain `oyoskills.com` swapped 2026-04-26** (was `oyotradeministry.com.ng`); free tier = 1 domain. From: `noreply@oyoskills.com` (DKIM/SPF/DMARC verified). |
| Cloudflare | lawalkolade@gmail.com | Holds `oyoskills.com` DNS zone (purchased 2026-04-26 at Go54). DNS-only mode currently; WAF subtask in Story 9-9. |
| Go54 | lawalkolade@gmail.com | Domain registrar for `oyoskills.com`. |
| ImprovMX | lawalkolade@gmail.com | **Inbound email forwarder** for `oyoskills.com` (5 aliases: info/admin/support/noreply/awwal → Builder Gmail). Chosen over Cloudflare Email Routing 2026-04-26 due to Cloudflare flapping during bootstrap; kept as permanent inbound. |

### 1.6 Project Email Architecture (added 2026-04-26; Resend swap LIVE 2026-04-26)

**3-vendor split (decided 2026-04-26 after Cloudflare flapping during bootstrap):**

```
Registrar: Go54 (oyoskills.com purchased 2026-04-26, ~₦15K/year)
   │
   └── Nameservers: Cloudflare (kia.ns.cloudflare.com, nero.ns.cloudflare.com)
         │
         ├── DNS provider: Cloudflare (FREE tier — DNS only, no proxying yet)
         │     • All records DNS-only (grey-cloud) per email-deliverability constraints
         │     • Phase 3 WAF/proxying deferred to Story 9-9
         │
         ├── INBOUND email: ImprovMX (FREE) — chose over Cloudflare Email Routing
         │     • MX records: mx1.improvmx.com (10) + mx2.improvmx.com (20)
         │     • SPF apex: v=spf1 include:spf.improvmx.com ~all
         │     • 5 aliases all forwarding to Builder's Gmail (~2 min delay observed):
         │         - admin@oyoskills.com    (canonical migration anchor)
         │         - info@oyoskills.com     (public-facing)
         │         - support@oyoskills.com  (user issues)
         │         - awwal@oyoskills.com    (Builder-personal; REMOVED at Transfer Day)
         │         - noreply@oyoskills.com  (catch-all for replies-to-no-reply)
         │
         └── OUTBOUND email: Resend (FREE tier, in budget) — LIVE 2026-04-26
               • Verified domain: oyoskills.com (free tier = 1 domain max)
               • Region: us-east-1 (North Virginia)
               • Custom Return-Path: send.oyoskills.com
               • DNS records on Cloudflare:
                   - MX send → feedback-smtp.us-east-1.amazonses.com
                   - TXT send → v=spf1 include:amazonses.com ~all
                   - TXT resend._domainkey → p=MIGfMA0G... (DKIM)
               • DMARC: v=DMARC1; p=none; rua=mailto:dmarc@oyoskills.com (apex TXT)
               • App transactional From: noreply@oyoskills.com (env: EMAIL_FROM_ADDRESS)
               • Verified live 2026-04-26: dkim=pass / spf=pass / dmarc=pass

Composition: Gmail "Send mail as"
   • Configured with smtp.resend.com:587 + Resend API key as password
   • Lets Builder compose AS info@oyoskills.com from Gmail UI
```

**Canonical migration anchor: `admin@oyoskills.com`.** Every project SaaS account (DigitalOcean, Tailscale, Cloudflare, hCaptcha, GitHub Org, Resend) is registered to `admin@oyoskills.com`. At Transfer Day, ONE change — flipping the **ImprovMX forwarder destination** from Builder Gmail to Ministry-provided email — migrates ALL SaaS account ownership in a single operation. See `docs/account-migration-tracker.md` for the operational sequence.

**Critical pitfalls:**

1. **MX records MUST stay DNS-only (grey-cloud).** Proxying MX records breaks email delivery — Cloudflare cannot proxy SMTP traffic. Both ImprovMX MX (apex) and Resend MX (`send` subdomain) must remain grey-cloud.
2. **Resend DKIM TXT (`resend._domainkey`) MUST stay DNS-only.** TXT records can't be proxied anyway, but worth stating explicitly: changing this record breaks DKIM signing.
3. **SPF: apex covers ImprovMX only; `send` subdomain covers Resend only.** Apex `v=spf1 include:spf.improvmx.com ~all` is for inbound bounces; `send` subdomain `v=spf1 include:amazonses.com ~all` is the actual outbound MAIL FROM. Don't merge them — apex MAIL FROM isn't used for outbound from Resend (uses Custom Return-Path = `send`).
4. **Cloudflare account is load-bearing for DNS only.** Holds the zone, future WAF (Story 9-9). Inbound email is on ImprovMX (separate vendor). **TOTP 2FA mandatory on Cloudflare.** Recovery codes in Builder password manager + sealed envelope to Mrs Lagbaja (Chemiroy MD) for redundancy.
5. **Don't proxy A records before HTTPS at edge is sorted.** Phase 2 of the DO/Domain/Cloudflare wiring is grey-cloud (DNS-only) with origin Let's Encrypt. Phase 3 is Cloudflare proxied with SSL/TLS = Full (strict). Skipping Phase 2 → broken HTTPS or "too many redirects".
6. **Resend free tier = 1 domain max.** When migrating sending domain, must DELETE old before ADDING new (5-min production-impact window mitigated by pre-staging Cloudflare DNS records).

**3-phase deployment plan** (cross-reference: session-2026-04-21-25.md Day 6):

- **Phase 1: Email-only on `oyoskills.com`** — Cloudflare DNS + ImprovMX inbound + Resend outbound. **DONE 2026-04-26.** Independently useful.
- **Phase 2: DNS-Only website (grey cloud)** — A records, expand Let's Encrypt cert to cover both `oyotradeministry.com.ng` + `oyoskills.com`, dual-domain nginx. Stories 9-2 + 9-4 territory.
- **Phase 3: Cloudflare Proxied (orange cloud)** — Story 9-9 Cloudflare WAF subtask. Full (strict) SSL, WAF rules, DDoS attenuation.

### 1.7 Critical credentials — where stored

| Credential | Where stored | DO NOT |
|---|---|---|
| VPS root password | Password manager (Bitwarden/1Password/etc.) | Write in plain-text files, commit to git, share in DMs |
| SSH key passphrase (if set) | Password manager | Reuse on other keys |
| DO account password | Password manager + TOTP app | Share account |
| Tailscale account | = Google account | Disable 2FA |
| Postgres `oslsr_user` password | Password manager + `/root/oslrs/.env` on VPS | Commit to git |
| Redis AUTH password | `/root/oslrs/.env` on VPS | Expose to public internet |
| S3/DO Spaces API keys | `/root/oslrs/.env` on VPS | Commit to git, share outside team |
| JWT secret | `/root/oslrs/.env` on VPS | Expose |
| Telegram bot token (alerting) | Password manager + `/root/oslrs/.env` on VPS as `TELEGRAM_BOT_TOKEN` | Commit to git; if leaked rotate via `/revoke` to @BotFather |

### 1.8 Alert routing matrix (Story 9-9 AC#6 — FRC item #5; live 2026-05-01)

**Channels in use:**

| Channel | Latency | Purpose | Configured via |
|---|---|---|---|
| Email digest | 0-30 min (cooldown gate) | Full audit trail, ALL severities including resolved | `EMAIL_FROM_ADDRESS` + active super_admin records (Builder + break-glass) |
| Telegram push | 1-3 sec | Instant phone notification for **CRITICAL only** | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` env vars on VPS |

**Severity → channel matrix:**

| Metric → state transition | Email digest | Telegram push |
|---|---|---|
| OK → warning | ✅ (next 30-min digest) | ❌ |
| warning → critical (escalation) | ✅ | ✅ instant |
| OK → critical (direct) | ✅ | ✅ instant |
| critical sustained (after 5-min cooldown) | ✅ | ✅ (capped at 3/hour per metric) |
| critical → resolved | ✅ | ❌ (good news doesn't ping) |

**What triggers a CRITICAL alert** (thresholds in `apps/api/src/services/alert.service.ts`):

| Metric | Critical threshold | Why |
|---|---|---|
| `cpu` | >90% | Sustained → service degradation |
| `memory` | >90% | Risk of OOM-killer |
| `disk_free` | <10% (free) | Risk of out-of-disk |
| `api_p95_latency` | >500ms | User-perceptible slowness |
| `db_status` | error | Database unreachable |
| `redis_status` | error | Queue + cache unreachable |
| `queue_waiting:<name>` | >200 | Queue backed up |

The 50-sample minimum on p95 (`MIN_SAMPLES_FOR_P95` in metrics.ts) prevents false alerts on low-traffic windows. fail2ban / CSP-violation-rate alerts are deferred follow-ups (would require new metric collectors).

**Quarterly drill (incorporated into §6.1 quarterly checks):**

1. SSH to VPS via Tailscale (`ssh root@oslsr-home-app`)
2. Send a heartbeat: `curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d "chat_id=$TELEGRAM_OPERATOR_CHAT_ID" -d "text=Heartbeat $(date -u +%FT%TZ)"` (loads vars from `/root/oslrs/.env` — `set -a; source /root/oslrs/.env; set +a` first)
3. Confirm phone vibrates within 3 seconds with the heartbeat message
4. If silent: check (a) bot token still valid (token rotation? leaked?), (b) chat_id still valid (operator changed Telegram account?), (c) phone notifications enabled for the bot conversation, (d) `pnpm logs oslsr-api | grep telegram` for `telegram.api_error` events

**If operator changes Telegram account or phone:**

1. New phone: install Telegram, sign in with same account → notifications resume automatically (no env change needed)
2. New Telegram account: get new chat_id via @userinfobot, update `TELEGRAM_OPERATOR_CHAT_ID` in `/root/oslrs/.env`, run `pm2 restart oslsr-api --update-env`

**If Telegram bot is compromised** (token leaked):

1. In Telegram, message @BotFather: send `/revoke` → select your bot → confirm
2. BotFather replies with a NEW token; old token immediately invalid
3. Update `TELEGRAM_BOT_TOKEN` in `/root/oslrs/.env`; run `pm2 restart oslsr-api --update-env`
4. Heartbeat-test per quarterly drill above

---

## 2. Access path details

### 2.1 Tailscale SSH (primary)

**Normal access:**

```powershell
ssh root@oslsr-home-app
```

**If Tailscale shows device offline on laptop:**

- Click Tailscale tray icon → verify "Connected"
- If disconnected, click "Log in"; complete browser SSO
- Run `tailscale status` in PowerShell to confirm both devices online

**If Tailscale shows VPS offline in admin console:**

- Tailscale admin: `https://login.tailscale.com/admin/machines`
- Confirm `oslsr-home-app` is "Connected"
- If offline for >5 min, escalate to DO Console (§2.2) and from the VPS: `sudo systemctl restart tailscaled && sudo tailscale up`

**Verify key auth is actually working:**

```powershell
ssh -o PasswordAuthentication=no root@oslsr-home-app
```

Should log in without any password prompt (passphrase on key is OK).

### 2.2 DO Web Console

**Access:**

- `https://cloud.digitalocean.com/droplets` → click **oslsr-home-app** → **Console** (top-right)
- Login: `root` / VPS root password (from password manager)

**When Console times out:**

**FIRST:** check the SSH firewall rule. DO Console connects via SSH from DO's own infrastructure IP ranges. If the SSH firewall does not permit DO's IPs, Console fails — this looks like a timeout in the browser but is actually a network-layer reject. Confirmed root cause of 2026-04-23 → 2026-04-25 Console outages while firewall was `100.64.0.0/10`-only.

Then:

1. **Verify firewall** — Networking → Firewalls → OSLRS → SSH rule. Sources must include `0.0.0.0/0` (current state) OR an explicit DO IP range list. If you've recently narrowed the rule, that's the cause.
2. Incognito / private browser window (disables extensions + cache; minor cause)
3. Different browser (Chrome ↔ Firefox ↔ Edge)
4. Check DO status: `https://status.digitalocean.com/`
5. If still failing after firewall verified open and ~5 minutes elapsed → use Recovery Console (§2.3) but note Recovery Console may share the same SSH-port dependency; test confirms whether it's a true break-glass alternative

**If VPS in-console services are suspect**, from any working SSH session:

```bash
systemctl status serial-getty@ttyS0.service      # Should be active
systemctl status droplet-agent                   # Should be active
# If either stopped:
sudo systemctl start <service-name>
sudo systemctl enable <service-name>
```

### 2.3 DO Recovery Console

**When to use:** Regular Console broken AND Tailscale SSH broken AND VPS not booting normally.

**Access:**

- Droplet page → sidebar **Recovery** → select **Boot from Recovery ISO** → **Reboot**
- Wait ~2 min for reboot into recovery environment
- Click **Console** — now shows recovery shell
- Mount your disk: `mount /dev/vda1 /mnt` (device name may vary; check `lsblk` first)
- Chroot into system: `mount --bind /dev /mnt/dev && mount --bind /proc /mnt/proc && mount --bind /sys /mnt/sys && chroot /mnt`
- Fix the breakage (edit config, reset password, restore key, etc.)
- Exit chroot, unmount, reboot back to normal: droplet page → **Recovery** → **Boot from Hard Drive** → reboot

### 2.4 Snapshot restore

**When to use:** VPS in a catastrophically broken state, easier to restore than diagnose.

**Trade-off:** Loses all data/config changes since snapshot was taken.

**Process:**

1. Droplet page → **Snapshots** tab
2. Find most recent snapshot → **Restore** → **Restore Droplet**
3. Wait 5–15 min (depending on droplet size)
4. Post-restore tasks:
   - Verify Tailscale re-authorized (may need `sudo tailscale up` again)
   - Run any data-recovery from S3 backups (`backups/daily/*` in DO Spaces)
   - Re-seed pending DB migrations if applicable

### 2.5 DO support ticket

**When to use:** Nothing else works OR confirmed DO-side outage.

**URL:** `https://cloud.digitalocean.com/support`

**Include:**
- Droplet ID (find on droplet page → Overview)
- Specific error message
- What you've already tried
- Urgency classification

**Response:** 4–12 hours for Standard support.

---

## 3. Common incident scenarios

### 3.1 "I can't SSH"

| Symptom | Likely cause | Fix |
|---|---|---|
| `Connection timed out` | Firewall change locked you out; OR Tailscale disconnected | Tailscale tray icon → reconnect. If still blocked → DO Console. If that fails → Recovery Console |
| `Permission denied (publickey)` | Key lost, key not on VPS, or sshd config broke key auth | DO Console → verify `/root/.ssh/authorized_keys` contains your key; check sshd config drop-ins |
| `Connection refused` | sshd not running | DO Console → `sudo systemctl status ssh` → `sudo systemctl start ssh` |
| `Host key verification failed` | VPS host key rotated (shouldn't happen without action) | From laptop: `ssh-keygen -R oslsr-home-app && ssh-keygen -R 100.93.100.28`. Retry. |

### 3.2 "Tailscale not working"

| Symptom | Fix |
|---|---|
| Laptop shows "Disconnected" in tray | Right-click tray → Exit, relaunch from Start menu |
| Laptop shows "Connected" but VPS shows offline | On VPS via Console: `sudo systemctl restart tailscaled && sudo tailscale up` |
| Tailscale admin console shows VPS offline >10 min | DO Console into VPS, restart tailscaled. Last resort: reboot VPS |
| Account locked out of Tailscale | `https://login.tailscale.com/start` — recover via Google account |

### 3.3 "App is down (API returning errors)"

Not strictly an access issue, but common:

```bash
# SSH in via Tailscale
pm2 list                              # Check all processes online
pm2 logs oslsr-api --lines 200        # Recent logs
docker stats --no-stream              # Redis + Postgres healthy?
systemctl status nginx                # nginx up?
curl -sI https://oyotradeministry.com.ng/api/v1/health   # Health endpoint
```

Restart app if needed: `pm2 restart oslsr-api`.

### 3.4 "Suspected security incident"

Stop changing things. Capture state.

```bash
# From SSH
last -a | head -50                       # Recent logins
journalctl --since "24 hours ago" | grep -Ei "Failed|invalid|Accepted" > /tmp/auth.log
sudo fail2ban-client status sshd         # Banned IPs
ss -tlnp                                 # Listening ports
ps auxf                                  # Process tree
docker stats --no-stream                 # Container CPU/mem
```

Email yourself the output files. Then:

1. Take DO snapshot immediately (forensic preservation)
2. Change VPS root password via DO → Access → Reset root password
3. Rotate JWT secret, Postgres password, Redis AUTH, S3 keys (all in `.env`)
4. If breach confirmed: DO support ticket + consider NDPA breach-notification (72-hour clock)

### 3.5 "Lost laptop"

| Action | When |
|---|---|
| Log out of laptop's Tailscale account | Immediately (admin console → Machines → revoke device) |
| Rotate GitHub Actions deploy key | Immediately (keypair also on laptop) |
| Generate new personal SSH key on replacement laptop | Same day |
| Add new public key to VPS `authorized_keys` via DO Console | Same day |
| Revoke old laptop's public key from VPS `authorized_keys` | Same day |
| Change DO account password | Same day (2FA TOTP seed may have been on laptop) |

---

## 4. Regular hygiene tasks

| Task | Cadence | Owner |
|---|---|---|
| Take a fresh DO snapshot | Weekly during field survey; monthly otherwise | Awwal |
| Verify DO Console works (incognito test) | Weekly | Awwal |
| Run fail2ban status to confirm alive | Weekly | Awwal |
| Apply OS updates + reboot | Monthly (per Story 9-9 OS patching subtask) | Awwal |
| Rotate VPS root password | Quarterly | Awwal |
| Review `/root/.ssh/authorized_keys` for orphans | Quarterly | Awwal |
| Test DO Recovery Console bootup (drill) | Quarterly | Awwal |
| Review this runbook for accuracy | Quarterly | Awwal |

---

## 5. Environment facts (keep accurate)

### 5.1 Droplet specs

- **Provider:** DigitalOcean
- **Region:** (populate when confirmed — likely `fra1` or similar)
- **Size:** 2GB RAM, 2 vCPU (baseline tier)
- **Disk:** 47GB SSD
- **OS:** Ubuntu 24.04.3 LTS (Noble Numbat)
- **Public IPv4:** `159.89.146.93`
- **Kernel:** 6.8.0-90 → upgrade pending to 6.8.0-110 (Story 9-9 OS patching subtask)

### 5.2 Services on droplet

- **PM2** — process manager for Node.js `oslsr-api` (port 3000)
- **Nginx** — reverse proxy + TLS termination (ports 80, 443)
- **Postgres** (Docker) — `oslsr-postgres` container, bound to 127.0.0.1
- **Redis** (Docker) — `oslsr-redis` container, bound to 127.0.0.1, AUTH enabled
- **Portainer** (Docker) — management UI (audit exposure in Story 9-9 port-audit subtask)
- **Tailscale** — `tailscaled.service`, peer to laptop
- **fail2ban** — SSH jail active
- **droplet-agent** — DO's DOTTY agent, manages Console integration

### 5.3 Related docs

- **Infrastructure + CI/CD Playbook:** `docs/infrastructure-cicd-playbook.md`
- **Team Context Brief:** `docs/team-context-brief.md`
- **Portable Playbook:** `docs/portable-playbook.md`
- **Security posture:** MEMORY.md "Security Hardening Phase 2" section + Story 9-9 backlog draft
- **Epic 9 / Story 9-9:** `_bmad-output/implementation-artifacts/sprint-status.yaml`
- **Sprint Change Proposal 2026-04-22:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-04-22.md`

---

## 6. Outstanding action items (as of 2026-04-25)

### 6.1 Immediate (closed 2026-04-25)

- [x] **Take a DO droplet snapshot** — done 2026-04-25. Two snapshots: `pre-os-upgrade-2026-04-25` (before OS upgrade) + `clean-os-update-2026-04-25` (post-upgrade canonical good-known state). Re-snapshot weekly during field survey.
- [x] **Verify DO Web Console** — done 2026-04-25. Console initially failed under `100.64.0.0/10`-only firewall (architectural finding: Console is SSH-based via DO infrastructure IPs, not hypervisor-OOB). Console works after firewall widening to include `0.0.0.0/0`. Captured in §1.1 + §2.2 above + Change Log.
- [x] **VPS root password** — explicitly retained 2026-04-25. Initial password set during DO droplet creation is strong; Awwal declined to reset. Password is in his password manager. Quarterly rotation cadence (§4) still applies.
- [x] **Clean up `github_actions_deploy` private key from laptop** — done 2026-04-25. Both private and public removed. Key now lives only in GitHub Secrets (canonical) + on VPS as public key in `authorized_keys` line 1. Confirmed CI deploys still work via two test commits (`096987e` + `1010d64`).

### 6.2 Short-term (Story 9-9 remaining subtasks — 8 of 10 still open)

OS patching ✅ done 2026-04-25 (kernel 6.8.0-90 → 110, 49 packages, reboot clean). Tailscale + SSH hardening ✅ done 2026-04-23.

- [ ] Add phone to Tailscale tailnet (Tailscale SSH iOS/Android app) — secondary access device, single-point-of-failure mitigation
- [ ] Configure fail2ban with stricter `jail.local` (optional — `bantime = 1h`, `findtime = 10m`, `maxretry = 3`)
- [ ] Add a second super-admin break-glass account (per Story 9-9 subtask)
- [ ] Enable backup client-side encryption before S3 upload (per Story 9-9 subtask)
- [ ] Port audit: `ss -tlnp`, restrict Portainer public access (per Story 9-9 subtask)
- [ ] Alerting tier: SMS/WhatsApp/paged channel for CRITICAL alerts (per Story 9-9 subtask)
- [ ] Logrotate for PM2 logs + journalctl retention (per Story 9-9 subtask)
- [ ] SOC-style activity baseline / SSH log differentiation (per Story 9-9 subtask)
- [ ] Self-hosted GitHub Actions runner inside tailnet (Story 9-9 follow-up — would allow re-narrowing firewall to tailnet-only; ADR-020 line 3253)
- [ ] Verify DO Recovery Console works — pending next quarterly drill (suspected to share SSH-port dependency with regular Console; verify in drill)

### 6.3 Domain-gated (pending `oyoskills.com` purchase)

- [ ] Cloudflare WAF + CDN + rate limiting enrollment
- [ ] Domain migration per Story 9-2 + 9-4
- [ ] When firewall is narrowed (after self-hosted runner), DO published IP ranges (`https://digitalocean.com/geo/google.csv`) must be added alongside `100.64.0.0/10` to preserve Console as break-glass

### 6.4 Story 9-10 observation window (opened 2026-04-25 08:54 UTC)

- [ ] Track PM2 ↺ counter at 24h, 48h, 72h post-reboot. Reset baseline = 0. If counter climbs >10/day: ioredis-reconnect-churn pattern likely persists (matches pre-reboot trend of ~10/day over 89 days). If stays at/near 0: pattern was OS-level (likely libc/systemd) and Story 9-10 may close as resolved by Story 9-9 OS-patching subtask.

---

## 7. Drill — run this quarterly

Simulate losing primary access. Goal: prove you can recover in under 30 minutes.

1. Disconnect Tailscale on laptop (right-click tray → Exit)
2. Attempt DO Web Console login — confirm works with password manager credentials
3. From Console: `systemctl status tailscaled` — confirm running
4. From Console: `tailscale status` — confirm both devices listed
5. Reconnect Tailscale on laptop
6. SSH via Tailscale works again
7. (Optional) Boot Recovery Console, look at disk, exit back to normal boot

If any step fails or takes >5 min to figure out, that's a finding — update this runbook with what was learned.

---

## 8. Changelog

| Date | Change | By |
|---|---|---|
| 2026-04-23 | Initial runbook created. Tailscale primary-access setup (Phases 0–6), fail2ban installed, DO Console verified broken on current ISP, runbook authored to cover gap. | Awwal + Claude |
| 2026-04-25 | §1.1 access-paths table updated: SSH firewall widened from `100.64.0.0/10`-only to `0.0.0.0/0` + `100.64.0.0/10`. Driver: GH Actions CI deploys reach VPS over public IP and would be blocked by tailnet-only rule. Architecture clarification: firewall is defence-in-depth; primary control is sshd-level key-only auth + fail2ban. Long-term resolution (Story 9-9 follow-up): self-hosted GH Actions runner inside tailnet; re-narrow firewall when that lands. ADR-020 in `_bmad-output/planning-artifacts/architecture.md` updated to reflect. | Awwal + Claude |
| 2026-04-25 | **Architectural correction:** the earlier "DO Console fails due to ISP/WebSocket filtering" theory was wrong. Empirical finding: Console started working the moment SSH firewall was widened to permit `0.0.0.0/0`. **DO Console is SSH-based** — it establishes an SSH session from DO's own infrastructure IP ranges to the droplet's port 22 and bridges to noVNC. The `100.64.0.0/10`-only firewall was blocking DO's own Console infrastructure. §1.1 + §2.2 updated to reflect actual mechanism + revised recovery troubleshooting order (firewall first, ISP last). Implication for future Story 9-9 self-hosted-runner work: firewall must permit DO published IP ranges in addition to `100.64.0.0/10`, OR accept Console as unavailable. | Awwal + Claude |
| 2026-04-25 (evening) | **Stale-state cleanup pass.** §1.1 access paths table refreshed: DO Droplet Snapshot row updated to reflect 2 snapshots in store (no longer "Not yet taken"); Public IP SSH row corrected — was incorrectly marked "Disabled" but actually firewall permits it intentionally as defence-in-depth shape with sshd-key-only as primary control. §1.3 updated: github_actions_deploy laptop key cleanup completed 2026-04-25 (removed both private+public; canonical now in GitHub Secrets only). Header updated: kernel 6.8.0-110, Last updated 2026-04-25. Bob (SM) had separately updated §1.4 (fail2ban load-bearing language) during A.5 invocation; this entry covers the rest. | Awwal + Claude |

---

*End of runbook. Print a one-page summary of §0 "Panic Start" and §3 "Common incident scenarios" and keep physically near your workstation during field survey.*
