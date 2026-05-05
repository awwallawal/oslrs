---
docRef: OSLRS/OPS-MAN/2026/001-QR
classification: Internal — OSLRS Field Operations
title: OSLRS Quick-Reference Card
subtitle: Field Enumerator A5 Companion to Operations Manual v1
superhead: Oyo State Skilled Labour Registry
authors: Lawal Awwal (Builder) · AI persona-drafted (Awwal)
firm: Oyo State Ministry of Trade, Investment & Cooperatives
date: May 2026
version: 1.0
coverCredit: 'Cover image: "A Tailor Sewing Clothes in Her Shop" · Meritkosy / Wikimedia Commons · CC BY-SA 4.0'
---

<!--
==============================================================================
OSLRS Operations Manual — Quick-Reference Card (A5)
Version: v1 (initial draft, 2026-05-04)
Audience: OSLRS Field Enumerators
Format: One A5 sheet, double-sided. Print on plain paper; lamination optional.

Companion to: docs/operations-manual/enumerator-v1.md (full manual)

Build pipeline (A5 page size):
  cd <repo-root>
  node _bmad-output/baseline-report/assets/build.js \
       docs/operations-manual/enumerator-quick-ref-v1.md \
       docs/operations-manual/enumerator-quick-ref-v1.pdf
  # NOTE: build.js currently defaults to A4. A5 override may require either:
  #  (a) custom @page CSS rule injected via front-matter
  #  (b) post-render PDF rescaling via Chromium --paper-format=A5
  # Author note: If A5 letterhead is too cramped, fall back to header-stripped
  # variant (still maroon brand-themed). See Story Risk #6.

Versioning: v1 ↔ enumerator-v1.md. Update both files together when revising.
==============================================================================
-->

# OSLRS Quick-Reference Card

> *Carry this with you. For full detail see the Operations Manual.*

---

## FRONT — Most-used in field

### 1. Login (when magic-link does not arrive)

1. Check spam folder.
2. Re-tap **Send Magic Link**.
3. Wait **2 minutes**.
4. After 3rd attempt + 15 minutes total → **call supervisor**.

### 2. NIN not found

1. Re-read NIN to respondent (digits in pairs).
2. Try again (typos resolve most cases).
3. Still not found → tap **Capture Pending NIN**.
4. Get respondent's **email or phone**.
5. Photograph respondent + continue.

### 3. Network drop / sync failure

1. Submissions are **safe on phone** — do not panic.
2. Toggle airplane mode on / 10 sec / off.
3. Check data balance: `*131#` MTN · `*323#` Airtel.
4. Move 50 m. Try again.
5. Try second SIM if dual-SIM.
6. End-of-day **Pending > 0** at 3 locations → **call supervisor**.

### 4. Photo blur

1. Tap **Retake** (no penalty).
2. Move to outdoor shade or window light.
3. Wipe lens. Hold elbows in.
4. Tap respondent's face on screen to focus.
5. After 3 retakes still bad → submit best + add note.

### 5. App crash

1. Force-close + re-open. **Resume draft** when prompted.
2. Crash repeats at same step → note step + respondent.
3. Restart phone if 3+ crashes/day.
4. Crashes after restart → **stop work, call supervisor**.

---

## BACK — Privacy + Escalation

### Consent script (read aloud, word-for-word)

<!-- AWWAL-VERIFY: this script must match the actual app consent screen at print-time. If app rev'd between draft and print, update card OR direct enumerator to read from app screen. Consent-evidence drift risk — reading a card script that differs from the app screen creates audit-trail conflict. -->

> *"I work for the Oyo State Ministry of Trade. I am collecting information for the Skilled Labour Registry, which the Ministry uses to plan training and connect tradespeople to opportunities. Your data is not sold. You have the right to see, correct, or delete your record later. Do you understand? Do you agree to give this information?"*

> *If the app screen shows a different script, **read the app screen, not this card.** Tell your supervisor at end-of-day so the card can be re-printed.*

If **No** → tap **Decline**. No penalty. Move on.

### What to say when respondent asks privacy questions

| Question | Your answer |
|---|---|
| What will you do with this data? | Goes into the Skilled Labour Registry. Ministry of Trade uses it for training planning + skill-gap analysis. Not sold. Not shared outside government without formal agreement. |
| Can I see what you have on me later? | Yes. Right to see, correct, or delete. Contact Ministry's Data Office. *(Phone below.)* |
| What if I don't want to answer? | You don't have to. No penalty. I will stop now if you say so. |

Anything beyond these → "*That is for the Ministry's Data Office; let me leave you the contact.*" Then escalate to supervisor end-of-day.

### NEVER do

- Never record without consent
- Never screenshot or share another respondent's data
- Never use respondent contacts for personal reasons
- Never leave phone unlocked + OSLRS app open

### Phone lost/stolen → call supervisor IMMEDIATELY (within 24 hrs)

### Escalation order

1. **Field Supervisor** — first contact for everything.
2. **OSLRS ICT** — only if supervisor unreachable >4 hrs OR data-loss incident.
3. **Ministry Data Office** — only NDPA questions you cannot answer.

### Contacts (working hours 8 AM – 6 PM Mon–Sat)

| Role | Phone |
|---|---|
| Your Supervisor | <!-- AWWAL-PROVIDE: supervisor-phone --> |
| OSLRS ICT primary | <!-- AWWAL-PROVIDE: builder-phone --> |
| OSLRS ICT backup | <!-- AWWAL-PROVIDE: builder-backup-phone --> |
| Ministry Data Office | <!-- AWWAL-PROVIDE: data-office-phone --> |

**Out-of-hours:** WhatsApp supervisor for phone-loss only. Everything else waits to 8 AM next working day.

---

*OSLRS Operations Manual v1 — Quick-Reference Card · May 2026 · Internal*
