# Condensed Association Data Sheet — Specification

**Owner:** John (PM) · UX: Sally · Import-fit: Winston/Amelia · Copy: Paige · Analytics: Mary
**Created:** 2026-06-25 · **Status:** v1 — FROZEN for the Monday 2026-06-29 umbrella-body meeting · **Print artifact:** `association-data-sheet-PRINT.html` generated 2026-06-27 (English-complete; 3 operator inputs marked `[AWWAL]` inline)
**Purpose:** A one-row-per-member sheet that association heads can fill on behalf of their members — fast enough to fill without an enumerator, rich enough to power per-LGA × trade clustering (the "tailors-in-an-LGA → site a textile centre" policy bite), and shaped so it **round-trips into the registry via the Epic 11 import path** with zero re-keying.

> **Why these columns and not 38:** the cascade (umbrella head → association head → members) makes the **association head the enumerator-equivalent** — the accountability that was missing for self-serve groups. So we don't gut the form to a contact list; we keep the *analytically load-bearing* fields (trade × LGA × experience) and drop the conditional/administrative ones (guardian block, business sub-questions, dual consents collapsed to one). Result: **12 member columns.**

---

## 1. Sheet header (one block per association, filled once)

| Field | Notes |
|---|---|
| Umbrella body | e.g. "Oyo State Council of Skilled Workers" (pre-printed) |
| Association / guild name | The specific association (e.g. "Ibadan Tailors Association") — becomes the group dimension |
| Association head — name & phone | The accountable filler; also the reconciliation contact |
| Primary LGA | From the 33-LGA list (Appendix A) |
| Date collected | |
| **Declared member count** | Head writes "we have N members" — reconciled against rows received (data-quality check + follow-up trigger) |

## 2. Member rows (one per member) — the 12 columns

| # | Column (header on the sheet) | Required | Maps to (import) | Notes |
|---|---|---|---|---|
| 1 | **S/N** | sheet-only | — | Serial; not imported |
| 2 | **Surname** | ✅ | `respondents.lastName` | |
| 3 | **First name** | ✅ | `respondents.firstName` | |
| 4 | **Phone number** | ✅ | `respondents.phoneNumber` | **Primary dedup key** + contact channel. Normalised to +234 on import. A row with no phone can't be deduped or re-contacted — treat as invalid. |
| 5 | **Gender** (M/F) | ✅ | `raw_data.gender` | Cheap, policy-relevant |
| 6 | **Date of birth** (or **Age** if DOB unknown) | ✅ | `respondents.dateOfBirth` (DOB) / `raw_data.age_years` (age fallback) | DOB preferred — drives the age compute. Age-only is accepted but flagged. |
| 7 | **LGA** (where they work/live) | ✅ | `respondents.lgaId` | From the 33-LGA list (Appendix A). **Primary clustering axis.** |
| 8 | **Town / Ward** | optional | `raw_data.town` | Finer geo for siting decisions |
| 9 | **Trade / primary skill** | ✅ | `marketplace_profiles.profession` | **Pick from Appendix B suggested list** — free-text variance kills clustering |
| 10 | **Years of experience** | ✅ | `marketplace_profiles.experience_level` | e.g. "5", "10+" |
| 11 | **NIN** | optional | `respondents.nin` | If the member has it to hand. Blank is fine (nullable post-11-1; partial-unique index protects FR21 when present). |
| 12 | **Consent** (Yes/No) | ✅ | `respondents.consentMarketplace` | "Yes" → consentMarketplace = true. **No "Yes" = do not enter the member.** (See §4.) |

**Discipline that makes or breaks the data:**
- **Phone is mandatory** — it's the dedup key *and* the only reliable re-contact path.
- **Trade must come from the Appendix B list.** "Tailor", "Tailoring", "fashion designer" as free text become three clusters of one. The controlled list collapses them; periodically fold popular "Other (specify)" write-ins back into the list (living list).
- **A worked example row is pre-filled on the printed sheet** (Sally) so the first real row mirrors it.

## 3. How it enters the registry (ingestion)

- **Source tag:** new enum value `imported_association` (extend `respondents.source` + add a per-source config block in `import-sources.ts`; the audit actions `import_batch.created`/`rolled_back` are already generic). Rows land `status = imported_unverified` — so they are **excluded from fraud-detection, marketplace-extraction, and partner-API `verify_nin`** until verified (the Epic 11-1 status gate already enforces this). This is the honest Tier-2 stratum.
- **Path:** the electronic sheet (XLSX/CSV, columns = the headers above) goes through the Epic **11-2 import service** (`/api/v1/admin/imports/dry-run` → `/confirm`), which already does **file-hash dedup**, **auto-skip on phone/email match**, a **lawful-basis prompt**, and a **14-day rollback**. The sheet's column order **is** the import column-mapping — frozen here so it round-trips.
- **Monday vs build:** Story **11-1 (schema) is DONE**; **11-2 (the service) is ready-for-dev, not built.** The cascade is inherently async (heads collect over days/weeks), so **we do NOT need import working by Monday** — we need the **sheet frozen** (this doc) by Monday and the association importer as a fast-follow (Story 13-2). Sheets collected this week import cleanly next week. A Google Form mirroring these exact columns is an acceptable interim that exports to the same CSV.
- **Dedup against existing individuals:** import auto-skips any row whose phone/NIN already exists (any source), so a member who already self-registered won't double-count. Reconciliation: `rows_inserted` vs the head's declared member count surfaces gaps.

## 4. Consent, lawful basis & language (NDPA) — Paige

Heads are collecting **third-party** personal data, so consent provenance must be explicit, not assumed.

**Declaration the head reads to each member (printed bilingually, English + Yoruba):**
> "The Oyo State Government is building a Skills Registry. If you agree, your details will be stored and used to contact you about skills, training, jobs, and economic opportunities for your trade and area. You can ask to be removed at any time. Write **Yes** in the Consent column if you agree."

- The per-member **Consent = Yes** column is the consent record; **rows marked No (or blank) are not entered.**
- Import **lawful basis:** record `ndpa_6_1_e` (public task — a government labour registry) **with** the per-member consent column as the defensible backstop; `lawful_basis_note` cites this sheet + the meeting date. (Final basis to confirm with the DPIA owner — Appendix H.)
- **Why bilingual here** (and what it is *not*): Yoruba on the sheet is for **comprehension and trust**, not access — a Yoruba reader almost certainly reads English too (Yoruba is more spoken than written). Reading the consent/questions in the local dialect confers **more meaning** and signals respect, which lifts answer quality and willingness. The genuinely **low-literacy / non-reading** members are served by the head reading the declaration **aloud** — which is exactly why the cascade (not a self-serve form in any language) is the right channel for that segment.
- **⚠️ Proxy collection is a new DPIA pattern, not just an import format** (peer review 2026-06-25): an untrained head collecting members' NIN/phone on paper creates a **processor/controller relationship**, **paper-retention + security** duties, and **proxy-consent** provenance. **Appendix H (DPIA) needs a real update** for this pattern — the per-member consent column is necessary but not sufficient. And because the "policy-bite" pitch incentivises **roll-padding with ghost members** (which declared-vs-received reconciliation can't catch — the head controls both numbers), imported rows stay **`imported_unverified`** until a **member-side check** (confirmation SMS once Termii clears, or a sampled call-back audit). See Story 13-2 AC5.4/AC5.5.

## 5. Open inputs needed from Awwal before print — THE ONLY REMAINING GATE

The print-ready form now exists (`association-data-sheet-PRINT.html` — page 1: the landscape data sheet with header block + 12 columns + worked example + the controlled Trade/LGA reference boxes; page 2: the read-aloud consent declaration + the fill/return one-pager from §6). It is **English-complete**; each item below is a marked `[AWWAL]` placeholder in the HTML. These three are the **only** things between the current artifact and the printer:

1. **Confirm/extend the Appendix B trade list** to reflect the actual guilds in the umbrella body → update the "Trade" reference box on page 1. _(I cannot author this — needs your knowledge of which guilds attend.)_
2. **Yoruba translation** of the §4 declaration (+ optional Yoruba sub-labels under the headers) → the `[YORUBA]` block on page 2. _(Owner: Awwal/Paige — needs a native speaker; I left the English authoritative + the slot ready.)_
3. **Print logistics** — copies (one sheet per association × expected associations), **named return contact + phone/WhatsApp**, and the **return deadline** → the `[AWWAL]` slots in the page-2 "How & when to return it" block. The named contact + deadline are load-bearing (§6: the sheet dies without them).

**Everything else is frozen and print-ready as-is.** Nothing here is a code/build task; none of it gates Monday's *meeting* (the sheet can be handed out the moment these three are filled).

## 6. The Monday human process (the sheet dies without it) — peer review 2026-06-25

A frozen 12-column sheet **dies in a WhatsApp group** without the human process around it. The Monday meeting must hand each association head a **one plain-language page** answering:
- **How to fill it** (the worked example row + the read-aloud consent declaration).
- **How and by when to return it** (channel + a deadline — e.g. "send the photo/file to <number> by <date>").
- **To whom** (a single **named contact** who chases and reconciles).
- **The reconciliation hook** — the head writes the **declared member count** up front, so under-delivery is visible and chase-able.

This one-pager + named contact is the difference between sheets that come back and a nice artifact nobody returns. **Owner: Awwal + Paige** (plain-language copy). Gate the *cascade go-live*, not the importer build.

---

### Appendix A — the 33 Oyo State LGAs (controlled list; import validates against `lgas.code`)

Afijio · Akinyele · Atiba · Atisbo · Egbeda · Ibadan North · Ibadan North-East · Ibadan North-West · Ibadan South-East · Ibadan South-West · Ibarapa Central · Ibarapa East · Ibarapa North · Ido · Irepo · Iseyin · Itesiwaju · Iwajowa · Kajola · Lagelu · Ogbomosho North · Ogbomosho South · Ogo Oluwa · Olorunsogo · Oluyole · Ona Ara · Orelope · Ori Ire · Oyo East · Oyo West · Saki East · Saki West · Surulere

### Appendix B — suggested trade list (DRAFT — Awwal to confirm/extend)

Tailoring / Fashion · Carpentry / Woodwork · Welding / Fabrication · Electrical / Electronics · Plumbing · Masonry / Bricklaying · Auto Mechanic · Hairdressing / Barbing · Catering / Food · Cosmetology / Make-up · Photography / Videography · Painting · Vulcanizing · Phone / Computer repair · Shoemaking / Leatherwork · Textile / Aso-Oke weaving · Agriculture / Agro-processing · **Other (specify)**
