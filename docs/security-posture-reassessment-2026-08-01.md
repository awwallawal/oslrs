# OSLRS Security Posture — Re-Assessment, 2026-08-01

**Supersedes the verdict of:** `docs/security-posture-stride-mapping-2026-04-20.md` (that document's STRIDE
mapping, attack trees and control inventory remain valid and are NOT restated here — only the *grade* and
the *residual risk register* are re-scored).

**Verdict: A- (defensible).** Up from **B+** on 2026-04-20.

---

## 0. METHOD — read this before quoting the grade

⚠️ **This is a DESK re-assessment against the April rubric, using repository evidence and live checks. It
is NOT a penetration test and NOT an independent audit.** It re-scores the same three dimensions the April
document scored, against the same residual-risk register, so the two are comparable. It cannot discover
findings that only a black-box re-test would surface.

**Why it exists:** the April document set an explicit, falsifiable condition for A- — *"one 30-minute
Cloudflare setup closes the largest remaining infrastructure gap and raises the grade to A-"*. That
condition was met on **2026-06-09** and nobody re-graded, so the repo has been carrying a stale B+ for
~8 weeks. A stale grade is what a Ministry stakeholder or auditor reads.

**What would make this stronger than a desk re-score:** an independent black-box re-test (the R2 exercise
`sec-r2-20260603` was the last one), a ZAP/Nuclei baseline against prod, and a restore drill on a schedule
rather than on incident. Those are named in §4 and none is launch-gating.

---

## 1. Score

| Dimension | 2026-04-20 | 2026-08-01 | Why it moved |
|---|---|---|---|
| **Code-level** | A- | **A-** | Held, not raised. 25/25 findings in the register now `Fixed`; token/session hardening (9-42, 9-48, 9-49 in-memory access token), MFA (9-13), step-up reauth (13-17/13-18, 9-route `SENSITIVE_ACTIONS`), hash-chained `audit_logs` (⚠️ per-row tamper evidence holds, but the chain currently reports INVALID on ordering grounds — residual #11), bounded/`.strict()` payload schemas, `safe-redirect` open-redirect guard, the 22P02 unsafe-cast class fixed (13-34), and a CI guard against registry-read drift (13-37). **Not raised to A** because that claim needs a re-test, not a self-review. |
| **Infrastructure** | B- | **B+** | The April P0 is closed: **F-024 origin-lock** (Cloudflare proxy verified live today — `oyoskills.com` resolves to `104.21.x`/`172.67.x`; DO firewall admits only ~22 Cloudflare ranges on 80/443). Plus a **blocking OSV prod-scope gate in CI** (13-31/13-32) which closes April residual #7, and full email authentication (#2). **Not A-** because single-VPS SPOF and plaintext `.env` at rest remain. |
| **Operational** | C+ | **B** | Telegram critical alerting (9-15), operations dashboard (9-19), ops digest, `emergency-recovery-runbook.md` with a panic-start §0, backup worker + monthly promotion (9-35), `pre-blast-dry-run.md` as an enforced send gate, and — new today — a **read-only `prod-verify` workflow** that runs every mandatory pre-send check over CI's proven SSH path, so verification no longer depends on Tailscale. **Not B+** because there is still no recurring restore-drill cadence and no log aggregation. |

**Aggregate: A- (defensible).** The April document's own stated condition for A- is satisfied, and three
further residuals closed beyond it.

---

## 2. April residual-risk register — current status

| # | Risk (April) | Sev | Status 2026-08-01 | Evidence |
|---|---|---|---|---|
| 1 | No Cloudflare WAF / L7 DDoS mitigation | **P0** | ✅ **CLOSED** | F-024 fixed 2026-06-09; Story 9-9 subtask #11; `docs/f-024-origin-lock-runbook.md`. Verified today: DNS → Cloudflare IPs; DO firewall 80/443 restricted to Cloudflare ranges. |
| 2 | DMARC / SPF not configured | P1 | ✅ **CLOSED** | Verified live 2026-08-01: DKIM `resend._domainkey.oyoskills.com` present (aligns `d=oyoskills.com`); envelope SPF via `send.oyoskills.com` → `include:amazonses.com` + Resend Return-Path MX; DMARC `v=DMARC1; p=none; rua=…`. Root `include:spf.improvmx.com` is inbound forwarding, not a sending gap. |
| 3 | `Server: nginx` banner | P3 | ➖ Unchanged, **accepted** | Negligible; removal needs a custom nginx build. |
| 4 | No SRI on third-party CDNs | P2 | ➖ Unchanged | Google Fonts + hCaptcha load without integrity hashes; CSP constrains origins. |
| 5 | No `'strict-dynamic'` CSP | P2 | ➖ Unchanged, **story exists** | `9-47-csp-style-src-nonce-hash-hardening`, `ready-for-dev`. Current 17-directive CSP is deployed and strong. |
| 6 | No centralized log aggregation / SIEM | P2 | 🔸 **Partially mitigated** | Not a SIEM, but no longer "SSH + grep": Telegram critical alerts (9-15), ops dashboard (9-19), ops digest, and named standing signals (`registration.draft_rejected`, `registration.campaign_source_dropped`, `campaign_contact.record_failed`). |
| 7 | No automated vulnerability scanning in CI | P2 | ✅ **CLOSED** | `osv-scanner` prod-scope **blocking** gate in `lint-and-build` (13-31/13-32). Demonstrably live: it has blocked deploys **5×** on newly-disclosed advisories against unchanged deps. |
| 8 | `.env` secrets plaintext on VPS disk | P2 | ➖ Unchanged | Standard at this scale; rotation runbook exists. Vault/KMS costed in `post-handover-security-recommendations.md`. |
| 9 | Single-VPS SPOF | P2 | ➖ Unchanged | DO snapshots + PM2 auto-restart. Accepted at field-ops scale. |
| 10 | Backup restore drill cadence | P2 | 🔸 **Partially** | Backup worker + encrypted monthly promotion (9-35); restore procedure documented in the emergency runbook. **Still no recurring drill schedule** — the honest remaining gap in the operational score. |
| 11 | **Audit hash chain reports INVALID on prod** (NEW, found 2026-08-03) | P2 | 🔸 **Open — integrity intact, ordering is not** | `AuditService.verifyHashChain()` returns **INVALID** on prod and has since **2026-04-04** (`verified: 52` of 1,706). **This is not tampering:** classified with `pnpm --filter @oslsr/api audit:verify-chain` → **0 self-hash failures, 117 link forks, 0 gaps**; every row matches `computeHash` of its own contents. The writer forks the chain — `SELECT … FOR UPDATE` on the tail does not serialise two concurrent writers under READ COMMITTED (the second re-reads the same locked row; the other's INSERT was never in its scan), and `createdAt` is stamped in JS before the transaction opens. **Per-row tamper evidence holds; total ordering does not.** Cited here because §1 credits "hash-chained immutable `audit_logs`" as a code-level control, and a control that reports INVALID in normal operation gets ignored. Fix direction: serialise on a constant `pg_advisory_xact_lock` and/or order by a monotonic sequence — a story, not a patch, and **never** by recomputing stored hashes. Tracked as 13-49 R12. |

**Movement: the single P0 closed, the single P1 closed, one P2 closed outright, two P2s partially
mitigated. Nothing regressed. ONE NEW FINDING was opened on 2026-08-03 (#11, audit-chain ordering)
— found by verifying an unrelated backfill, not by a scheduled check, which is itself worth noting.**

---

## 3. Findings register

`docs/security/findings-register.md` — **25 of 25 findings `✅ Fixed`. Zero open, zero
accepted-with-residual-risk.** Includes both R2 Highs (F-011 plaintext reset token; F-024 origin
reachability) and every Medium.

---

## 4. What is NOT claimed, and what would raise the grade further

Stated plainly so nobody quotes this document beyond its evidence:

- **This is not a re-test.** An independent black-box exercise (last: `sec-r2-20260603`) is what would
  justify moving code-level from A- to A. **Recommended before any public/press launch**, not before the
  email blast.
- **To reach a defensible A overall**, the three unchanged P2s are the roadmap: managed secrets
  (Vault/KMS or DO App Platform), redundancy beyond a single VPS, and log aggregation. All three are
  costed in `docs/post-handover-security-recommendations.md` (~₦300-500K one-time + ~₦7-30K/mo).
- **Cheapest real improvements from here**, in order: (a) put the restore drill on a quarterly calendar —
  closes residual #10 and lifts operational to B+ for essentially zero cost; (b) tighten DMARC from
  `p=none` to `p=quarantine` **after** the blast, once `rua` reports confirm alignment in the wild —
  doing it before would risk your own launch mail; (c) land 9-47 for `strict-dynamic`.

---

## 5. Launch relevance

**Nothing in this re-assessment gates the relaunch.** The launch-blocking item remains commercial —
Resend Pro — not security. Email authentication is correctly configured, so the blast's deliverability
posture is sound (§2 #2). The one security-adjacent action worth taking *after* the blast is the DMARC
tightening in §4.

---

## 6. Provenance

- Rubric + control inventory: `docs/security-posture-stride-mapping-2026-04-20.md`
- Findings: `docs/security/findings-register.md` (R2 `sec-r2-20260603`, white-box pinned to `f2b9695`)
- Origin-lock: `docs/f-024-origin-lock-runbook.md`; Story 9-9 subtask #11
- Port/attack-surface policy: `docs/port-audit-2026-05-08.md` (Story 9-9 AC#3) — **note its standing rule:
  a `ufw` ALLOW for a port the DO firewall denies is graded a defence-in-depth gap. A proposal on
  2026-08-01 to open UDP 41641 for Tailscale direct connections was measured, then WITHDRAWN on this
  basis; the operational need it addressed is served by the `prod-verify` workflow instead.**
- Forward spend options: `docs/post-handover-security-recommendations.md`
- Live checks performed 2026-08-01: DNS (Cloudflare proxy, SPF/DKIM/DMARC), `ufw status`, `tailscale
  netcheck` both ends, DO firewall rule set, findings-register tally.
