# Association Member Consent-Evidence Form (v1)

**Document reference:** CHM/OSLR/2026/001 — Appendix H addendum, Annex B
**Purpose:** the consent-evidence record for one association/cooperative batch imported into the OSLRS registry via the umbrella-body cascade (Story 13-2). Satisfies the DPIA condition H-MC.5 A-R1 (proxy-consent validity) and is cross-referenced by `import_batches.lawful_basis_note` at confirm time.
**Author:** Iris (DPIA / NDPA Counsel) · **Drafted:** 2026-07-20 · **Status:** template — Awwal to transcribe existing records into this format
**Lawful basis:** NDPA s.6(1)(e) public interest (primary) + s.6(1)(a) consent (per-member backstop)

> **How to use:** complete ONE form per association batch. Keep it with (or alongside) the completed 12-column condensed sheet. When the batch is imported, record this form's reference (below) in the import's lawful-basis note. Retain + destroy per Annex A (paper retention arrangement).

---

## 1. Batch identification

| Field | Value |
|---|---|
| Umbrella body | |
| Association / cooperative name | |
| Association head — full name | |
| Association head — phone | |
| Primary LGA | |
| **Secretariat briefing date** (in-person) | |
| Declared member count | |
| Sheet(s) collected on | |
| Form reference (for `lawful_basis_note`) | `ASSOC-YYYYMMDD-⟪assoc-slug⟫` |

## 2. Head attestation (the accountable declaration)

*The association head reads and signs. This is the inclusion path for non-literate members — the head briefs them in person and reads the declaration aloud.*

> I, the undersigned association head, confirm that:
> 1. I attended the **in-person briefing** at the Secretariat on the date above, where the **purpose** of the Oyo State labour/skills registry and the use of the data were explained to me.
> 2. I **explained that purpose to each member** listed on the accompanying condensed sheet, and **read the data-collection declaration aloud** to them (including members who cannot read).
> 3. Each member listed **consented** to their details (including phone, and NIN where given) being submitted to the registry, and understood they may **object or withdraw** at any time via the contact channel in §4.
> 4. The details I collected are, to the best of my knowledge, **accurate**, and I collected them **with each member's knowledge**.
> 5. Members who **declined** are **not** on the sheet (or are marked "No" in the Consent column and must not be entered).

| | Name | Signature | Date |
|---|---|---|---|
| **Association head** | | | |
| **Witness — Secretariat officer** | | | |

## 3. Per-member consent (on the condensed sheet)

Per-member consent is captured in the **Consent (Yes/No)** column of the 12-column condensed sheet (`docs/launch-campaign/association-condensed-sheet-spec.md`). Rows marked **No or blank are NOT entered** into the registry (enforced by the importer, Story 13-2 AC4.3). This form's head attestation (§2) is the institutional backstop for the per-row column.

## 4. Data-subject rights notice (must be read aloud in §2.3)

> Your information is held by ⟪MINISTRY_LEGAL_NAME⟫ for the Oyo State labour/skills registry. You may ask to **see, correct, or delete** your information, or **object** to its use, at any time by contacting: **⟪MINISTRY/SUPPORT_CONTACT⟫** (phone / email / SMS). You will also receive a confirmation message you can use to confirm or correct your record, or to opt out.

## 5. Handling

- This form is retained + destroyed per **Annex A** (paper retention & security arrangement).
- On import, its reference (§1) is recorded in `import_batches.lawful_basis_note` alongside `ndpa_6_1_e` and the briefing date.
- A member who later objects is added to suppression and excluded from further processing (or erased on request).

---

## Change Log
| Date | Change |
|---|---|
| 2026-07-20 | Template drafted by Iris (DPIA/NDPA Counsel). One-per-batch head-attestation + witness + per-member (sheet column) + DSAR notice. Companion to `dpia-appendix-h-multichannel-collection-v1.md` Annex B and `docs/launch-campaign/association-condensed-sheet-spec.md`. |
