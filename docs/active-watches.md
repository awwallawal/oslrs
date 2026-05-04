# Active Watches — what to monitor and when

**Living dashboard.** Single source of truth for all calendar gates, follow-ups, and SM-blocked items across Epics 9, 10, 11. Items appear when active; **items are deleted when closed** (this is not a history log — sprint-status.yaml + story Change Logs hold history).

**Last updated:** 2026-05-04 (Story 9-8 enforcing flip applied locally — operator push pending; 48h re-monitoring window 2026-05-01→2026-05-03 closed clean)

**Update protocol:** at the end of every session that creates new monitoring items, edit this file. When watching this file, sort entries by date ascending within each section. Keep it ≤1 screen.

---

## 🔴 Active this week (2026-05-02 → 2026-05-08)

| Date | What | Where to act | Why it matters |
|---|---|---|---|
<!-- Story 9-8 watch removed 2026-05-04: 48h window closed CLEAN (0 violations); enforcing flip committed locally; operator push starts a 1-hour browser-soak window (see new entry below). -->
| **2026-05-04 (post-push)** | **Story 9-8 enforcing-flip browser-soak — 1 hour after operator pushes the local commit** | `git push` triggers CI redeploy (~6 min). Then: `curl -sI https://oyotradeministry.com.ng/ \| grep -i 'content-security'` should show `content-security-policy:` (no `-report-only`). Browser DevTools Console clean for 1 hour on golden-path flows (homepage, login, register, dashboard, marketplace, insights). `pm2 logs oslsr-api \| grep csp_violation` should remain quiet. | If any new violation fires, 2-min rollback recipe documented in `infra/nginx/oslsr.conf` comment block lines 51–52 (rename header back to Report-Only, commit, push). |
| **2026-05-03 → ?** | **Story 9-11 (Audit Log Viewer) — incoming code review** | When Awwal signals 9-11 dev is feature-complete, invoke `/bmad:bmm:workflows:code-review` on `9-11-audit-log-viewer.md` against the uncommitted working tree (per `feedback_review_before_commit.md`). Working tree already carries 17 9-11 files alongside 10-5 docs (Pitfall #30 — parallelism, not contamination); selective stage at commit. | 9-11 is upstream of Stories 10-1 + 10-6 in the dependency chain (see Cross-story chain section). |
| **2026-05-04** | **Story 9-10 7-day post-fix trajectory pull** | `ssh root@oslsr-home-app && pm2 status` — read ↺ counter; reference commit `718f84e` deploy completion 2026-04-27 ~07:30 UTC | If ↺ ≤2: AC#1 + AC#3 satisfied → write `apps/api/src/docs/9-10-pm2-restart-post-fix-trajectory.md`. If >2: iterate fix or scope 9-10b |
| **2026-05-04** | **Story 9-10 AC#5 pino log noise audit** (2-hour timebox) | `pm2 logs oslsr-api --lines 5000` — categorize repeated patterns; adjust log levels in code | Done criteria: 2-hour timebox spent OR all surfaced patterns addressed; remaining patterns become new `[AI-Review][LOW]` follow-ups in 9-10. **No infinite-tinker scope.** |
| **2026-05-04** | **Cloudflare WAF / PM2 / CSP follow-up checklist** | `docs/follow-ups/2026-05-04-cloudflare-waf-pm2-csp-review.md` (existing checklist file) | Trajectory capture + spontaneous-vs-deploy decomposition for Story 9-10 |
| **2026-05-08** | **Story 9-10 AC#4 decision gate: 11-1 dependency** | ✅ **RESOLVED FAVOURABLY** — Story 11-1 closed Done 2026-05-03. The conditional split into `9-10b-akintola-endpoint-audit` is therefore *not* triggered; 9-10 AC#4 can proceed against 11-1's shipped schema. Confirm at this gate that AC#4 EXPLAIN audit work has actually started against the new tables. | The conditional fork is closed; proceed with 9-10's regular AC#4 path. |

---

## 🟠 This month (8-30 days, 2026-05-09 → 2026-05-31)

| Date | What | Where to act |
|---|---|---|
| **2026-05-23** | **Story 9-9 AC#9 4-week SSH activity baseline closes** (long-pole) | Synthesize `docs/ssh-activity-baseline-2026-05-XX.md` from 4 weekly snapshots (`docs/ssh-activity-baseline-week-1..4-*.md`); add to monthly review cadence in runbook §6.1 |
| **2026-05-25 (~30d)** | **DO snapshot expiry**: `pre-os-upgrade-2026-04-25` + `clean-os-update-2026-04-25` | If still wanted past 30 days, take a fresh snapshot or extend retention. Otherwise let them roll off — current state is well-captured. |

---

## 🟡 Next 90 days (June - July)

| Date | What | Action when it fires |
|---|---|---|
| **2026-06-02** | **GitHub forces Node 24 default** | Verify SHA-pinned actions (upload-artifact / download-artifact / pnpm-action-setup) still work. Re-bump to tagged Node 24 stable releases when published (likely v6.x line). Drop FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 env var if it ever gets re-introduced. |
| **2026-06-22** | **Let's Encrypt cert renewal pre-flight** | `docs/follow-ups/2026-06-22-letsencrypt-cert-renewal-preflight.md` (existing checklist) — current cert SAN includes `oyotradeministry.com.ng` + `oyoskills.com` (4 domains total); auto-renew via certbot |
| **2026-07-25** | **Let's Encrypt cert expiry** (auto-renews ~30d before) | Should self-resolve via certbot cron; verify the renewal happened by curling cert validity post-renewal |
| **2026-09-16** | **GitHub removes Node 20 from runners entirely** | If we haven't re-bumped to tagged Node 24 stable releases by now, the SHA pins must already be on Node 24 commits (they are). Should be a no-op. |

---

## 🟢 Quarterly recurring (per runbook §6.1)

- **Telegram alert heartbeat drill** — `curl -X POST .../sendMessage -d "text=Heartbeat $(date)"` from VPS; confirm phone vibration. Catches operator-changed-phone, bot-token revoked, notifications muted.
- **Backup restore drill** — once AC#5 backup encryption ships (Wave 1), test restore from encrypted dump against scratch Postgres
- **VPS root password rotation** — confirmed strong but on quarterly cadence per runbook §1.5
- **DO snapshot review** — clean up old snapshots, take fresh baseline if no recent one
- **Break-glass account credential test** — `admin@oyoskills.com` super_admin login still works; password unchanged in manager
- **SSH activity baseline review** (post 2026-05-23 once AC#9 closes) — monthly review for anomalies

---

## ⏳ Blocked on SM (Bob) — invoke `*create-story --yolo` when ready

| Item | Why deferred | When to invoke |
|---|---|---|
| **Story 9-9a / 9-9b split** | 9-9 is `in-progress` since 2026-04-25 with 5/10 ACs done. Per `feedback_canonical_create_story_workflow.md` cannot ad-hoc create stories; sprint-status comment honestly reflects "DONE 5/10" as mitigation. | Next session that resumes 9-9 backlog work (ACs #3 port audit, #4 auth rate-limit, #5 backup encryption, #7 logrotate) |
| **Story 9-14 — self-hosted GH Actions runner inside tailnet** | Architectural unblocker referenced in 5+ places (9-9 AC#10 follow-up, 9-10 AC#3, runbook §6.1, ADR-020, memory). Slot 9-14 open (9-13 = TOTP MFA). | When you want to re-narrow SSH firewall back to `100.64.0.0/10` + DO infra ranges OR eliminate any remaining VPS resource pressure |
<!-- Story 9-10b row removed 2026-05-03: condition (11-1 not merged by 2026-05-08) did not trigger — 11-1 closed Done 2026-05-03. -->
| **Story 10-5 ratification — real-Iris + real-Gabe sign-off on v1.1** | DSA template + SOP + signoff doc all bumped to v1.1 incorporating R1 (6M+4L) + R2 (5H+8M+4L) findings. AI-agent persona drafts in place; two `_pending real-human ratification_` rows in `dsa-template-v1-signoff.md` Sign-off table need real-human countersignatures before any partner-facing use. | When real-Iris + real-Gabe are identified and onboarded (likely Operate-phase Ministry counsel, post-Transfer). Until then 10-5 sits in `review` status — operational deliverables ready, ratification gate open. |

---

## 📋 Deferred LOWs (parked, no urgency, tracked in story Review Follow-ups (AI))

**Story 9-9 AC#6 Telegram alerting polish** (`9-9-infrastructure-security-hardening.md` Review Follow-ups):
- F3: chat_id leak risk in error logs (theoretical; defer until external log forwarding adds real risk)
- F5: `disable_web_page_preview` deprecated by Telegram API (still works; future polish to `link_preview_options.is_disabled`)
- F6: No clickable URL in alert text (low value)
- F7: No tokenPrefix in error logs (multi-bot debug aid; defer unless multiple bots)
- F9: process.env reads on every dispatch (sub-microsecond/hour; defer unless profiling surfaces real cost)

**Story 9-10 H2** — AC#7 ioredis regression test deferred. Either write before AC#3 closes (2026-05-04 window) OR explicitly accept as long-term LOW with rationale documented at story closure.

**Story 9-13 deferred follow-ups** (added 2026-05-02 from AC#13 code-review of uncommitted working tree):
- **F5 [MEDIUM]**: Controller integration test suite (~10-15 tests) — Task 6.2 originally deferred; ~2-hour pass before story → done
- **F9 [MEDIUM]**: Backup-code-used email notification (AC#4 partial) — needs template-pattern decision; story Change Log corrected to reflect "10 of 11 ACs" not "11 of 11"
- **F10 [LOW]**: Cookie path `/api/v1/auth` duplicated between `mfa.controller.ts` + `auth.controller.ts` — extract to `lib/cookie.ts` shared constant when convenient
- **F13 [LOW]**: `mfa_secret` plaintext storage with `TODO(9-9)` marker — **auto-converts when Story 9-9 AC#5 (backup AES-256 encryption) ships**. Update this entry on that day.

---

## 🎯 Field Readiness Certificate — current state

Per `_bmad-output/planning-artifacts/epics.md` § FRC (revised 2026-04-27):

| # | Item | Story | Status |
|---|---|---|---|
| 1 | Tailscale live + SSH public-port closed | 9-9 (Tailscale subtask) | ✅ Done 2026-04-23 |
| 2 | Story 11-1 schema + Akintola composite indexes | 11-1 | ✅ Done 2026-05-03 |
| 3 | Story 9-12 Public Wizard + Pending-NIN + Magic-Link | 9-12 | ⏳ Backlog (ready-for-dev) |
| 4 | prep-input-sanitisation-layer merged | prep task | ✅ Done 2026-05-03 |
| 5 | Backup AES-256 client-side encryption + restore drill | 9-9 (subtask 5) | ⏳ Backlog (Wave 1) |
| 6 | Operations Manual enumerator-section drafted + printed | Iris / Gabe | ⏳ Backlog (legal/ops, off-engineering) — *adjacent material from Story 10-5 (DSA v1.1 + SOP v1.1, 1,555 lines) is now on file under `docs/legal/`; this is **not** the enumerator section itself but is in the same author/voice and reduces drafting effort when real-Iris + real-Gabe pick up the Operations Manual* |

**Score: 3/6 done. 3 outstanding.** All 3 outstanding items are zero-cost on the engineering side (item #6 is Iris/Gabe non-engineering work; Story 10-5's legal/ops material is adjacent prior art that Iris/Gabe can draw on but does not itself satisfy this gate).

**Note:** Story 9-9 AC#6 Telegram alerting was originally tagged FRC #5 but **demoted to Ministry hand-off recommendation 2026-04-27**; that slot now holds AC#5 backup encryption. AC#6 Telegram is "above-and-beyond improvement" (already shipped 2026-05-01), not field-blocking.

---

## 🔗 Cross-story dependency chain (what unblocks what)

```
prep-input-sanitisation-layer (FRC #4) ──► 11-2 (Import Service)

11-1 (Schema, FRC #2) ──┬─► 9-12 (Public Wizard, FRC #3)
                        ├─► 11-2 ──► 11-3 (Import UI)
                        ├─► 11-4 (Source Badges)
                        └─► 9-10 AC#4 (EXPLAIN audit) [decision 2026-05-08]

9-11 (Audit Log Viewer) ──┬─► 10-1 (Consumer Auth)
                          └─► 10-6 (Consumer Audit Dashboard)

10-5 (DSA Template) ──► 10-1 (Consumer Auth) ──┬─► 10-2 (Rate Limit) ──┬─► 10-3 (Admin UI)
                                               │                        ├─► 10-4 (Dev Portal)
                                               │                        └─► 10-6 (Audit Dashboard)
                                               └─► 10-3, 10-4, 10-6
```

Critical path to field-survey start: **11-1 → 9-12 + prep-sanitisation + 9-9 AC#5 backup encryption + Operations Manual drafted (Iris/Gabe).** Engineering can sequence 11-1 → prep-sanitisation → 9-12 in parallel with 9-9 AC#5; Iris/Gabe Operations Manual is independent.

Epic 10 is **post-field** — does NOT block field-survey start.

---

## Operating notes

- **End-of-session ritual:** Before declaring "session closed", check this file. Add new watches; delete closed ones; nudge dates if calendar slipped.
- **Cross-references:** Each item links out to detail (story files, runbook sections, follow-up checklists). This file is shallow; the truth lives in the linked sources.
- **If this file gets long:** something has slipped. Re-prioritize, split items, or escalate.
