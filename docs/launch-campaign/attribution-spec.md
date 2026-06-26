# Multi-Channel Campaign Attribution — Specification

**Owner:** Mary (Analyst) · Impl: Amelia · PM: John
**Created:** 2026-06-25 · **Status:** spec → Story 13-1
**Why:** The launch fires **five channels at once** (radio · paid social · association cascade · enumerators · organic). Without per-channel attribution we get a number and **no idea which naira earned it** — we can't renew radio on evidence, kill a weak platform, or steer enumerators. *(Project lesson: "install analytics BEFORE launch — post-launch instrumentation is a permanent dark window.")*

> **Current state (verified):** attribution is **ABSENT**. `respondents.source` only records the *method* (enumerator/public/clerk/imported_*), not the acquisition *channel*. The wizard reads only `?token=` (resume). Cloudflare Web Analytics is live but privacy-first (no per-registration channel). **But it ships with NO migration** via `wizard_drafts.form_data.extras` → `submissions.raw_data.campaign_source`.

---

## 1. Channels to separate

A **single, plain-language list** (no station sub-picker — simpler to answer, cleaner to analyse):

`Radio` · `TV` · `Word of mouth` · `Association / cooperative` · `Search engine` · `Facebook` · `Instagram` · `Twitter / X` · `Other`

Plus **by-construction** (no question needed): association-sheet imports = `imported_association`; enumerator submissions = `enumerator`. (A self-serve association member who registers *direct* on the website picks **Association / cooperative** — which is why the self-report question still matters even with source tagging.)

## 2. Capture — three mechanisms (all no-migration)

**(a) "How did you hear about us?" — mandatory early-wizard question.**
- `select_one`, asked once near the start (Contact step or a dedicated micro-step). Options = the channel list above.
- This is the **only** way to attribute the **offline / unclickable** channels — **Radio, TV, Word of mouth** can't be tracked by any pixel or UTM. Self-report is load-bearing, not a nicety.
- Stored client-side in `form_data.extras.acquisition = { channel }`.

**(b) UTM / referral param parse — for the clickable channels.**
- On wizard entry, read `utm_source`, `utm_medium`, `utm_campaign`, and `?ref` from the URL → `form_data.extras.utm = {...}`.
- Ad creative links carry them, e.g. `https://oyoskills.com/register?utm_source=facebook&utm_medium=cpc&utm_campaign=launch_2026_06`.
- UTM is the **objective** signal; the self-reported question is the **fallback + radio** signal. When both exist, keep both (UTM wins for reporting; the question validates it).

**(c) Source-by-construction — no question needed.**
- Association-sheet rows import as `source = imported_association`.
- Enumerator submissions are `source = enumerator`.
- These channels are known by the ingestion path, so they bypass (a)/(b).

**On submit:** merge `extras.acquisition` + `extras.utm` into `submissions.raw_data.campaign_source` (single JSON key, no schema change), e.g.
```json
"campaign_source": { "channel": "radio", "station": "fresh_fm", "utm": {} }
```

## 3. Reporting

- **Monday only needs CAPTURE live** — the report can wait. A SQL `GROUP BY raw_data->'campaign_source'->>'channel'` (+ station) over completed registrations gives counts.
- **⚠️ Split the channels into AWARENESS vs DIRECT-RESPONSE before you judge them on CPA** (peer review 2026-06-25). Mary called radio/TV/social "warming," not conversion — but a pure `CPA = spend ÷ completions` scoreboard will make awareness channels look terrible on a government NIN-collecting form and **get you to kill spend that was actually working.** You cannot run a warming campaign on a direct-response scoreboard.
  - **Awareness channels (Radio · TV · brand/reach social):** measure **reach / lift in organic + branded-search + word-of-mouth registrations during and after the flight**, not direct CPA. Expect a *delayed, diffuse* effect.
  - **Direct-response channels (search ads · click-to-register social):** judge on **CPA = spend ÷ completions** with a pre-agreed 48-hour ceiling; reallocate if a channel exceeds it. (And if direct-response CPA is bad, the *form friction* is the lever, not the channel.)
- **CPA kill-switch (direct-response only; decide the threshold BEFORE spend):** pre-commit the 48-hour CPA ceiling so the cut is a rule, not a post-hoc rationalisation — but never apply it to an awareness channel.
- **Fast-follow (Story 13-6):** a coverage dashboard — **registrations by LGA × trade × channel** — so under-covered LGAs become visible and enumerators get steered into the holes (representativeness as an active control, not a hope).

## 4. Build notes (Story 13-1)

- No migration: `extras` is the documented forward-compat slot on `wizard_drafts.form_data`; `raw_data` accepts a new `campaign_source` key at `submitWizard`.
- Carry the value through the existing draft → submit path; assert it lands in `raw_data` with a test.
- The "how did you hear" question and station list are config, not schema — keep them in one place so the 11 stations are editable without a deploy if a station is added/dropped.

## 5. Social pixels — a decision, not a default ⚠️

Embedding Meta (Facebook/Instagram) + X pixels gives the **paid online** channels objective conversion tracking, retargeting, and auto-optimisation that self-report can't. **But this is a government, PII-collecting site with a deliberately locked-down posture**, so it's a real trade, not a free add. Two tracks:

**What pixels CAN'T do:** attribute Radio, TV, or Word of mouth (no click). Those stay on self-report (§2a) no matter what. Pixels only help the clickable paid channels — so they're *additive* to, not a replacement for, the question.

**The cost of embedding pixels (don't wave this away):**
- **CSP:** the site runs a hardened ~17-directive CSP (Stories 9-8/9-30) and chose **Cloudflare privacy-first analytics** specifically to avoid third-party trackers. Pixels need new `script-src`/`connect-src` allowances (`connect.facebook.net`, `analytics.twitter.com`, …) — widening the attack surface that was deliberately minimised.
- **NDPA / DPIA:** browser pixels drop cookies and ship behavioural data (and, for conversion matching, *hashed PII*) to Meta/X. On a registry collecting NIN/phone, that almost certainly needs a **cookie-consent gate** and a **DPIA update (Appendix H)** with a stated lawful basis.
- **Trust:** a labour registry that asks for NIN *and* carries Facebook tracking reads badly if surfaced; it cuts against the consent/data-minimisation story we tell respondents.

**Recommended pattern IF we use pixels (the safe way):**
1. **Server-side, not browser, where possible** — Meta **Conversions API** with hashed identifiers beats the browser pixel for control and CSP cleanliness.
2. **Fire only on a post-completion "thank-you" page — never on PII-entry steps** (don't fire a pixel on the NIN/phone screens).
3. **Consent-gated load** — pixel scripts load only after an explicit cookie-consent opt-in.
4. **Explicit CSP allowances** + a **DPIA addendum** before go-live.

**Cleaner alternative (keeps the privacy posture intact):** skip embedded pixels; rely on **UTM links + the self-report question** for attribution, and read conversions from the ad platforms' own *click* data against UTM-tagged landings. You lose retargeting and auto-optimisation, but you keep zero third-party trackers, no consent banner, and the DPIA unchanged. For a ₦200k spend, the optimisation upside is modest — this alternative is likely the right call for launch, with pixels revisited if spend scales.

→ **This is your decision (Story 13-1 branch).** Default recommendation: **UTM + self-report only for launch; pixels parked behind the consent/DPIA work.**

## 6. Open input needed from Awwal

- **Pixel decision** (§5): UTM-only for launch, or pixels-with-consent-gate? (Default rec: UTM-only.)
- **CPA kill-switch ceiling** — the 48h cost-per-registration threshold that triggers reallocation (§3).
