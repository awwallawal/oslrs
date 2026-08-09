# Story 13.59: Activation ends with nothing in the person's hands

Status: backlog

<!-- EMERGENT 2026-08-09 from the enumerator invite dry run (Awwal's observation). Activation
currently ends by redirecting to a login page and issuing no artefact at all. -->

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
| Enumerator | *"You are cleared for field registration in [LGA]."* + staff ID + **the read-out rule** (never read a number until the app shows one) + the briefing link |
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

## Out of scope

- SMS confirmation. Termii must not gate launch; the 12 no-email staff are an operator concern.
- Re-sending on reactivation.

## Notes

- Small, self-contained, no schema. Value is disproportionate to size: it closes a journey that
  currently ends in silence, and it is where 13-4 R8's field rules can reach an enumerator who left
  the printed briefing at home.
