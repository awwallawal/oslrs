# PM Brief — Story 13-13: Email Unsubscribe → Suppression Hygiene

**Author:** John (PM) · **Date:** 2026-06-29 · **For:** Bob (SM) to author Story 13-13 via canonical *create-story
**Origin:** 13-11 review L1 + 13-12 review L2 (the cross-cutting List-Unsubscribe gap)
**Epic:** 13 (campaign / acquisition) · **Tier:** post-launch hygiene (NOT launch-gating)

## The job-to-be-done (the why)
We built a do-not-contact list (`email_suppressions`, Story 13-9) and we honor it on **every marketing send** — the three blasts (9-27/9-28/13-11) and the 13-12 evergreen auto-send. It has two automatic inlets: **bounced** and **complained** (Resend webhook). It is missing the one inlet a recipient can actually *choose*: **unsubscribe**.

Right now a registrant who no longer wants our referral/re-engagement emails has only one option — mark us as spam. That **trains the spam filters against us** and tanks deliverability for the registrants who *do* want to hear from us. An honored unsubscribe is therefore both an **NDPA-positive** (respecting a withdrawal of contact consent) and a **deliverability win** (a clean exit that isn't a spam complaint). 13-13 closes that loop: unsubscribe becomes a first-class, third inlet to the list we already trust.

**Urgency:** best-practice, not mandatory. Gmail/Yahoo's one-click rule binds senders >5,000/day; we're <400. So this is *deliverability + trust hygiene*, post-launch — do it properly, but it does not gate the Jul-1 campaign.

## In scope — complete the loop, both tiers, one story
**FR1 — List-Unsubscribe header (Tier-1).** Marketing emails carry `List-Unsubscribe: <mailto:support@oyoskills.com?subject=unsubscribe>, <https://oyoskills.com/api/v1/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). Renders the native "Unsubscribe" affordance in Gmail/Apple/Yahoo.

**FR2 — One-click unsubscribe endpoint (Tier-2, the meaningful half).** A PUBLIC `POST /api/v1/unsubscribe` that verifies the token and writes the address into `email_suppressions` with a **new reason `unsubscribed`** (extend the enum `bounced|complained|unsubscribed`). Once there, the blasts and the 13-12 auto-send skip them automatically — no new wiring on the send side. Returns a minimal confirmation page (also support `GET` for the human-click-through case).

**FR3 — Honored by construction.** No change to the send-suppression logic — it already reads `email_suppressions`. The story's job is the *inlet*, not the *enforcement* (enforcement is 13-9, already shipped).

## Security model (non-negotiable)
- The endpoint is **public (no auth)** — it must work from an email client with no session.
- The link carries an **HMAC-signed, per-recipient token** binding the recipient's email (+ optionally a category). The server verifies the signature before suppressing — so a caller can only unsubscribe **their own** address; no enumeration, no unsubscribing strangers.
- **Idempotent** (already-suppressed → 200, no error) and **rate-limited** (reuse the existing rate-limit middleware pattern).
- No PII beyond the email being suppressed; no account lookup required.

## Scope boundaries (the guard-rails — read these twice)
- **Marketing-only.** The header goes ONLY on marketing categories: `reengagement-blast`, `supplemental-survey`, `thankyou-referral`. **Transactional** (magic-link, registration-confirmation, registration-status, password-reset, staff-invitation) and **ops/alert/digest** emails get **NO** unsubscribe header — you do not unsubscribe from a login link or a system alert. *Implementation note for the SM:* the Resend provider does not currently receive the `NotificationCategory`; gating the header marketing-only requires threading the category (or an `allowUnsubscribe` flag) through `sendGenericEmail → dispatch → provider` — a known shared-email-path change, so call it out as its own task with a focused test.
- **Do NOT touch the ops/alert suppression behavior.** The ops/alert path deliberately does NOT consult `email_suppressions` (confirmed). That is correct: suppressing a bounced ops recipient would **silence critical alerts**. Leave it alone.
- **OUT of scope — related operator action (note, don't build):** the bouncing `admin@oyoskills.com` super-admin notification address (surfaced 2026-06-29 deliverability investigation) is a **separate operator fix** — make the mailbox deliverable or change the super-admin's email. It is NOT an unsubscribe and NOT part of 13-13.

## Privacy / NDPA stance
Honoring an unsubscribe is a positive under NDPA (respecting the data subject's choice to withdraw from non-essential contact). Confirmation is shown; the only data processed is the email being added to the do-not-contact list. Transactional/legal-basis comms (a magic-link they requested, a registration receipt) are correctly *not* unsubscribable.

## Dependencies & sequencing
- **Depends on:** 13-9 (`email_suppressions` + `getSuppressedEmails`, shipped) and the Resend provider (13-9 tag plumbing, shipped). No dependency on 13-10/13-12.
- **Sequencing:** post-launch hygiene. Lands any time; not before Jul-1. After it ships, the marketing-email opt-out copy (currently "email support@…") can optionally point at the native unsubscribe too.

## Acceptance-criteria seeds (for Bob — refine in the story)
1. Marketing emails carry both List-Unsubscribe variants (mailto + https one-click) + List-Unsubscribe-Post; transactional/ops emails carry neither.
2. `POST /api/v1/unsubscribe` with a valid signed token adds the email to `email_suppressions(reason='unsubscribed')`; a subsequent blast/auto-send skips it.
3. Invalid/forged/missing token → 4xx, nothing written; idempotent on repeat; rate-limited.
4. The category/flag is threaded to the provider so only marketing categories get the header (tested).
5. A suppressed address can be re-subscribed only by an explicit operator action (out of band) — unsubscribe is one-way for the user.

## Open question for Bob/SM (the one real WHY to resolve)
Token design: **stateless HMAC** (email+category signed with a server secret; nothing stored; simplest) vs a **stored single-use token**. Recommendation: **stateless HMAC** — unsubscribe is idempotent and low-stakes (worst case is a re-suppress), so the simplicity of no token table wins. Validate in the story.

→ **Hand to Bob (SM):** author `13-13-email-unsubscribe-suppression.md` via canonical *create-story; ground the provider-category threading + the rate-limit/HMAC patterns against the codebase before locking ACs.
