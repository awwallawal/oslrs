# OSLRS Account Migration Tracker

**Owner:** Awwal (currently); Ministry ICT lead post-Transfer
**Created:** 2026-04-25
**Last updated:** 2026-04-26 (refactored for turnkey-package strategy)
**Purpose:** living document tracking the migration of every OSLRS-related account from Builder-controlled ownership to Ministry-owned ownership at Transfer Day per D2 Transfer Protocol.
**Update cadence:** at every account-state change (status, owner, recovery contacts). At minimum, weekly review during Operate phase.
**Final state:** this document, fully populated and signed, becomes **Schedule 1 of the Transfer Protocol** at Transfer Day per D2 §3.1.

---

## Strategy — TURNKEY PACKAGE handover (adopted 2026-04-26)

**Original plan (superseded):** during Operate phase, parallel-migrate each account from Builder personal ownership → Ministry-coordinated ownership. Required Ministry IT to provision Workspace email, GitHub Org, DO account, etc. on Awwal's timeline.

**Why superseded:** Oyo State ICT procurement bureaucracy delays Ministry-side provisioning. Building the migration plan around Ministry IT availability creates dependency that slows the project.

**Adopted strategy:** Builder funds + provisions the few missing project assets (`oyoskills.com` domain, project phone SIM, Cloudflare account on free tier), packages everything as a single turnkey deliverable, and hands the COMPLETE package to Ministry at Transfer Day. Ministry inherits a working system + all credentials. **Out-of-pocket bounded**: well under ₦100K total project lifetime (₦15K/year domain + ₦500 SIM + ~₦5K/mo airtime), recoverable via D2 §6 retainer reimbursement clause.

**Key architectural decision: `admin@oyoskills.com` is the CANONICAL MIGRATION ANCHOR.**

Every project SaaS account (DigitalOcean, Tailscale, Cloudflare, hCaptcha, GitHub Org, Resend, etc.) gets registered to `admin@oyoskills.com` — NOT to `lawalkolade@gmail.com`. The Cloudflare Email Routing setup forwards `admin@oyoskills.com` to wherever the current owner needs (Awwal's Gmail during Operate phase; Ministry destination at Transfer Day).

**At Transfer Day, ONE change** — flipping the Cloudflare forwarding destination from Awwal's Gmail to Ministry's email — migrates ALL SaaS account ownership in a single operation. No per-account migration ceremony. The email is the same; only its forwarding destination changes.

This collapses what was a 12-step parallel-migration sequence into 3 operations: (a) transfer Cloudflare account to Ministry, (b) flip forwarding destinations, (c) transfer DO + Tailscale tenancies.

---

## How to use this tracker

1. **Status semantics (refactored for turnkey strategy):**
   - `Personal` — owned by Awwal personally on his email; no Ministry access. Should ROTATE to `admin@oyoskills.com`-anchored account during Operate phase.
   - `Anchored` — registered to `admin@oyoskills.com` (the project anchor). Forwards to Awwal's Gmail during Operate phase. Builder controls but no longer dependent on Builder's personal Gmail for recovery.
   - `Co-owned` — Ministry has been added as second owner/admin during late-Operate-phase overlap.
   - `Ministry-owned` — primary ownership transferred; Awwal removed or downgraded.
   - `Migrated + Awwal removed` — final state.

2. **Migration date** — the date the row reached `Ministry-owned`. Verifies via the verification method column.

3. **Verification method** — what evidence proves the migration actually completed (e.g. "Ministry ICT lead confirmed they can reset the password without Awwal's involvement").

4. **The `Anchored` state is the strategic preparation step.** Most SaaS rows should be `Anchored` BEFORE they become `Co-owned` or `Ministry-owned`. Anchoring decouples the account from Awwal's personal Gmail; Ministry transfer then becomes a forwarding-flip rather than account-recreation.

---

## Section 1 — Identity / Email accounts (refactored 2026-04-26 for turnkey strategy)

| Account | Currently | Target | Status | Migration Date | Notes |
|---|---|---|---|---|---|
| `lawalkolade@gmail.com` | Builder personal (Awwal Gmail) | _(remains Builder personal; deprecates from project use)_ | Personal | N/A | Used to bootstrap project. Once `admin@oyoskills.com` is live and accounts are anchored, this becomes contact-only address per D2 §6 retainer. **Never write Ministry data into this account.** No transfer required (it's permanently Builder's). |
| `admin@oyoskills.com` _(via Cloudflare Email Routing on `oyoskills.com`)_ | _(pending domain purchase)_ | Forwarding destination flips Builder Gmail → Ministry destination at Transfer Day | Anchored after creation | TBD | **CANONICAL MIGRATION ANCHOR.** Used to register every project SaaS account from creation forward. The forwarder destination, not the email itself, is what migrates. Cost: zero (Cloudflare free tier). |
| `info@oyoskills.com` (forwarder) | _(pending domain)_ | Same as above | Anchored | TBD | Public-facing email — printed on website, ID cards, transactional email From: address. Forwards to same destination as `admin@`. |
| `support@oyoskills.com` (forwarder) | _(pending domain)_ | Same as above | Anchored | TBD | User-reported issues. Forwards to same destination. |
| `awwal@oyoskills.com` (forwarder, Builder-personal channel) | _(pending domain)_ | At Transfer Day, the forwarder is REMOVED entirely (not migrated) | Anchored | TBD | Distinct from `admin@`. This is direct contact for Awwal during Operate phase. Removed at Transfer Day so Ministry doesn't inherit a Builder-personal alias. |
| `noreply@oyoskills.com` (forwarder OR drop) | _(pending domain)_ | Optional — used as From: for system-generated emails that shouldn't receive replies | Anchored | TBD | Either forward to /dev/null equivalent or to admin destination. Configured at app layer (Resend From:). |
| `[Ministry destination email]` _(provided by Ministry at Transfer Day)_ | _(not yet identified)_ | Becomes the forwarding destination for all `*@oyoskills.com` aliases | Pending Ministry input | TBD | Ministry tells Builder ONE email at Transfer Day. Builder updates Cloudflare Email Routing destinations. Done. |

---

## Section 2 — Source code & CI/CD

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| GitHub user `awwallawal` (personal) | Personal Awwal | _(remains personal; downgrade to contributor)_ | Personal | N/A | N/A | After repo transfer, Awwal becomes a regular collaborator. |
| GitHub Organization `oslsr-ministry` _(create)_ | _(not yet created)_ | Ministry-owned (admin = Ministry email) | Pending Ministry action | TBD | Ministry admin can transfer/archive/delete repo without Awwal's consent | Free GitHub Org tier suffices initially. Transfer to paid Team if private-repo limits hit. |
| Repository `awwallawal/oslrs` | Personal Awwal | Transferred to `oslsr-ministry/oslrs` | Pending Ministry org creation | TBD | Issues + PRs + Actions history preserved post-transfer; CI deploys still green | GitHub Settings → Danger Zone → Transfer ownership. Awwal must initiate; Ministry org admin must accept. |
| GitHub Secret `SSH_PRIVATE_KEY` (deploy key) | Personal Awwal account | Transferred with repo | Auto-migrates with repo transfer | (Same as repo transfer) | First post-transfer CI deploy succeeds | Repo-scoped secret moves with the repo. |
| GitHub Actions IP allowlist on DO firewall | Currently `0.0.0.0/0` (defence-in-depth) | Long-term: self-hosted runner inside tailnet (Story 9-9 follow-up subtask) | Backlog | TBD | Self-hosted runner appears in repo's runner list; CI deploys via tailnet | Tracked in Story 9-9 follow-ups, not part of accounts migration directly. |

---

## Section 3 — Infrastructure (DigitalOcean)

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| DigitalOcean account (root, `lawalkolade@gmail.com`) | Personal Awwal | Ministry-owned DO account | Pending | TBD | Ministry can reset DO billing + manage all resources without Awwal | **Path A (recommended):** add Ministry as Owner via DO Teams → both have access during overlap → Awwal leaves Team. **Path B:** snapshot droplet → recreate in fresh Ministry account → DNS cutover. Path A is cleaner. |
| Droplet `oslsr-home-app` (159.89.146.93) | Within Awwal's DO account | Within Ministry's DO account | Inherits DO account migration | TBD | Same as DO account verification | Single droplet; no internal account-level move required. |
| DO Spaces bucket `oslsr-media` (S3-compatible storage) | Within Awwal's DO account | Within Ministry's DO account | Inherits DO account migration | TBD | Same | All backup retention + media storage. |
| DO Spaces API keys (`S3_*` env vars) | Generated under Awwal's DO account | Re-generated under Ministry's DO account | Pending | TBD | New keys in `/root/oslrs/.env`; backup/restore worker still functions | Rotate at migration; old keys revoked. |
| DO Cloud Firewall "OSLRS" | Within Awwal's DO account | Within Ministry's DO account | Inherits DO account migration | TBD | Same | Rules unchanged through migration. |
| Two snapshots (`pre-os-upgrade-2026-04-25`, `clean-os-update-2026-04-25`) | Within Awwal's DO account | Within Ministry's DO account | Inherits DO account migration | TBD | Snapshots visible in Ministry dashboard | If Path B (snapshot+recreate) chosen, these are the source for the new droplet. |
| DO support contract / billing | Awwal's credit card | Ministry payment method | Pending | TBD | Next billing cycle charges Ministry, not Awwal | Coordination with Ministry finance. |

---

## Section 4 — Operator network (Tailscale)

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| Tailscale tailnet (`tailnet-XXXX`, owner = `lawalkolade@gmail.com`) | Personal Awwal Google account | Ministry-owned Tailscale tenant | Pending | TBD | Ministry can add/remove devices; Awwal's device still works during overlap or is removed at end | **Path A:** transfer tailnet ownership via Tailscale support ticket. **Path B:** Ministry creates fresh tailnet; devices re-enrolled. |
| Device `desktop-qe4lplq` (Awwal's laptop) | In Awwal's tailnet | Removed from Ministry tailnet at handover | Pending | TBD | Tailscale admin shows device removed; SSH from Awwal's laptop fails post-removal | Final step of operator hand-off. |
| Device `oslsr-home-app` (VPS) | In Awwal's tailnet | In Ministry's tailnet | Inherits tailnet migration | TBD | `tailscale status` on VPS shows new tenant | Can be re-enrolled without VPS reboot. |
| Ministry ICT lead's device | Not yet on tailnet | Added to tailnet | Pending Ministry action | TBD | `tailscale status` lists Ministry device | Add early in Operate phase to enable parallel access. |
| Awwal's phone | Not yet on tailnet | (Optional) added for SPOF mitigation | Backlog | TBD | Tailscale SSH app login works from phone | Per runbook §6.2 — single-point-of-failure mitigation. |

---

## Section 5 — VPS local credentials

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| VPS root password | Set by Awwal at droplet creation; in Awwal's password manager | Ministry shared vault (transferred when migration is well underway) | Personal | TBD | Ministry ICT lead can log into DO Console with the password from Ministry's password manager | Quarterly rotation cadence per runbook §4. |
| `/root/.ssh/authorized_keys` line 1 — `github-actions-deploy` | Repo-controlled (key in GitHub Secrets) | Auto-migrates with repo transfer | Inherits repo migration | TBD | First post-repo-transfer CI deploy succeeds | Key file contents stay; ownership of who-issued-the-key changes. |
| `/root/.ssh/authorized_keys` line 2 — Awwal's `id_ed25519.pub` | Awwal's laptop | Removed at handover | Pending | TBD | Awwal's laptop SSH refused; Ministry SSH works | Final operator hand-off step. |
| `/root/.ssh/authorized_keys` line 3 — Ministry ICT lead's key (to add) | Not yet present | Added during overlap | Pending | TBD | Ministry SSH from their laptop works | Add early in Operate phase. |
| `/root/oslrs/.env` (DB password, JWT secret, Redis AUTH, S3 keys, hCaptcha secret) | On VPS, copied from Awwal's local generation | Rotated to Ministry-generated values; backed up to Ministry's password manager | Personal | TBD | Ministry can rotate any single secret without Awwal's involvement | Rotate quarterly per runbook §4. |
| Postgres `oslsr_user` password | `/root/oslrs/.env` + Awwal's password manager | Rotated; in Ministry vault | Personal | TBD | Ministry can connect via `psql` with the password | Coordinated with `.env` rotation. |
| Redis AUTH password | `/root/oslrs/.env` + Awwal's password manager | Rotated; in Ministry vault | Personal | TBD | `redis-cli -a <pwd>` from VPS works for Ministry | Same. |
| JWT signing secret | `/root/oslrs/.env` only | Rotated; in Ministry vault | Personal | TBD | Existing user sessions invalidated post-rotation; new login flow works | Rotation forces re-authentication of all current sessions; coordinate with field-survey timing. |

---

## Section 6 — Third-party SaaS

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| Resend (transactional email) | Personal Awwal account; **sending domain swapped from `oyotradeministry.com.ng` → `oyoskills.com` on 2026-04-26** (free tier = 1 domain; verified DKIM/SPF/DMARC all pass; prod From: `noreply@oyoskills.com` live) | Ministry-owned account, sending domain stays `oyoskills.com` | Account ownership: Pending. Sending-domain swap: Done 2026-04-26 | TBD | Ministry can revoke/rotate Resend API key without Awwal | Add Ministry email as additional admin → make admin → demote Awwal. DNS records (DKIM CNAME `resend._domainkey`, MX `send`, TXT `send` SPF) on Cloudflare under `oyoskills.com`. |
| hCaptcha | Personal Awwal account | Ministry-owned account | Pending | TBD | Ministry can rotate hCaptcha secret key | Same pattern: add admin → demote. |
| Cloudflare _(when domain lands; Story 9-9 subtask)_ | Not enrolled | Ministry-owned account from day one | Backlog | TBD | Ministry domain transferred + dashboard access | **Do NOT enrol under Awwal's account, even temporarily.** Cleanest if Ministry-owned from day one. |
| Tailscale Pro/Business _(if upgraded later for >3 users)_ | Free tier on Awwal's account | Ministry-owned upgraded subscription | Backlog | TBD | Ministry billing visible; Awwal removed from billing | Free tier covers current operational scale. |
| Google Cloud (OAuth client for hCaptcha and possible future use) | Personal Awwal Google Cloud project | Ministry-owned Google Cloud project | Pending | TBD | OAuth client_id rotated; original client revoked | Light-touch — tied to email migration above. |

---

## Section 7 — Domain & DNS (refactored 2026-04-26 — turnkey package)

| Account / Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| `oyotradeministry.com.ng` (current production domain) | Likely Ministry-owned (`.com.ng` is local registrar) | Confirmed Ministry-owned | _Verify_ | TBD | Ministry confirms registrar credentials in their possession | If Builder has registrar password, transfer to Ministry. If Ministry already owns it, just confirm. |
| `oyoskills.com` _(turnkey deliverable — Builder purchases ~₦15K/year)_ | Builder-purchased; registered to `admin@oyoskills.com` (chicken-and-egg solved by using Builder Gmail at registrar then changing email after Cloudflare Email Routing comes online) | Ministry-owned (registrar transfer at Transfer Day) | Personal initially; Anchored once Email Routing live | TBD | Ministry can manage DNS records + receive renewal emails | **Reversed from earlier plan** — Builder DOES register this on Builder-controlled registrar (Namecheap/Porkbun). Why: Ministry IT bureaucracy would block timely purchase; Builder-funded turnkey approach is cleaner. Transfer at Transfer Day via registrar push-transfer. |
| Cloudflare account (Free tier) | Builder-created with `admin@oyoskills.com` (or temporarily Builder Gmail until Email Routing live, then rotate primary email to `admin@oyoskills.com`) | Ministry-owned at Transfer Day | Anchored after rotation to `admin@oyoskills.com` | TBD | Ministry can log into Cloudflare dashboard via their email + 2FA | **CRITICAL load-bearing account** — holds DNS, Email Routing, future WAF (Story 9-9 subtask). Must have TOTP 2FA from day one. Recovery codes backed up to (a) Builder password manager and (b) sealed envelope handed to Mrs Lagbaja (Chemiroy MD) per Bob's recommendation. |
| DNS records on Cloudflare (A, AAAA, CNAME, MX for Email Routing, TXT for SPF/DKIM/DMARC, CNAME for Resend DKIM) | Within Cloudflare account | Inherits Cloudflare account ownership | Inherits Cloudflare row | Inherits | DNS lookups resolve correctly | All records visible in Cloudflare dashboard. |

---

## Section 7.1 — Project phone (added 2026-04-26 — turnkey package)

| Asset | Currently | Target | Status | Migration Date | Verification | Notes |
|---|---|---|---|---|---|---|
| Project SIM card (`+234 XXX XXX XXXX` — assigned by carrier at purchase) | Builder purchases (~₦500 SIM + ~₦5K/mo airtime); registered in Builder's name initially | SIM physically transferred to Ministry at Transfer Day; Ministry re-registers with carrier in their name | Personal initially; physically handed at Transfer | TBD | Ministry can receive SMS/calls on the number; carrier confirms ownership change | Carrier choice: MTN/Airtel/Glo (whichever has best Ibadan coverage). WhatsApp Business activated on the SIM. Used for: project hotline, SMS OTP if/when budget activates Story 9-12 SMS-OTP path, citizen-support callback line. |
| WhatsApp Business profile on the SIM | Same as SIM | Same as SIM | Inherits SIM | TBD | Ministry can post to broadcast list | Useful for: enumerator-supervisor channel, announcements, citizen FAQ replies. |

## Section 8 — Documentation & deliverables

| Asset | Currently | Target | Status | Notes |
|---|---|---|---|---|
| Source code (repo) | GitHub `awwallawal/oslrs` | GitHub `oslsr-ministry/oslrs` | Pending | Per Section 2. |
| `_bmad-output/` BMAD planning + implementation artifacts | In repo | In repo (transferred) | Inherits repo migration | All SCPs, stories, sprint-status, retros. Schedule 2 of D2 Transfer Protocol. |
| `docs/` operational docs | In repo | In repo (transferred) | Inherits repo migration | Includes Emergency Recovery Runbook, Infrastructure CI/CD Playbook, Portable Playbook, Session Notes, Account Migration Tracker (this file), Transfer Protocol Template, Epic 10-1 Design Brief. |
| Baseline Report v1 (Chemiroy March 2026) | Awwal's local + repo | Repo only | Inherits repo migration | Already in repo. |
| Baseline Report v2 _(future)_ | Not yet authored | Authored during Operate phase per Deliverable Commitment Matrix; submitted to Ministry post-field-survey | Backlog | Per SCP-2026-04-22 §2.4 + portable-playbook v1.2 pattern "write report as if delivered, hold until true". |
| `MEMORY.md` + topical memory files (Claude auto-memory) | In `~/.claude/projects/...` on Awwal's laptop | Stays on Awwal's laptop (Awwal's tooling, not Ministry's) | N/A | Future Ministry contractor uses fresh tooling; relies on `docs/` + `_bmad-output/` instead. |
| Awwal's password manager vault (Bitwarden / 1Password) | Awwal's personal vault | Selected entries exported to Ministry shared vault | Pending | Ministry shared vault provisioning is its own workstream. |

---

## Section 9 — Sequencing & milestones (refactored 2026-04-26 for turnkey strategy)

### Pre-field-survey (next 1–2 weeks)

1. ✅ Tailscale, OS upgrade, runbook, snapshots — done
2. **Buy `oyoskills.com` domain** — Builder action; ~₦15K at Namecheap/Porkbun
3. **Buy project SIM** — Builder action; activate WhatsApp Business
4. **Set up Cloudflare DNS + Email Routing** — Builder action; create `admin@/info@/support@/awwal@/noreply@oyoskills.com` forwarders → Builder Gmail
5. **Set up Resend domain verification on `oyoskills.com`** — Builder action; add SPF/DKIM/DMARC records
6. **Configure Gmail "Send mail as"** — Builder action; allows composing from `info@/admin@oyoskills.com` via Resend SMTP
7. **Confirm `oyotradeministry.com.ng` registrar ownership** — verify Ministry already owns OR transfer to Ministry registrar account

### During field survey (Operate phase)

8. **Migrate third-party SaaS accounts FROM `lawalkolade@gmail.com` TO `admin@oyoskills.com`** — Builder action; rotate primary email on each (DO, Tailscale, hCaptcha, Resend, Cloudflare). Update tracker as each rotates from Personal → Anchored.
9. **Update each account's `.env`-stored secrets** alongside email rotation if any rotation forces re-issuance
10. **Identify Ministry destination email** — Ministry input; whatever email the Permanent Secretary or State ICT Director wants the project mailbox forwarded to post-Transfer (may be a `.gov.ng` address or even another Gmail; Ministry's call)
11. **Take field-survey-period snapshots** — weekly DO snapshot rotation
12. **Pair-programming knowledge transfer sessions** with Ministry ICT lead — weekly cadence; documented in `docs/knowledge-transfer-log.md` (to be created)
13. **Document each migrated account state** — flip tracker rows from Personal → Anchored

### Transfer Day (one session, ~2 hours of orchestrated handover)

14. **Update Cloudflare Email Routing destinations** — flip ALL `*@oyoskills.com` forwarders from Builder Gmail to Ministry destination email. **One change migrates every SaaS account anchored to `admin@oyoskills.com` simultaneously.** Removes `awwal@oyoskills.com` forwarder entirely (no Builder-personal alias inherited by Ministry).
15. **Transfer Cloudflare account ownership** to Ministry — `admin@oyoskills.com` becomes the primary Cloudflare account email; Ministry sets new password + new TOTP 2FA
16. **Transfer DigitalOcean account** — Path A (preferred): Ministry joins as Owner via DO Teams → Builder leaves Team. OR Path B: snapshot+recreate in Ministry-owned DO account.
17. **Transfer Tailscale tailnet ownership** to Ministry-owned Tailscale account (Tailscale support ticket OR fresh tenant + device re-enrolment)
18. **Transfer domain registrar** — push `oyoskills.com` from Builder's Namecheap/Porkbun account to Ministry's
19. **Transfer GitHub repo** — `awwallawal/oslrs` → `oslsr-ministry/oslrs`
20. **Hand SIM card** physically to Ministry; Ministry registers with carrier in their name
21. **Builder's SSH key removed** from VPS `/root/.ssh/authorized_keys`
22. **Builder's Tailscale device removed** from tailnet
23. **VPS root password rotated** by Ministry; new value in Ministry password vault
24. **`.env` secrets rotated** by Ministry — JWT signing secret, DB password, Redis AUTH, S3 keys; Builder loses any retained knowledge of production secrets
25. **Sign Transfer Acceptance Certificate** (D2 Schedule 5) referencing this tracker as Schedule 1

### Post-Transfer (D2 §6 Retainer Period)

- Builder stays available for incident support per D2 retainer terms (limited hours, defined SLA)
- Builder has NO active access to any Ministry-owned account
- Builder's Gmail (`lawalkolade@gmail.com`) is contact-only — no operational role
- Quarterly drill (runbook §7) by Ministry
- 60–90 days post-Transfer: Ministry decides whether `admin@oyoskills.com` continues (recommended) or migrates to a `.gov.ng` Workspace address. Either way, Builder is uninvolved.

---

## Section 10 — Risks captured during migration (refactored 2026-04-26 for turnkey strategy)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cloudflare account compromised → domain + email + (future) WAF all controlled by attacker | Low | TOTP 2FA on Cloudflare from day one; recovery codes in Builder password manager + sealed envelope to Mrs Lagbaja (Chemiroy MD) for redundancy |
| `admin@oyoskills.com` recovery flow goes to Builder Gmail during Operate phase → Builder lockout = project lockout | Medium | Builder's password manager + `awwal@oyoskills.com` forwarder allow recovery; Cloudflare 2FA recovery codes are the ultimate fallback |
| DO account transfer breaks DNS / firewall mid-migration | Medium | Path A (Owner-add then Owner-leave) avoids any service interruption; Path B has 30-min DNS cutover window. Schedule between survey rounds. |
| GitHub repo transfer breaks CI deploys | Medium | Test deploy from new org location BEFORE relying on it; rollback plan = re-transfer back to Builder's account |
| Tailscale tenant migration drops devices mid-survey | Low | Migrate during low-traffic window; have DO Console as break-glass during the gap |
| Ministry ICT lead unavailable when migration step requires their action | Low (turnkey strategy doesn't depend on Ministry side during Operate phase) | Turnkey strategy minimises Ministry-side coordination; Ministry only needs to provide ONE destination email at Transfer Day |
| `.env` rotation invalidates user sessions during field survey | Medium | Schedule rotations between survey rounds; communicate to enumerators |
| Builder's personal Gmail (lawalkolade@gmail.com) becomes unreachable post-Transfer | Low (post-Transfer it's contact-only, not operational) | After forwarding flip at Transfer Day, `admin@oyoskills.com` no longer forwards to Builder's Gmail; Builder Gmail is irrelevant to operations |
| Domain registrar transfer fails or is delayed at Transfer Day | Medium | Schedule registrar transfer 1–2 weeks BEFORE Transfer Day so DNS doesn't have to migrate alongside everything else |
| Project SIM physical loss before Transfer Day | Low | Carrier offers SIM replacement with same number; document SIM PIN in Builder password manager |
| Out-of-pocket reimbursement not approved by Ministry | Medium | D2 §6.4 retainer rate already agreed in principle; out-of-pocket items are itemised in invoice with receipts; if rejected, Builder absorbs as goodwill cost. Total exposure <₦100K. |

---

## Section 11 — Sign-off (Transfer Day)

To be completed at Transfer Day, becomes part of D2 Schedule 1.

| Role | Name | Signature | Date |
|---|---|---|---|
| Builder | Lawal Awwal Akolade | ________ | ________ |
| Witness | _________________ | ________ | ________ |
| Ministry Permanent Secretary | _________________ | ________ | ________ |
| Ministry State ICT Director | _________________ | ________ | ________ |

---

*Last updated: 2026-04-25*
*Cross-references: D2 Transfer Protocol (`docs/transfer-protocol-template.md`); Emergency Recovery Runbook (`docs/emergency-recovery-runbook.md`); Session Notes (`docs/session-2026-04-21-25.md`)*
