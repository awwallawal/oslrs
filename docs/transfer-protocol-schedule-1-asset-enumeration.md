# Transfer Protocol — Schedule 1: Asset Enumeration & Ownership Map

**Cross-reference:** D2 Transfer Protocol (`docs/transfer-protocol-template.md`) Section 3.1 + Schedule 1 placeholder.
**Living document:** populated during the Operate phase as accounts and assets migrate; signed at Transfer Day.
**Source data:** account-migration-tracker.md (operational tracker) — this Schedule is the legal-instrument-shaped projection of that tracker.
**Status:** Draft — accuracy verified through 2026-04-26 (refactored for TURNKEY PACKAGE strategy).
**Strategy:** Builder-funded turnkey package handover. Builder personally provisions `oyoskills.com` domain + project SIM + Cloudflare account from his own resources during Operate phase, then transfers the complete package to Ministry at Transfer Day in a single orchestrated session (~2 hours). Replaces earlier "Ministry-Workspace-coordinated parallel migration" plan that was blocked by Oyo State ICT procurement bureaucracy.
**Canonical anchor:** `admin@oyoskills.com` (Cloudflare Email Routing forwarder) is the single migration anchor — every project SaaS account registered under it; transfer ownership = flip the forwarder destination from Builder Gmail to Ministry email, in one operation.

---

## Preamble

This Schedule enumerates every asset transferring under the Transfer Protocol. Each row identifies:
- **Asset ID:** unique identifier for cross-reference
- **Asset description:** what the asset is + where it lives
- **Owner before Transfer Date:** legal/operational owner during the Operate phase
- **Owner after Transfer Date:** legal/operational owner post-Transfer
- **Transfer mechanism:** how ownership change is effected
- **Verification:** how the change is proven complete
- **Transfer status:** as of the Schedule signing date

Assets are grouped by category. Each category corresponds to a Transfer Protocol section.

---

## Category A — Source Code & Intellectual Property

| Asset ID | Asset Description | Owner Before | Owner After | Transfer Mechanism | Verification | Status |
|---|---|---|---|---|---|---|
| A.1 | Repository: `awwallawal/oslrs` (Git history, branches, issues, PRs, GitHub Actions, repo-scoped Secrets) | Lawal Awwal Akolade (personal GitHub user `awwallawal`) | Oyo State Ministry of Trade, Investment and Co-operatives (via Ministry-owned GitHub Organisation, target name `oslsr-ministry`) | GitHub Settings → Danger Zone → Transfer ownership; Builder initiates, Ministry org admin accepts | Builder loses admin rights; Ministry can archive/delete/transfer further without Builder | _Pending_ |
| A.2 | Code license — implicit copyright on all original code authored by Builder; no explicit OSS license declared | Lawal Awwal Akolade (sole author copyright) | Joint copyright + perpetual royalty-free license to Ministry per Protocol §3.3 | Protocol §3.3 license clause | Protocol signature | _Pending Protocol execution_ |
| A.3 | Methodology — design patterns, BMAD workflows, ADRs, Portable Playbook, Field Readiness Certificate pattern, correct-course discipline (per Portable Playbook v1.2) | **Lawal Awwal Akolade — RETAINED per Protocol §3.2** | _(retained by Builder)_ | Methodology is expressly excluded from transfer | Builder retains right to apply Methodology to other projects | _Pre-existing — no transfer required_ |
| A.4 | All BMAD planning artefacts (`_bmad-output/`) — PRD V8.2, Architecture (with ADRs 018/019/020), UX Specification V3.0, Epics, all SCPs (2026-02-05 + 2026-04-04 + 2026-04-22), all retros, sprint-status.yaml | _(within repo — inherits A.1)_ | _(within repo — inherits A.1)_ | Inherits A.1 transfer | First post-transfer git pull from Ministry org succeeds | _Pending A.1_ |
| A.5 | All operational documentation (`docs/`) — emergency-recovery-runbook, infrastructure-cicd-playbook, portable-playbook, account-migration-tracker, this Schedule 1, Transfer Protocol template, session notes, ITF-SUPA reference screenshots | _(within repo — inherits A.1)_ | _(within repo — inherits A.1)_ | Inherits A.1 transfer | Same | _Pending A.1_ |

---

## Category B — Hosting Infrastructure

| Asset ID | Asset Description | Owner Before | Owner After | Transfer Mechanism | Verification | Status |
|---|---|---|---|---|---|---|
| B.1 | DigitalOcean Account (root account `lawalkolade@gmail.com`) | Lawal Awwal Akolade | Ministry-owned DO account (target email `oslsr@oyotradeministry.com.ng` or equivalent) | **Path A (preferred):** Ministry account joins as Owner via DO Teams; Builder leaves Team. **Path B (fallback):** snapshot+recreate. | Ministry can manage all OSLRS resources without Builder involvement | _Pending Ministry account creation_ |
| B.2 | Droplet `oslsr-home-app` (IP `159.89.146.93`, region [populate], 2GB / 2vCPU / 47GB SSD, Ubuntu 24.04.4, kernel 6.8.0-110) | _(within DO account — inherits B.1)_ | _(within DO account — inherits B.1)_ | Inherits B.1 | Droplet visible in Ministry's DO dashboard | _Pending B.1_ |
| B.3 | DO Cloud Firewall "OSLRS" — SSH inbound dual-source `0.0.0.0/0` + `100.64.0.0/10`; HTTPS 443; HTTP 80 redirect; other ports per app needs (see runbook §1.4) | _(within DO account)_ | _(within DO account)_ | Inherits B.1 | Firewall rules visible in Ministry's DO dashboard | _Pending B.1_ |
| B.4 | DO Spaces bucket `oslsr-media` — application media + backups (`backups/daily/`, `backups/monthly/`) | _(within DO account)_ | _(within DO account)_ | Inherits B.1 | Bucket visible in Ministry's DO dashboard; backup worker continues writing | _Pending B.1_ |
| B.5 | DO Spaces API keys (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) — currently in `/root/oslrs/.env` | Generated under Builder's DO account | Re-generated under Ministry's DO account | Rotate keys at B.1 transfer; old keys revoked; new keys deployed via env var update | Backup worker successfully uploads with new keys | _Pending B.1_ |
| B.6 | DO Snapshots: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25` | _(within DO account)_ | _(within DO account)_ | Inherits B.1 | Snapshots visible in Ministry's DO dashboard | _Pending B.1_ |
| B.7 | DO Support Contract / Billing | Builder's credit card | Ministry payment method | Coordination with Ministry finance; update DO billing details | Next billing cycle charges Ministry | _Pending B.1_ |

---

## Category C — Operator Network (Tailscale)

| Asset ID | Asset Description | Owner Before | Owner After | Transfer Mechanism | Verification | Status |
|---|---|---|---|---|---|---|
| C.1 | Tailscale tailnet (currently `tailnet-XXXX`, owner `lawalkolade@gmail.com`, Free Personal tier) | Lawal Awwal Akolade | Ministry-owned Tailscale tenant | **Path A (preferred):** transfer ownership via Tailscale support ticket. **Path B (fallback):** Ministry creates fresh tailnet; devices re-enrolled. | Ministry can add/remove devices via admin console; Builder's device removed at end of overlap window | _Pending_ |
| C.2 | Device registration `oslsr-home-app` @ `100.93.100.28` | _(within tailnet — inherits C.1)_ | _(within Ministry tailnet)_ | Inherits C.1; may need re-enrolment if Path B | `tailscale status` on VPS shows correct tenant | _Pending C.1_ |
| C.3 | Builder's device `desktop-qe4lplq` @ `100.113.78.101` | In Builder's tailnet | Removed at Transfer Day | Tailscale admin → remove device | SSH from Builder's laptop refused post-removal | _Pending C.1_ |

---

## Category D — Domain Names & DNS (refactored 2026-04-26 — turnkey strategy)

| Asset ID | Asset Description | Owner Before | Owner After | Transfer Mechanism | Verification | Status |
|---|---|---|---|---|---|---|
| D.1 | `oyotradeministry.com.ng` (current production domain) | _Verify_ — likely Ministry-owned given `.com.ng` registrar conventions | Confirmed Ministry-owned | If Ministry already owns: confirm credentials are in Ministry IT possession. If Builder is current registrar contact: transfer via registrar UI. | Ministry IT can update DNS records without Builder | _Pending verification_ |
| D.2 | `oyoskills.com` — **TURNKEY DELIVERABLE** | Builder-purchased + registered on Builder's Namecheap/Porkbun account (~₦15K/year) | Ministry-owned via registrar push-transfer at Transfer Day | Initiator-side (Builder) initiates registrar transfer 1–2 weeks BEFORE Transfer Day; Ministry registrar receives + accepts; domain remains active throughout | Ministry can renew domain via their registrar account | _Pending Builder purchase (within 1–2 weeks)_ |
| D.3 | DNS records on Cloudflare Free tier (A, AAAA, CNAME, TXT for SPF/DKIM/DMARC, MX for Email Routing) | Within Builder's Cloudflare account | Within Ministry's Cloudflare account (post-Cloudflare account ownership transfer) | Cloudflare account ownership transfer (see E.7) — DNS records inherit | DNS lookups continue to resolve correctly across the transfer | _Pending Cloudflare setup_ |
| D.4 | Project phone SIM (`+234 XXX XXX XXXX` — assigned by carrier) | Builder-purchased (~₦500 SIM); Builder name on carrier registration | Physically transferred at Transfer Day; Ministry re-registers with carrier | Builder hands SIM to Ministry; Ministry visits carrier office for ownership change paperwork | Ministry receives SMS/calls on the number; carrier confirms re-registration | _Pending Builder SIM purchase + activation_ |

---

## Category E — Third-Party SaaS / Vendors (refactored 2026-04-26 — turnkey strategy)

All SaaS accounts get registered to `admin@oyoskills.com` (per Category G.2 anchor) during Operate phase. Transfer at Transfer Day = Cloudflare forwarding flip + per-vendor primary-email rotation to Ministry destination.

| Asset ID | Asset Description | Owner Before | Owner After | Transfer Mechanism | Verification | Status |
|---|---|---|---|---|---|---|
| E.1 | Resend account (transactional email, sending domain `oyoskills.com` — **swap completed 2026-04-26**, DKIM/SPF/DMARC all pass, prod From: `noreply@oyoskills.com` live) | Currently `lawalkolade@gmail.com` → rotate to `admin@oyoskills.com` during Operate | Ministry-controlled (via G.2 forwarder flip) | Builder rotates account email from personal Gmail to `admin@oyoskills.com` during Operate; Cloudflare forwarder flip at Transfer Day completes the transfer | Ministry can rotate Resend API key from their inherited account | _Domain swap done 2026-04-26; account email rotation pending_ |
| E.2 | hCaptcha account | Currently `lawalkolade@gmail.com` → rotate to `admin@oyoskills.com` | Ministry-controlled (via G.2 forwarder flip) | Same pattern as E.1 | Ministry can rotate hCaptcha secret | _Pending email rotation_ |
| E.3 | Google Cloud project (OAuth client for hCaptcha + future use) | Builder's personal Google Cloud — owned to Builder Gmail | New Google Cloud project under Ministry post-Transfer | OAuth client recreation at Transfer Day; OLD client revoked, NEW client provisioned in Ministry-owned project | Original client revoked; new client functioning | _Pending Transfer Day_ |
| E.4 | _(removed — Cloudflare merged into E.7 below)_ | — | — | — | — | — |
| E.5 | GitHub Actions (CI/CD) | Builder's personal GitHub user `awwallawal` | Ministry GitHub Organisation `oslsr-ministry` (post-A.1 transfer) | Inherits A.1 (repo transfer) | First post-transfer CI deploy succeeds | _Pending A.1_ |
| E.6 | Tailscale subscription (currently Free tier) | Builder Google account | Ministry-owned Tailscale tenant | Tailscale tailnet ownership transfer (support ticket OR fresh tenant + device re-enrolment) — see C.1 | Ministry sees billing (if upgraded) and can manage devices | _Backlog (depends on team scale at Transfer)_ |
| E.7 | **Cloudflare account (FREE tier)** — load-bearing: holds DNS, Email Routing, future WAF (Story 9-9 subtask), DDoS attenuation | Builder-created with `admin@oyoskills.com` as primary email (or temporarily Builder Gmail until Email Routing live, then rotate primary email) | Ministry-owned at Transfer Day | At Transfer Day: (a) Ministry creates Cloudflare account with Ministry email; (b) Builder transfers `oyoskills.com` zone via Cloudflare's "Move site to another account" feature OR Ministry recreates zone; (c) Builder removes their account access | Ministry can manage DNS + Email Routing + (future) WAF without Builder | _Pending domain purchase_ |

---

## Category F — VPS Local Credentials (in `/root/oslrs/.env` and runbook §1.6)

These credentials should be ROTATED at Transfer Day, not transferred verbatim. Rotation invalidates whatever Builder has retained on personal devices.

| Asset ID | Credential | Where Stored | Transfer Action | Verification | Status |
|---|---|---|---|---|---|
| F.1 | VPS root password | DO droplet + Builder's password manager | Builder shares with Ministry's password manager (shared vault); rotated quarterly per runbook §4 thereafter | Ministry ICT lead can log in via DO Console with the password | Builder retained per 2026-04-25 decision; documented in account-migration-tracker.md |
| F.2 | `/root/.ssh/authorized_keys` line 1 — `github-actions-deploy` | Repo-controlled (key in GitHub Secrets) | Inherits A.1 | First post-transfer CI deploy succeeds | _Pending A.1_ |
| F.3 | `/root/.ssh/authorized_keys` line 2 — Builder's `id_ed25519.pub` | VPS | **Removed at Transfer Day** | Builder's laptop SSH refused | _Pending Transfer Day_ |
| F.4 | `/root/.ssh/authorized_keys` line 3 — Ministry ICT lead's key (to add) | VPS | **Added during Operate phase** | Ministry SSH from their laptop works | _Pending Ministry key_ |
| F.5 | Postgres `oslsr_user` password | `/root/oslrs/.env` + Builder's password manager | Rotated at Transfer; new value in Ministry vault + .env | Ministry can connect via `psql` | _Pending_ |
| F.6 | Redis AUTH password | `/root/oslrs/.env` + Builder's password manager | Rotated at Transfer; new value in Ministry vault + .env | `redis-cli -a <pwd>` works | _Pending_ |
| F.7 | JWT signing secret | `/root/oslrs/.env` only | Rotated at Transfer; existing user sessions invalidated | Login flow works post-rotation | _Pending — coordinate with field-survey timing_ |
| F.8 | Resend API key | `/root/oslrs/.env` | Rotated alongside E.1 | Email worker successfully sends | _Pending_ |
| F.9 | hCaptcha secret key | `/root/oslrs/.env` | Rotated alongside E.2 | hCaptcha verification on registration works | _Pending_ |
| F.10 | DO Spaces API keys | `/root/oslrs/.env` | Rotated alongside B.5 | Backup worker writes succeed | _Pending B.1_ |

---

## Category G — Identity Email Accounts (refactored 2026-04-26 for turnkey strategy)

| Asset ID | Account | Owner Before | Owner After | Transfer Mechanism | Status |
|---|---|---|---|---|---|
| G.1 | `lawalkolade@gmail.com` (Builder's personal Gmail) | Lawal Awwal Akolade — RETAINED | _(remains Builder personal; contact-only post-Transfer)_ | Builder's personal contact email per Protocol §6 retainer; never receives Ministry data post-Transfer | _Builder personal — no transfer_ |
| G.2 | `admin@oyoskills.com` (Cloudflare Email Routing forwarder) | Builder-controlled — destination = Builder Gmail during Operate phase | Ministry-controlled — destination flipped to Ministry-provided email at Transfer Day | **CANONICAL MIGRATION ANCHOR.** Transfer mechanism: Cloudflare Email Routing dashboard → edit forwarder destination from Builder Gmail to Ministry email. **One operation migrates ALL SaaS accounts anchored to this address.** | _Pending domain purchase + Cloudflare setup_ |
| G.3 | `info@oyoskills.com` (forwarder) | Builder-controlled (same destination as G.2) | Ministry-controlled (same destination as G.2 post-flip) | Inherits G.2 forwarder flip | _Pending domain_ |
| G.4 | `support@oyoskills.com` (forwarder) | Builder-controlled (same destination as G.2) | Ministry-controlled (same destination as G.2 post-flip) | Inherits G.2 forwarder flip | _Pending domain_ |
| G.5 | `awwal@oyoskills.com` (Builder direct-contact forwarder) | Builder-controlled — destination = Builder Gmail | **REMOVED at Transfer Day** (not migrated — distinct Builder-personal alias) | Cloudflare Email Routing dashboard → delete forwarder | _Pending domain; explicit removal at Transfer_ |
| G.6 | `noreply@oyoskills.com` (transactional outbound from Resend) | Builder-controlled (Resend From:) — **LIVE 2026-04-26**, prod app sends from this address | Ministry-controlled (still serves as Resend From: post-Transfer) | Inherits Resend account ownership transfer (Category E.1) | _Live; account ownership migration pending_ |
| G.7 | `[Ministry destination email]` (TBD — provided by Ministry at Transfer Day) | _(not yet identified)_ | Ministry-owned (Ministry's existing email — could be `.gov.ng` or any other) | Ministry tells Builder the destination email; Builder updates Cloudflare Email Routing once at Transfer | _Pending Ministry input at Transfer Day_ |

---

## Category H — Legal & Documentation Artefacts

| Asset ID | Asset | Owner Before | Owner After | Transfer Mechanism | Status |
|---|---|---|---|---|---|
| H.1 | Transfer Protocol (this document's parent at `docs/transfer-protocol-template.md`) | Drafted by Builder | Signed by both Parties — joint instrument | Execution per Protocol §17.6 | _Pending Nigerian-qualified legal review then signature_ |
| H.2 | DPIA (Baseline Report Appendix H + standalone D1 deliverable) | Drafted by Builder + Iris | **Filed by Ministry with NDPC**; Ministry is data controller per Protocol §7 | Builder delivers; Ministry files | _Pending drafting + NDPC filing_ |
| H.3 | Records of Processing Activities (RoPA) | Drafted by Builder + Iris | **Maintained by Ministry** thereafter per NDPA §38 + Protocol §7.3 | Builder delivers initial state; Ministry maintains | _Pending drafting_ |
| H.4 | Data-Sharing Agreement template (Story 10-5 deliverable) | Drafted by Iris + Gabe | **Used by Ministry** when provisioning partner-API consumers (Epic 10) | Ministry signs DSAs with each consumer (ITF-SUPA, NBS, NIMC, etc.) | _Pending Story 10-5 implementation_ |
| H.5 | Operations Manual (per-role: enumerator, supervisor, clerk, assessor, super admin — D4 deliverable subset; FRC item #6) | _(authored by Builder + Gabe; not yet drafted for field-survey window)_ | Used by Ministry operations team | Builder delivers; Ministry distributes + trains | _Pending drafting (FRC item #6)_ |
| H.6 | Baseline Report v1 (Chemiroy March 2026, 22 chapters) | Builder + Chemiroy Nigeria Limited | _(retained as historical artefact in repo)_ | _(no transfer — historical)_ | _Pre-existing_ |
| H.7 | Baseline Report v2 (full refresh, written-as-if-delivered, gated by Deliverable Commitment Matrix) | _(not yet authored — post-field-survey)_ | Submitted to Ministry as final report | Builder authors per Portable Playbook v1.2 pattern | _Backlog_ |

---

## Category I — Knowledge Transfer

| Asset ID | Activity / Artefact | Owner Before | Owner After | Mechanism | Status |
|---|---|---|---|---|---|
| I.1 | Pair-programming knowledge transfer sessions during Operate phase | Builder facilitates | Ministry ICT lead + 2nd Ministry technical staff (when identified) | Weekly cadence during Operate phase; sessions logged with date, topic, attendees, recordings | _Pending Operate-phase scheduling_ |
| I.2 | Quarterly drill (per runbook §7) — break-glass simulation | Initially Builder + Ministry observer | Ministry executes solo by 2026-Q3 | Per runbook §7 procedure | _First drill due 2026-07-23_ |
| I.3 | Operations Manual training (per H.5) | Builder + Gabe deliver | Ministry trains its own enumerators / supervisors / clerks | Train-the-trainer model; Ministry takes ownership of training delivery | _Pending H.5 drafting_ |

---

## Sign-off

To be completed at Transfer Day per Protocol §4.2 (Transfer Acceptance Certificate referencing this Schedule).

| Role | Name | Signature | Date | Verification |
|---|---|---|---|---|
| Builder | Lawal Awwal Akolade | ________ | ________ | I confirm I have transferred or relinquished access to every asset enumerated above as marked, except where explicitly retained per the Protocol |
| Witness | _________________ | ________ | ________ | I observed the asset-by-asset verification on Transfer Day |
| Ministry — Honourable Commissioner | _________________ | ________ | ________ | The Ministry accepts the assets as enumerated; I confirm the transfer mechanism completed as marked |
| Ministry — Permanent Secretary | _________________ | ________ | ________ | Counter-signed |
| Ministry — State ICT Director | _________________ | ________ | ________ | I confirm the technical assets are functioning under Ministry control as of this date |

---

## Status totals (running tally — refactored 2026-04-26 for turnkey strategy)

_Last update: 2026-04-26_

| Category | Total assets | Pending | Anchored / In-flight | Ministry-owned | Retained / N/A |
|---|---|---|---|---|---|
| A. Source code & IP | 5 | 4 | 0 | 0 | 1 (A.3 Methodology retained) |
| B. Hosting infra | 7 | 7 | 0 | 0 | 0 |
| C. Operator network | 3 | 3 | 0 | 0 | 0 |
| D. Domains & DNS + project SIM | 4 | 4 | 0 | 0 | 0 |
| E. Third-party SaaS (incl. E.7 Cloudflare) | 6 | 6 | 0 | 0 | 0 |
| F. VPS local credentials | 10 | 10 | 0 | 0 | 0 |
| G. Identity email (incl. forwarders) | 7 | 6 | 0 | 0 | 1 (G.1 Builder retained) |
| H. Legal & documentation | 7 | 6 | 0 | 0 | 1 (H.6 historical) |
| I. Knowledge transfer | 3 | 3 | 0 | 0 | 0 |
| **TOTAL** | **52** | **49** | **0** | **0** | **3** |

Migration progress: **0 of 49 transfer-pending assets** completed as of 2026-04-26. Updates as Operate phase progresses + Builder executes turnkey provisioning.

Net assets added vs. 2026-04-25 version: +5 (project SIM added to D; 4 email forwarder rows added to G; Cloudflare row added to E; one E.4 row removed).

---

*Cross-references: D2 Transfer Protocol (`docs/transfer-protocol-template.md`); Account Migration Tracker (`docs/account-migration-tracker.md`); Emergency Recovery Runbook (`docs/emergency-recovery-runbook.md`); Session Notes (`docs/session-2026-04-21-25.md`)*
