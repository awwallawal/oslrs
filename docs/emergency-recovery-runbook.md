# OSLRS VPS — Emergency Recovery Runbook

**Owner:** Awwal (lawalkolade@gmail.com)
**System:** `oslsr-home-app` — DigitalOcean droplet, Ubuntu 24.04.3 LTS, Ibadan/Oyo State Labour & Skills Registry production
**Last updated:** 2026-04-23
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
| **DO Recovery Console** | ✅ Available | Separate feature from regular Console. Boots recovery OS. |
| **DO Droplet Snapshot** | ⚠️ Not yet taken | **TODO:** Take snapshot before field survey begins. See §6.1. |
| **Public IP SSH** | ❌ Disabled | Firewall blocks; sshd disallows password auth. Intentional. |

### 1.2 Machines on Tailscale tailnet

| Device name | Tailscale IP | OS | Role |
|---|---|---|---|
| `oslsr-home-app` | `100.93.100.28` | Ubuntu 24.04 | The VPS (production) |
| `desktop-qe4lplq` | `100.113.78.101` | Windows 11 | Awwal's laptop |

Add phone + secondary laptop later for redundancy.

### 1.3 SSH configuration

**On laptop (`C:\Users\DELL\.ssh\`):**

- `id_ed25519` / `id_ed25519.pub` — Awwal's personal key (created 2026-01-19)
- `github_actions_deploy` / `.pub` — CI deploy key (also in GitHub Secrets; **clean up laptop copy** as a follow-up hygiene task)
- `config` — maps `oslsr-home-app` to `id_ed25519` via `IdentitiesOnly yes`
- `known_hosts` — cached fingerprints

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

- **fail2ban** — installed, active, watching sshd journal (default config: maxretry 5, bantime 10m)
- **DO Cloud Firewall "OSLRS"** — SSH restricted to `100.64.0.0/10`; other ports per app needs
- **Helmet CSP** on app layer — full sec2-3 CSP enforcing on 200 responses

### 1.5 Key accounts & contacts

| Account | Auth method | Notes |
|---|---|---|
| DigitalOcean | `lawalkolade@gmail.com` + Google SSO + TOTP 2FA | Droplet owner. Set up 2FA if not already. |
| Tailscale | `lawalkolade@gmail.com` + Google SSO | Free Personal tier. Admin console: `https://login.tailscale.com/admin/machines`. |
| GitHub | personal account | Owns `github_actions_deploy` private key in Secrets. |
| Resend | lawalkolade@gmail.com | Transactional email sender. |
| Cloudflare | (not yet enrolled) | Pending `oslrs.com` domain purchase. |

### 1.6 Critical credentials — where stored

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

## 6. Outstanding action items (as of 2026-04-23)

### 6.1 Immediate (this week)

- [ ] **Take a DO droplet snapshot** — first one. Sets the baseline for restore-based recovery. Repeat weekly during field survey.
- [ ] **Verify DO Web Console** works from at least one network/browser combo (try mobile hotspot). If confirmed broken, document and rely on Recovery Console + Snapshot as primary break-glass.
- [ ] **Set/reset VPS root password** via DO → Access → Reset root password. Save to password manager. Needed for Console access.

### 6.2 Short-term (next 2 weeks, part of Story 9-9 subtasks)

- [ ] Clean up `github_actions_deploy` private key from laptop (keep in GitHub Secrets only)
- [ ] Add phone to Tailscale tailnet (Tailscale SSH iOS/Android app) — secondary access device
- [ ] Apply 51 pending OS updates + reboot (schedule low-traffic window)
- [ ] Install OS packages: `dbus`, `docker`, `systemd-logind`, `unattended-upgrades` services are all flagged for deferred restart
- [ ] Configure fail2ban with stricter `jail.local` (optional — `bantime = 1h`, `findtime = 10m`, `maxretry = 3`)
- [ ] Add a second super-admin break-glass account (per Story 9-9 subtask)
- [ ] Enable backup client-side encryption before S3 upload (per Story 9-9 subtask)
- [ ] Port audit: restrict Portainer public access (per Story 9-9 subtask)
- [ ] Alerting tier: SMS/WhatsApp/paged channel for CRITICAL alerts (per Story 9-9 subtask)

### 6.3 Domain-gated (pending `oslrs.com` purchase)

- [ ] Cloudflare WAF + CDN + rate limiting enrollment
- [ ] Domain migration per Story 9-2 + 9-4

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

---

*End of runbook. Print a one-page summary of §0 "Panic Start" and §3 "Common incident scenarios" and keep physically near your workstation during field survey.*
