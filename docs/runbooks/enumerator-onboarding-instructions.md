# Enumerator Onboarding — instructions, and the practice-capture key

**Created 2026-09-18.** For the 19-person cohort re-onboarding with real email addresses.

**Why this exists:** the first attempt lost seven people to problems none of them could see —
an address they could not guess, a photo step that failed silently, and rate limits that refused
them for being behind the same proxy as a colleague. All of those are fixed. What is left is
making the instructions unambiguous, so that somebody who does not complete onboarding has
genuinely chosen not to.

---

## 1. The practice-capture key — `Praktis`

Every enumerator makes **exactly ONE** practice capture before real field work. It uses:

| field | value |
|---|---|
| First name | **Tunji** |
| Surname | **Praktis** |

⛔ **The SURNAME is the key. It must be a name no Nigerian would be given.**

The obvious choice — using a friendly name like *Tunji* as the surname — was measured against the
live register and rejected: **`Tunji` appears 33 times as a surname and 71 times as a first name**
among real respondents. A teardown keyed on it would delete 33 real people. `Praktis` returns **0**
on both columns.

✅ So Tunji survives where it is harmless (the first name) and the key sits where it must be
impossible (the surname).

**Teardown becomes a predicate rather than a review:**

```sql
-- List first. Always.
SELECT id, first_name, last_name, lga_id, created_at, submitter_id
FROM respondents WHERE last_name ILIKE 'praktis' ORDER BY created_at;
```

⭐ **And the inverse is the real prize: an UNTAGGED capture from a trial account is a REAL PERSON.**
Last time there was no tag at all — runbook §0.9a records the result, *"Tagged rows: 0. Rows from
test accounts: 2"* — and two genuine registrants came within one query of being deleted. With the
tag, the ambiguity is gone in both directions.

⚠️ It is also a comprehension check. Somebody who cannot follow *"surname must be Praktis"* will not
follow the questionnaire either, and that is worth knowing before they are in the field, not after.

---

## 2. The message to send (WhatsApp / video script)

> **Onboarding — please read fully before you start**
>
> You are receiving a NEW invitation email. The old one no longer works. Please ignore any earlier
> email.
>
> **1. Your login is your normal email address.** The one you gave us. There is no longer any `+test`
> or extra text. If you were using a `+test` address before, forget it — it is gone.
>
> **2. Open the invitation email and click the button.** ⏰ **The link works for 48 hours.** If it
> expires, message us and we will send another — but please do it the same day.
>
> **3. Fill in your details carefully.** You will be asked for your password, NIN, date of birth,
> home address, next of kin, and your bank account.
>
> ⚠️ **Your bank ACCOUNT NAME must match your full name exactly as it appears on your bank app or
> statement.** If your account reads "Badmus Alia Tolani" but your name here is "Badmus Aliyat
> Tolani", the payment will bounce. Copy it exactly from your bank — do not type it from memory.
>
> **4. Take the photo in good light.** Face the window or stand outside. Hold the phone steady and
> fill the frame with your face. If it says the photo is not clear, move to brighter light and try
> again — it is the light, not you.
>
> **5. Allow LOCATION when your phone asks.** The app records where a registration was taken. If you
> block location, your work cannot be verified and it may not count. Please tap **Allow**.
>
> **6. Do ONE practice registration.** Any details you like, EXCEPT the name, which must be:
>
> > **First name: Tunji**
> > **Surname: Praktis**
>
> This is how we know your account works. We delete it afterwards.
>
> **7. Message the group when you have finished** — say "done" and your LGA.
>
> ⛔ **Do NOT start real registrations until we confirm.** Anything captured before we give the
> go-ahead will be deleted with the practice data.

---

## 3. Why each instruction exists — do not drop one

Every line above is a defect somebody actually hit. Recorded so that a future edit does not quietly
remove the reason:

| instruction | the incident behind it |
|---|---|
| "Your login is your normal email" | **36 failed logins** across 7 people typing the address without `+test`; two typed a bare `+` because they knew a plus existed and could not guess the rest (§0.1a) |
| "The link works for 48 hours" | 7 of 17 sat on invitations that expired 09-08 and were never resent |
| "Account name must match exactly" | measured 2026-09-17: **4 of 11** activated enumerators had a mismatched account name — a dropped letter, a typo, a partial, an extra given name |
| "Take the photo in good light" | selfies were sized to the video's CSS width, failing a 240px floor; **75 photo failures from one person**, who tried harder than anyone and never got in |
| "Allow location" | GPS is captured on **3 of 8,299** submissions, which is why the fraud engine has scored nothing since 09-05 (story 13-69) |
| "One practice registration, surname Praktis" | §0.9a — no tag existed, so practice and real data were indistinguishable and two real registrants nearly got deleted |
| "Do not start until we confirm" | two enumerators went ahead without instructions in the first cohort, producing real registrations nobody had planned for |

---

## 4. Operator sequence — the order is load-bearing

```
1. Send instructions (video / WhatsApp)          ← BEFORE any invitation
2. Review + delete existing practice respondents  ← §0.9a: list, read names, confirm
3. Deactivate → rename +test to real → re-onboard ← keeps the user id
4. Send invitations, timed so people can act      ← 48h clock
5. Each does ONE Tunji Praktis capture
6. Delete by predicate: last_name ILIKE 'praktis'
7. Confirm go-ahead → real field work begins
```

⛔ **Steps 2 and 3 must not swap.** `submitter_id` has no foreign key (§0.9b) and every consumer
INNER joins, so disabling or deleting an account first makes its captures vanish from the very
review query that exists to protect real registrants. Handle respondents while the accounts can
still be joined.

⚠️ **Step 3 preserves the user id**, so the 30 captures already recorded keep their attribution and
nothing is orphaned. Use `Deactivate` then `Reactivate (re-onboard)` — both already in the Staff
Management actions menu. It clears the password and issues a fresh invitation; it does NOT delete
the account.

⚠️ **Hold step 4 until story 13-69 has deployed.** That story is what makes GPS capture work. Invite
people before it lands and their first real captures will carry no coordinates — the exact gap the
instructions now ask them to avoid.

✅ **Adedeji Adetola is excluded from the re-onboarding** — he is working correctly with 23 captures.
⚠️ **Rename his address anyway:** he has **9 failed logins** against `checkadetola@gmail.com` in two
days. He is the most productive enumerator in the cohort and is still fighting the suffix.
