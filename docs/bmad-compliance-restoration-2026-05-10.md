# BMAD Compliance Restoration Tracker

| Field | Value |
|---|---|
| Created | 2026-05-10 by Amelia (dev agent) |
| Last verified | 2026-05-10 ~15:30 UTC (R1-R5+F5a closed via `c3db684`; F1 closed by this commit; <2-week field-survey runway active) |
| Status | OPEN — **§A R1-R5 closed via `c3db684`; F5 closed `609e06e`; F5a closed `c3db684`; F1 closed by this commit.** Remaining: F2 (AC#4 stretch), F3 (AC#9 carry), F6 (deferred wait-and-see), F7 (Operate-phase Story 9-14), F8 (alert ergonomics nice-to-have). F4 dissolved. |
| Owner | Awwal + dev agent (next session — Amelia) |
| Audit method | Round 1 (5 commits, full rubric) + Round 2 (30-commit sweep, V1+V2+V4 patterns) + 2026-05-10 PM reframe |
| Field-survey | < 2 weeks out (best estimate as of 2026-05-10). VPS upgrade to `s-2vcpu-4gb` recommended pre-field — see §I. |
| Scope | (1) BMAD restoration §A, (2) VPS state index §B, (3) audit methodology §D, (4) forward 9-9 close-out §F, (5) **Story 9-9 final closure §G with AC#9 carry clause**, (6) **Critical path to field §H**, (7) **VPS sizing decision §I** |

---

## §C Resume Instructions (READ FIRST IF COLD-RESUMING)

If a new session is opening this doc with no prior context:

1. **Reload project context**:
   - Read `C:\Users\DELL\.claude\projects\C--Users-DELL-Desktop-oslrs\memory\MEMORY.md` (auto-loaded; already in context)
   - Read `docs/team-context-brief.md`
2. **Reload audit context**:
   - Read this doc top-to-bottom
   - Read `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` Subtask 5 + Change Log + Review Follow-ups (AI) sections
3. **Verify nothing has shifted since "Last verified" timestamp above**:
   - `git log d8f96a3..HEAD --oneline` — any new commits since?
   - If yes: spot-check whether new story-impl commits include review-pass evidence (V1 pattern). Update §A as needed.
4. **Pick up the next task** in this priority order (reframed 2026-05-10 by John PM for <2-week field-survey runway):
   - **§H Critical Path to Field is the canonical priority list** — read it first.
   - **Tier 1 status (2026-05-10 ~15:30 UTC)**: ✅ R1-R5 closed `c3db684` ✅ F5a closed `c3db684` ✅ F1 closed (this commit). **Remaining Tier 1**: Story 9-12 Public Wizard (FRC #3, the field-blocker) + VPS resize to 4GB (operator action, §I).
   - **Tier 2 (stretch, ship if time allows)**: F2 (AC#4 rate-limit audit, 4-8 hr) + Story 9-13 TOTP MFA close-out (~30 min ratification) + Story 10-5 DSA close-out (~30 min ratification) + F8 (alert ergonomics PR, ~75 min) + F3 (AC#9 carry-clause documentation).
   - **Tier 3 (Awwal committed to "all stories before field"; PM flagged as defer-able)**: 11-2 / 11-3 / 11-4 / 10-1 / 10-2 / 10-3 / 10-4 / 10-6 / prep-export-row-cap.
   - **Tier 4 (strictly defer to Operate-phase)**: F6 (threshold tuning wait-and-see), F7 (Story 9-14 worker isolation), Story 9-9 AC#10 follow-up (firewall re-narrow), self-hosted GH Actions runner.
   - F4 — **dissolved.** Filed as prep-7 follow-up. Not a separate task.

When closing a task:
- Mark the checkbox `[x]`
- Append the closing commit SHA to the task line
- Update the **Last verified** timestamp at top

When the last task in §A closes, update **Status** to CLOSED and append a closure entry to §E.

---

## §A Restoration Backlog (5 tasks, ~90 min total)

### R1 — Retrospective adversarial code review on AC#5 close-out work

- [x] **Task**: Run `/bmad:bmm:workflows:code-review` workflow on the AC#5 close-out diff (commit `4dc989f` working-tree state). Auto-fix HIGH+MEDIUM findings inline; document LOW findings under a new 2026-05-10 divider in the Story 9-9 Review Follow-ups (AI) section. **CLOSED `c3db684` 2026-05-10 14:32 UTC** — 0 HIGH / 3 MEDIUM / 6 LOW. R1-M1 + R1-M2 auto-fixed inline (test count 18 → 20). R1-M3 deferred-with-rationale. 6 LOWs documented as backlog under 2026-05-10 divider in Story 9-9 Review Follow-ups (AI).
- **File**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md`
- **Reference pattern**: AC#6 retrospective review (Change Log entry 2026-05-01) + AC#3 third-pass review (2026-05-08 divider). Same shape.
- **Why**: AC#5 shipped without the documented pre-commit review that `feedback_review_before_commit.md` mandates. This is a recurrence of the AC#6 mistake that originally prompted that memory note. Without R1, the violation persists in institutional record.
- **Specific files to review in scope**:
  - `apps/api/src/lib/backup-crypto.ts` (95 lines, NEW)
  - `apps/api/src/lib/__tests__/backup-crypto.test.ts` (200 lines, 18 tests, NEW)
  - `apps/api/src/workers/backup.worker.ts` (modified — encryption gating)
  - `apps/api/scripts/restore-backup.ts` (modified — auto-detect encrypted vs legacy)
  - `.env.example` (BACKUP_ENCRYPTION_KEY block)
  - `docs/infrastructure-cicd-playbook.md` Part 12
  - `docs/emergency-recovery-runbook.md` §7.2
- **Acceptance**: New 2026-05-10 divider in Review Follow-ups (AI) section with N findings categorised HIGH/MEDIUM/LOW. HIGHs + most MEDIUMs auto-fixed inline; LOWs documented as backlog with `[Pending-…]` tags as needed.
- **Estimate**: 30-45 min
- **Closing SHA**: _(fill in)_

### R2 — Add Subtask 5 File List block to Story 9-9

- [x] **Task**: The story file at L327-370 has dedicated File List blocks for Subtask 6 (DONE 2026-05-01), Subtask 3 (PARTIAL 2026-05-08...), and the Subtask 1+2 preserved blocks. **No equivalent `**Subtask 5 (DONE 2026-05-09):**` block exists**. Add one matching the Subtask 6 structure. **CLOSED `c3db684` 2026-05-10 14:32 UTC** — 9-file Subtask 5 File List block added; obsolete `apps/api/scripts/backup-to-s3.sh` line removed from forward-planned block.
- **File**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` (around L327)
- **Reference pattern**: copy the `**Subtask 6 (DONE 2026-05-01):**` block at L329-337 verbatim and adapt for AC#5.
- **Files to list in the new block**:
  - `apps/api/src/lib/backup-crypto.ts` — **created**
  - `apps/api/src/lib/__tests__/backup-crypto.test.ts` — **created** (18 tests)
  - `apps/api/src/workers/backup.worker.ts` — **modified** (encryption gating, manifest extension, .enc suffix on S3 key)
  - `apps/api/scripts/restore-backup.ts` — **modified** (legacy/encrypted dual-path, loud-fail on missing manifest encryption)
  - `.env.example` — **modified** (BACKUP_ENCRYPTION_KEY block + 3-place storage requirement)
  - `docs/infrastructure-cicd-playbook.md` — **modified** (Part 12 encrypted backup recipe + 5-row failure-modes table)
  - `docs/emergency-recovery-runbook.md` — **modified** (§7.2 quarterly drill recipe)
  - `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` — **modified** (Subtask 5 marked done, Status Matrix + Priority Map updated, Subtask 11 progress refreshed, Change Log entry, FRC Impact section, this File List block)
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` — **modified** (9-9 comment refreshed with AC#5 close-out + DONE 7/10 framing)
- **Bonus cleanup**: in the "Subtasks 4-5, 7, 9 (forward-planned)" block at L360-368, **remove** the obsolete `apps/api/scripts/backup-to-s3.sh` line (the actual implementation pivoted to BullMQ worker — never used a shell script).
- **Acceptance**: Subtask 5 File List block exists, lists all 9 files above with create/modify markers, and the obsolete shell-script line is removed from the forward-planned block.
- **Estimate**: 5 min
- **Closing SHA**: _(fill in)_

### R3 — Populate Dev Agent Record fields in Story 9-9

- [x] **Task**: L514-524 of the story file has three placeholder fields that have never been populated despite **7 of 10 subtasks done**: **CLOSED `c3db684` 2026-05-10 14:32 UTC** — Agent Model Used + Debug Log References + Completion Notes List populated with per-subtask content for AC#1, AC#2, AC#3, AC#5, AC#6, AC#8, AC#10. Same-LLM same-session caveat acknowledged.
  - `### Agent Model Used` — currently `_(Populated when each subtask enters dev.)_`
  - `### Debug Log References` — currently `_(Populated during implementation.)_`
  - `### Completion Notes List` — currently `_(Populated during implementation.)_`
- **File**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` (L514-524)
- **Suggested content**:
  - **Agent Model Used**: Claude Opus 4.7 (1M context) across all subtasks. Cite per-subtask if any used different model.
  - **Debug Log References**: cite key evidence files — drill output for AC#5 (Task 5.8 inline), heartbeat curl response for AC#6 (gitignored `ssh_analysis.txt` + Change Log 2026-05-01), port-audit output (`docs/port-audit-2026-05-08.md`), Cloudflare real-IP verification commit `1383373`, OS upgrade snapshot names `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`.
  - **Completion Notes List**: one-line per closed subtask citing the close-out date + headline outcome (e.g., "AC#1 (2026-04-23) — Tailscale+SSH lockdown closed Mon 2026-04-20 brute-force vector at firewall+sshd layer; emergency-recovery-runbook authored").
- **Acceptance**: All 3 placeholder strings replaced with real per-subtask content; placeholders no longer appear in the file.
- **Estimate**: 15 min
- **Closing SHA**: _(fill in)_

### R4 — Promote test-fix lessons to playbook (Pitfalls #32-34)

- [x] **Task**: Three lessons from commits `c375254` + `235563c` are captured only in commit bodies, not in the canonical pitfall catalogue. The pattern set by `9a3ca29` (Pitfall #31 in playbook) shows the right discipline; these three follow-ups should match. **CLOSED `c3db684` 2026-05-10 14:32 UTC** — Pitfalls #32 (selector rot), #33 (WebSocket-refresh flake), #34 (continue-on-error mask) appended to `docs/infrastructure-cicd-playbook.md` with Symptom / Detection / Cause / Fix / Reference structure.
- **File**: `docs/infrastructure-cicd-playbook.md`
- **Pitfalls to add**:
  - **Pitfall #32 — Selector rot under accessibility-name UI changes.** Symptom: Playwright tests pass strict-mode regex like `/broadcast to team/i` until UI gains a second matching element (button aria-label + heading sharing the visible text); test then fails strict-mode with "two elements matched". Detection: `pnpm exec playwright test` after any aria-label/role rename. Fix: switch to `getByRole(role, {name: …})` with exact-match, or scope the search via `.getByRole("region", …).getByRole(…)`. Reference: commit `235563c`.
  - **Pitfall #33 — WebSocket-refresh flake masquerading as a flaky test.** Symptom: send-action returns 200, e2e assertion checks for the result in inbox within 15s, fails sporadically. Cause: the inbox refetch / WebSocket event lags or doesn't fire deterministically in CI. Detection: high test variance + no obvious code path failure. Fix: scope assertion to compose-pane verification (deterministic), defer full round-trip to integration-test fixture using `page.waitForResponse()` for the explicit refetch. Reference: commit `c375254` broadcast-test scope narrowing.
  - **Pitfall #34 — `continue-on-error: true` as silent-failure mask.** Symptom: GitHub Actions workflow conclusion = `success` despite real test failures because the offending job had `continue-on-error: true`. Detection: read job logs not just workflow-level status; if a CI gate matters, it cannot be `continue-on-error`. Fix: remove `continue-on-error: true` once stabilization phase ends; or pair with a downstream "all-jobs-must-succeed" required-status check. Reference: commit `235563c` removal of `continue-on-error: true` from `.github/workflows/e2e.yml`.
- **Acceptance**: 3 new pitfall entries in playbook, each with Symptom / Detection / Fix / Reference fields matching existing pitfalls #18-31's structure.
- **Estimate**: 20 min
- **Closing SHA**: _(fill in)_

### R5 — Add Change Log entry recording the audit + R1-R4 restorations

- [x] **Task**: Single 2026-05-10 entry in Story 9-9 Change Log table (around L530) summarising the audit, the violations found, and which R-tasks closed them. Should reference this tracker doc. **CLOSED `c3db684` 2026-05-10 14:32 UTC** — single 2026-05-10 entry appended to Change Log table summarising R1-R5+F5a closure with cross-reference to tracker.
- **File**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` Change Log table
- **Suggested entry**:
  > **2026-05-10** | BMAD compliance audit + restoration. | 30-commit sweep (commits `9a3ca29..d8f96a3`) found 1 V1 violation (AC#5 shipped without documented pre-commit code review — recurrence of AC#6 mistake), 1 V2 violation (Subtask 5 File List block missing), 1 V4 violation (Dev Agent Record placeholders unfilled despite 7/10 subtasks done), 1 V5 partial (3 test-fix lessons captured in commit bodies but not playbook). Round 2 sweep against 30 commits confirmed AC#5 is the only V1 violation; V2 + V4 are 9-9-specific. R1-R5 restorations executed per `docs/bmad-compliance-restoration-2026-05-10.md` §A. Tracker doc remains the canonical record.
- **Acceptance**: Change Log entry added at the bottom (or in chronological order) referencing this tracker file.
- **Estimate**: 5 min
- **Closing SHA**: _(fill in)_

---

## §B VPS State Index (2026-04-23 → 2026-05-10)

This is an **index**, not re-documentation. For each VPS-side change in the audit window, points at where it is canonically documented + flags any gaps.

### Index format

| Date | VPS action | Canonical doc | Verification evidence | Gap? |

### 2026-05-10

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-10 | `BACKUP_ENCRYPTION_KEY` generated on VPS via `openssl rand -hex 32`; appended to `/root/oslrs/.env`; saved to password manager + paper backup | Story 9-9 Subtask 5 Task 5.2 + `.env.example` block + runbook §7.2 | Worker logs show `encryptionKeySet: true`; first encrypted backup `2026-05-10-app_db.sql.gz.enc` shipped to S3 | None |
| 2026-05-10 | `pm2 restart oslsr-api --update-env` on VPS (PID 321876 → 324062) | Story 9-9 Task 5.8 step 2 | Logs show `workers.initialized backupWorkerRunning: true server_start host: 127.0.0.1` | None |
| 2026-05-10 | Manual one-shot backup queued via `getBackupQueue().add('ac5-drill-manual', {})` on VPS (Job ID 110) | Story 9-9 Task 5.8 step 3 | Worker logs `backup.encrypt.complete algorithm: aes-256-gcm`; S3 verified upload of `.sql.gz.enc` | None |
| 2026-05-10 | First §7.2 restore drill executed on VPS — scratch `postgres:15-alpine` on `127.0.0.1:55432`; `restore-backup.ts --latest --target-db ... --confirm`; all 4 table counts matched manifest | Story 9-9 Task 5.8 step 5 + runbook §7.2 | Inline output captured in story file (users/respondents/audit_logs/submissions all `Match: YES`) | None |

### 2026-05-09

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-09 | Portainer recreated over Tailscale: `docker stop+rm portainer` → `docker run -d -p 127.0.0.1:8000:8000 -p 127.0.0.1:9443:9443 -v portainer_data:/data ...` (new container `1d3771a45a04`) | Story 9-9 AC#3 close-out + `docs/port-audit-2026-05-08.md` + runbook §1.4 + commit `235c8e4` body | `docker ps`: `127.0.0.1:8000->8000/tcp, 127.0.0.1:9443->9443/tcp`; internal `https://127.0.0.1:9443/` 200; external `Test-NetConnection` confirms 8000+9443 closed at DO firewall edge | None |
| 2026-05-09 | `ufw delete allow 9443/tcp` on VPS (both v4 + v6 rules deleted) | Story 9-9 AC#3 + runbook §1.4 | `ufw status \| grep 9443` empty | None |
| 2026-05-09 | Backup of pre-recreate Portainer config: `/root/portainer-config-backup-2026-05-09.json` (274 lines) | Story 9-9 AC#3 close-out File List | File present on VPS; cited as rollback path | None |
| 2026-05-09 | Deploy `0effb50` (pnpm override `fast-xml-builder>=1.1.7` for GHSA-5wm8-gmm8-39j9) | commit `0effb50` body + sprint-status | API health 200 post-deploy | None |
| 2026-05-09 | Deploy `9a3ca29` + `235563c` + `c375254` (e2e cache + triage); CI pipeline-only changes | commits + 9-9 Change Log entry 2026-05-09 ("E2E CI gate stabilised") | E2E job: 16 passed / 0 failed / 20 skipped | None |

### 2026-05-08

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-08 | Deploy `14df7e7` (port audit + API HOST=127.0.0.1 binding via `resolveListenAddress` + nginx upstream `localhost:3000` → `127.0.0.1:3000`) | Story 9-9 AC#3 partial Change Log + `docs/port-audit-2026-05-08.md` | `ss -tlnp` shows `:3000` bound `127.0.0.1` only post-deploy | None |
| 2026-05-08 | `ss -tlnp` + `iptables -L -n` + `iptables -t nat -L -n` audits captured | `docs/port-audit-2026-05-08.md` | 15-port table + DO firewall posture verified | None |

### 2026-05-04 (Pitfall #23 outage + recovery)

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-04 | Deploy `ac903c8` — nginx CSP `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (single-line rename, lines 53+77 of `infra/nginx/oslsr.conf`) | Story 9-8 Tasks 7.4-7.7 + commit body | `curl -sI` shows enforcing header; 0 csp-report POSTs in 48h soak window | None |
| 2026-05-04 | Pitfall #23 outage 11:11 → 11:46 UTC: hCaptcha widget rendered "for testing only" banner; login POSTs failed for 35 min. Root cause: `VITE_HCAPTCHA_SITE_KEY` + `VITE_GOOGLE_CLIENT_ID` stored as Secrets but workflow reads `${{ vars.X }}` | `docs/infrastructure-cicd-playbook.md` Pitfall #23 + MEMORY.md "2026-05-04 Pitfall #23 production outage" entry | Authoritative values pulled from VPS `.env` via Tailscale SSH; `gh variable set` × 2; `1e0173e` empty commit re-trigger; deployed bundle confirmed prod sitekey `9772af14-6b9c-...` | None |
| 2026-05-04 | Pre-build env guard `2b0c0b8` added to ci-cd.yml — fails CI at minute 1 if `VITE_HCAPTCHA_SITE_KEY` empty OR matches test sitekey OR `VITE_GOOGLE_CLIENT_ID` empty | commit `2b0c0b8` + Pitfall #23 addendum | CI run after deploy proves guard fires correctly when triggered with empty value | None |

### 2026-05-03

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-03 | Deploy `938b6a6` — Story 11-1 schema migration `migrate-multi-source-registry-init.ts` ran via CI deploy; respondents.nin nullable + partial UNIQUE WHERE NOT NULL + status enum + provenance columns + import_batches table + 5 composite indexes | Story 11-1 + commit body + sprint-status comment | Both `respondents_status_check` + `import_batches_status_check` CHECKs + `respondents_nin_unique_when_present` partial UNIQUE active in production | None |
| 2026-05-03 | prep-input-sanitisation operator backfill on prod (05:50 UTC): 1 row scanned, 1 planned, 1 written, 0 failed | prep-input-sanitisation-layer story + sprint-status comment | `report-backfill-failures.ts` confirmed "FRC item #4 unblocked" | None |
| 2026-05-03 | `VALIDATE CONSTRAINT chk_respondents_phone_number_e164` on prod via `docker exec -i oslsr-postgres psql ...` | prep-input-sanitisation-layer story | Every existing row satisfies E.164 regex; future inserts/updates rejected if non-canonical | None |

### Earlier (pre-audit-window references for completeness)

| Date | VPS action | Canonical doc | Verification | Gap? |
|---|---|---|---|---|
| 2026-05-01 | Telegram bot `@oslsr_alerts_bot` setup; `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` to `/root/oslrs/.env`; pm2 restart with `--update-env`; heartbeat curl proved phone vibration | Story 9-9 Subtask 6 + runbook §1.8 + commit `9d4081b` | Telegram API `{"ok":true,"message_id":4}` at 10:26:45 UTC; raw response in (gitignored) `ssh_analysis.txt` | None |
| 2026-04-30 | Wave 0 deploy `e799104` + `6932ac0` — build moved off-VPS to GH Actions cloud runner; vite+tsc no longer run on the 2GB VPS during deploy | prep-build-off-vps-cloud-runner story + commits | Wall-clock 43.5s median, 0.66 GiB peak, 0 CRITICAL digests across 2 measured deploys | None |
| 2026-04-27 | Cloudflare Phase 3: DNS A `oyoskills.com` + CNAME www grey → orange; SSL/TLS Full(strict); Always Use HTTPS + Auto HTTPS Rewrites; WAF Managed Rules baseline Always Active | Story 9-9 AC#10 + `docs/session-2026-04-21-25.md` Postscript 3 + commits `4c2d909`/`bf98931`/`1383373` | `req.ip` = real Nigerian-ISP `197.211.52.65` post-deploy; WS 101 verified | None |
| 2026-04-26 | Phase 1 email: 5 ImprovMX aliases (admin/info/support/noreply/awwal) → Builder Gmail; Resend domain swapped `oyotradeministry.com.ng` → `oyoskills.com`; prod env `EMAIL_FROM_ADDRESS=noreply@oyoskills.com` | sprint-status comments 2026-04-26 + Story 9-4 + `docs/account-migration-tracker.md` | DKIM/SPF/DMARC pass; verified e2e via real password-reset email at TLS 1.3, 1-second delivery | None |
| 2026-04-26 | Second super-admin `admin@oyoskills.com` created via staff-invite UI; both super_admins receive system health digests | Story 9-9 AC#8 + sprint-status | `SELECT` query confirmed 2 active super_admins in prod DB | None |
| 2026-04-26 | Fossil purge: deleted prod DB `super_admin` row with email `'"awwallawal@gmail.com" \'` (quotes + trailing backslash baked in from 2026-03-02 multi-line-paste); prod `.env` `SUPER_ADMIN_EMAIL` line scrubbed; backup at `/root/oslrs/.env.bak.<UTC-timestamp>` | MEMORY.md "Fossil purge 2026-04-26 (eve)" entry | 0 FK refs verified via `information_schema` sweep before delete | None |
| 2026-04-25 | OS upgrade: Ubuntu 24.04.3 → 24.04.4; kernel 6.8.0-90 → 6.8.0-110; 49 packages incl. `systemd`, `apparmor`, `snapd`, `cloud-init`, `nodejs`, `openssh-server`. Reboot 08:54:37 UTC. | Story 9-9 AC#2 + runbook §6.1 monthly-reboot pre-flight + sprint-status comment 2026-04-25 | Two snapshots taken: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25`; PM2 ↺ counter reset 916+ → 0 | None |
| 2026-04-25 | DO Cloud Firewall SSH rule amended: `100.64.0.0/10`-only → dual-source `0.0.0.0/0` + `100.64.0.0/10` (architectural correction per ADR-020 V8.2-a1 §"DO Console Access Vector") | ADR-020 + runbook §1.1/§1.4/§2.2/§6.1 + PRD V8.3 NFR9 | DO Console reachable from any browser post-amendment; sshd-key-only is primary control | None |
| 2026-04-23 | Tailscale installed on laptop (`100.113.78.101`) + VPS (`100.93.100.28`); `id_ed25519` public key appended to `/root/.ssh/authorized_keys`; sshd_config + drop-ins `PasswordAuthentication no` + `PermitRootLogin prohibit-password`; fail2ban active | Story 9-9 AC#1 File List "Tailscale Hardening Subtask" + runbook §1.1 | (a) public-IP SSH password = `Permission denied (publickey)`; (b) public-IP SSH wrong key = denied + fail2ban ban; (c) Tailscale SSH = no-prompt success | None |

### Gaps identified

**None.** Every VPS state change in the audit window has a canonical doc location AND verification evidence. The institutional record is complete — the issue identified by Round 1+2 was not "undocumented VPS work" but "story-discipline gaps in 9-9 (R1-R5)". This index also serves as a single-glance-resume artifact for any future operator returning to 9-9 work.

---

## §D Audit Methodology + Rubric (preserved for reuse)

### Story-implementation rubric (5 criteria)

A commit is a "story-implementation commit" if it adds or modifies feature code mapped to a story AC. Such commits should pass:

1. **SM-authored canonically** — Story file authored via Bob (SM) `*create-story --yolo` workflow, not ad-hoc agent-authoring. Per `feedback_canonical_create_story_workflow.md`.
2. **Tasks executed in order** — `[x]` checkboxes in story file match the commit's deliverables; AC referenced in commit subject (`AC#N`).
3. **Red-green-refactor / TDD** — Tests added in the same commit as implementation. New code without new tests is a violation unless explicitly justified (e.g., pure config change).
4. **File List accuracy** — Dev Agent Record File List in story file matches `git diff --stat` for the commit.
5. **Code review BEFORE commit** — Documented adversarial code review pass on uncommitted working tree, per `feedback_review_before_commit.md`. Evidenced by either (a) Review Follow-ups (AI) section in story file with findings table, or (b) commit message explicitly citing "+N-finding code-review pass".

### CI-fix rubric (3 criteria — lighter)

A commit is a "CI-fix" if it adjusts CI/CD config, test selectors, or non-feature tooling. Story file is not expected. Such commits should pass:

- **A. Cite the incident** — Commit body references the failing run, prior commit, or production symptom that prompted the fix.
- **B. Capture the lesson** — If the fix encodes a non-obvious gotcha, add a Pitfall entry to `docs/infrastructure-cicd-playbook.md`. Inline commit-body explanation alone is insufficient for systemic gotchas.
- **C. No scope creep** — Fix touches only files in scope of the incident. Bundling unrelated docs/refactors into a CI-fix commit makes archaeology brittle.

### Round 2 sweep methodology (replicable in future audits)

To audit ~30 commits efficiently:

1. `git log -30 --pretty=format:"%h | %ad | %s" --date=short` — get the window
2. Classify each commit: story-impl / CI-fix / docs-only / chore
3. For story-impl commits, look for review-pass evidence in commit subject or body (`+N-finding`, `R2/R3`, `code-review pass`, etc.). If absent, open the corresponding story file's Review Follow-ups (AI) section and check for a divider matching the commit date.
4. `Grep` for `**Subtask N (DONE` across `_bmad-output/implementation-artifacts/` to find File List block patterns. Compare to subtask-completion claims.
5. `Grep` for `_(Populated when each subtask enters dev\.\)_` to find unfilled Dev Agent Record placeholders. Cross-check story status: backlog/ready-for-dev = correct to be empty; in-progress/review/done = violation.
6. Reading 30 diffs end-to-end is unnecessary. Reading commit metadata + Story file Review Follow-ups sections is 5× faster and surfaces V1 violations directly.

---

## §E Closure Log

_(Each completed task appends a one-line entry here when its checkbox flips to `[x]`. When all 5 R-tasks AND the F-tasks below close, status flips to CLOSED and the doc moves to historical reference.)_

- **2026-05-10 12:19 UTC** — F5 closed via commit `609e06e` (other Claude session). Time-windowed p95 buffer eviction shipped; 2 pre-commit code-review passes; 6 new tests; full API suite 2087/7/0. **F5a (Pitfall #35 in playbook) opened as leftover** — F5 commit shipped without the playbook entry that the BMAD discipline checklist required.
- **2026-05-10 14:32 UTC** — **R1, R2, R3, R4, R5, F5a all closed** via commit `c3db684`. Single BMAD restoration commit. R1: 0 HIGH / 3 MEDIUM / 6 LOW on AC#5; 2 MEDIUMs auto-fixed (test count 18 → 20); 6 LOWs documented as backlog. R2: Subtask 5 File List block added (9 files) + obsolete `backup-to-s3.sh` removed from forward-planned. R3: 3 Dev Agent Record fields populated for 7 done subtasks. R4: Pitfalls #32-34 in playbook. F5a: Pitfall #35 in playbook. R5: 2026-05-10 audit Change Log entry on Story 9-9. Pre-commit checks: API lint clean, tsc clean, backup-crypto + worker tests 81/81 pass.
- **2026-05-10 ~15:30 UTC** — **F1 (AC#7 logrotate) closed** by this commit. VPS-side: pm2-logrotate v3.0.0 installed + configured; journald `SystemMaxUse=2G` + `MaxRetentionSec=30d`. Disk recovered 2.2 GB (2.5 GB → 266 MB). Runbook §1.4 "Log retention policy" subsection authored. Story 9-9 Subtask 7 marked DONE; Status Matrix + Priority Map + Subtask 11.1 progress (`7/10 → 8/10`) all refreshed; Change Log entry appended. sprint-status.yaml comment updated `DONE 7/10 → 8/10`. AC#9 carry-clause acknowledgement added. **Tier 1 Critical Path to Field complete except Story 9-12 (FRC #3 blocker, the only thing standing between current state and FRC complete) + VPS resize.**

---

## §F 9-9 Forward Roadmap (after R1-R5 close)

These are the **remaining Story 9-9 ACs** + adjacent technical debt. They are NOT restoration tasks (the past commits are clean) — they are **forward work that the restored discipline will be applied to**. Sequenced after R1-R5 because R1-R5 establishes the canonical template (Subtask File List block, pre-commit code-review divider, Dev Agent Record per-subtask) that F1+F2 will simply slot into.

**Sequence rationale**: AC#7 first (smallest, proves the restored template); AC#4 second (largest surface, benefits most from discipline being already in place); AC#9 runs in parallel (passive observation, no file collision). E2E skips after the 9-9 ACs since they're a separate prep-7 concern and don't gate field-readiness.

### F1 — AC#7 Logrotate for PM2 + journald (CLOSED 2026-05-10)

- [x] **Task**: Configure `pm2-logrotate` module + tune `/etc/systemd/journald.conf` retention. Cheapest of the remaining ACs; prevents disk-fill incident. **CLOSED 2026-05-10 ~15:00 UTC over Tailscale.** pm2-logrotate v3.0.0 installed + 4 settings applied; journald `SystemMaxUse=2G` + `MaxRetentionSec=30d` (recovered 2.2 GB on restart: 2.5 GB → 266 MB); runbook §1.4 "Log retention policy" subsection authored. **Closing SHA**: this commit.
- **Story file**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` Subtask 7 (L216-221, currently 4 unchecked subtasks 7.1-7.4)
- **Subtasks (already in story)**:
  - 7.1 `pm2 install pm2-logrotate` + `pm2 set pm2-logrotate:max_size 50M` / `:retain 14` / `:compress true` / `:rotateInterval '0 0 * * *'`
  - 7.2 `/etc/systemd/journald.conf`: `SystemMaxUse=2G`, `MaxRetentionSec=30d`, then `systemctl restart systemd-journald`
  - 7.3 Verify: `pm2 logrotate --status` + `journalctl --disk-usage`
  - 7.4 Add to runbook §1.4 — Log retention policy
- **BMAD discipline checklist** (apply the restored template):
  - [ ] Add new `**Subtask 7 (DONE 2026-XX-XX):**` File List block per R2's pattern
  - [ ] Run `/bmad:bmm:workflows:code-review` on uncommitted tree BEFORE commit; add 2026-XX-XX divider to Review Follow-ups (AI)
  - [ ] Update Dev Agent Record Completion Notes with 1-liner (after R3 fills the section)
  - [ ] Refresh sprint-status.yaml comment: `DONE 7/10 → 8/10`
  - [ ] Change Log entry citing AC#7 closure
- **Acceptance**: All 4 subtasks `[x]`; runbook §1.4 has Log retention policy block; pm2-logrotate verified; journalctl disk-usage bounded.
- **Estimate**: ~1 hour
- **Closing SHA**: _(fill in)_

### F2 — AC#4 App-layer rate-limit audit on `/auth/*` endpoints (~4-8 hours, P1)

- [ ] **Task**: Inventory every `/api/v1/auth/*` and `/api/v1/staff/activate/*` endpoint, verify per-IP rate limits configured per PRD NFR4.4 (login: 5/15min, password reset: 3/hour, profile edit token: 3/NIN/day), add `apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts` that asserts each endpoint enforces its documented limit.
- **Story file**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` Subtask 4 (L131-137, currently 5 unchecked subtasks 4.1-4.5)
- **Subtasks (already in story)**:
  - 4.1 Inventory `/api/v1/auth/*` + `/api/v1/staff/activate/*` via `apps/api/src/routes/auth.routes.ts` + `staff.routes.ts`
  - 4.2 Identify rate-limit middleware per endpoint (per-IP / per-NIN / per-email)
  - 4.3 Cross-check thresholds against PRD NFR4.4
  - 4.4 Add coverage test that asserts each documented endpoint enforces its limit
  - 4.5 Document delta + remediation in Dev Notes
- **BMAD discipline checklist** (apply the restored template):
  - [ ] Add new `**Subtask 4 (DONE 2026-XX-XX):**` File List block per R2's pattern
  - [ ] Run `/bmad:bmm:workflows:code-review` BEFORE commit; add 2026-XX-XX divider to Review Follow-ups (AI). **Largest commit of the three remaining — review pass is most valuable here.**
  - [ ] Update Dev Agent Record Completion Notes
  - [ ] Refresh sprint-status.yaml: `DONE 8/10 → 9/10`
  - [ ] Change Log entry citing AC#4 closure
- **Cross-cutting watch items**:
  - PRD NFR4.4 thresholds may have evolved; verify against current PRD V8.4 not V8.3
  - Some endpoints may have been added since the story was authored — coverage test must auto-traverse the route table, not hard-code endpoint list
- **Acceptance**: All 5 subtasks `[x]`; coverage test passes; any threshold drift documented + remediated.
- **Estimate**: 4-8 hours
- **Closing SHA**: _(fill in)_

### F3 — AC#9 SOC-style activity baseline (4-week passive observation, P2)

- [ ] **Task**: 4-week observation window collecting baseline sshd activity per source IP class. **Cannot be compressed** — this is calendar-gated.
- **Story file**: `_bmad-output/implementation-artifacts/9-9-infrastructure-security-hardening.md` Subtask 9 (L233-245, currently 6 unchecked subtasks 9.1-9.6)
- **Subtasks (already in story)**:
  - 9.1 `journalctl -u ssh --since "2026-04-25" | grep -E "(Accepted|Failed)"` weekly for 4 weeks
  - 9.2 Categorize source IPs (Operator / GH Actions / DO Infrastructure / fail2ban-banned / Unknown)
  - 9.3 Capture weekly snapshots `docs/ssh-activity-baseline-week-N-2026-05-XX.md`
  - 9.4 After 4 weeks: synthesize as `docs/ssh-activity-baseline-2026-05-XX.md`
  - 9.5 Add monthly review cadence to runbook §6.1
  - 9.6 Document P0-incident-response procedure for unexpected successful login
- **Calendar gate**: observation opened 2026-04-25; **4 weeks elapses ~2026-05-23**.
- **Operational note**: Subtasks 9.1-9.3 are weekly drumbeat starting any time after now (week 3 of 4 is still capturable). Subtask 9.4 needs a calendar trigger ~2026-05-23. Subtasks 9.5-9.6 are documentation, can run any time after the synthesis.
- **BMAD discipline checklist**:
  - [ ] Add new `**Subtask 9 (DONE 2026-05-2X):**` File List block per R2's pattern
  - [ ] No code-review pass needed (pure documentation deliverable)
  - [ ] Update Dev Agent Record Completion Notes
  - [ ] Refresh sprint-status.yaml: `DONE 9/10 → 10/10` AND **flip Story 9-9 status `in-progress → done`** (assuming F1+F2 done by then)
  - [ ] Change Log entry citing AC#9 closure + Story 9-9 final closure
- **Acceptance**: 4 weekly snapshot docs + 1 synthesis doc + runbook §6.1 monthly review cadence + P0 incident-response procedure in runbook §3.
- **Estimate**: 4 weeks elapsed (passive); ~2 hours active work spread across the 4-week window.
- **Closing SHA**: _(fill in)_

### F5 — Metrics middleware time-window eviction (CLOSED 2026-05-10 commit `609e06e`)

- [x] **Task**: Add time-based sample eviction to `apps/api/src/middleware/metrics.ts` rolling-buffer p95 computation. Drop samples older than 5 min before computing percentile. Eliminates the stale-outlier-on-low-traffic-VPS failure mode permanently. **Closed via commit `609e06e`** with two pre-commit code-review passes (1st 8 findings + 2nd 6 findings, including a parallel-array → record-array refactor), 6 new tests, full API suite green (2087/7/0).
- **Trigger incident**: 2026-05-10 ~08:28 + 08:34 UTC — `api_p95_latency=752` CRITICAL Telegram alert fired twice, 6 min apart, identical value. Diagnosis: AC#5 encrypted-backup run at 07:33 UTC (CPU-bound AES-GCM + pg_dump + S3 upload, 704ms total) blocked the API event loop. HTTP request in-flight during that window got recorded at ~700-750ms in `apps/api/src/middleware/metrics.ts:26-29` rolling buffer (1000 samples, no time-based eviction). On a low-traffic admin app, that single sample sits at top-5% until ~50 newer requests evict it. **System was healthy** (load 0.00, mem 59MB, health 200 in <100ms) — false alert by mechanism.
- **Files**:
  - `apps/api/src/middleware/metrics.ts` — add time-based eviction (drop samples > 5 min old before p95 computation); ~15 LOC
  - `apps/api/src/middleware/__tests__/metrics.test.ts` — new test asserting injected stale sample is evicted
- **Cross-references**:
  - Triage transcript: `ssh_analyssis.txt` lines 240-419 (gitignored evidence)
  - **F6 below** — Path 3 (threshold tuning, complementary to F5)
  - **F7 below** — Path 4 (workers in separate PM2 process, architectural; supersedes need for F5 long-term but F5 still useful as defense-in-depth)
  - Story 9-10 Dev Notes — record this incident as evidence supporting F7
- **BMAD discipline checklist (closed)**:
  - [x] Pre-commit code review on uncommitted tree — DONE (2 passes; 1st-pass dev-persona + 2nd-pass canonical BMM Skill)
  - [x] No story file required (tactical bugfix; record as Story 9-10 finding in its Dev Notes) — DONE (Post-Close PC1 in `9-10-pm2-restart-loop-investigation.md` Review Follow-ups (AI))
  - [ ] **Pitfall #35 in `docs/infrastructure-cicd-playbook.md` — NOT DONE.** F5 commit shipped without the playbook entry. **Tracked as F5a below.**
  - [x] Commit message cites incident timestamps + alert values — DONE
- **Acceptance**: Code + test ✅ + Story 9-10 Dev Notes ✅. Pitfall #35 outstanding (see F5a).
- **Closing SHA**: `609e06e9444fa9828bfd65fea23beac65098d24c` (2026-05-10 12:19 UTC)

### F5a — Pitfall #35 in playbook (F5 leftover)

- [x] **Task**: Add Pitfall #35 to `docs/infrastructure-cicd-playbook.md`. The F5 commit shipped without it; story Review Follow-ups capture the *story-specific* learning, but a Pitfall entry generalises the gotcha for any future engineer encountering the same symptom on this or future projects. **CLOSED `c3db684` 2026-05-10 14:32 UTC** — Pitfall #35 appended with full Symptom / Detection / Cause / Fix (mechanism = F5 commit `609e06e`) / Architectural-fix-pending (Story 9-14) / Tactical-alternative (F6) / Reference structure.
- **Suggested entry**:
  > **Pitfall #35 — In-process worker CPU spike contaminates API latency rolling buffer on low-traffic VPS.**
  > **Symptom**: CRITICAL `api_p95_latency` alert fires identical value across multiple 120s evaluator cycles, despite system being idle (load 0.00, low memory, health 200). Same exact value re-fires 6+ minutes later.
  > **Detection**: Cross-check VPS load + memory + health endpoint at the alert time — all three idle ⇒ buffer-stale not real-traffic. Then check workers-tier activity (backup, email, fraud, import) within ±2 min of the alert.
  > **Cause**: A single CPU-bound in-process worker run (e.g., AES-GCM encrypted backup + pg_dump + S3 upload at ~700ms) blocks the API event loop. HTTP requests in-flight during that window get recorded at ~700-750ms in the latency rolling buffer. On a low-traffic admin app, that single sample sits at top-5% until enough newer requests evict it — which can take 40+ minutes.
  > **Fix**: Time-windowed buffer eviction. Drop samples older than 5 min before computing p95. Implemented in commit `609e06e` (Story 9-10 PC1).
  > **Architectural fix (pending, F7 in tracker)**: Move workers to a separate PM2 process so backup/email CPU work cannot block the API event loop at all. Decision-date stake 2026-05-17.
- **BMAD discipline checklist**:
  - [ ] No code review needed (pure docs)
  - [ ] Cross-link from F7 + Story 9-10 PC2 follow-up — when F7 ships, the Pitfall's "Architectural fix (pending)" line flips to "Architectural fix (shipped via Story 9-10c)"
- **Acceptance**: Pitfall #35 entry exists in `docs/infrastructure-cicd-playbook.md` with Symptom / Detection / Cause / Fix / Architectural-follow-up structure matching pitfalls #18-31.
- **Estimate**: 10 min
- **Closing SHA**: _(fill in)_

### F6 — Alert threshold tuning for `api_p95_latency` (Path 3 from 2026-05-10 triage)

- [ ] **Task**: Decide whether to bump `api_p95_latency` thresholds in `apps/api/src/services/alert.service.ts:74` from `warn=250ms / crit=500ms` to `warn=500ms / crit=1000ms`. Current values are aggressive for an in-process-workers admin app on a 2GB VPS where backup/email CPU work legitimately blocks the event loop for ~700ms during a normal backup run.
- **Trigger incident**: Same 2026-05-10 false-alert as F5 (api_p95_latency=752 fired twice on healthy system).
- **Cross-references**:
  - F5 (time-window buffer eviction) — addresses the *mechanism* of the false alert. F6 addresses the *threshold appropriateness* given the workload shape. They are complementary, not alternatives.
  - F7 (workers in separate PM2 process) — if F7 ships, the in-process-worker blocking goes away and tighter p95 thresholds become reasonable again. F6 may need to be re-evaluated post-F7.
- **Decision points**:
  - Bumping thresholds risks masking real performance regressions during normal-traffic operation. Field-survey workload is unknown — once enumerator traffic hits, p95 will rise legitimately and current thresholds may catch it correctly.
  - Alternative: keep thresholds tight, but add a "deploy-recovery window" suppression (e.g., `evaluateMetric` skips api_p95_latency for first 60 min after PM2 restart). More targeted, less risk of masking real problems.
- **BMAD discipline checklist**:
  - [ ] Decision recorded in Story 9-10 Dev Notes as a follow-up (Story 9-10 is `done` so this becomes a postscript) OR routed to Bob (SM) for a new follow-up story
  - [ ] If code change shipped: pre-commit code review + Change Log
  - [ ] Cross-link from F5 commit body (so future archaeology connects them)
- **Acceptance**: Either (a) decision recorded "no change, monitor under field-survey load" with rationale, OR (b) thresholds bumped via PR with the alternative considered, OR (c) deploy-recovery-window suppression shipped as a third path.
- **Estimate**: 15-30 min decision + (if shipping code) 30 min implementation
- **Closing SHA / decision link**: _(fill in)_

### F7 — Story 9-14 worker process isolation [Operate-phase backlog]

**Renamed + deferred 2026-05-10 by John PM.** Was provisionally named `9-10c-worker-process-isolation` in commit `609e06e` body — that name was implementation-shorthand, not portfolio-coherent (Story 9-10 is `done`; reopening with subtask letters breaks status semantics). Canonical name going forward: **Story 9-14**.

**Status**: **DEFERRED to Operate-phase.** Original 2026-05-17 SM-authoring stake **dropped** — that was a 7-day artifact-deadline that pre-dated the <2-week field-survey reality. F7 is forward architectural work, not field-blocking.

**Why defer**:
- F5 already eliminated the false-alert *mechanism* (time-window buffer eviction shipped commit `609e06e`)
- F6 wait-and-see absorbs threshold concerns until field traffic is observed
- Authoring the story alone competes with Awwal's focus on Story 9-12 (the actual FRC blocker)
- Workers-blocking-event-loop is not a *correctness* bug, it's a *defense-in-depth* improvement. F5+F6 cover the user-visible symptoms.

**Reactivation triggers** (any one re-opens F7):
- Field-survey traffic produces sustained CRITICAL alerts that F5+F6 cannot silence
- Backup CPU saturation crashes a real enumerator session
- Operate-phase telemetry shows >5 PM2 ↺ events/week not deploy-correlated
- Ministry-handover preparation requires "no in-process worker blocking"

**When Bob (SM) picks up post-field**:
- Author as Story 9-14 (next free slot — 9-13 is TOTP MFA already taken)
- Consider bundling with **self-hosted GH Actions runner inside tailnet** (separate Story 9-9 AC#10 follow-up) — both architectural; both touch "what runs where on the 2GB VPS"; one Bob authoring session, possibly two stories
- Pre-commit code review on uncommitted tree per `feedback_review_before_commit.md`
- Runbook + playbook updates for the new 2-PM2-process topology

**Cross-references**:
- Story 9-10 Dev Notes Post-Close PC2 — origin of the architectural follow-up
- F5 + F6 — symptom-coverage layers; F7 is root-cause coverage
- F8 (LATENCY_WINDOW_MS env-config) — could bundle into F7 if F7 ships first

**Estimate when picked up**: 1-2 days dev work + ~2 hours SM authoring.
**Closing SHA / story file link**: _(populated post-field-survey when picked up)_

### F8 — Alert ergonomics PR (bundled cadence audit + LATENCY_WINDOW_MS env-config)

**Bundling decision (John PM, 2026-05-10)**: original F8 (cadence audit) and F9 (env-config) merged into a single small PR. Same surface (alert/metrics observability), same review window. Saves overhead.

- [ ] **Task A — Cadence audit (was F8, Story 9-10 PC3)**: Investigate why the 2026-05-10 incident showed a 6-minute gap between identical Telegram notifications when the `evaluateMetric` cadence in `apps/api/src/workers/index.ts:84` is 120s. Identify mechanism (likely per-metric 5-min cooldown in `alert.service.ts`); document in runbook §1.8 (alert routing matrix) so operators know what to expect under sustained anomaly.
- [ ] **Task B — LATENCY_WINDOW_MS env-config (was F9, Story 9-10 PC4)**: Make the 5-min time-window in `getP95Latency()` configurable via `LATENCY_WINDOW_MS` env var, default 300000. Useful for field-survey if operator wants to tighten/loosen without a deploy.
- **Files**:
  - `.env.example` — add `LATENCY_WINDOW_MS` block with default + tuning guidance
  - `apps/api/src/middleware/metrics.ts` — read env var, default fallback
  - `apps/api/src/middleware/__tests__/metrics.test.ts` — 1 unit test asserting default + override behaviour
  - `docs/emergency-recovery-runbook.md` §1.8 — cadence audit findings + tuning recipe
  - `_bmad-output/implementation-artifacts/9-10-pm2-restart-loop-investigation.md` — PC3 + PC4 close-out notes in Review Follow-ups (AI)
- **BMAD discipline checklist**:
  - [ ] Pre-commit code review on uncommitted tree
  - [ ] Story 9-10 PC3 + PC4 entries flipped from `[ ]` to `[x]` with closing-SHA citation
  - [ ] Commit message: `feat(metrics): story 9-10 PC3+PC4 — cadence audit + LATENCY_WINDOW_MS env-config`
- **Acceptance**: Both tasks landed in single PR. Cadence mechanism documented. Env-config working with default + override.
- **Estimate**: ~60-75 min (~30 min audit + ~30 min env-config + ~15 min review/commit)
- **Priority for field**: nice-to-have, not blocking. Ship after FRC #3 lands.
- **Closing SHA**: _(fill in)_

### ~~F4~~ — E2E test skip backlog (DISSOLVED 2026-05-10 — filed as prep-7 follow-up)

**Decision (John PM, 2026-05-10)**: 3 verified runtime skips with explanatory TODOs in-test do not warrant their own story. Authoring overhead exceeds the work. Filed as a follow-up bullet under prep-7's existing follow-up section. No tracker entry needed.

**Skips for the record** (verified 2026-05-10 by Amelia):
| # | Test | File:Line | Re-enable condition |
|---|---|---|---|
| 1 | `should reject invalid NIN with modulus11 error and accept valid NIN` | `apps/web/e2e/nin-validation.spec.ts:31` | Add a published native form with NIN question to dev-seed orchestrator |
| 2 | `open a thread and verify messages render` | `apps/web/e2e/messaging.spec.ts:84` | Either await refetch via `page.waitForResponse('**/messages/threads')` OR integration-test fixture |
| 3 | `start a direct message via New Conversation` | `apps/web/e2e/messaging.spec.ts:153` | Seed reliably produces a supervisor with ≥1 assigned enumerator |

The 7× `setup.skip()` in `auth.setup.ts` and 10× `test.fixme()` in `golden-path.spec.ts` are intentional CI / progressive-enablement, NOT in scope.

**Action**: when prep-7's follow-up section gets its next refresh, append the 3 entries above. Otherwise no work here.

---

## §G Story 9-9 Final Closure Conditions

Story 9-9 status flips `in-progress → done` when ALL of the following are true:

- [ ] R1-R5 closed (BMAD compliance restoration)
- [ ] F1 closed (AC#7 logrotate)
- [ ] F2 closed (AC#4 rate-limit audit)
- [ ] F3 closed (AC#9 4-week activity baseline) **OR** field-survey starts before 2026-05-23 → invoke **carry clause** below
- [ ] sprint-status.yaml entry: `9-9-infrastructure-security-hardening: done` with comment `DONE 10/10` (or `DONE 9/10 + carry-AC#9` if carry invoked)
- [ ] FRC table in `epics.md` flipped for items #1 + #5 (already done per Subtask 11.2; Bob to confirm on next sprint-planning pass)

**AC#9 carry clause (added 2026-05-10 by John PM)**: If field-survey starts before AC#9's 4-week observation window closes (~2026-05-23), Story 9-9 may be **closed-with-carry** — AC#9 reframed as ongoing Operate-phase activity, not a 4-week-window deliverable. Carry-clause invocation requires:
- Documented field-survey-start date in this tracker §I or session notes
- Explicit Change Log entry in 9-9 story file: `Closed-with-carry. AC#9 SOC baseline reframed as Operate-phase ongoing activity per 2026-05-10 PM directive (field-survey started YYYY-MM-DD).`
- AC#9 Subtask 9 retained `[ ]` checkbox state (deliverables still tracked, just not blocking closure)

F4 (e2e skip backlog) — **dissolved** per 2026-05-10 PM decision; filed as prep-7 follow-up. Does not appear in closure conditions.

---

## §H Critical Path to Field (added 2026-05-10 by John PM)

**Field-survey start**: < 2 weeks out (best estimate as of 2026-05-10).

**Awwal commitment (2026-05-10)**: develop all stories before field-work except date-dependent ones. Working overtime if required.

### Tier 1 — MUST ship before field-survey (FRC + minimum operational hygiene)

| # | Item | Tracker ref | Estimate | Why |
|---|---|---|---|---|
| 1 | R1-R5 BMAD restoration | §A | ~90 min | Establishes discipline template that every following commit relies on |
| 2 | F5a Pitfall #35 in playbook | §F | 10 min | F5 leftover; smallest item; close fast |
| 3 | F1 — Story 9-9 AC#7 logrotate | §F | ~1 hr | Prevents disk-fill incident during 30-day field run |
| 4 | **Story 9-12 Public Wizard + Pending-NIN magic-link** | sprint-status `ready-for-dev` | L (14 ACs) | **THE FRC #3 BLOCKER** — only thing between current state and FRC complete |
| 5 | VPS resize to `s-2vcpu-4gb` | §I | ~10 min ops | Pre-field capacity safety margin |

**Tier 1 total estimate**: ~2-3 days Dev Agent time + ~10 min operator time. Achievable in <2 weeks even with overtime contingency.

### Tier 2 — SHOULD ship if time allows (defense-in-depth + open-loop close-outs)

| # | Item | Tracker ref / sprint-status | Estimate | Why |
|---|---|---|---|---|
| 6 | F2 — Story 9-9 AC#4 rate-limit audit | §F | 4-8 hr | Auth-endpoint defense-in-depth; pentest-flagged gap |
| 7 | Story 9-13 TOTP MFA close-out | sprint-status `review` | ~30 min if ratifying | Above-NDPA-bar for super_admin auth posture |
| 8 | Story 10-5 DSA close-out | sprint-status `review` | ~30 min if ratifying | Legal artifact ratification (real-Iris + real-Gabe) |
| 9 | F8 — Alert ergonomics bundled PR | §F | ~60-75 min | Cadence audit + LATENCY_WINDOW_MS env-config; field-traffic ergonomics |
| 10 | F3 — Story 9-9 AC#9 SOC baseline | §F | passive | Either complete (calendar) OR invoke carry clause per §G |

**Tier 2 total estimate**: ~6-10 hr active dev + 1 hr ratification + passive observation. Stretches the timeline but mostly parallelisable with Tier 1.

### Tier 3 — Stretch goals (PM recommends defer to Operate-phase)

| # | Item | sprint-status | PM rationale for defer |
|---|---|---|---|
| 11 | Story 11-2 import service parsers | `ready-for-dev` | Post-field unless 9-12 needs imports for first enumerator session |
| 12 | Story 11-3 admin import UI | `ready-for-dev` | Depends on 11-2; same defer logic |
| 13 | Story 11-4 source badges + filter chips | `ready-for-dev` | Depends on 11-1 (done) but not field-blocking — Registry / Marketplace polish |
| 14 | Story 10-1 consumer auth | `ready-for-dev` | **Partner API governance — no partners exist yet.** Operate-phase. |
| 15 | Story 10-2 per-consumer rate-limit | `ready-for-dev` | Same: post-Story-10-1 cascade |
| 16 | Story 10-3 consumer admin UI | `ready-for-dev` | Same |
| 17 | Story 10-4 developer portal | `ready-for-dev` | Same |
| 18 | Story 10-6 consumer audit dashboard | `ready-for-dev` | Same |
| 19 | prep-export-row-cap-and-redirect | `ready-for-dev` | Preventive cap; no real export volume in production yet |

**PM call**: Awwal committed to "all stories before field" — that's the user decision. But I'm flagging that Tier 3 (especially Epic 10) is partner-API plumbing for partners that don't exist yet. Cutting Tier 3 from pre-field push frees ~30-40% of dev capacity for Tier 1+2 polish. Final call stays with Awwal as he goes.

### Tier 4 — Strictly defer (Operate-phase / Ministry handover)

- F7 → Story 9-14 worker process isolation — architectural, post-field
- Story 9-9 AC#10 follow-up (re-narrow firewall after self-hosted runner) — architectural, post-field
- Cousin Story to F7: self-hosted GH Actions runner inside tailnet — architectural, post-field
- F6 — alert threshold tuning — wait-and-see post field-traffic-start

---

## §I VPS Field-Exercise Sizing Decision

**Current state (verified 2026-05-10 ~12:16 UTC via Tailscale):**

| Spec | Value |
|---|---|
| Droplet plan | `s-1vcpu-2gb` (DigitalOcean basic) |
| RAM | 1.9 GiB total / 711 MiB used (37%) / 1.2 GiB available |
| Swap | 0 — no swap configured |
| CPU | 1 vCPU "DO-Regular" |
| Disk | 48 GB / 7.6 GB used (16%) |
| Load avg | 0.00 0.00 0.00 (idle) |
| Uptime | 15 days |
| PM2 ↺ counter | 51 (mostly deploy-driven post-2026-04-25 baseline reset) |
| Workers | All in-process with `oslsr-api` (until F7/Story 9-14 ships post-field) |

**Recommendation (John PM, 2026-05-10)**: **Upgrade to `s-2vcpu-4gb` for the 30-day field-exercise window.**

| Plan | Specs | Cost (USD/mo) | Cost (NGN/mo, ~₦1500/$) |
|---|---|---|---|
| Current `s-1vcpu-2gb` | 1 vCPU / 2 GB / 50 GB | ~$12 | ~₦18-20K |
| **Recommended `s-2vcpu-4gb`** | **2 vCPU / 4 GB / 80 GB** | **~$24** | **~₦36-40K** |
| `s-4vcpu-8gb` (over-provisioned) | 4 vCPU / 8 GB / 160 GB | ~$48 | ~₦72-80K |

**Cost differential for 30-day field exercise**: ~$12 = ~₦18-20K extra. Less than the ops manual print run.

### Why upgrade (not cost-justified vs current usage, but risk-justified)

Current 2GB / 1 vCPU works for pre-field admin (37% RAM idle). Field load layers on:

1. 50-100 enumerators concurrent submissions, sync, photo uploads
2. Daily backup CPU spike (~704ms event-loop block, observed in F5 incident)
3. In-process workers (until F7) — backup + email + fraud + import + ODK sync share the API event loop on a single vCPU
4. Postgres + Redis colocated — every query competes with API memory
5. Zero swap = OOM kill, not slow-down
6. Single moment of unexpected pressure (bulk import / multi-enumerator concurrent / runaway query) → data loss + interrupted enumerator session

A 4GB / 2 vCPU host buys:
- Headroom for the exact failure modes F7 was supposed to prevent (workers blocking event loop become tolerable on 2 vCPU)
- Memory ceiling that absorbs bulk-import + photo upload spikes
- Reversible: DO supports clean resize, snapshot before, downgrade after Operate-phase if telemetry confirms 2GB suffices

### Pre-resize checklist (operator)

- [ ] Take DO snapshot named `pre-field-resize-2026-05-XX`
- [ ] Schedule 5-min downtime window (low-traffic hour, e.g. 02:00 UTC)
- [ ] DO control panel → Droplet → Resize → `s-2vcpu-4gb`
- [ ] Confirm reboot completed; verify all services up via runbook §1.1
- [ ] Take post-upgrade snapshot named `post-field-resize-2026-05-XX` (canonical baseline)
- [ ] Update this §I with date + new RAM/CPU evidence
- [ ] Update MEMORY.md "VPS healthy at X% RAM" line with new figure
- [ ] Update runbook §1.1 droplet-spec line

### Post-field downgrade decision (Operate-phase)

After 30-day field exercise:
- If telemetry shows sustained <50% RAM and load avg <0.7 → safe to downgrade to 2GB
- If anywhere near saturation → keep 4GB through Ministry handover; document in transfer-protocol
- Decision: ~Day 25 of field exercise based on collected metrics

**Closing**: this §I gets a final entry once resize is executed.
