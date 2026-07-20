# DPIA Amendment — Multi-Channel Data Collection (Appendix H addendum)

**Document reference:** CHM/OSLR/2026/001 — Appendix H addendum "H-MC" (Multi-Channel Collection)
**Instrument:** amends the OSLRS Baseline Study Report, Appendix H (`_bmad-output/baseline-report/BASELINE-STUDY-REPORT-COMPLETE.md`)
**Author:** Iris (DPIA / NDPA Counsel) · **Drafted:** 2026-07-20 · **Status:** DRAFT — PENDING MINISTRY (Controller) RATIFICATION + NDPC filing
**Sign-off tracker:** `docs/legal/dpia-multichannel-signoff-v1.md`
**Companion form:** `docs/legal/association-member-consent-evidence-form-v1.md`

> ⚠️ **MERGE INSTRUCTION (for whoever integrates this into the live report):** the collection-channel sections below are numbered **H-MC** so they do **NOT** collide with §H.9/§H.10, which H.8.2 reserves for onboarded API *consumers*. Merge the H-MC.5 rows into the parent **H.5 Risk Register** and the H-MC.6 rows into **H.6 Technical & Organisational Measures**, and insert this addendum after H.7 / before H.8. Do not renumber the consumer template.
>
> ✅ **DPO RESOLVED (Awwal, 2026-07-20):** the NDPA s.32 Data Protection Officer / oversight role is the **SABER Focal Person**, under whose guidance the OSLRS project is run. No designation gap.
> 🟨 **PLACEHOLDERS Awwal is transcribing** — every `⟪…⟫` is a real-world fact to confirm before ratification: `⟪MINISTRY_LEGAL_NAME⟫`, `⟪SABER_FOCAL_PERSON_NAME_CONTACT⟫` (name/contact of the known role), `⟪CHEMIROY_CONTACT⟫`, `⟪SECRETARIAT_ADDRESS⟫`, `⟪PAPER_RETENTION_DAYS⟫`, `⟪DESTRUCTION_METHOD⟫`.

---

## H-MC.0 Identification & Roles (NDPA s.24, s.32)

| Role | Entity | Contact |
|---|---|---|
| **Data Controller** (determines purpose + means; NDPC-accountable) | ⟪MINISTRY_LEGAL_NAME⟫ (Oyo State) | via the SABER Focal Person (below) |
| **Designated DPO / oversight** (NDPA s.32) | **SABER Focal Person** — the project runs under their guidance | ⟪SABER_FOCAL_PERSON_NAME_CONTACT⟫ |
| **Processor / Implementing Consultant** | Chemiroy Nigeria Limited | ⟪CHEMIROY_CONTACT⟫ |
| **Technical Processor** (build/hosting/operations) | OSLRS engineering (Awwal) | as per operations manual |
| **Association head** (per batch) | named on each consent-evidence form | proxy sub-processor — see H-MC.5 R2 |

> **Why this matters:** legal accountability + the NDPC DPIA filing are the **Controller's** (the Ministry's). Chemiroy and the engineering team act **on the Ministry's documented instructions** (NDPA s.29 processor duties). The association head is a **proxy collector** — a narrow, briefed processor role bounded by the consent-evidence form (H-MC annex B).

---

## H-MC.1 Scope of this amendment

This addendum extends the base DPIA (H.1–H.7) to cover **three new data-collection channels** that entered scope after the original assessment. All three serve the **same, already-assessed purpose** (a State labour/skills registry — H.2, lawful basis NDPA s.6(1)(e) public interest); they add new *collection mechanisms*, not new purposes:

- **Channel A — Association proxy-collection** (umbrella-body cascade; Story 13-2).
- **Channel B — Imported public register + confirm-first contact** (ITF-SUPA; Stories 11-5 / 13-39).
- **Channel C — Edge-store capacity capture** (Cloudflare fallback; Story 13-3) — *activates only when 13-3 ships; documented now for completeness.*

---

## H-MC.2 Purpose of Processing (append to H.2)

Add to the registry's stated purposes:
- **A** — include artisans/tradespeople organised under associations/cooperatives who register **via their association head** (the inclusion path for non-literate and non-enumerated members), so the registry is not skewed to only the literate/enumerated.
- **B** — incorporate members of **accountable public registers** (e.g. the ITF-SUPA Oyo artisan register) and give each individual a **confirm-first** opportunity to acknowledge, correct, and claim their record.
- **C** — preserve name/phone/LGA leads captured at the edge during a **traffic-spike fallback**, round-tripped into the registry.

## H-MC.3 Categories of Personal Data (append to H.3)

Same core categories as H.3 (name, NIN, DOB, phone, LGA), **plus**:
- **Email address** — NEW first-class contact field (`respondents.email`, Story 11-5). Contact-PII: used for verification + campaign only; **never exposed on any public surface**. Not an identity/dedup key (shared addresses).
- **Trade / occupation, years of experience, town/ward, gender** — skills-registry fields (Axis-2 `core`).
- **Provenance metadata** — source, import batch, external reference (ADM No.), lawful-basis note.
- **Channel A** additionally involves **transient paper records** (the condensed sheet) — see H-MC.6 M-A3.

## H-MC.4 Data Subject Rights (append to H.4)

All NDPA data-subject rights (access, rectification, erasure, objection, restriction, portability) apply unchanged. Channel-specific provisions:
- **Every confirm-first email (B) and every association briefing (A)** must carry a **plain-language notice** of the right to **object / withdraw** and a working channel to exercise it (the unsubscribe/suppression inlet, Story 13-13, and the support channel).
- **Rectification is built into Channel B** — the confirmation flow lets the individual correct name/trade/LGA (Story 13-39), operationalising NDPA rectification at the point of contact.
- Imported individuals who **object** are added to `email_suppressions` and excluded from all further processing beyond the honest headcount, or erased on request.

---

## H-MC.5 Risk Assessment (append rows to H.5 Risk Register)

Likelihood/Impact scale per the report's H.5 methodology (Low/Med/High).

### Channel A — Association proxy-collection

| # | Risk | L | I | Mitigation (all already built unless noted) |
|---|---|---|---|---|
| A-R1 | **Proxy-consent validity** — members did not personally sign; the head attests on their behalf | Med | High | In-person **Secretariat briefing** + the data-collection **declaration read aloud** (inclusion path for non-literate members); the **consent-evidence form** (Annex B) captures head attestation + Secretariat date + per-member Consent Yes/No; recorded in `import_batches.lawful_basis_note`. Members marked "No"/blank are **not entered** (importer AC4.3). |
| A-R2 | **Roll-padding / ghost members** — the "policy-bite" pitch incentivises inflating the list; declared-vs-received reconciliation can't catch it (head controls both numbers) | Med | High | Imported rows held **`imported_unverified`** (excluded from marketplace/fraud/verified-headline) until a **member-side check** — confirmation SMS (Termii) / **email (13-39)** / **sampled Assessor callback (13-40)**. Dedup on phone/NIN. A ghost can't confirm itself. |
| A-R3 | **Paper-sheet retention + physical security** — sheets bearing NIN/phone held before digitisation | Med | High | The **retention & security arrangement** (Annex A): locked storage, named-officer access, digitise within `⟪PAPER_RETENTION_DAYS⟫`, secure destruction (`⟪DESTRUCTION_METHOD⟫`) + destruction log. |
| A-R4 | **Untrained head as sub-processor** — collects/handles PII without formal training | Med | Med | Bounded, briefed role: the head acts only under the Secretariat briefing + the consent-evidence form's written instruction; minimal fields (12-column sheet); the digital record is authoritative and the paper is destroyed per Annex A. |
| A-R5 | **Transcription error** (dirty phone/LGA/trade; the real ASNAT batch showed ~15 spellings of one trade) | High | Low | Import **dry-run preview** + normalisation warnings + `shared_email`/typo flags; operator review before confirm; 14-day rollback. |

### Channel B — Imported public register + confirm-first contact

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| B-R1 | **Cold-contacting a public register** — emailing individuals whose data was collected for another body's purpose | Med | Med | **Confirm-first = double opt-in:** the first email is a **one-time transparency + claim notice** (NDPA s.6(1)(f) legitimate interest + s.27 transparency, with one-click opt-out). **Marketing only AFTER confirmation** (consent). Non-response → no further contact. |
| B-R2 | **Wrong-recipient / shared email** — a proxy/cybercafé address on many rows | Med | Med | `shared_email` guard (flag-not-collapse ≥3, Story 11-5); the magic-link proves control of the address before any promotion; email is never an identity key. |
| B-R3 | **Unverified imports inflating "verified" counts** | Med | Med | `imported_unverified` stratum + honest **composition** headline (Story 12-4); only a member-side confirmation promotes to verified. |
| B-R4 | **Data accuracy** — imperfect names extracted from a PDF | Med | Low | Confirmation flow **doubles as a rectification loop** (self-correct name/trade/LGA, Story 13-39). |
| B-R5 | **Third-party source-file handling** — the register file is bulk third-party PII | Med | Med | Secure handling; the test fixture is **gitignored** (never committed); the source file is deleted after successful ingest + reconciliation per the retention rule. |

### Channel C — Edge-store capacity capture *(activates with Story 13-3)*

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| C-R1 | **Transient edge retention** of name/phone/LGA in a third-party (Cloudflare) store | Low | Med | Data-minimised (3 fields); origin-independent store; **short retention** — round-tripped into the registry via the import path, then the edge store is **purged**. |
| C-R2 | **Cross-border processing** — Cloudflare edge may process outside Nigeria (NDPA s.41–43) | Low | Med | Document the transfer ground (adequacy / contractual safeguards) at 13-3 build time; minimise fields + retention to reduce exposure. **⟪confirm Cloudflare processing location/ground at 13-3⟫** |

---

## H-MC.6 Technical & Organisational Measures (append to H.6)

| ID | Measure | Where implemented |
|---|---|---|
| M-1 | **Honest trust-stratum** — imported rows land `imported_unverified`, excluded from marketplace / fraud / verified-headline until a member-side check promotes them | Stories 11-1/11-2 status gate; taxonomy Axis-3 |
| M-2 | **Channel-agnostic member-side verification** — SMS / email magic-link / sampled Assessor callback, one promotion path via the 12-4 model | 13-2 / 13-39 / 13-40; taxonomy R5 |
| M-3 | **Confirm-first double opt-in** — transparency notice + opt-out first; consent-based marketing only after confirmation | 13-39; 13-13 unsubscribe/suppression |
| M-4 | **Reversibility** — 14-day import rollback (soft-delete via status flip; rows preserved for audit, never hard-deleted) | 11-2 |
| M-5 | **Deduplication** on the NDPA-safe identity key (NIN → phone → id; `identity_ambiguous` never silently merged) | 11-2 / taxonomy R2 |
| M-6 | **Data minimisation** — only registry-relevant fields; email restricted to verification/campaign; **email never public** | 11-5 privacy guard |
| M-7 | **Auditability** — every import batch + rollback + verification is append-only audit-logged | 6-1 audit chain; 11-2 |
| M-8 | **Association paper controls** — locked storage, named-officer access, timed digitisation, secure destruction + log | **Annex A** (below) |
| M-9 | **Consent evidence** — batch head-attestation + per-member Consent Yes/No + Secretariat briefing date | **Annex B** (`association-member-consent-evidence-form-v1.md`) |
| M-10 | **Source-file hygiene** — third-party register files gitignored, deleted post-ingest | 11-2 (`.gitignore`); this DPIA |

---

## H-MC.7 Lawful Basis Confirmation

- [x] **NDPA s.6(1)(e) — public interest / official authority** *(primary — the registry is a government labour-market function)* — Channels A, B (ingest), C.
- [x] **NDPA s.6(1)(f) — legitimate interest** — Channel B **contact** (confirm-first notice), balanced by transparency + one-click opt-out + no marketing pre-confirmation.
- [x] **NDPA s.6(1)(a) — consent** — per-member association consent (A, backstop) + post-confirmation marketing (B).
- [x] **NDPA s.26(1)(b) — national identification** — for NIN-bearing rows.
- [ ] Cross-border (C only, if confirmed): NDPA s.41 ground `⟪…⟫`.

## H-MC.8 DPIA Conclusion (Iris)

**Verdict: APPROVED WITH CONDITIONS.** The three collection channels are proportionate to the registry's public-interest purpose, and the residual risks are mitigated by controls **already built in code** plus the two annexes. Conditions before go-live of the *contacting/collecting* steps (the ingest/build itself is not gated):
1. Ministry ratifies this addendum + files with NDPC. *(DPO/oversight already resolved — the SABER Focal Person, H-MC.0.)*
2. Annex A (paper retention) adopted by the Secretariat; Annex B (consent-evidence form) used for every association batch.
3. Channel B confirm-first copy finalised (transparency + opt-out) before any send.
4. Channel C cross-border ground confirmed at 13-3 build time.

---

## Annex A — Association Paper-Sheet Retention & Security Arrangement (DRAFT to transcribe)

> Adopt/edit to match what actually happens at the Secretariat. This is the model H-MC.6 M-8 references.

1. **Storage.** Completed condensed sheets are held in a **locked cabinet** at `⟪SECRETARIAT_ADDRESS⟫`, accessible only to named officers on the access list (§4).
2. **Minimisation.** Sheets carry only the 12 approved columns. No photocopies beyond those needed for digitisation; no personal devices retain images after upload.
3. **Digitisation window.** Each sheet is entered into the registry (via the import dry-run → confirm path) within **`⟪PAPER_RETENTION_DAYS⟫` days** (recommended: 14) of collection. The **digital record is authoritative**.
4. **Access log.** A simple register records who accessed the physical sheets, when, and why.
5. **Transient media.** Any WhatsApp/photo transmission used to relay a sheet is **deleted from devices and chats after successful import + reconciliation** (the sheet is the record, not the chat).
6. **Retention & destruction.** Paper is retained only until (a) digitised, (b) declared-vs-received reconciled, and (c) a `⟪verification window, recommended 90⟫`-day query window passes — then **securely destroyed by `⟪DESTRUCTION_METHOD⟫` (recommended: cross-cut shredding)**, recorded in a destruction log (date, batch, officer).
7. **Breach.** Any loss/theft of a sheet is reported to the DPO within **24 hours** (NDPA s.40).

## Annex B — Association Consent-Evidence Form

Separate transcribe-ready form: **`docs/legal/association-member-consent-evidence-form-v1.md`**. One per association batch; captures head attestation + Secretariat briefing date + per-member Consent Yes/No. Referenced by `import_batches.lawful_basis_note` at confirm time.

---

## Change Log
| Date | Change |
|---|---|
| 2026-07-20 | Drafted by Iris (DPIA/NDPA Counsel) from the multi-channel ingest thread (`docs/session-2026-07-20-import-spine-and-email-channel.md`). Covers Channels A (association proxy), B (imported register + confirm-first contact), C (edge capture). Amends Appendix H (H.2/H.3/H.4/H.5/H.6). Status: DRAFT — pending Ministry ratification + NDPC filing. |
