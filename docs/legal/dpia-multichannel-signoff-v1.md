# DPIA Multi-Channel Collection — Sign-Off & Ratification Tracker

**Instrument:** ratifies `docs/legal/dpia-appendix-h-multichannel-collection-v1.md` (Appendix H addendum H-MC) + `docs/legal/association-member-consent-evidence-form-v1.md`
**Author:** Iris (DPIA / NDPA Counsel) · **Opened:** 2026-07-20 · **Status:** OPEN — awaiting Ministry ratification
**Reference:** CHM/OSLR/2026/001 — Appendix H addendum

> This is the one place that answers "**is the DPIA done?**" Everything technical is drafted; what remains is (1) transcribe the real-world facts, (2) a human Controller ratifies, (3) file with NDPC. Until all three, the DPIA is DRAFT and the *contacting/collecting* go-lives (13-2 cascade send, 13-39 email send) stay gated (the ingest/build itself is **not** gated).

## Step 1 — Transcribe the real-world facts (Awwal)
Replace every `⟪…⟫` placeholder in the addendum + form:

| Placeholder | Where | Owner | Done |
|---|---|---|---|
| `⟪MINISTRY_LEGAL_NAME⟫` | H-MC.0, form §4 | Awwal | ☐ |
| DPO / oversight — **✅ RESOLVED: SABER Focal Person** (only the name/contact `⟪SABER_FOCAL_PERSON_NAME_CONTACT⟫` to fill) | H-MC.0 | Awwal | ☑ role resolved |
| `⟪CHEMIROY_CONTACT⟫` (processor slot) | H-MC.0 | Awwal | ☐ |
| `⟪SECRETARIAT_ADDRESS⟫` | Annex A | Awwal | ☐ |
| `⟪PAPER_RETENTION_DAYS⟫` (rec. 14) + `⟪DESTRUCTION_METHOD⟫` (rec. shred) + verification window (rec. 90) | Annex A | Awwal | ☐ |
| `⟪MINISTRY/SUPPORT_CONTACT⟫` (DSAR channel) | form §4 | Awwal | ☐ |
| Channel-C cross-border ground | H-MC.5 C-R2 | at 13-3 build | ☐ (defer) |

## Step 2 — Controller ratification (Ministry — the one genuinely human, non-delegable act)
| Signatory | Role | Name | Signature on file | Date |
|---|---|---|---|---|
| | Ministry Controller / authorised officer | | | |
| | Designated DPO / oversight — **SABER Focal Person** | ⟪name⟫ | | |
| | Iris (Counsel — draft author) | Iris | ✅ drafted 2026-07-20 | 2026-07-20 |

## Step 3 — File with NDPC + record
- ☐ Ministry files the DPIA with the **NDPC** (Nigeria Data Protection Commission) per NDPA s.28.
- ☐ Merge the H-MC sections into the live Appendix H (per the addendum's MERGE INSTRUCTION — do **not** touch the §H.9/§H.10 consumer reservation).
- ☐ Record ratification date here + as `action='dpia.ratified'` in `audit_logs` (mirrors the DSA `dpia.reaffirmed` pattern).

## What ratification UNBLOCKS
- **13-2** association cascade **go-live** (the importer build is not gated; the *sending members to collection + counting them* is).
- **13-39** ITF confirm-first **email send** (the ingest 11-5 is not gated).
- Records the concrete `§H-MC` reference into each story's `lawful_basis_note`.

## Annual maintenance
Per H.8.3 cadence: the DPO reviews H-MC annually (paired with the registry's review), updating the risk register + measures if channels change.

## Change Log
| Date | Change |
|---|---|
| 2026-07-20 | Opened by Iris. Three-step close-out: transcribe facts → Ministry ratify → NDPC file. Gates the *send/collect* go-lives (13-2/13-39), not the build. |
