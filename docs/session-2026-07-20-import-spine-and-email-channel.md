# Session 2026-07-20 — Import Spine (11-2) + Email-Channel Ingest & the Verification/Identity Stack

**Participants:** Awwal (Builder) · Dev (Opus 4.8, dev-story) · Bob (SM, *create-story) · John (PM, validate/harmonize)
**Read this to trace:** why 11-2 was built, where the ITF/email-channel work came from, and what each spawned story is for. This is the provenance record for code-review, commit, and the eventual retrospective.

---

## TL;DR chain (how one thing led to the next)

1. **Started `dev-story` on 13-2** (association importer). → Discovered **13-2 hard-depends on 11-2 (import service), which was NOT built** — only the 11-1 schema existed. (`import-sources.ts` absent; the `import.queue/worker` present were the *staff* importer, unrelated.)
2. **Awwal ruled: sequence 11-2 first**, so 13-2 becomes the thin association slice it was scoped as.
3. **Built 11-2 in full** (import spine): dry-run → confirm → 14-day rollback, CSV/XLSX/PDF parsers, per-source config, `shared_email`... (no — that's 11-5) dedup on phone/NIN, audit, defensive status gates. 52 tests; full API suite green (3197). Status → **review**.
4. **Tested 11-2 against Awwal's real ITF PDF** (`Oyo_shortlisted_artisans.pdf`, 3,675 rows). Two findings that reshaped the plan:
   - **Redacted phones** (`******************`) — the shortlist PDF masks the mandatory dedup/contact key → every row would fail.
   - **`respondents` has no email column** — 11-2 could only stash imported email in `metadata.imported_email` (not dedup-able, not campaign-targetable).
   - Also a real **parser bug**: the register opens with title rows above the header → "first row = header" collapsed everything. **Fixed** (`findHeaderRowIndex`) + corrected the real ITF column mapping.
5. **Awwal's question: can we ingest email-only (phone absent, email present)?** → Yes, and email is arguably the *better* channel for this cohort (it moves verification off Termii/SMS onto Resend/email, already live). Wrote the requirements brief.
6. **Bob authored Story 11-5** (email-channel ingest). **John validated → SPLIT (Awwal-ratified):** 11-5 = ingest; **13-39** = verify/contact.
7. **John verified the existing verification model** before drafting a new one — it already exists (`registry-data-status-taxonomy.md`, R1–R4). **Amended it with R5** (email as a channel-agnostic member-side confirmation vector; email is NOT an identity key → feeds R2 `identity_ambiguous`).
8. **Spun up 3 missing stories** the thread exposed: **11-6** (email backfill), **11-7** (identity-ambiguous resolution + merge), **13-40** (Assessor verify-imported-rows queue — the taxonomy-specified human fallback).
9. **John prioritized 12-4** as the linchpin (every verification/identity story derives from its model).

---

## Story map (what exists now, and where it came from)

| Story | Status | What | Provenance |
|---|---|---|---|
| **11-2** import spine | review | dry-run/confirm/rollback + CSV/XLSX/PDF parsers + dedup + audit + status gates | pulled forward to unblock 13-2 |
| **11-5** email-channel ingest | ready-for-dev | first-class `respondents.email` + reachability (phone-OR-email) + `shared_email`-safe dedup + email-never-public + ITF both-eventualities | ITF real-fixture findings (§4 above) |
| **13-39** email import-verification | backlog | confirm-first magic-link → tier-1→tier-2 + cleaning loop + bounce + Cohort-D + DPIA | carved from 11-5 (the split) |
| **11-6** email backfill | backlog | populate `respondents.email` for existing wizard/OAuth rows | so email dedup vs the live registry is strong |
| **11-7** identity resolution + merge | backlog | act on R2 `identity_ambiguous` / `email_match_review` / `shared_email` flags (manual merge/keep-separate) | flags are created but nothing acts on them |
| **13-40** Assessor verify-imported queue | backlog | human fallback for member-side confirmation | taxonomy-specified, never storied |
| **12-4** registryTotals/data_status model | ready-for-dev (Epic 12) | the 3-axis derivation service — the LINCHPIN all the above read | elevated this session |

---

## Documents touched / created this session

- **Created:** `docs/launch-campaign/itf-email-channel-ingest-brief.md` (requirements brief) · stories `11-5`, `13-39`, `11-6`, `11-7`, `13-40` · this session doc.
- **Amended:** `registry-data-status-taxonomy.md` (**R5** — email as channel-agnostic member-side check; email ≠ identity key) · `11-2` story (dev record + these findings) · `epics.md` (Story 11.5 + parity) · `sprint-status.yaml` (all new stories) · `roadmap-to-launch.md` (12-4 priority + Epic 11 pull-forward) · `.github/workflows/ci-cd.yml` (11-2 migrate runner) · `apps/api/.gitignore` (ITF PII fixture).
- **Code (11-2, uncommitted, awaiting Awwal's separate code-review):** see the 11-2 File List.

---

## Durable lessons (retro input)

1. **Verify story dependencies against the codebase before building.** 13-2's "one enum + one config block" framing was true *only if 11-2 existed* — it didn't. A 10-minute ground-truth check (does `import-sources.ts` exist?) reframed the whole plan. [[pattern-ship-a-fix-that-never-fires]] cousin: *a story that can't fire because its substrate is unbuilt.* **→ Formalized as Pitfall #43** in `docs/infrastructure-cicd-playbook.md`.
2. **Real fixtures beat synthetic ones for ingest code.** The synthetic pdfkit test passed; the *real* ITF PDF exposed (a) redacted phones, (b) title-rows-before-header, (c) the missing email column. None were visible without the real file.
3. **An importer that hard-requires phone silently excludes email-only accountable cohorts.** Reachability (phone OR email) is the durable shape — the intake twin of 13-33's "many intakes, one registry."
4. **Email is a weak dedup key.** Blind email-collapse merges distinct artisans (shared/proxy/cybercafé addresses). `shared_email` flag-not-collapse is load-bearing, and email must stay OUT of the R2 distinct-identity key.
5. **Verify the model exists before drafting a new one.** The "unified verification" work was already done (taxonomy R1–R4); the right move was a one-paragraph R5 amendment, not a redundant doc.
6. **Split by job-to-be-done + gate.** Ingest (no external gate) vs verify (DPIA/Termii-marker gated) are different jobs — coupling them blocks the clean half behind the gated half. Mirrors 11-2(spine)/13-2(campaign).

---

## Open items / next actions

- **Code review of 11-2** — Awwal runs it in a separate CLI, then commit/push. (Nothing in this session pre-empts that.)
- **DPIA — DRAFTED 2026-07-20 (Iris), awaiting Ministry ratification.** No longer an open unknown: `docs/legal/dpia-appendix-h-multichannel-collection-v1.md` (Appendix H addendum H-MC, covers association proxy / imported-register+email / edge capture) + `docs/legal/association-member-consent-evidence-form-v1.md` + `docs/legal/dpia-multichannel-signoff-v1.md`. **DPO/oversight resolved** — the **SABER Focal Person** (the project runs under their guidance; NDPA s.32 satisfied). **Remaining human steps:** Awwal transcribes the `⟪…⟫` facts → Ministry (Controller) ratifies → files with NDPC. Gates the 13-2 cascade + 13-39 *send*, not the build.
- **12-4 sequencing** — elevated as linchpin; see `roadmap-to-launch.md`.
- **Chase ITF unmasked CSV** in parallel (adds phone + fixes the ADM↔NAME merge) — but 11-5 means we are no longer blocked on it.
- **One-promotion-path constraint** — all tier-1→tier-2 promotion (SMS/email/assessor) must go through a single 12-4-aligned service method, not per-story.
