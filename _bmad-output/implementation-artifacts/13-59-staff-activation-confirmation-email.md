# Story 13.59: Activation ends with nothing in the person's hands

Status: ready-for-dev

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

- [ ] **Task 1 — The completion email** (AC: #1, #2)
  - [ ] Insertion point is `services/auth.service.ts:275-280` — `activation.complete` is the **sole
        occurrence in the API**, a bare `logger.info` followed immediately by `return updatedUser`. It
        sits **after** the `db.transaction` commits (`:198`), which is what makes AC2.2 safe: a send
        failure there cannot roll the activation back.
  - [ ] Send via `services/notification-meter.service.ts` (the counted chokepoint, 9-63) — not a bare
        provider call.
  - [ ] Role copy in ONE place keyed by role; a role with no copy **fails loudly**, never sends blank.
  - [ ] Login URL is **`/staff/login`**, not `/login` (the 2026-08-09 redirect bug — do not reintroduce
        it in copy). Avoid the word "onboarded".
  - [ ] ⛔ **No attachments** (AC4, Awwal's standing ruling) — the shared sending domain carries the
        blast programme and the jingle.
- [ ] **Task 2 — First-login modal** (AC: #5)
  - [ ] Reuse the existing authenticated `GET /users/id-card` (`routes/user.routes.ts:24`). **No new
        download path.**
  - [ ] Closeable per the ruling — which is exactly why Task 4 is load-bearing.
  - [ ] 🔗 **Depends on 13-60.** When `liveSelfieIdCardUrl` is NULL the card cannot be generated
        (`user.controller.ts:89`). The modal must say the photo is missing and link 13-60's magic-link
        retry — a PULLED artefact can be withheld; this is why the no-attachments ruling downgraded
        13-60 from blocker to strong dependency.
- [ ] **Task 3 — A permanent home, one implementation** (AC: #6)
  - [ ] `features/dashboard/pages/ProfilePage.tsx` section is **canonical**; the enumerator sidebar
        entry (`features/dashboard/config/sidebarConfig.ts`) **links to it** rather than
        re-implementing (13-55's five-copies lesson). Sidebar tests exist at
        `features/dashboard/__tests__/sidebarConfig.test.ts`.
- [ ] **Task 4 — Prove they actually have it** (AC: #7) — ⛔ **do not cut this**
  - [ ] Audit each download: `staff.id_card_downloaded` / `staff.briefing_downloaded`, matching the
        existing dotted vocabulary in `services/audit.service.ts` (`user.activated`,
        `respondent.self_updated`) — **no schema change**.
  - [ ] Operator view of **who has NOT downloaded**; modal re-appears while either artefact is
        outstanding. Without this the story ships an offer, not a delivery
        ([[pattern-ship-a-fix-that-never-fires]]).
  - [ ] 🔗 Same operator surface as 13-60 Task 3.
- [ ] **Task 5 — Briefing drift guard** (AC: #6, #8)
  - [ ] `docs/runbooks/enumerator-field-briefing.md` (112 lines) is still Markdown. Render the PDF in
        CI or guard that the `.md` cannot change without it. *A stale briefing in the field is worse
        than none, because it will be believed.*
- [ ] **Task 6 — Prove it end to end on the artefact** (AC: #3, #8)
  - [ ] **RED-verify:** neuter the send, prove a test fails.
  - [ ] Observe it for an **enumerator** — ✅ now possible against a real prod account (see AC3.3).
        ⚠️ Super-admin activation is `backOfficeActivation: true` and takes a **different branch**
        (`auth.service.ts:171`); a back-office-only test proves nothing about the field path.
  - [ ] Assert the **artefact**: the PDF opens, the photo is present, the QR resolves, the briefing
        matches the current `.md`. "I received the email" and "the modal appeared" both pass over the
        hole — a card with an empty photo box downloads perfectly well.

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

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-09 | Raised EMERGENT from the enumerator invite dry run | Awwal |
| 2026-08-10 | Amended — briefing + ID card attached to the email | John (PM) |
| 2026-08-10 | ⛔ Attachments RULED OUT same day; email becomes the prompt, app the delivery; AC5/6/7 added | Awwal |
| 2026-08-12 | Premises re-verified on prod; AC3.3's stale activation count corrected; flipped to `ready-for-dev` (full spec, all 8 ACs) | Bob (SM) |
| 2026-08-12 | Tasks/Subtasks + Dev Notes added | Bob (SM) |
