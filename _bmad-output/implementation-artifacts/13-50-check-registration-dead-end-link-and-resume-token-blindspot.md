# Story 13.50: `/check-registration` hands adopted people a dead-end link — and nothing audits it

Status: backlog

## Story

As **someone already in the register who checks their own status**,
I want **the link I am emailed to show me my registration**,
so that **I am not sent back through a wizard that ends in "This NIN is already registered" —
an error that reads, to the person receiving it, as though the Registry has lost them.**

And as the **operator**,
I want **`wizard_resume` token issuance to appear in the audit trail**,
so that **the volume of this is measurable at all — it currently is not.**

## Context

Both halves were found on 2026-08-05 while closing 13-49 R5. They are one story because they are
one code path: the second is the reason the first went unnoticed for so long.

**Half 1 — the dead-end link.** `registration-status.service.ts:293` issues a **`wizard_resume`**
magic link to anyone who looks up their status by email at `/check-registration`. For a person whose
registration is already complete, that link is a trap:

```
/check-registration → emailed a wizard_resume link → resume the wizard →
refill → submit → 409 NIN_DUPLICATE
```

The code comment already concedes the gap:

> *"It issues a wizard_resume magic-link. It lands on the authenticated status home (9-40) when
> shipped; today it degrades gracefully to the wizard resume/summary surface."*

**It does not degrade gracefully for an adopted person. It degrades into an error.**

This compounds with 13-49 **R4**, which ruled that the adoption confirmation should point people at
`/check-registration` instead of promising an amend link. That ruling was right on its own terms —
but it means **174 adopted people were directed to the one surface that hands out the bad link.**

**Half 2 — the blind spot that hid it.** `wizard_resume` mints are **not audited**. On 2026-08-05,
**86** were created, and `magic_link.issued` recorded only `login` and `pending_nin_complete`. An
entire token purpose is invisible to the audit trail.

That is why this looked like a small fixed problem for a day. The stock was measured at 37, a
mitigation was sized against 37, and an hour later the same query returned 39 — **the number moving
between two measurements is the only reason a producer was looked for at all.** With the mints
audited, "86 today" would have been on the first screen instead of the fifth.

## What has already been done (do not redo)

- **38 dead-end tokens expired on prod, 2026-08-05** (13-49 R5), on Awwal's instruction. Targeted:
  only adopted people who **already hold a NIN**, because only those dead-end. The one adopted
  person **without** a NIN was deliberately left alone — R21 now attaches their submission and
  returns their existing reference code, so their link works correctly.
- **`wizard_drafts` were NOT touched** (278 rows intact). A token is not draft data, so Awwal's
  keep-forever retention ruling is untouched, and this story must preserve that.
- **The expiry is a stopgap and will not hold.** Every adopted person who checks their status mints
  a fresh dead-end link. Re-running it is a treadmill; that is what this story ends.

## Acceptance Criteria

### AC1 — `/check-registration` stops issuing dead-end links
1. When the looked-up respondent's registration is **already complete** (has a NIN / `active`), the
   emailed link MUST NOT be `wizard_resume`. It goes to a status surface that shows their reference
   code and current state.
2. When the respondent is **`pending_nin_capture`**, behaviour is unchanged where it already works
   — `pending_nin_complete` is the correct purpose there and the 9-12 ladder depends on it.
3. ⚠️ **Do not blanket-disable `wizard_resume`.** It is correct for a genuinely mid-wizard person
   who has no respondent row yet. The branch is on *registration completeness*, not on the purpose.
4. **RED-verify:** neuter the branch, prove a test fails, restore by hand. A test that asserts the
   happy outcome without ever exercising the branch is the defect class in
   [[pattern-test-that-passes-over-a-hole]] — 13-49's `--dry-run` flag was parsed and read by
   nothing, and the test was green.

### AC2 — `wizard_resume` issuance is auditable
1. Every `wizard_resume` mint writes `magic_link.issued` with its purpose, matching what `login`
   and `pending_nin_complete` already do.
2. The audit row records **why** it was issued (`trigger`), so `/check-registration` mints are
   distinguishable from genuine mid-wizard resumes. Without that, the count is a number with no
   denominator.
3. ⚠️ **Check the other purposes while in here.** Two of five were found unaudited by accident;
   nobody has verified the remaining ones. Enumerate the enum in
   `db/schema/magic-link-tokens.ts` and confirm each mint site writes an audit row — an
   audit-coverage gap found by accident twice is a gap nobody has ever swept.

### AC3 — Prove it on the real cohort
1. After deploy, `SELECT` live `wizard_resume` tokens held by adopted people → **0**, and it
   **stays** 0 across a day of normal `/check-registration` traffic. The stock returning is the
   signal that AC1 branched on the wrong condition.
2. **REOPEN TRIGGER:** any `NIN_DUPLICATE` in the audit log from an adopted person. Currently **0** —
   the exposure has never actually been realised, which is why this is not launch-gating.

### AC4 — A half-typed email must not become a person

**Found 2026-08-06 by four bounces inside 100 seconds** — which is the tell: four people do not
independently mistype `.com`.

```
yusuffasiat@gmail.co          dayoariremako88@gmail.co
ogunbonadamola@gmail.co       aladechristianahtosin@gmail.co
```

**`wizard_drafts` is keyed on `email`, and the wizard autosaves while the user is still typing.** So a
half-entered address gets its own row. Each of those four has TWO drafts — the `.co` and the `.com` —
and the `.co` one is a **phantom person**.

This is the known mid-keystroke-autosave trap ([[draft-nin-questionnaire-first]], where `form_data.nin`
is a partial snapshot) with the failure moved somewhere much worse: **there the half-typed value is
just bad data in a field; here it is the PRIMARY KEY, so it manufactures a person who never existed.**

What it cost, measured:
- **All 4 phantoms were invited in D4** — mail sent to addresses that cannot receive it.
- **All 4 belong to people who were ALREADY in the register.** We invited four registered citizens to
  register, at addresses they do not have.
- The D4 denominator is **71 real invitees, not 75** → conversion is **5/71 = 7.0%**, not 6.7%.
- Suppression keyed the `.co` strings, so their real `.com` addresses are untouched. No lasting harm
  to those four — this is a data-hygiene and metrics defect, not a citizen-facing one.

Exactly **4** exist repo-wide; none outside D4. Contained, and worth fixing before the next blast.

1. **Do not persist a draft under an email that is still being typed.** Debounce is not enough — the
   row is created on the first autosave. Options, in the order I would try them: only key a draft
   once the address passes the same validation Step 2 already applies at Continue; or key drafts on a
   stable client-side id with `email` as an ordinary column.
2. ⚠️ **Do not "fix" this by deleting the phantoms and calling it done.** The producer is still
   running — same trap as R5, where 38 tokens were expired while `/check-registration` kept minting
   more. Clear the 4 AND close the path that makes them.
3. **RED-verify:** simulate the autosave sequence `a@gmail.c` → `a@gmail.co` → `a@gmail.com` and
   assert **one** draft row results, not three.

### AC5 — A pre-blast phantom sweep, because the detector is one query

Any cohort assembled from `wizard_drafts` inherits AC4's phantoms. The blast scripts already have a
`--dry-run`; this belongs in it as a **blocking pre-flight**, not a report nobody reads.

```sql
-- a draft email that is a strict PREFIX of another draft email = abandoned mid-typing
SELECT a.email AS phantom, b.email AS real_address
FROM wizard_drafts a
JOIN wizard_drafts b ON b.email LIKE a.email || '%' AND b.email <> a.email;
```

1. Every blast script runs this over its cohort and **excludes** matches, printing what it dropped.
2. ⚠️ **`log()` the exclusions.** A silent filter reads as "everyone was contacted" — the failure
   mode in [[pattern-test-that-passes-over-a-hole]] applied to operations rather than tests.
3. **Also exclude drafts whose owner is already registered.** Three of the four phantoms were, and
   that check is independently useful: D4 should never have invited a registered person at all.
4. Reconcile the cohort count against `campaign_sends` after the run —
   [[pattern-batch-job-races-live-users]] already requires this per run; phantoms are a second reason.

⚠️ **This changes the D4 conversion baseline.** Any conversion figure quoted before this sweep used
75; the honest denominator is 71. Fix the metric wherever it is computed, or the improvement from
excluding phantoms will look like a conversion lift that never happened.

## Out of scope

- **9-40's authenticated status home.** This story routes to whatever exists today; it does not
  build the destination. If 9-40 lands first, AC1 points at it instead.
- **Deleting adopted drafts.** Ruled out permanently — retention is keep-forever.

## Notes for whoever picks this up

- **Not launch-gating, but it degrades with engagement** — the opposite of most backlog items. Every
  adopted person who checks their status adds one. Volume grows with the thing we want more of.
- Sibling of [[pattern-ship-a-fix-that-never-fires]]: there the fix never executes; here the fix
  executes and the condition regenerates behind it. **Ask of any stock-clearing remediation: what
  produces these?** — before calling it done.
