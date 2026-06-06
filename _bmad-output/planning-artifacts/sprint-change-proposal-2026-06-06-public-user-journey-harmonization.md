# Sprint Change Proposal — Public-User Journey Harmonization

**Date:** 2026-06-06
**Author:** Bob (SM), via correct-course (incremental mode). Facilitation conducted live with Awwal across the 2026-06-03→06 session; this document records the settled outcome.
**Trigger:** Story 9-16 (magic-link login) prod UAT on 2026-06-06 succeeded mechanically but surfaced that the public-user *journey* is incoherent — the parts (wizard, login, dashboard) were each built in isolation and never reconciled into one front.

---

## 1. Trigger & root-cause analysis

**What happened.** Magic-link login works end-to-end in production (verified: seeded `public_user` → request link from `/login` → Resend email delivered → landing Confirm → `/dashboard`). But the moment a logged-in public user lands on the dashboard, the seams show:

- `PublicUserHome` is the **legacy Story 2.5-8 dashboard** — hardcoded "Profile Completion: 2 of 5 steps" + a "Start Survey" CTA. It has zero awareness of the wizard or the user's respondent record. It would invite a *completed* registrant to start over.
- There is **no link from a `users` account to its `respondents` row** (no `user_id`, no `email` on `respondents`), so the dashboard cannot find "my registration" even in principle.
- **No production path creates `public_user` rows** (wizard makes respondents only; legacy register + Google OAuth retired in 9-12) — so the live audience is zero. [[public-user-creation-gap]]
- **`/login` is undiscoverable** — only reachable by typing the URL. `SmartCta` shows logged-out users only "Register"; there is no "Sign in" door.

**Root cause (not "the wizard was wrong").** The original 4-hop flow (register → verify → login → fill survey) bled >50% before any answer — real registration friction (ADR-015). The wizard correctly collapsed that and embedded the questionnaire, optimizing **first-time data capture**. But it **left the returning-account-holder journey undesigned**: it captures the respondent and never builds the account, the way back, or the dashboard that reflects what was done. The large up-front cost (a gate everyone hits) was correctly traded for a small deferred cost (return-coherence for the subset who come back). That deferred bill is now due. The defect is "parts built before the whole was drawn," not the wizard.

## 2. The coherent front (target journey — authoritative spec)

> **One registration, one source of truth, surfaced everywhere. The wizard is the single frictionless front door; the account is a silent byproduct, never a gate; the dashboard is where the wizard's output lives and is revisitable.**

Two users, one front:
- **Respondent (data subject)** — fills the wizard once, may never return. The wizard stays pure: no forced login, no account step.
- **Account-holder (returning user)** — wants back in to view/edit/see marketplace status. Gets a passwordless account *provisioned silently* at wizard submit, and a discoverable-but-optional return path.

**Journey:**

```
Entry (homepage / public header)
  ├─ logged out → TWO doors:  "Register" → wizard      |  "Sign in" → magic-link
  └─ logged in  → "Dashboard"  (SmartCta already does this ✓)

Capture: the 5/11-step wizard (UNCHANGED — stays frictionless). 9-12 / 9-18.

Account: at wizard submit, silently provision a PASSWORDLESS public_user +
         link respondents.user_id. No gate, no extra step. 9-38 (keystone).

Return: "Sign in" → magic-link-primary page ("enter your email, we'll send a
        one-time link"). Password is a secondary option only for users who
        opted into one (9-32). Forgot-password scoped to staff.

Dashboard: registration-status home driven by a state machine —
   no respondent/draft  → "Let's get you registered" → wizard
   draft in progress     → "Continue — Step X of N"  → authenticated resume
   registered, NIN pending → "Add your NIN"           → resume at NIN step
   fully registered      → "✓ Complete" → read-only summary + EDIT + marketplace status
```

**Guardrail (load-bearing):** never re-introduce friction onto the capture path. No login/account step inside the wizard. Friction belongs nowhere on capture; coherence belongs everywhere on return.

**Wrong-door recovery:** a returning user who taps "Register" out of habit must not restart — the entry detects an existing registration (via the status read-model) and routes to the dashboard / offers a sign-in link.

## 3. Impact analysis

| Area | Current | Target | Touched by |
|---|---|---|---|
| Account creation | none at runtime | silent at wizard submit + `respondents.user_id` FK | **9-38** |
| Registration read-model | none | `GET /me/registration-status` (state + draft step + summary) | **9-38** |
| Public header (logged out) | "Register" only | "Sign in" + "Register" | **9-39** |
| Public sign-in page | password-primary + forgot-password | magic-link-primary; password secondary; forgot-pw → staff | **9-39** |
| Wrong-door recovery | none | Register-by-returning-user → dashboard | **9-39** |
| Public dashboard | legacy hardcoded "2 of 5 / Start Survey" | registration-status home (state machine) + edit + marketplace | **9-40** |
| Authenticated wizard resume | magic-link token only | "Continue registration" from dashboard | **9-40** |
| Legacy survey-from-dashboard path | live, parallel to wizard | retired / reconciled | **9-40** |
| 9-16 magic-link login | done ✓ | unchanged | — |

**No PRD/architecture contradiction** — this *completes* ADR-015's intent (magic-link primary, wizard-first), it doesn't reverse it. ADR-015's 2026-06-03 "Magic-link login activation" amendment already flagged the account-creation open decision that 9-38 closes.

## 4. Proposed path forward (stories + sequencing)

- **9-38** (amended) — *keystone.* Silent passwordless account at wizard submit + `respondents.user_id` FK + backfill + **new `GET /me/registration-status` read-model** + the new-registrant landing-copy fix (AC#9). ready-for-dev.
- **9-39** (new) — *public entry-IA.* Logged-out "Sign in" door in `SmartCta`/`Header`; magic-link-primary public sign-in page (password secondary, forgot-password → staff); wrong-door recovery; optional "signed in as" indicator.
- **9-40** (new) — *public dashboard rewrite.* Registration-status home consuming the read-model; authenticated wizard resume ("Continue registration"); edit profile; marketplace status (Epic 7 tie-in); retire the hardcoded card + the legacy survey-from-dashboard path.

**Sequence (all before the blasts):**
`9-16 ✓ → 9-17 → 9-18 → 9-38 → 9-39 + 9-40 → field deployment + Cohort A/B blasts`

Rationale: a blasted user who logs in must meet a coherent front, not "Start Survey / 2 of 5." 9-38 is the spine both 9-39 and 9-40 read; 9-39 and 9-40 can run in parallel once 9-38 lands.

## 5. Decisions locked (this session)

1. **Wizard stays pure** — no login/account step added to the capture path.
2. **Account is silent + passwordless** at wizard submit (9-38), not a gate.
3. **Two doors** at entry (Register / Sign in), self-selected, with wrong-door recovery — *not* a single auto-detecting page.
4. **Magic-link is the primary public return channel**; password is opt-in (9-32); forgot-password scopes to staff.
5. **Completed-user dashboard is editable + marketplace-aware** (per Awwal 2026-06-06).
6. **9-16 flipped to done** as the login *mechanism*; the journey muddle is this SCP's scope, not 9-16's.
7. **Process lesson captured to memory:** design the end-to-end journey before building mechanisms. [[journey-before-mechanism]]

## 6. References

- Root-cause + journey dialogue: 2026-06-03→06 session.
- [[public-user-creation-gap]], [[field-readiness-sequence-2026-05-31]], [[journey-before-mechanism]]
- ADR-015 + 2026-06-03 "Magic-link login activation" amendment: `_bmad-output/planning-artifacts/architecture.md`
- Evidence: `SmartCta.tsx` (logged-in→Dashboard ✓, logged-out→Register only), `PublicUserHome.tsx` (legacy hardcoded), `respondents.ts:83-127` (no user_id/email), `registration.controller.ts:468` (submitWizard).
