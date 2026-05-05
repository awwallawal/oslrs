---
docRef: OSLRS/OPS-MAN/2026/001
classification: Internal — OSLRS Field Operations
title: OSLRS Operations Manual
subtitle: Enumerator Section v1 — Field-readiness handbook
superhead: Oyo State Skilled Labour Registry
authors: Lawal Awwal (Builder) · AI persona-drafted (Iris/Gabe/Awwal)
firm: Oyo State Ministry of Trade, Investment & Cooperatives
date: May 2026
version: 1.0
coverCredit: 'Cover image: "A Tailor Sewing Clothes in Her Shop" · Meritkosy / Wikimedia Commons · CC BY-SA 4.0'
---

<!--
==============================================================================
OSLRS Operations Manual — Enumerator Section
Version: v1 (initial AI-persona-ratified draft, 2026-05-04)
Status: PENDING-REAL-HUMAN-RATIFICATION (real-Iris + real-Gabe ratify Section 4
        and Sections 5-6 respectively, paired with Story 10-5 ratification)
Audience: ~50–100 OSLRS field enumerators across Oyo State LGAs
Scope: Pre-field training reference + in-field operational handbook

Author personae (per Story prep-operations-manual-enumerator-section AC#1):
- Sections 1, 2, 3 — Awwal-Builder persona (technical app-usage chunks; AI
  first-cut, awaiting Awwal review/edit per Risk #1 mitigation)
- Section 4 — Iris persona (DPIA / NDPA Counsel; voice derived from
  docs/legal/consumer-onboarding-sop-v1.md per AC#4)
- Section 5, 6 — Gabe persona (Legal & Documentation Reviewer)
- Section 7 (Quick-reference card) — separate file:
  docs/operations-manual/enumerator-quick-ref-v1.md

Closure semantics (per Awwal directive 2026-05-04):
- review = .md source + print-ready HTML/PDF + Iris sign-off + Gabe sign-off
  all delivered. Field-readiness gate met.
- done = real-Iris + real-Gabe ratification (single session, paired with 10-5)
- Physical printing on Ministry office printer is downstream of `done`,
  NOT field-blocking.

Build pipeline (project uses build.js — DO NOT use pandoc; build.js calls
markdown-it + js-yaml + pdf-lib + headless Chromium directly):
  cd <repo-root>
  node _bmad-output/baseline-report/assets/build.js \
       docs/operations-manual/enumerator-v1.md \
       docs/operations-manual/enumerator-v1.pdf
  # Produces: enumerator-v1.html (intermediate) + enumerator-v1.pdf
  # See _bmad-output/baseline-report/assets/README.md for pipeline details.
  # Note: build.js front-matter assumes Chemiroy → MTIC formal-doc shape;
  #       internal-doc adaptation MAY be needed (see Completion Notes in
  #       implementation-artifacts/prep-operations-manual-enumerator-section.md).

Versioning convention (semver per AC#7):
  v1     — this draft (initial AI-persona-ratified)
  v1.1   — post-dry-run friction + post-real-human-ratification incorporation
  v2     — major restructuring (e.g. 3+ missing scenarios surface in field)

References:
- Story 10-5 SOP voice baseline: docs/legal/consumer-onboarding-sop-v1.md
- Story 10-5 sign-off pattern:   docs/legal/dsa-template-v1-signoff.md
- Story 9-12 Public Wizard:      _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md
- Role taxonomy:                 docs/oslsr-glossary.md + packages/types/src/roles.ts
==============================================================================
-->

# OSLRS Operations Manual — Enumerator Section

**Version:** v1 (initial draft, awaiting field validation)
**Date:** May 2026
**Classification:** Internal — OSLRS Field Operations
**Audience:** Field Enumerators and Field Supervisors

---

## How to use this manual

Read **Section 1** (Daily Workflow) before your first day. Keep the **Quick-Reference Card** (separate A5 sheet) on you in the field. When something goes wrong, jump to **Section 3** (Common Errors). When a respondent asks a privacy question, **Section 4** (NDPA Briefing) gives you the words to use.

Sections 5 (Payment) and 6 (Escalation) are reference material — read once, refer back when needed.

If a step in this manual does not match what your phone shows, **stop and call your supervisor**. The app may have been updated since printing; your supervisor has the current version of every screen. Do not improvise.

---

# Section 1 — Daily Workflow Checklist

**Purpose:** Tells you what to do at three points in your day — before you leave home, at midday, and before you sleep. Following the checklist keeps your data safe, your battery alive, and your supervisor informed.

> *Author note (v1 first-cut by AI in Awwal-Builder persona; Awwal to review and adjust the specific figures marked* `<!-- AWWAL-VERIFY -->` *during ratification pass).*

## 1.1 Start-of-day (before you leave home)

Do all six items, in order, before you leave home:

1. **Charge to 100%.** A full charge typically lasts a day of field work; a half charge does not.
2. **Confirm power-bank is charged.** A 10,000 mAh power-bank gives you roughly one full re-charge.
3. **Confirm SIM has airtime AND data.** Minimum: ₦500 airtime + at least 500 MB data balance. <!-- AWWAL-VERIFY: confirm minimum data balance figure is right for typical field day -->
4. **Open the OSLRS app and tap *Sync*.** Confirm the *Last Sync* timestamp updates to the current time. If it does not, see Section 3.4.
5. **Check today's assignment.** The home screen shows your assigned LGA + ward + expected number of submissions. If the assignment is missing or wrong, **call your supervisor before leaving home** — do not start field work on a wrong assignment.
6. **Photograph your ID badge** with the OSLRS app camera (one photo, kept for the day). This proves you were the enumerator in the field if a respondent later disputes anything.

<!-- SCREENSHOT: home-screen-with-todays-assignment-and-sync-button -->

## 1.2 Mid-day sync (lunch break)

At your lunch break — or any time you have 4G/Wi-Fi and 5 minutes — do these four:

1. Tap **Sync** in the app. Wait for the *Last Sync* timestamp to update.
2. Confirm the sidebar shows **0 pending** submissions. If pending count > 0 after a successful sync, see Section 3.4.
3. Plug into your power-bank if your phone is below 50%.
4. Send a one-line WhatsApp to your supervisor: `[Your name] — synced at [time], [N] submissions today so far.` This is your daily heartbeat; supervisors track progress against the LGA target through these messages.

<!-- SCREENSHOT: sync-status-zero-pending-submissions -->

## 1.3 End-of-day reconciliation (before you sleep)

Do all five before you sleep — this is the most important checklist of the day:

1. **Final sync.** Tap *Sync*; confirm *Last Sync* timestamp shows the current time and *Pending Submissions* shows zero.
2. **Reconcile your day's count.** The app's *Today* screen shows N submissions. Compare to your paper tally (if you keep one) or your memory of the day. Discrepancy ≥ 2 submissions: see Section 3.5.
3. **Photograph anything you could not capture in the app** (e.g., a respondent's NIN slip when the NIN-lookup failed). Email these photos to your supervisor with the respondent's full name in the subject line. Do **not** send NIN slip photos via WhatsApp.
4. **Plug your phone in to charge overnight.** Even if the battery shows >50%, charge — tomorrow's start-of-day check expects 100%.
5. **Send end-of-day WhatsApp** to your supervisor: `[Your name] — done for [date], [N] total submissions, [any issues].` If "any issues" is non-empty, expect a call back from your supervisor that evening.

<!-- SCREENSHOT: end-of-day-summary-screen -->

---

# Section 2 — Capture Flow Walkthrough

**Purpose:** Step-by-step walkthrough of recording one respondent submission. Read this section once before your first field day; refer back when a step confuses you. Eight steps total — login through sync.

> *Author note (v1 first-cut by AI in Awwal-Builder persona; Awwal sources actual production-app screenshots post-draft per directive 2026-05-04. Steps describe behaviour at app version `<!-- AWWAL-VERIFY: production-app-commit-hash-at-print-time -->`. If the live app differs, supervisor has the current rev — call before improvising.)*

## 2.1 Login (Step 1)

1. Open the OSLRS app on your phone.
2. Tap **Login**.
3. Enter your **work email address** (the one your supervisor provisioned — usually `firstname.lastname@oyoskills.com` or your personal email if Ministry IT has not yet issued a work email).
4. Tap **Send Magic Link**.
5. Wait up to 60 seconds for the email to arrive. Check spam if it does not appear in your inbox.
6. Open the email; tap the **Sign In** button or copy the 6-digit code.
7. The app opens at your home screen.

<!-- SCREENSHOT: login-page-with-magic-link-input-empty -->
<!-- SCREENSHOT: magic-link-email-on-phone -->
<!-- SCREENSHOT: home-screen-after-successful-login -->

**Common login problems:** see Section 3.1 (Magic-link email did not arrive) and Section 3.2 (Magic-link expired).

## 2.2 Start a new submission (Step 2)

1. From the home screen, tap **+ New Submission** (the large button at the bottom of the screen).
2. Confirm your **LGA** and **ward** are correct on the screen (the app pre-fills them from your assignment). If wrong, see Section 3.6.
3. Tap **Continue**.

<!-- SCREENSHOT: new-submission-button-prominent-on-home-screen -->
<!-- SCREENSHOT: lga-and-ward-confirmation-screen -->

## 2.3 NIN lookup (Step 3)

The respondent's NIN is the unique key for their record. Get this right; it is the single most important field in a submission.

1. Ask the respondent for their **NIN**: *"Please tell me your eleven-digit National Identification Number."* If they only have the slip, ask them to read it to you — do not photograph the NIN at this stage.
2. Type the 11 digits into the **NIN** field on the app. The field accepts only digits.
3. Tap **Lookup**.
4. The app calls the NIMC service and returns one of three outcomes:
   - **Match** — the respondent's name + date of birth + photo are pre-filled on the next screen. Confirm with the respondent: *"Is this you? Is your date of birth correct?"* If yes, tap **Continue**.
   - **No match** — see Section 3.1 (NIN not found).
   - **Network error** — see Section 3.4 (Network drop).

<!-- SCREENSHOT: nin-input-field-empty -->
<!-- SCREENSHOT: nin-lookup-success-pre-filled-respondent-details -->

## 2.4 Photograph the respondent (Step 4)

A clear photo is required for every submission. The photo proves the enumerator met the respondent in person.

1. After NIN match, tap **Take Photo**.
2. Position the respondent in **good light** — outdoors in shade, OR indoors near a window. Avoid direct sunlight on the face (causes blown-out highlights).
3. Frame **shoulders up, eyes open, no sunglasses, no head covering that hides the face**. Religious head coverings (hijab, cap) that do not hide the face are acceptable.
4. Tap the camera button. Review the photo on screen.
5. If blurry or wrong, tap **Retake**. See Section 3.3 (Photo blur) for tips.
6. When the photo is acceptable, tap **Use Photo**.

<!-- SCREENSHOT: in-app-camera-with-shoulders-up-frame-guide -->
<!-- SCREENSHOT: photo-review-screen-with-retake-and-use-buttons -->

## 2.5 Skills entry (Step 5)

Capture the respondent's primary trade and any secondary trades. Use the dropdown picker — do not free-type unless the trade is genuinely missing from the list.

1. Tap the **Primary Trade** dropdown.
2. Type the first three letters of their trade (e.g., `tai` for Tailor). The list filters as you type.
3. Tap the matching trade. If you cannot find it after trying 3 different spellings, tap **Other** and free-type the trade name. The system flags free-typed trades for the registry curation team.
4. Tap **+ Secondary Trade** if the respondent practises more than one trade. Repeat for up to two secondary trades.
5. For each trade, the app may ask **Years of experience**: enter a number from 0 to 80.
6. Tap **Continue** when all trades are captured.

<!-- SCREENSHOT: skills-dropdown-with-typed-prefix-filtering-results -->
<!-- SCREENSHOT: secondary-trade-add-button -->

**A common mistake:** capturing the *workshop name* or *employer* in the Trade field. The Trade field is the *kind of work* (Tailor, Welder, Mechanic) — not the workshop or employer. If unsure, ask: *"What kind of work do you do with your hands or your tools?"*

## 2.6 Consent (Step 6)

This is the most important step from a privacy perspective. **Do not skip the consent script** even if you are running late. See Section 4 for the full NDPA briefing — read that before you go to the field.

1. Read the consent script aloud to the respondent. The script appears on the app screen — read it word-for-word in the language the respondent is comfortable with (English or Yoruba — your supervisor briefs you in Yoruba at training).
2. After reading, ask: *"Do you understand? Do you agree to give this information for the Oyo State Skilled Labour Registry?"*
3. The respondent answers Yes or No. Tap the matching button.
4. If **Yes**: continue to Step 7.
5. If **No**: tap **Decline**. The app discards the partial submission. **Do not pressure the respondent.** A *No* is a valid outcome — record it and move on. Your supervisor tracks declines in your day's totals; declines are expected and do not count against you.

<!-- SCREENSHOT: consent-script-screen-with-yes-and-no-buttons -->

## 2.7 Submit (Step 7)

1. Review the summary screen. The app shows: respondent name, NIN, trade, photo, consent confirmed.
2. If anything is wrong, tap **Edit** next to the wrong field and correct it.
3. When everything is right, tap **Submit**.
4. The app shows one of two outcomes:
   - **Submitted online** — *"Submission saved to server"* (green tick). You're done with this respondent; tap **+ New Submission** for the next one.
   - **Submitted offline** — *"Saved locally, will sync when online"* (orange clock icon). Equally fine. The submission will sync at your next mid-day or end-of-day sync. **Do not panic at the orange clock.**

<!-- SCREENSHOT: submission-summary-screen-with-edit-and-submit-buttons -->
<!-- SCREENSHOT: success-confirmation-with-green-tick -->
<!-- SCREENSHOT: offline-saved-confirmation-with-orange-clock -->

## 2.8 Offline-then-sync (Step 8)

The OSLRS app is designed for field work where the network is unreliable. **You can capture an entire day's submissions without any network at all** — the app stores them on your phone. They sync to the server when you next have signal.

How it works:
- When you submit and you have signal, the submission goes to the server immediately (green tick).
- When you submit and you do **not** have signal, the submission is saved on your phone (orange clock).
- When you next have signal AND tap **Sync**, all orange-clock submissions go up. Their indicator changes to green tick.
- The sidebar **Pending Submissions** count shows how many are still on your phone waiting to sync. At end-of-day, this number must be **zero** before you sleep.

**What "have signal" means in practice:** if you can open WhatsApp and send a message, you have signal for the OSLRS sync.

<!-- SCREENSHOT: sidebar-with-pending-count-and-sync-button -->

If pending submissions remain after a sync attempt, see Section 3.4.

---

# Section 3 — Common Error Scenarios + Recovery

**Purpose:** When something goes wrong in the field, find the matching scenario below and follow the steps. Each scenario has a *when-to-escalate* trigger — if you reach that line, stop and call your supervisor.

> *Author note (v1 first-cut by AI in Awwal-Builder persona; Awwal to validate against actual app behaviour and add scenarios from real field experience post-draft.)*

## 3.1 NIN not found

**Symptom:** You enter the 11-digit NIN, tap **Lookup**, and the app shows *"NIN not found"* OR *"Respondent not found in NIMC"*.

**Recovery:**

1. **Re-check the digits with the respondent.** *"Please read your NIN to me one more time, slowly."* Most "not found" cases are typos.
2. **Check for transposed digits.** Common: swapping the 8th and 9th digit. Read the digits back to the respondent in pairs: "nine-three, four-one, two-seven, five-five, eight-zero-six".
3. **If the respondent has a NIN slip but no card**, ask to see the slip. The slip has the NIN printed in large digits — easier to verify than reading aloud.
4. **If still not found after two attempts**, tap **Capture Pending NIN**. This records the respondent's name + photo + trade + consent **without** a verified NIN. The system flags the submission for a Magic-Link follow-up: the respondent receives an email asking them to verify their NIN online (per Story 9-12 Pending-NIN flow).
5. **Get the respondent's email or phone number** for the Magic-Link follow-up. The app prompts you for this when you tap **Capture Pending NIN**.
6. Continue to Step 4 (Photograph) as normal.

**When to escalate:** If the respondent has no NIN at all (never enrolled with NIMC), and they do not know an enrollment centre near them, escalate to your supervisor at end-of-day. Do not refuse the submission — capture-pending-NIN with their email, and the supervisor handles enrollment outreach separately.

## 3.2 Magic-link email did not arrive (login)

**Symptom:** You requested a magic-link login email, waited 60 seconds, and the email is not in your inbox or spam.

**Recovery:**

1. **Check your spam / junk folder** carefully. Magic-link emails from `noreply@oyoskills.com` sometimes land in spam on first use.
2. **Confirm you typed the correct email.** Tap **Back** in the app, re-enter your email, tap **Send Magic Link** again.
3. **Wait 2 full minutes** before requesting again. Some carriers delay email by 1-2 minutes during peak traffic.
4. **If the email still does not arrive after a third attempt**, the email server may have rate-limited you. Wait 10 minutes, then try once more.
5. **Mark `noreply@oyoskills.com` as Not Spam** in your email app for next time.

**When to escalate:** If after 15 minutes and 3 attempts you still have no email, call your supervisor. They can request a temporary one-time login code for you from the Builder/ICT team.

## 3.3 Photo blur

**Symptom:** The photo you took is out of focus, or the respondent's face is too dark to see clearly.

**Recovery:**

1. **Tap Retake.** No penalty for retaking — better a clear photo on the second try than a blurry one on the first.
2. **Move to better light.** Outdoor shade is best; direct sunlight is worst. Indoors, position the respondent facing a window.
3. **Wipe the camera lens** on your phone with a clean cloth. Field dust is the most common cause of soft-focus photos.
4. **Hold the phone steady.** Tuck your elbows in against your body; exhale before tapping the camera button.
5. **Tap the respondent's face on the screen** before tapping the camera button — this tells the camera to focus there.

**When to escalate:** If after 3 retakes the photo is still unusable (e.g., the respondent will not stay still, or the light is genuinely impossible), submit with the best photo you have and add a note in the **Submission Notes** field: *"Photo quality limited by [reason]; respondent agreed."* The verification team flags low-quality photos for a re-photograph appointment.

## 3.4 Network drop

**Symptom:** The app shows *"Network error — could not reach server"* during NIN lookup OR during sync.

**Recovery:**

1. **For NIN lookup specifically:** the app cannot do an offline NIN lookup. Tap **Capture Pending NIN** as in Section 3.1 step 4 — submit the respondent now, and the NIN verifies via Magic-Link follow-up later.
2. **For sync:** do not panic. Submissions are safe on your phone. They will sync at your next sync attempt with signal.
3. **Check your data balance.** Open your SIM provider's app or dial the balance USSD code (`*131#` for MTN, `*323#` for Airtel, etc.). If your data is exhausted, top up.
4. **Toggle airplane mode on, wait 10 seconds, toggle off.** This forces your phone to re-acquire the network. Resolves more sync failures than any other single action.
5. **Move 50 metres in any direction.** Sometimes the issue is a network black-spot specific to where you are standing.
6. **Try a different network if available.** If your phone has dual SIM, switch to the second SIM and retry.

**When to escalate:** If your end-of-day **Pending Submissions** count is greater than zero AND you have tried sync at three different locations, call your supervisor before sleep. They escalate to the Builder/ICT team to confirm the server is healthy.

## 3.5 Skip-logic confusion

**Symptom:** The app skipped a question you expected to ask, OR you cannot find a question you needed to record.

**Recovery:**

1. **Review the summary screen** before tapping Submit. Every captured field is there. If a field is missing that should be present, tap **Back** and check whether you skipped a screen accidentally.
2. **The app uses skip-logic intentionally.** For example, if a respondent answers *"No primary employer"* to the employment-type question, the app skips the employer-name question (which would be empty anyway). If you expected the employer-name question and did not see it, the app's skip-logic is correct.
3. **If you genuinely need to capture something that has no field**, use **Submission Notes** at the bottom of the summary screen. Free-text up to 500 characters. The verification team reads notes; do not abuse this for things that should be in dedicated fields.

**When to escalate:** If a question you NEED to ask (per supervisor briefing) is missing from the app entirely, screenshot the summary screen and email your supervisor that evening. The supervisor coordinates with the Builder/ICT team to add the field in a future update.

## 3.6 App crash or unexpected freeze

**Symptom:** The OSLRS app suddenly closes mid-submission, OR the screen freezes and tapping does nothing for more than 30 seconds.

**Recovery:**

1. **Force-close the app and re-open it.**
   - Android: swipe up from the bottom to see open apps; swipe the OSLRS app off the screen; tap the OSLRS icon to re-open.
   - iPhone: double-tap the home button (or swipe up); swipe up on the OSLRS card; tap the OSLRS icon.
2. **Re-open the app.** Most crashes are recoverable — your in-progress submission is auto-saved as a draft. The app prompts you: *"Resume the submission you were working on?"* Tap **Yes**.
3. **If the app crashes a second time at the same step**, the crash is reproducible — note exactly which step and which respondent. Send the details to your supervisor at end-of-day.
4. **Restart your phone** if the app crashes more than 3 times in one day. Memory pressure from other apps can cause repeated crashes; a restart clears it.

**When to escalate:** If the app crashes more than 3 times in one day AFTER restarting your phone, call your supervisor immediately. Do not continue field work — the crashes may corrupt submissions. Wait for supervisor instruction.

---

# Section 4 — NDPA Briefing for Field Staff

> *Authored by AI agent in Iris persona (DPIA / NDPA Counsel). Voice derived from `docs/legal/consumer-onboarding-sop-v1.md` per AC#4. Sign-off doc at `docs/operations-manual/iris-signoff-v1.md` flags real-Iris ratification.*

**Purpose:** Tells you what the law expects of you when you handle respondent data. Read this once before you go to the field. The whole section fits on one printed page; if it does not, please tell your supervisor.

## What the law calls you

The Nigeria Data Protection Act 2023 (NDPA)[^1] gives you a role: you are the **data collector** acting on behalf of the Oyo State Ministry of Trade, Investment & Cooperatives (the "Controller"). The Controller is legally responsible for what happens to respondent data; you are legally responsible for **how you collect it**. Two duties matter.

### Duty 1 — Collect only what the form asks for

Do not write anything in the **Submission Notes** field that the form did not specifically ask for. Do not record the respondent's home address, religion, ethnic group, or political affiliation unless a specific field asks. The legal basis for this collection is **public interest**[^2] — the Ministry can collect what serves the registry's purpose, and **only that**.

### Duty 2 — Treat the data as confidential

While the data is on your phone, you are responsible for it. Do not show another person the respondent's NIN, photo, or trade. Do not screenshot a submission and forward it on WhatsApp. Do not let your friends look at your phone while the OSLRS app is open. If your phone is lost or stolen, **call your supervisor immediately** — within 24 hours[^3] — so the Builder/ICT team can wipe your phone session remotely.

## What to say when a respondent asks

Respondents have the right to ask any question about their data. You are not expected to answer like a lawyer; you are expected to answer like a representative of the Ministry. Three common questions:

1. **"What will you do with this data?"** Say: *"It goes into the Oyo State Skilled Labour Registry, which the Ministry of Trade uses to plan training programmes, identify skill gaps, and connect tradespeople with opportunities. Your data is not sold; it is not shared with anyone outside government without a formal agreement."*

2. **"Can I see what you have on me later?"** Say: *"Yes. You have the right to see your record, correct mistakes, or ask for it to be deleted. To do so, contact the Oyo State Ministry of Trade's data office. The phone number is on the Quick-Reference Card I will leave with you."*

3. **"What if I don't want to answer?"** Say: *"You don't have to. If you decline at any point, I will stop and not record anything further. There is no penalty."* Then tap **Decline** in the app and move on.

## When to escalate to the Ministry's data office

Any question you cannot answer with the three answers above, **stop and tell the respondent**: *"That is a question for the Ministry's data office directly. Let me leave you with the contact and you can call them."* Then escalate to your supervisor at end-of-day; the supervisor briefs the data office.

Do not improvise legal answers. If you are unsure, **silence + escalation** is always the right answer.

## What you must NEVER do

- Never record a respondent without their consent (Section 2.6 in this manual).
- Never share, photograph, or screenshot another respondent's data to discuss with anyone.
- Never use a respondent's contact details for personal reasons (e.g., to call them about something unrelated to the registry).
- Never leave your phone unlocked and unattended while the OSLRS app is open.

If you are ever asked by anyone — including someone claiming to be from the Ministry, the police, or any other authority — to show them respondent data outside the app's normal flow, **say no, then call your supervisor immediately**. Legitimate access to OSLRS data goes through the Ministry's data office, never through a field enumerator.

[^1]: NDPA — Nigeria Data Protection Act 2023, including Section 6 (lawful basis), Section 25 (data processor obligations), Section 39 (security of processing), Section 40 (breach notification).

[^2]: NDPA Section 6(1)(e) — Public Interest. Specifically: the Oyo State Ministry of Trade, Investment & Cooperatives processes respondent data in the exercise of an official authority vested in the State of Oyo, namely the planning and delivery of skills-development policy.

[^3]: NDPA Section 40 — breach notification timelines. The Ministry must notify the data subjects (respondents) and the Nigeria Data Protection Commission within 72 hours of becoming aware of a breach. Field-staff reporting within 24 hours of phone loss/theft gives the Ministry time to assess + notify within the legal window.

---

# Section 5 — Reimbursement, Payment & Phone-Allowance Procedure

> *Authored by AI agent in Gabe persona (Legal & Documentation Reviewer). Sign-off doc at `docs/operations-manual/gabe-signoff-v1.md` flags real-Gabe ratification.*
>
> *Author note: specific Naira amounts marked* `<!-- AWWAL-VERIFY -->` *— Awwal supplies the Ministry-approved figures during ratification pass.*

**Purpose:** Tells you what you will be paid, when, and how to claim reimbursable expenses. Field work has clear pay rules; follow them and your payment is on time.

## 5.1 Daily allowance + per-submission rate

You receive two payments per field day:

1. **Daily allowance:** ₦<!-- AWWAL-VERIFY: daily-allowance-amount --> per field day, regardless of submission count. Covers transport within your assigned LGA, mid-day meal, and your personal time.
2. **Per-submission rate:** ₦<!-- AWWAL-VERIFY: per-submission-rate --> per *valid* submission. A valid submission is one that passes verification (Section 5.4). Submissions flagged as duplicates, fraudulent, or rejected by the assessor do not count.

Both payments are calculated weekly (Monday-Saturday field days; Sunday is not a field day) and paid at the end of each week.

## 5.2 Phone-allowance + airtime/data top-up

The Ministry provides:

1. **Phone allowance:** ₦<!-- AWWAL-VERIFY: phone-allowance-monthly-amount --> per month, paid on the first working day of each month. Covers wear-and-tear on your personal phone used for field work.
2. **Airtime/data top-up:** ₦<!-- AWWAL-VERIFY: airtime-data-monthly-amount --> per month, paid the same day as the phone allowance. Covers your data + voice usage for field work. If your work-related usage genuinely exceeds this, see Section 5.5 (Reimbursement).

Both payments are independent of submission count — you receive them regardless of how many days you work in a given month.

## 5.3 Payment channel

Payment is by **bank transfer** to the account you provided to your supervisor at onboarding. Confirm the bank account details with your supervisor at onboarding; once confirmed, do not change the account during the field-survey unless absolutely necessary (account changes mid-field cause payment-week delays).

The transfer is from the **Oyo State Ministry of Trade, Investment & Cooperatives — Field Survey Account**. The reference line on your bank statement reads `OSLRS-FIELDPAY-<YYYY-WW>` where `WW` is the week number.

## 5.4 What "valid submission" means for payment

A submission is **valid** for payment when all four conditions are met:

1. The submission was successfully synced to the server (no orange-clock submissions left over).
2. The submission passed verification (the assessor reviewed it and did not flag it).
3. The submission is not a duplicate of another submission already in the registry.
4. The submission is not flagged as fraudulent (e.g., GPS location did not match the assigned LGA, or the submission was captured outside working hours, etc.).

Verification typically completes within 3-5 business days of sync. Your weekly payment includes only verified submissions from the *previous* week — submissions captured Monday–Saturday week 1 are paid in week 2. This is not a delay; it is the verification cycle.

## 5.5 Reimbursable expenses

Some expenses are reimbursable beyond the daily/monthly allowances:

1. **Inter-LGA transport** — if your supervisor sends you outside your assigned LGA for any reason, the inter-LGA transport cost is reimbursable. Keep the receipt; submit it with your weekly timesheet.
2. **Replacement printing** — if the printed Operations Manual or Quick-Reference Card you were issued is destroyed in the field (e.g., rain, accidental loss), reimbursement covers reprinting at a local commercial print shop up to ₦<!-- AWWAL-VERIFY: replacement-print-cap -->.
3. **Genuine field-emergency expenses** — e.g., a respondent needed urgent assistance and you covered a small cost. These are reimbursable on supervisor approval; not automatic. Submit a written explanation with the receipt.

Submit reimbursement claims with your weekly timesheet (Section 5.6). Claims older than 30 days from the expense date are not reimbursed unless your supervisor approves an exception in writing.

## 5.6 Weekly timesheet + payment cycle

Every Sunday evening (or first thing Monday morning if Sunday is impossible), submit your weekly timesheet:

1. The timesheet template is in your supervisor's WhatsApp or email — ask if you do not have it.
2. Fill in: name, week number, days worked, daily submission counts, reimbursable expenses (with receipts attached as photos).
3. Submit to your supervisor by **Monday 10:00 AM**. Late timesheets push your payment to the following week.
4. Your supervisor consolidates all team timesheets and submits to the Ministry's payroll office by **Tuesday 5:00 PM**.
5. Payment hits your bank account by **Friday close-of-business** the same week.

If your payment is delayed beyond the Friday, see Section 6.2 (Payment escalation).

---

# Section 6 — Escalation Paths

> *Authored by AI agent in Gabe persona (Legal & Documentation Reviewer). Specific phone numbers + names marked* `<!-- AWWAL-PROVIDE -->` *for Awwal to fill from the actual Ministry team roster post-draft.*

**Purpose:** When something goes wrong that you cannot fix yourself, this section tells you who to contact, in what order, and at what time. Follow the order — do not skip directly to the top of the chain.

## 6.1 The escalation order

Three levels, in order:

1. **Your Field Supervisor** — first contact for almost everything. Available during working hours (typically 8 AM – 6 PM Monday–Saturday).
2. **OSLRS ICT / Builder Team** — second contact, only if your supervisor cannot resolve OR is unreachable for more than 4 hours during working hours. Available during working hours.
3. **Ministry of Trade — Data Office (NDPA-related issues only)** — third contact, only for privacy-related questions a respondent asks that you cannot answer (Section 4) OR for confirmed data-loss / data-breach incidents.

**Do not contact the Permanent Secretary, the Honourable Commissioner, or any senior Ministry official directly.** The escalation order goes through the three levels above; senior officials are looped in by the Data Office or the ICT team if the issue requires it.

## 6.2 Who to call for which problem

| Problem | First contact | Second contact (if first unavailable >4 hrs) |
|---|---|---|
| App crash or freeze (after retry) | Field Supervisor | OSLRS ICT / Builder Team |
| Sync persistent failure (after retry) | Field Supervisor | OSLRS ICT / Builder Team |
| Magic-link email never arrives | Field Supervisor | OSLRS ICT / Builder Team |
| Respondent asks NDPA question I cannot answer | Field Supervisor | Ministry Data Office |
| Respondent requests their data / correction / deletion | Field Supervisor | Ministry Data Office |
| Phone lost or stolen | Field Supervisor *(within 24 hours per Section 4)* | OSLRS ICT / Builder Team *(immediately, parallel to supervisor)* |
| Suspected data breach (e.g., someone saw respondent data on my phone unauthorised) | Field Supervisor *(immediately)* | Ministry Data Office *(within 24 hours)* |
| Payment delayed beyond Friday close | Field Supervisor | Ministry Payroll *(supervisor escalates; do not call payroll directly)* |
| Inter-LGA transport authorisation needed mid-day | Field Supervisor | *(no second contact — supervisor must authorise)* |
| Personal emergency (e.g., illness, family) | Field Supervisor | *(no second contact)* |

## 6.3 Contact details (Field-Survey period)

> *Awwal provides actual names and numbers from the Ministry team roster. Placeholder pending Awwal-supplied roster.*

| Role | Name | Phone (working hours) | Email |
|---|---|---|---|
| Field Supervisor (your assigned LGA group) | <!-- AWWAL-PROVIDE: supervisor-name --> | <!-- AWWAL-PROVIDE: supervisor-phone --> | <!-- AWWAL-PROVIDE: supervisor-email --> |
| OSLRS ICT / Builder Team — primary | <!-- AWWAL-PROVIDE: builder-name --> | <!-- AWWAL-PROVIDE: builder-phone --> | `support@oyoskills.com` |
| OSLRS ICT / Builder Team — backup | <!-- AWWAL-PROVIDE: builder-backup-name --> | <!-- AWWAL-PROVIDE: builder-backup-phone --> | `admin@oyoskills.com` |
| Ministry of Trade — Data Office | <!-- AWWAL-PROVIDE: data-office-name --> | <!-- AWWAL-PROVIDE: data-office-phone --> | <!-- AWWAL-PROVIDE: data-office-email --> |
| Ministry of Trade — Payroll *(supervisor calls only)* | <!-- AWWAL-PROVIDE: payroll-name --> | <!-- AWWAL-PROVIDE: payroll-phone --> | <!-- AWWAL-PROVIDE: payroll-email --> |

## 6.4 Out-of-hours emergencies

Working hours are 8 AM – 6 PM Monday–Saturday. Outside working hours:

- **Phone lost or stolen** — message your supervisor on WhatsApp immediately; they wake the ICT team if needed. Phone-loss is the only out-of-hours escalation that gets immediate response.
- **Anything else** — wait until 8 AM the next working day, then escalate per Section 6.2.

Do not call the Builder personal mobile out-of-hours unless it is a phone-loss/breach situation. Out-of-hours non-emergencies waste the on-call capacity for genuine emergencies.

## 6.5 When in doubt

The default escalation rule when you are unsure: **call your supervisor.** They route your issue to the right place. Your job in the field is to capture submissions cleanly; the supervisor's job is to handle everything else.

---

# Section 7 — Quick-Reference Card

The Quick-Reference Card is a separate **printable A5 sheet** you carry in the field. It distills the five most common things from this manual:

1. Login + magic-link recovery (from Section 2.1 + 3.2)
2. NIN-not-found capture-pending workflow (from Section 3.1)
3. Network-drop sync recovery (from Section 3.4)
4. Consent script and NDPA briefing answers (from Section 2.6 + Section 4)
5. Escalation phone numbers (from Section 6.3)

The card is designed to be glanced at while standing with a respondent. It is not a replacement for reading the full manual — read this manual once before your first field day; the card is for in-field memory aid.

The A5 card source file is at `docs/operations-manual/enumerator-quick-ref-v1.md`. Print on plain paper at A5 size, double-sided. Lamination is recommended for field handling but not required (per Awwal directive 2026-05-04: Ministry office printer absorbs the print run; lamination optional based on field feedback).

---

# Document Control

| Item | Value |
|---|---|
| Document title | OSLRS Operations Manual — Enumerator Section |
| Version | v1 |
| Date | May 2026 |
| Audience | OSLRS Field Enumerators + Field Supervisors (~50–100) |
| Authoring agents | AI in Awwal-Builder + Iris + Gabe personae (per `prep-operations-manual-enumerator-section` Story AC#1) |
| Voice baseline | Story 10-5 SOP — `docs/legal/consumer-onboarding-sop-v1.md` |
| Ratification gate | Real-Iris (Section 4) + real-Gabe (Sections 5–6) — single session paired with Story 10-5 ratification |
| Print | Ministry office printer (A4 for full manual; A5 for quick-reference card) |
| Next review | v1.1 — post-dry-run friction + post-real-human-ratification incorporation |

**Status:** v1 draft — awaiting real-Iris + real-Gabe ratification + Awwal post-draft pass (screenshot sourcing + naira-amount filling + Ministry team-roster phone numbers).

**Related documents:**

- Quick-Reference Card: `docs/operations-manual/enumerator-quick-ref-v1.md`
- Iris persona sign-off: `docs/operations-manual/iris-signoff-v1.md`
- Gabe persona sign-off: `docs/operations-manual/gabe-signoff-v1.md`
- Story (this manual's source-of-truth): `_bmad-output/implementation-artifacts/prep-operations-manual-enumerator-section.md`
- Story 10-5 voice baseline: `docs/legal/consumer-onboarding-sop-v1.md`
- Story 10-5 ratification pattern: `docs/legal/dsa-template-v1-signoff.md`
