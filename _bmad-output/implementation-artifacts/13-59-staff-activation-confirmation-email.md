# Story 13.59: Activation ends with nothing in the person's hands

Status: backlog

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
3. ⚠️ Two accounts have ever been activated on prod (both super-admins, 2026-04-26), and a super-admin
   activation is `backOfficeActivation: true`, which takes a **different branch**. A test that only
   covers the back-office path proves nothing about the field path — that asymmetry is exactly why two
   activation defects survived to 2026-08-09.

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
