# Story 13.59: Activation ends with nothing in the person's hands

Status: done

<!-- PREPPED FOR DEV 2026-08-12 by Bob (SM) on Awwal's launch-date ruling: FULL SPEC, all 8 ACs
including the AC5/AC6/AC7 first-login modal + permanent home, no carve. SM note on record: this is
the largest chunk in the field-day batch and is sequenced LAST (13-60 → 13-57 → 13-59) so that if
anything slips it is the modal, not the selfie or the ingestion boundary. Premises re-verified
against prod 1f06179: `activation.complete` is a bare log line with no side effect (auth.service.ts
:275-280, sole occurrence), and the prod staff count in AC3.3 was stale — the field path HAS now
been exercised. FIELD-DAY GATE 3 of 3. -->

<!-- ⛔ DO NOT REGENERATE THIS FILE WITH *create-story. It would author from epics.md and destroy
two rounds of amendments including the AC4 no-attachments ruling. Edit in place. -->


<!-- EMERGENT 2026-08-09 from the enumerator invite dry run (Awwal's observation). Activation
currently ends by redirecting to a login page and issuing no artefact at all.

⚠️ AMENDED TWICE ON 2026-08-10 (Awwal, John/PM). First amendment attached the briefing + ID card to
the email; **that was RULED OUT the same day and attachments are OFF** — see AC4. The artefacts are
delivered in-app via a first-login modal with a permanent home (AC5/AC6/AC7). The email is the
prompt, not the carrier. -->

## Story

As **a newly activated enumerator, clerk, assessor, official or admin**,
I want **an email confirming my account is live and what I can now do**,
so that **I have something durable that says who I am on this platform — instead of a redirect and
nothing.**

## Context

The invitation email exists. The **completion** email does not. Today the wizard finishes, the page
waits five seconds, and the person is sent to a login screen. That is the entire close of the flow.

For a field officer walking into an LGA office, the email is often the only thing they can show. It
is also the only durable record of what role they hold — and for enumerators it is the natural place
for the field rules that currently live only on a printed sheet
(`docs/runbooks/enumerator-field-briefing.md`, 13-4 R8) that they may not be carrying.

⚠️ **On the word "onboarded":** avoid it. It is SaaS/HR jargon and reads oddly in Nigerian government
English — nobody says *"I have been onboarded."* Subject line: **"Your OSLRS account is active — [Role]"**.

## Acceptance Criteria

### AC1 — One email, sent on successful activation, per role

Sent once, on `activation.complete`, to the address the account was invited at. Role-specific body:

✅ **VERIFIED 2026-08-12 (Bob/SM) — the premise holds exactly.** `activation.complete` is a **single
occurrence in the whole API** (`auth.service.ts:275-280`), and it is a bare `logger.info` followed
immediately by `return updatedUser`. **No email, no artefact, no side effect of any kind.** That log
call is your insertion point, and it sits *after* the `db.transaction` commits (`:198`) — correct
placement for AC2.2, since a send failure there cannot roll the activation back.

| role | the sentence that matters |
|---|---|
| Enumerator | *"You are cleared for field registration in [LGA]."* + staff ID + **the read-out rule** (never read a number until the app shows one) + **"log in and download your ID card and field briefing before you go out"** (AC4) |
| Clerk | *"You can now enter registrations from the office."* |
| Assessor | *"You can now review and score submissions."* |
| Government Official | *"You now have read access to registry reports."* |
| Super Admin | *"You have full administrative access."* + a security line — this one earns it |

1. Every email states the **login URL** — and it is `/staff/login`, not `/login`. (The redirect bug
   fixed on 2026-08-09 sent staff to the citizen door, which rejects them outright; do not
   reintroduce it in copy.)
2. Role copy lives in ONE place, keyed by role. A new role added without copy must fail loudly, not
   send a blank body.

### AC2 — It routes through the counted chokepoint

1. Sent via `notification-meter.service.ts`, like every other counted send (9-63). Not a bare provider
   call.
2. ⚠️ **A failed confirmation email must NOT fail the activation.** The account is already live; the
   email is a courtesy. Log the failure, surface it in the digest, never roll back.

### AC3 — Prove it fires for a role nobody has exercised

1. **RED-verify:** neuter the send, prove a test fails.
2. **AC-liveness:** this must be observed sending for at least an **enumerator** — the role with zero
   production activations before 2026-08-09. Assert on the send record, not on "no error".
3. ⚠️ ~~Two accounts have ever been activated on prod (both super-admins, 2026-04-26)~~, and a
   super-admin activation is `backOfficeActivation: true`, which takes a **different branch**. A test
   that only covers the back-office path proves nothing about the field path — that asymmetry is
   exactly why two activation defects survived to 2026-08-09.
   ✅ **RE-MEASURED 2026-08-12 — the count is stale and the news is good.** Prod now holds **5 staff
   accounts**: 2 super_admin (2026-02-23, 2026-04-26) and 3 enumerator (2026-04-20; 2026-08-09
   *deactivated*; **2026-08-10 active, selfie + ID card, verified 08-11**). The **field path has now
   been exercised end-to-end on prod**, so AC3.2's observed-send is achievable against a real
   enumerator rather than blocked on one being created. The branch asymmetry
   (`backOffice` at `auth.service.ts:171`) is unchanged and the warning still stands.

### AC4 — ⛔ NO ATTACHMENTS. The email is the prompt; the app is the delivery. (RULED 2026-08-10)

**Awwal's ruling, and the reason is larger than a spam folder.** The same sending domain carries the
re-engagement blasts and whatever the radio jingle generates. **Domain reputation built over seven
months is the asset the entire blast programme rides on** — spending it on a delivery convenience
that an in-app modal provides for free is a bad trade at any odds. It also *improves* this email:
plain, attachment-free transactional mail is the highest-deliverability shape there is, and this is
the message that must reach every new field officer.

1. **No attachments, on this email or any other staff mail.** The body stays self-sufficient (staff
   ID, LGA, the read-out rule, `/staff/login`) and adds one instruction: **log in and download your
   ID card and field briefing before you go to the field.**
2. ⚠️ **Name what the attachment was actually buying: OFFLINE ACCESS.** An enumerator standing in an
   LGA office with no data. A modal does not preserve that property by existing — it preserves it
   only if the download **actually happens, at first login, on the device they will carry.** AC7 is
   what makes that true; without AC7 this ruling trades guaranteed inbox delivery for an optional
   dialog, which is a worse position than either option.
3. **AC5 of the withdrawn amendment is void** — no `attachments` field is added to `EmailContent`,
   no provider change, no mock change. That work disappears entirely.

### AC5 — The first-login modal

1. On an enumerator's **first authenticated session**, a modal offers both artefacts: **ID card
   (PDF)** and **field briefing (PDF)**.
2. **Closeable**, per the ruling. Nobody is trapped in a dialog.
3. ⛔ **If the card has no photo, do not serve a broken card.** 13-60's swallow means
   `live_selfie_id_card_url` can be NULL. The modal says the photo is missing and links the retry
   (13-60 AC2's magic-link self-update) instead of downloading a card with an empty box.
   ✅ **This is why 13-60 no longer BLOCKS 13-59** — a *pulled* artefact can be withheld at the point
   of delivery; a *pushed* attachment cannot. The ruling de-risked the sequencing as a side effect.
4. Reuses `GET /users/id-card` (`user.routes.ts:24`), which already exists and is authenticated.
   **No new download path.**
5. ⚠️ **The briefing is markdown** (`docs/runbooks/enumerator-field-briefing.md`, 112 lines) and the
   PDF **will drift from it the moment someone edits the `.md`** —
   [[pattern-a-record-about-the-work-is-not-the-work]]. Render in CI, or check the PDF in **with a
   guard that fails when the `.md` changes and the PDF does not.** A stale briefing in the field is
   worse than no briefing, because it will be believed. *(This survives the ruling unchanged — the
   delivery channel moved, the drift risk did not.)*

### AC6 — A permanent home, and ONE implementation

1. **Canonical home: `ProfilePage.tsx`** (`features/dashboard/pages/`) — a new *"My ID & Field
   Briefing"* section. That is where a person looks for their own credentials, it already exists for
   every staff role, and the card is not enumerator-specific.
2. **The sidebar entry LINKS to that section — it does not re-implement it.** 13-55's lesson: five
   hand-written copies of one operation. One implementation, two doors.
3. Enumerator sidebar (`sidebarConfig.ts:92-99`) already carries seven entries; the briefing is
   enumerator-only, so the entry is added **for that role only**, not globally.
4. Both artefacts stay reachable forever — not only at first login. A lost phone, a re-issued card,
   a briefing revision must all be self-serve.

### AC7 — Prove they actually have it. This AC is what makes the ruling safe.

1. ⚠️ **A closeable modal that everyone dismisses has delivered nothing.**
   [[pattern-ship-a-fix-that-never-fires]] in its purest form: the feature exists, the path is never
   travelled, and we would have swapped guaranteed inbox delivery for an optional dialog. **Do not
   treat this AC as optional polish — it is the load-bearing half of the decision.**
2. Record each download as an audit action — `staff.id_card_downloaded` /
   `staff.briefing_downloaded`, matching the existing dotted vocabulary (`user.activated`,
   `invitation.resend`). **No schema change**; the audit chain already carries this shape.
3. **Operator view before the field day:** the staff list shows **who has not yet downloaded**.
   Pairs with 13-60 AC3 (who has no photo) — same surface, same query, one screen that answers *"is
   this person ready to go out?"*
4. The modal **re-appears while either artefact is undownloaded** — closeable every time, persistent
   until satisfied. That is the difference between an offer and a delivery.

### AC8 — "End to end" means the artefact, not the arrival

1. ⚠️ **"I received the email" and "the modal appeared" are both tests that pass over a hole.** A card
   with an empty photo box downloads perfectly well. The assertions are: **the PDF opens**, **the
   photo is present**, **the QR resolves**, and **the briefing PDF matches the current `.md`.**
2. Assert on the send record and on the **download audit rows** (AC7.2) — not on "no error".
3. RED-verify the modal: an enumerator who has never downloaded sees it; one who has, does not.

---

<details><summary>⛔ WITHDRAWN 2026-08-10 — the attachment design, kept visible rather than deleted</summary>

The first amendment on 2026-08-10 attached the briefing PDF and the ID card to this email. **Awwal
ruled it out the same day to protect sender-domain reputation**, and the ruling is recorded here with
what it cost and what it saved, because a reader deserves to know the design moved and why.

- ~~Briefing PDF + ID card PDF attached to the confirmation email.~~
- ~~`EmailContent` (`packages/types/src/email.ts:27-45`) gains an `attachments` field; both providers
  and the mock carry it.~~ **This work disappears entirely — the contract is untouched.**
- ~~13-60 HARD-BLOCKS this story, because a pushed attachment cannot be withheld when the photo is
  missing.~~ **Superseded by AC5.3:** a pulled artefact *can* be withheld, so 13-60 became a strong
  dependency rather than a blocker. The ruling improved the sequencing, not only the reputation.
- **What was genuinely lost:** guaranteed offline possession. The attachment landed in the inbox
  whether or not the person acted. AC7 exists precisely to buy that property back — and if AC7 is
  cut, this story ends up **worse** than the attachment design, not merely different.

</details>

## Out of scope

- SMS confirmation. Termii must not gate launch; the 12 no-email staff are an operator concern.
- Re-sending on reactivation.
- ⛔ **Email attachments — anywhere, on any send.** Ruled out 2026-08-10 (AC4). Not "not yet": the
  sending domain is shared with the blast programme, so this is a standing constraint, not a scope cut.
- A true offline PWA cache of the two artefacts. The device's own file storage is the offline story
  here; a service-worker cache is a different, larger problem.

## Notes

- **Still no schema** — the download record is an audit action in the existing dotted vocabulary, not
  a new column. Value remains disproportionate to size: it closes a journey that currently ends in
  silence, and it is how 13-4 R8's field rules reach an enumerator who left the printed briefing at
  home.
- ⚠️ **The story grew a web half.** It was authored as a small API/email story; it now spans the
  email, a first-login modal, a `ProfilePage` section, a sidebar entry and a download audit trail.
  **Kept as ONE story deliberately** — the halves are useless apart (the email instructs the person to
  log in and download; without the modal that instruction is a lie), and F1's rule is *merge only
  where it still ships in one pass*, which this does. But the "small, self-contained" framing it was
  authored under no longer holds, and sizing it from that line would be wrong.
- Pairs with **13-60** on one operator screen: *who has no photo* and *who has not downloaded* answer
  the same question — **is this person ready to go out?**

## Tasks / Subtasks

⚠️ **Sizing:** this story has a web half as well as the email. It is sequenced LAST of the three
field-day gates deliberately — see the header. Do not size it from the "small, self-contained" line
in its original Notes; that line no longer holds.

- [x] **Task 1 — The completion email** (AC: #1, #2)
  - [x] Insertion point is `services/auth.service.ts:275-280` — `activation.complete` is the **sole
        occurrence in the API**, a bare `logger.info` followed immediately by `return updatedUser`. It
        sits **after** the `db.transaction` commits (`:198`), which is what makes AC2.2 safe: a send
        failure there cannot roll the activation back.
  - [x] Send via `services/notification-meter.service.ts` (the counted chokepoint, 9-63) — not a bare
        provider call.
  - [x] Role copy in ONE place keyed by role; a role with no copy **fails loudly**, never sends blank.
  - [x] Login URL is **`/staff/login`**, not `/login` (the 2026-08-09 redirect bug — do not reintroduce
        it in copy). Avoid the word "onboarded".
  - [x] ⛔ **No attachments** (AC4, Awwal's standing ruling) — the shared sending domain carries the
        blast programme and the jingle.
- [x] **Task 2 — First-login modal** (AC: #5)
  - [x] Reuse the existing authenticated `GET /users/id-card` (`routes/user.routes.ts:24`). **No new
        download path.**
  - [x] Closeable per the ruling — which is exactly why Task 4 is load-bearing.
  - [x] 🔗 **Depends on 13-60.** When `liveSelfieIdCardUrl` is NULL the card cannot be generated
        (`user.controller.ts:89`). The modal must say the photo is missing and link 13-60's magic-link
        retry — a PULLED artefact can be withheld; this is why the no-attachments ruling downgraded
        13-60 from blocker to strong dependency.
- [x] **Task 3 — A permanent home, one implementation** (AC: #6)
  - [x] `features/dashboard/pages/ProfilePage.tsx` section is **canonical**; the enumerator sidebar
        entry (`features/dashboard/config/sidebarConfig.ts`) **links to it** rather than
        re-implementing (13-55's five-copies lesson). Sidebar tests exist at
        `features/dashboard/__tests__/sidebarConfig.test.ts`.
- [x] **Task 4 — Prove they actually have it** (AC: #7) — ⛔ **do not cut this**
  - [x] Audit each download: `staff.id_card_downloaded` / `staff.briefing_downloaded`, matching the
        existing dotted vocabulary in `services/audit.service.ts` (`user.activated`,
        `respondent.self_updated`) — **no schema change**.
  - [x] Operator view of **who has NOT downloaded**; modal re-appears while either artefact is
        outstanding. Without this the story ships an offer, not a delivery
        ([[pattern-ship-a-fix-that-never-fires]]).
  - [x] 🔗 Same operator surface as 13-60 Task 3.
- [x] **Task 5 — Briefing drift guard** (AC: #6, #8)
  - [x] `docs/runbooks/enumerator-field-briefing.md` (112 lines) is still Markdown. Render the PDF in
        CI or guard that the `.md` cannot change without it. *A stale briefing in the field is worse
        than none, because it will be believed.*
        **→ Taken a third way: the PDF is rendered FROM the `.md` at request time, so there is no
        second artefact to drift and nothing to guard.** See Dev Notes → "Deviations".
- [x] **Task 6 — Prove it end to end on the artefact** (AC: #3, #8)
  - [x] **RED-verify:** neuter the send, prove a test fails. *(Done three times — see the RED-verify
        ledger in the Dev Agent Record. One of them failed to go red and exposed a bad test.)*
  - [x] Observe it for an **enumerator** — ✅ now possible against a real prod account (see AC3.3).
        ⚠️ Super-admin activation is `backOfficeActivation: true` and takes a **different branch**
        (`auth.service.ts:171`); a back-office-only test proves nothing about the field path.
        **→ Both branches asserted separately in `auth.activation.test.ts`.**
  - [x] Assert the **artefact**: the PDF opens, the photo is present, the QR resolves, the briefing
        matches the current `.md`. "I received the email" and "the modal appeared" both pass over the
        hole — a card with an empty photo box downloads perfectly well.
        ⚠️ **"The QR resolves" is PARTIALLY discharged — see Residual R2.** The URL is proven to reach
        the encoder; an optical scan is not automated and is an operator UAT step.

### Review Follow-ups (AI) — adversarial code review 2026-08-16

⚖️ **Thirteen findings, all fixed in the same pass** (Awwal's ruling: record them AND fix them, so the
record survives the fix). Severity is as-found, before the fix. **12 were in-scope** (3 High, 5 Med,
4 Low); **L5 was raised as out-of-scope debt and ruled in by Awwal the same session** — see its own
section below.

The HIGH rows are each an instance of a pattern this story cites in its own prose and then commits —
which is the reason they are written down rather than quietly corrected.

- [x] **[AI-Review][High] H1 — `formatStaffId` was COPIED, not extracted, and both tests that claim
      to guard it pass over the hole.** `id-card.service.ts:66-68` still carried its own
      `OSLSR-${substring(0,8)}`; the Completion Note claiming extraction was false, and the file was
      correctly absent from the File List because it was never touched. **RED-VERIFIED by the
      reviewer:** the card was deliberately diverged to `OSLRS-` + 6 chars and *both*
      `id-card.artefact.test.ts` ("pins that the card's own derivation still agrees") and
      `staff-activation-complete-email.test.ts` ("one formatter, two surfaces") stayed GREEN — they
      assert a pure function against a string literal and never touch the card. Only the
      pre-existing `id-card.service.test.ts` caught it, on a third independent literal.
      [[pattern-test-that-passes-over-a-hole]] [`id-card.service.ts:66`]
- [x] **[AI-Review][High] H2 — an UNINDEXED `audit_logs` scan on the dashboard hot path, for every
      authenticated user including citizens.** `audit_logs` carries exactly one index
      (`created_at`, `schema/audit.ts:35`); this story is the first code in the repo to query it by
      `actor_id` at request time. `StaffArtefactsModal` is mounted on `DashboardLayout`, the ONLY
      dashboard layout (`App.tsx:738`), which hosts the `public_user` routes — and
      `getStaffArtefactState` ran the audit query BEFORE checking applicability, so it fired for
      citizens who are entitled to nothing. `?missingArtefacts=true` added two correlated
      `NOT EXISTS` on the same unindexed columns. Days before a blast, on a 2GB box.
      [`staff-artefacts.service.ts:139`, `staff.service.ts:199`]
- [x] **[AI-Review][High] H3 — the entitlement rules ended up in FOUR places, three as bare string
      literals.** `ID_CARD_ROLES` (character-identical to `FIELD_ROLES`, not imported from it), the
      raw SQL in `staff.service.ts`, and `StaffArtefactsCell` in the browser — whose own comment
      admitted the mirroring. The audit action names were literals in the SQL too. Written under a
      module docblock reading *"Three doors, one implementation. 13-55's lesson was five
      hand-written copies of one operation."* [[pattern-census-counts-sites-not-callers]]
- [x] **[AI-Review][Med] M1 — a dangling empty section on ProfilePage for four roles.** The
      `<h2>My ID & Field Briefing</h2>` and its paragraph rendered unconditionally while the panel
      returned `null`, so every back-office role and every citizen saw a heading with nothing under
      it. [`ProfilePage.tsx:207`]
- [x] **[AI-Review][Med] M2 — a THIRD deviation from the ACs, recorded only in a code comment, and
      it split the two surfaces.** `promptRequired` excluded applicable-but-unavailable artefacts
      (so a no-photo enumerator who took the briefing was never prompted again) while the operator
      filter and column listed that same person as "Not taken: ID card" forever — under a docblock
      promising *"'still outstanding' means the same thing on every surface"*, and a Deviations
      section that said there were exactly two.
- [x] **[AI-Review][Med] M3 — AC7.4's re-appearance half was untested.** The tests proved the modal
      closes; nothing proved it comes back. That is the half the story itself calls *"the
      load-bearing half of the decision"*.
- [x] **[AI-Review][Med] M4 — `?missingArtefacts=true` had no status gate**, so every `invited`
      (never activated) and `deactivated` field-role account appeared on the screen an operator
      reads to answer *"is this person ready to go out?"*.
- [x] **[AI-Review][Med] M5 — AC6.1's canonical home was asserted on one side only.**
      `ProfilePage.test.tsx` only swapped the render harness; nothing asserted the section exists,
      carries the `id-and-briefing` anchor, or that the scroll fires. The sidebar test pinned the
      href pointing AT the anchor. A link verified at the source and never at the target — the
      same shape as the dead `/users/id-card` this story found.
- [x] **[AI-Review][Low] L1 — `GET /users/field-briefing` was authenticated but not role-gated**, so
      any citizen could pull the internal runbook and mint a `staff.briefing_downloaded` audit row
      against a non-staff actor.
- [x] **[AI-Review][Low] L2 — the `(req as any)` cast that ENABLED the `.userId` defect was left in
      place** at the exact site the story just fixed, while the two new handlers use the typed
      `req.user?.sub`. The instance was fixed; the enabling condition was not (§2o again).
- [x] **[AI-Review][Low] L3 — Escape did not close the modal.** `open` was passed with no
      `onOpenChange`, so only the button worked. AC5.2: *"nobody is trapped in a dialog."*
- [x] **[AI-Review][Low] L4 — a 5-minute `staleTime` with no invalidation from 13-60's photo
      retry**, so someone who added their photo kept reading "no photo yet" on the screen that had
      just told them to fix it.
- [x] **[AI-Review][High] L5 — `packages/*` WAS NEVER LINTED, BY ANYTHING, EVER.** Raised as an
      out-of-scope observation ("pre-existing, not mine"); **Awwal ruled it in the same session —
      *"it does not make sense to leave it unresolved as technical debt"*** — and the ruling was
      right, because the finding was bigger than the note that carried it. See the dedicated section
      below.

### 🔎 L5 — the lint gate covered a third of the repo and reported success

**Awwal's ruling, 2026-08-16.** This was raised as *"pre-existing, repo-wide, and outside this
story"* and left as debt. It was ruled in immediately: **an unresolved gate is not technical debt,
it is a false report** — and the reason it surfaced here at all is that this story put something
important behind it.

**What was actually true.** `pnpm lint` runs `turbo run lint`, which runs the `lint` script of every
workspace that *has* one. Only `apps/api` and `apps/web` had one. `packages/types`,
`packages/utils`, `packages/config` and `packages/testing` — **42 TypeScript files, including the
shared contract both applications import** — had no config and no script. Pointing eslint at them by
hand did not report zero problems; it refused to start:

```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

So a green `pnpm lint` was reporting on **2 of 6 packages** and saying nothing whatsoever about the
other four — convincingly. That is the same shape as the recorded pitfall that **`scripts/` is
outside `tsconfig`**: a directory quietly outside the gate that everyone reads as inside it. A
directory with no gate is safer than this, because this one had a green tick over it.
[[pattern-monitor-measuring-something-else]] — *a metric doesn't break when it stops being true.*

**Why it surfaced now, and why that is the uncomfortable part.** This story's own review created
`packages/types/src/staff-artefacts.ts` to fix H3 — the single source of truth for who is entitled
to which artefact, imported by the API service, the operator's SQL filter and the browser column
alike. **The fix for "four hand-written copies with no compile-time guard" was placed in the one
directory in the repo that no linter looks at.** The consolidation is still right; it was landing
somewhere less checked than where it came from, and nobody would have noticed.

**What was done.**

1. **One shared config, not four.** `eslint.config.packages.js` at the repo root, with each package's
   `lint` script pointing at it via `--config`. Four near-identical configs would have been this
   story's own H3 finding committed again in a new medium. Rules are the `apps/api` set minus its
   Express carve-outs — divergence between an app and a package it imports should be a decision
   someone makes, not a default nobody chose.
2. **Root devDependencies** gained `eslint`, `@eslint/js`, `typescript-eslint`, `globals` **at the
   exact versions `apps/api` and `apps/web` already pin**, so plugins resolve next to the shared
   config, **nothing new enters the lockfile, and the OSV gate's surface is unchanged** (§2e).
3. **Two real defects the first-ever lint found**, both fixed rather than silenced:
   - `packages/types/src/auth.ts` — `RefreshTokenRequest` and `LogoutRequest` were empty
     `interface` declarations meant to document "this endpoint takes no body". An empty interface
     **accepts any non-nullish value, `0` and `""` included**, so the shape that was written to say
     *nothing goes here* in fact said *anything at all goes here* — the exact opposite of its
     comment. Both have **zero consumers repo-wide** (verified), so this corrects documentation
     rather than behaviour; now `Record<string, never>`, which means what the comment always claimed.
   - `packages/testing/src/decorators.ts:27` — `try { … } catch (error) { throw error; }` around the
     whole tagged-test body. A no-op that reads as error handling. Removed; the SLA violation still
     throws, **RED-verified** by setting the golden-path SLA to `0.000001s` and watching
     `SLA Violation: Test took 0.136s (allowed 0.000001s)` fail the test, then restoring it.

**The gate now.** `pnpm lint` → **"Packages in scope: @oslsr/api, @oslsr/config, @oslsr/testing,
@oslsr/types, @oslsr/utils, @oslsr/web · Running lint in 6 packages · Tasks: 6 successful, 6
total."** Two became six, and the tick now means what it says.

⚠️ **This is out of 13-59's scope and is recorded as such.** It is here because it was found by this
review and ruled in by Awwal in the same session — not because it belongs to the activation email.
A reader sizing this story from its ACs should discount this section; a reader asking *why does the
repo lint six packages as of 2026-08-16* should find it.

## Dev Notes

### Project Structure Notes

- API: `services/auth.service.ts` (activation), `services/notification-meter.service.ts` (counted
  chokepoint), `services/audit.service.ts` (action vocabulary), `routes/user.routes.ts:24` (id-card).
- Web: `features/dashboard/pages/ProfilePage.tsx`, `features/dashboard/config/sidebarConfig.ts`,
  onboarding activation flow under `features/onboarding/`.
- Web tests run from `apps/web` (`cd apps/web && pnpm vitest run`) — **never** `pnpm vitest run` from
  the repo root for web; that picks up the wrong config.

### References

- Prod verification 2026-08-12 (`1f06179`): `activation.complete` sole occurrence; 5 staff accounts,
  field path now exercised end-to-end (see AC3.3).
- 9-63 (notification meter / counted send), 9-12 (magic-link self-update), 13-4 R8 (field briefing).
- Pairs with 13-60 on one operator screen and one dependency (the card needs the photo).

### Deviations from the written ACs (three; all deliberate, none a scope cut)

⚠️ **This heading used to say "both".** The third deviation below was implemented from the start and
recorded only in a code comment, which meant the section a reader trusts to list the departures was
itself a record that had drifted from the work ([[pattern-a-record-about-the-work-is-not-the-work]]).
Found by the 2026-08-16 review (M2).

**1. AC5.5 / Task 5 — the briefing PDF is rendered from the `.md` at request time.**
The AC offered two remedies for drift: render in CI, or check the PDF in behind a guard. A third
option removes the problem instead of policing it — if the PDF is generated from the Markdown on
every request there is no second artefact to fall behind. This is strictly stronger than a guard,
because a guard is a check that can be cached, skipped, or ordered below something broader
(Pitfall #45 / #47), whereas an artefact that does not exist cannot go stale.
*Cost, stated plainly:* the API now reads a file outside its own package at runtime. Safe here for a
checked reason — prod deploys by `git pull` into `/root/oslrs` and runs from inside that same tree,
so `docs/` is always beside the code — and the resolver walks up to `pnpm-workspace.yaml` rather than
counting `../`s, which is the bug 13-26 exists to fix in `db/index.ts:11`.

**2. AC1's role table omits Supervisor; copy was written for it anyway.**
Supervisor is a `FIELD_ROLE` in `packages/types/src/roles.ts`, so it activates through this exact
path. Left out, AC1.2's loud failure would have fired on a real supervisor's activation. The table
was written from the five roles in front of the author; the enum is the authority on who can get
here.

**3. AC7.4 says the modal returns "while either artefact is undownloaded". It returns while either is
undownloaded AND ACTUALLY OBTAINABLE.**
An enumerator whose photo never saved (13-60's swallow) cannot download a card at all. Read
literally, AC7.4 would nag them forever about something they have no way to satisfy — and a dialog
that cannot be satisfied is one people learn to dismiss, which costs us the briefing too. So
`isOutstanding()` requires `available`, and the missing photo is surfaced with 13-60's retry link
instead of being counted as an outstanding download.
*What the review corrected here (M2):* the rule was applied to the modal and a DIFFERENT rule to the
operator's screen, which listed that same person as "Not taken: ID card" indefinitely. The app had
stopped asking while the operator was still being told the person was unready — two surfaces, two
definitions, under a docblock promising *"'still outstanding' means the same thing on every
surface"*. Both now call `isOutstanding()`; someone who cannot be issued a card appears under
13-60's "No ID photo" column, which is the question that actually describes their situation. The two
columns now partition *"is this person ready to go out?"* instead of overlapping on it.

## Dev Agent Record

### Implementation Plan (as executed)

Six tasks, red-green-refactor throughout, in the story's stated order.

| # | What was built | Where |
|---|---|---|
| 1 | Role-keyed copy → typed sender → counted `dispatch()` → call site after the committed transaction | `staff-activation-copy.ts`, `email.service.ts`, `staff-activation-notification.ts`, `auth.service.ts` |
| 2 | Fixed the dead `GET /users/id-card`; added the briefing PDF + artefact-state endpoints; built the closeable modal | `user.controller.ts`, `user.routes.ts`, `field-briefing.service.ts`, `StaffArtefactsModal.tsx` |
| 3 | One panel component, rendered by both the modal and a new canonical ProfilePage section; enumerator-only sidebar entry LINKS to it | `StaffArtefactsPanel.tsx`, `ProfilePage.tsx`, `sidebarConfig.ts` |
| 4 | Two audit actions + awaited recorder + bulk read; staff-list columns and a `?missingArtefacts=true` filter beside 13-60's | `staff-artefacts.service.ts`, `staff.service.ts`, `StaffTable.tsx` |
| 5 | Briefing rendered from the live `.md` (see Deviations) | `field-briefing.service.ts` |
| 6 | RED-verifies + artefact-level assertions on a really-rendered PDF | test files below |

### 🔎 What this story found that it was not looking for

⛔ **`GET /users/id-card` was DEAD — it 401'd every authenticated caller, and the test suite said it
was fine.**

The controller read `(req as any).user?.userId`. The JWT payload keys the principal under `.sub`
(`packages/types/src/auth.ts`), so `userId` was **always undefined** and every real request got
`AUTH_REQUIRED` — the one error guaranteed to make a field officer think they had been signed out,
on the one screen where they provably had not.

Three things make this worth writing down:

1. **It is the same defect F-023 (Story 9-42) already fixed in `uploadSelfie`, eight lines above, with
   a comment explaining it.** The sibling was left behind — a fix applied to the cohort in front of it
   rather than to the class (§2o).
2. **The test suite passed over it.** `user.id-card.test.ts` minted its own JWT as
   `{ userId: user.id }` — a token shape `TokenService.generateAccessToken` has never issued. The
   fixture agreed with the bug and disagreed with production, so the endpoint was green for months.
   [[pattern-test-that-passes-over-a-hole]] in its exact form: *the test constructed a world in which
   the wrong code was right.* The fixture now mints the production payload, which is the only version
   of the test that can fail when the endpoint is broken.
3. **This story is built on that endpoint.** AC5.4 says the modal reuses it, "no new download path".
   Shipping the modal without this fix would have delivered a download button that could not work —
   which is precisely why AC8.1 insists the assertion is *the PDF opens*, not *the button is there*.

### RED-verify ledger (AC3.1, AC8.3)

| # | Fix neutered | Result |
|---|---|---|
| 1 | The `sendActivationComplete(...)` call site in `auth.service.ts` | ✅ 2 tests fail (`expected "sendStaffActivationCompleteEmail" to be called 1 times, but got 0`) — on **both** the field and back-office branches. The two AC2.2 tests correctly stayed green: they assert the activation survives, which it does either way. That is the blind-spot proof. |
| 2 | `.sub` reverted to `.userId` in `downloadIDCard` | ✅ 3 tests fail, the first with `expected 401 to be 200` — the exact production symptom. |
| 3 | The modal's `promptRequired` gate (`open` forced true) | ⚠️ **FAILED TO GO RED — 8/8 still passed.** See below. |

⭐ **RED-verify #3 is the one worth reading.** The two "modal does NOT show" tests asserted absence
after `waitFor(() => expect(fetchArtefactState).toHaveBeenCalled())`, which resolves the moment the
query *starts* — before the component re-renders with data. So the modal was absent for a reason that
had nothing to do with the gate, and an always-open modal passed the test that existed to forbid it.
**"The element is not there" is the single easiest assertion to satisfy by accident, because it is
also exactly what a component that has not rendered yet looks like** — an absence consistent with both
a working gate and a deleted one proves neither (§2aa). Fixed by waiting on the query's `success`
state; the neuter then failed 2 tests, and the fix restored 8/8.

*This is the second time in this story that a green test was defending nothing.* The first was the
`userId` JWT fixture above. Both were found by RED-verifying rather than by reading.

**…and then it happened twice more, in the review.** Final count for this story: **six** RED-verifies
run, of which **three exposed a green test that was defending nothing** — every one found by
neutering rather than by reading.

| # | Fix neutered | Result |
|---|---|---|
| 4 | `id-card.service.ts` diverged to `OSLRS-` + 6 chars (review H1) | ⚠️ **FAILED TO GO RED in the two tests that claimed to cover it.** `id-card.artefact.test.ts`'s *"pins that the card's own derivation still agrees"* and the email test's *"one formatter, two surfaces"* both passed — each asserted a pure function against a literal and neither ever read the card. Only the pre-existing `id-card.service.test.ts` went red, on a *third* independent literal. Fixed by pointing the card at `formatStaffId` and asserting `doc.text` against `formatStaffId(...)`; the neuter then goes red. |
| 6 | The golden-path SLA set to `0.000001s` after removing the no-op `try/catch` in `packages/testing/src/decorators.ts` (review L5) | ✅ Fails with `SLA Violation: Test took 0.136s (allowed 0.000001s)`. The removed wrapper was `catch (e) { throw e }` — provably a no-op by language semantics, but the throw now sits inside no `try` at all, so the enforcement was re-proved rather than reasoned about. Restored after. |
| 5 | `live_selfie_id_card_url IS NOT NULL` deleted from the `?missingArtefacts` predicate (review M2) | ⚠️ **FAILED TO GO RED — the reviewer's OWN new test.** It asserted `artefactsOutstanding`, which is computed in JavaScript, and never called the filter, so it said nothing about the WHERE clause. Fixed with a test whose subject is a **clerk** with no photo: a clerk owes only the card, so their presence is decided *solely* by the branch under test, where an enumerator would appear via the briefing branch either way and could not tell a working gate from a deleted one (§2aa). The neuter now fails it. |

⭐ **Row 5 is the one to carry forward.** The reviewer wrote the fix, wrote a test for the fix, watched
it pass, and it was guarding the wrong half of the change — the same error, one layer up, inside the
pass that existed to catch it. **Writing a test for your own fix does not make it a guard; neutering
the fix does.** Nobody is outside this rule, least of all the person who just wrote the finding.

### Completion Notes

- **AC1** — copy for all six activatable roles in `ACTIVATION_COPY`, typed as a full `Record<UserRole,…>`
  so a new role is a *compile* error, with a runtime `AppError` for the string-typed path from
  `roles.name`. `public_user` is present and explicitly `null` — a silent fallback would be the exact
  blank-body outcome AC1.2 forbids.
- **AC1 (staff ID)** — the email quotes the same `OSLSR-XXXXXXXX` the card prints, via a new shared
  `formatStaffId`.
  ⚠️ **CORRECTION (review H1, 2026-08-16).** This note originally read *"It was previously inline in
  `id-card.service.ts:67`; extracted rather than copied"*. **That was false.** The helper was
  created and the email was pointed at it; `id-card.service.ts:66-68` was never touched and kept its
  own `OSLSR-${substring(0,8)}` — which is why that file was correctly absent from the File List.
  Two derivations of one identity, shipped under a note claiming there was one. Worse, the two tests
  that claimed to guard the agreement asserted `formatStaffId` against a string literal and never
  read the card: the reviewer diverged the card to `OSLRS-` + 6 chars and **both stayed green**.
  Now genuinely extracted — the card calls `formatStaffId`, and `id-card.service.test.ts` asserts
  `doc.text` was called with `formatStaffId(...)` rather than with a third independent literal, so a
  divergence cannot be introduced without a red test (RED-verified).
- **AC2** — routed through `EmailService.dispatch()`, so `NotificationMeter.recordEmailSend` counts it
  under a new `staff-activation-complete` category, ordered ABOVE the looser `staff-invitation`
  classifier rule so the two stay tellable apart.
- **AC2.2** — proven twice, against the real app + real DB: a THROWN send failure and a soft
  `success:false` both leave the account `active` with a cleared invitation token.
- **AC4** — no `attachments` field was added to `EmailContent`; no provider or mock changed. Asserted
  directly on the payload the provider receives.
- **AC5.3** — the panel withholds the card when `liveSelfieIdCardUrl` is NULL, states why, and links
  13-60's existing `/profile-completion` retry. The endpoint's refusal was given a specific code
  (`ID_CARD_PHOTO_MISSING`, was `VALIDATION_ERROR`) so the client never string-matches a message.
- **AC6** — `StaffArtefactsPanel` is the single implementation; the modal and the ProfilePage section
  both render it, and the enumerator sidebar entry links to `#id-and-briefing` rather than
  re-implementing. The hash link also *works*: React Router does not scroll to a hash, so ProfilePage
  scrolls on arrival — a link that resolves but never lands is a link that never fires.
- **AC7** — downloads are recorded via `logActionTx` inside an awaited transaction, **not** the
  `void`-returning `logAction` ([[pattern-void-helper-loses-last-batch-row]]); a floating write is a
  race in the test and a lost row under load. Recorded BEFORE `res.send`, since after it the handler
  is racing the response.
- **AC7.3** — one extra query per page (not per row) feeds two staff-list columns and a
  `?missingArtefacts=true` filter sitting beside 13-60's "No ID photo". The filter's predicate is
  per-entitlement, so a back-office user — who owes nothing — can never appear in it.
- **Suite (dev pass)** — API **3818 passed / 0 failed** (277 files); web **2894 passed / 0 failed**
  (266 files); utils 126. `tsc --noEmit` clean on api + web + types; eslint clean on every touched
  file; all three CI drift guards green (registry-read 381 files, respondent-write 381 files,
  story-residuals 317 stories).
- **Suite (after the 2026-08-16 review fixes)** — API **3824 passed / 0 failed / 9 skipped / 1 todo**
  (275 files + 2 skipped, 3834 total); web **2902 passed / 0 failed** (266/266 files).
  `tsc --noEmit` clean on api, web and types. `pnpm lint` **6 packages, 6 successful** (was 2 — see
  L5).
  ⚠️ *An earlier run in the same session read 3825 passed / 8 skipped.* One test moved pass → skip
  between runs and the 3834 total is unchanged: `auth.activation.test.ts:488` is gated on
  `hasS3Config = !!(S3_ACCESS_KEY && S3_SECRET_KEY)`, which differed between shells. Checked rather
  than waved through, because "the number moved and both were green" is precisely how a real
  regression gets filed as noise.
  ⚠️ **The same two web files failed on the first full-suite run** as in the dev pass
  (`a3-eslint-policy` 52.8s, `route-resolution` 24.7s). Classified as the known local contention
  flake (§2g, `[[feedback_local_full_suite_flakiness]]`) — **and then confirmed twice rather than
  assumed**: both passed in isolation at **6.6s and 5.7s**, and the full web suite was then re-run
  clean at 266/266. Worth the second confirmation specifically because `a3-eslint-policy` scans the
  test files this pass added, so "it's the usual flake" was a hypothesis with a live alternative.
- ⚠️ **Two web tests failed on the first full-suite run** (`route-resolution` at 18.9s, `a3-eslint-policy`
  at 50.4s) and passed in isolation at 1.4s and 6.5s. Classified as the known local contention flake
  (§2g, `[[feedback_local_full_suite_flakiness]]`) — **and then confirmed rather than assumed**, by
  re-running the whole web suite: 266/266 green.

## Residuals

Per the §2a0 three states. **`done` is not permitted while any row is OPEN or DISCHARGE-ON-DEPLOY.**

| ID | Sev | State | Evidence / trigger | Owner |
|---|---|---|---|---|
| **R1** | High | **DISCHARGE-ON-DEPLOY** | Nothing here has run on prod. Discharge by activating one real staff account after deploy and checking **both**: `pm2 logs oslsr-api \| grep activation.completion_email_sent` shows the line with the right `role`, **and** the recipient actually received it. A green deploy is not evidence — the send is a side effect on a path CI exercises only against a mock provider. | adjudication |
| **R2** | Med | **ACCEPTED** | **"The QR resolves" (AC8.1) is only partially automated.** *Measured:* `verificationUrl` is used in exactly one place in `id-card.service.ts` (line 35, `QRCode.toBuffer`) and is never printed as text, and two cards differing only in that URL produce different bytes — so the URL demonstrably reaches the encoder. *Not proven:* that a phone camera decodes it back. An optical decoder would be a new runtime dependency on an OSV-gated tree. **Reopen trigger:** any report of a QR that does not scan, or the first time a verification link is reported wrong. **Closes by:** one operator scan of a real printed card during field-day UAT. | Awwal (UAT) |
| **R3** | Med | **ACCEPTED** | **The modal has never been seen by a real user.** It is proven by component tests on both branches of `promptRequired` (RED-verified after the false-green above), but "an enumerator logs in and sees it" is an event that has not happened — [[pattern-verification-that-cannot-run-yet]]. **Reopen trigger:** the staff list showing an enumerator still "Not taken" more than 48h after their first login — i.e. the prompt is being shown and ignored, or not shown at all. That signal already exists on the operator screen this story built, so no new monitor is needed. | adjudication |
| **R6** | Med | **DISCHARGE-ON-DEPLOY** | **The new `idx_audit_logs_actor_action` index is built by `db:push` NON-concurrently**, which takes a SHARE lock on `audit_logs` for the duration — blocking audit WRITES, and therefore every audited action, until it completes. Added by review H2 because this story is the first code to query `audit_logs` by `actor_id` at request time and the table had only a `created_at` index. **Discharge by:** either (a) building it by hand BEFORE the deploy — `CREATE INDEX CONCURRENTLY idx_audit_logs_actor_action ON audit_logs (actor_id, action, created_at DESC);` — so `db:push` finds it present and does nothing, or (b) confirming post-deploy that the API came up clean and `\d audit_logs` lists the index. ⚠️ Prefer (a): the lock duration scales with a table that has been appending since 2026-02 and nobody has measured its current size. | adjudication |
| **R4** | Low | **CLOSED** | The briefing PDF cannot drift from `docs/runbooks/enumerator-field-briefing.md`: `field-briefing.service.test.ts` asserts the service reads the live file byte-for-byte and that a changed `.md` changes the PDF. Re-run: `pnpm vitest run apps/api/src/services/__tests__/field-briefing.service.test.ts` (8/8). | — |
| **R5** | Low | **CLOSED** | The dead `/users/id-card` is fixed and locked: `user.artefacts.routes.test.ts` "serves the PDF to an authenticated caller — it does NOT 401" fails (`expected 401 to be 200`) if `.sub` reverts to `.userId`; RED-verified this session. | — |

## Closing verdict

**CLOSED — `done`. Deployed `63088f8`, verified on production 2026-08-17.** Dev complete, all 8 ACs implemented, adversarial code review run and all
thirteen findings fixed (12 in-scope + L5, the lint gate, ruled in by Awwal), suites green, six
RED-verifies on record (three of which exposed a false-green test — one of them the reviewer's own).

It does **not** flip to `done`, for two independent reasons:

1. **R1 is DISCHARGE-ON-DEPLOY.** An activation email that has never been sent by production is a fix
   whose firing has not been observed, and that is the top defect class in this codebase
   ([[pattern-ship-a-fix-that-never-fires]]).
2. **R6 is DISCHARGE-ON-DEPLOY** (new, from the review). The `audit_logs` index this story now needs
   is built non-concurrently by `db:push` and locks the table while it builds.

⚖️ **The BMAD code-review workflow's step 5 would set this to `done`** — all HIGH and MEDIUM findings
are fixed and every AC is implemented, which is its stated condition. **Overruled by §2a0**, which
forbids `done` while any residual is OPEN or DISCHARGE-ON-DEPLOY. The workflow's rule is about the
review; §2a0's is about production, and production has not run a line of this yet.

- **Deploy SHA:** ✅ **`63088f8`** — deployed and verified on production 2026-08-17. CI/CD
  **32020476075** + E2E **32020476014** both success, **`deploy` TAKEN with all 10 jobs green**,
  prod `git rev-parse` = `63088f8`, health 200.

#### ✅ R1 DISCHARGED — production sent it, and Resend delivered it

A **real enumerator activation** was run end to end on prod (`lawalkolade+testfour@gmail.com`,
2026-08-17 11:09:09), and `email_events` carries the proof:

```
sent      @ 11:17:21   campaign=staff-activation-complete
delivered @ 11:17:22   campaign=staff-activation-complete
```

The account came out `active` with `photo_status=saved`, `photo_source=live_capture`,
`photo_sharpness_score=0.49`. **The same run also exercised R2 and R3** — the ID card and the field
briefing were both downloaded from the modal, and the Super-Admin panel rendered its
Taken / Not Taken column.

> ⚠️ **The evidence was in `email_events`, NOT `campaign_sends` — and adjudication looked in the wrong
> table first.** `campaign_sends` holds only `reengagement-blast` and `thankyou-referral`: it is a
> **marketing** ledger, and a transactional email correctly never enters it. The first query returned a
> clean, convincing **`0`**. **It was Awwal saying "I received the confirmation email" that contradicted
> it.** Fourth wrong-table lookup this month (handoff §2z(d)) — and the one that shows the failure mode
> plainly: *a right-looking zero from the wrong source would have reported a working feature as broken.*

#### ✅ R6 DISCHARGED — the index built cleanly

`idx_audit_logs_actor_action` is **present and `indisvalid = yes`** on prod — a completed build, not a
failed one leaving an invalid index behind. `audit_logs` held **2,641 rows**, small enough that the
non-concurrent SHARE lock was momentary. ⚠️ **That window narrows as the table grows** — the next
non-concurrent index on this table deserves the same check rather than the same assumption.

⚠️ **A CPU Warning (75%) fired ~11:00**, in the deploy window: `pnpm install` + build + `db:push` + the
index build on a 2-vCPU box. Cleared on its own — load average `0.22 / 0.05 / 0.02` afterwards. **A
warning during a deploy is the monitor working, not a fault.** Swap in use at 65 MB of 2047; per
[[infra-vps-operational-state]], swap in *steady* use is the signal to resize, not to add more.
- **RED-verify evidence:** see the ledger above — **6 runs: 3 red as designed, 3 false-greens found
  and fixed** (one from the dev pass, two from the review, one of those the reviewer's own test).
- **File-List reconciliation:** re-run after the review fixes — the File List below matches
  `git status --short` **exactly**, set-diffed in both directions, with five files added by the
  review pass. ⚠️ Two files in the working tree are **NOT part of this story and must not be
  committed with it** — `13-46-…md` and `13-51-…md`, written concurrently by the SM CLI on
  2026-08-16. The tree was clean when this session began.

## File List

**New — API**
- `apps/api/src/services/staff-activation-copy.ts`
- `apps/api/src/services/staff-activation-notification.ts`
- `apps/api/src/services/field-briefing.service.ts`
- `apps/api/src/services/staff-artefacts.service.ts`
- `apps/api/src/services/__tests__/staff-activation-complete-email.test.ts`
- `apps/api/src/services/__tests__/field-briefing.service.test.ts`
- `apps/api/src/services/__tests__/staff-artefacts.integration.test.ts`
- `apps/api/src/services/__tests__/id-card.artefact.test.ts`
- `apps/api/src/routes/__tests__/user.artefacts.routes.test.ts`

**New — web / shared**
- `apps/web/src/features/dashboard/api/artefacts.api.ts`
- `apps/web/src/features/dashboard/hooks/useStaffArtefacts.ts`
- `apps/web/src/features/dashboard/components/StaffArtefactsPanel.tsx`
- `apps/web/src/features/dashboard/components/StaffArtefactsModal.tsx`
- `apps/web/src/features/dashboard/components/__tests__/StaffArtefacts.test.tsx`
- `packages/types/src/staff-id.ts`
- `packages/types/src/staff-artefacts.ts` *(review H3 — the ONE entitlement list, imported by the API service, the operator's SQL and the browser column alike)*

**Modified — API**
- `apps/api/src/services/auth.service.ts`
- `apps/api/src/services/email.service.ts`
- `apps/api/src/services/notification-category.ts`
- `apps/api/src/services/audit.service.ts`
- `apps/api/src/services/staff.service.ts`
- `apps/api/src/controllers/user.controller.ts`
- `apps/api/src/controllers/staff.controller.ts`
- `apps/api/src/routes/user.routes.ts`
- `apps/api/src/__tests__/auth.activation.test.ts`
- `apps/api/src/__tests__/user.id-card.test.ts`
- `apps/api/src/__tests__/performance.id-card.test.ts`
- `apps/api/src/services/__tests__/audit.service.test.ts`
- `apps/api/src/controllers/__tests__/staff.controller.test.ts`

**Modified — API, added by the 2026-08-16 review**
- `apps/api/src/db/schema/audit.ts` *(H2 — `idx_audit_logs_actor_action`; see R6 before deploying)*
- `apps/api/src/services/id-card.service.ts` *(H1 — the card now calls the shared `formatStaffId` instead of carrying its own copy)*
- `apps/api/src/services/__tests__/id-card.service.test.ts` *(H1 — asserts against `formatStaffId(...)`, not a third literal)*

**Modified — web / shared**
- `apps/web/src/layouts/DashboardLayout.tsx`
- `apps/web/src/features/dashboard/pages/ProfilePage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/ProfilePage.test.tsx`
- `apps/web/src/features/dashboard/config/sidebarConfig.ts`
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts`
- `apps/web/src/features/staff/components/StaffTable.tsx`
- `apps/web/src/features/staff/pages/StaffManagementPage.tsx`
- `apps/web/src/features/staff/types.ts`
- `apps/web/src/features/staff/api/staff.api.ts`
- `packages/types/src/email.ts`
- `packages/types/src/index.ts`
- `apps/web/src/features/onboarding/pages/ProfileCompletionPage.tsx` *(review L4 — this page IS the "add your photo" link the panel offers, so it clears the artefact cache on success, beside 13-60's profile invalidation)*

**New + Modified — the L5 lint gate (OUT OF STORY SCOPE, ruled in by Awwal 2026-08-16)**
- `eslint.config.packages.js` *(new — the ONE shared config for all four packages)*
- `package.json` *(root — eslint devDeps at the versions the apps already pin; no new lockfile entries)*
- `pnpm-lock.yaml`
- `packages/types/package.json` *(+ `lint` script)*
- `packages/utils/package.json` *(+ `lint` script)*
- `packages/config/package.json` *(+ `lint` script)*
- `packages/testing/package.json` *(+ `lint` script)*
- `packages/types/src/auth.ts` *(empty marker interfaces → `Record<string, never>`; zero consumers)*
- `packages/testing/src/decorators.ts` *(no-op `catch (e) { throw e }` removed; SLA throw RED-verified)*

**Modified — process**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`ready-for-dev` → `in-progress` → `review`)
- `_bmad-output/implementation-artifacts/13-59-staff-activation-confirmation-email.md` (this file)

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-09 | Raised EMERGENT from the enumerator invite dry run | Awwal |
| 2026-08-10 | Amended — briefing + ID card attached to the email | John (PM) |
| 2026-08-10 | ⛔ Attachments RULED OUT same day; email becomes the prompt, app the delivery; AC5/6/7 added | Awwal |
| 2026-08-12 | Premises re-verified on prod; AC3.3's stale activation count corrected; flipped to `ready-for-dev` (full spec, all 8 ACs) | Bob (SM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added | Bob (SM) |
| 2026-08-16 | Implemented all 6 tasks / 8 ACs via dev-story. Found and fixed a live production defect in scope: `GET /users/id-card` 401'd every caller (`.userId` vs `.sub`), and its own test minted a fabricated token that hid it. Two audit actions added (58 → 60). Suites green (API 3818, web 2894). Status → `review` with 5 residuals; R1 blocks `done`. | Amelia (dev-story, Opus 5) |
| 2026-08-16 | **L5 (out of story scope, ruled in by Awwal the same session): `packages/*` had never been linted.** `turbo run lint` covered 2 of 6 workspaces — the other four had no eslint config at all, so eslint refused to START on 42 files including the shared contract both apps import. A green `pnpm lint` was a false report, not missing coverage. Fixed with ONE shared root config (four copies would have been this review's own H3 finding again) + root devDeps at the versions the apps already pin, so no new lockfile entries and no OSV surface change. The first-ever lint found two real defects, both fixed not silenced: empty marker `interface`s in `types/src/auth.ts` that accepted `0`/`""` while documenting "no body" (zero consumers, verified), and a no-op `catch (e) { throw e }` in `testing/src/decorators.ts` (SLA throw RED-verified by neutering the SLA to 0.000001s). Gate now: 6 packages, 6 successful. | Claude (code-review, Opus 5) |
| 2026-08-16 | **Adversarial code review — 12 findings (3 High, 5 Med, 4 Low), all recorded as Review Follow-ups AND fixed in the same pass** (Awwal's ruling). H1: `formatStaffId` was copied not extracted, and both tests claiming to guard it passed a deliberate divergence — RED-verified. H2: the first request-time `audit_logs` query in the repo ran unindexed on every dashboard load *including citizens*; added `idx_audit_logs_actor_action` (→ **new R6**), an applicability short-circuit, and DB-side aggregation. H3: entitlement rules had reached four hand-written copies; consolidated into `@oslsr/types` with the verdict now computed server-side. Plus M1 dangling heading, M2 the two surfaces disagreeing (recorded as the third Deviation), M3/M5 missing tests, M4 status gate, L1 citizens could pull the runbook, L2 the `any` cast, L3 Escape, L4 stale photo state. **Two RED-verifies failed to go red — one of them the reviewer's own test** (ledger rows 4–5). Suites re-run green: API 3824 passed / 0 failed (3834 total), web 2902 (266/266); `pnpm lint` 6/6. Status stays `review`: R1 and R6 are DISCHARGE-ON-DEPLOY. | Claude (code-review, Opus 5) |
