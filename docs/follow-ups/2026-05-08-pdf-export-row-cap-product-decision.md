# Follow-up — 2026-05-08 — PDF export row-cap product decision

**Run on or after:** as soon as PM bandwidth permits (no calendar gate)
**Owner:** John (PM) — outcomes route to Iris/Sally for UX, then back to SM (Bob) for story creation
**Originating context:** Story 9-10 close-out 2nd-pass code-review (2026-05-08) surfaced the real cost of `ExportService.generatePdfReport` at scale. The data was previously invisible because the BENCHMARK-gated tests were permanently dark; this brief is the surfaced nuance.

---

## Concrete data

Benchmarks against synthesised in-memory rows (no DB, no network), measured on developer laptop 2026-05-08:

| Format | Rows  | Time     | Output size | Heap delta |
|--------|------:|---------:|------------:|-----------:|
| PDF    |   100 |   490 ms |     969 KB  | (small)    |
| PDF    | 1,000 | 2,359 ms |   9,682 KB  | (small)    |
| PDF    | 10,000 | **14,607 ms** | **93.0 MB** | -3.3 MB    |
| CSV    |   100 |    13 ms |       6 KB  | small      |
| CSV    | 1,000 |    12 ms |      62 KB  | small      |
| CSV    | 10,000 |   120 ms |     634 KB  | small      |
| CSV    | 100,000 |  342 ms |     6.3 MB  | +66.4 MB   |

CI-tightened thresholds (post-2026-05-08): PDF 10K must complete <30s; CSV 100K <2s. Both pass with comfortable margin.

---

## What this means in product terms

1. **PDF is the wrong format past ~1,000 rows.** The 93 MB / 14.6 s observation is the symptom. Generating, transmitting, storing, and opening a 93 MB PDF is bad on every dimension: server CPU during generation, bandwidth on the wire, S3 storage cost, mail attachment limits (Gmail/most webmail caps are 25 MB), and the user's machine when they double-click it. CSV at the same row count is 6.3 MB / 342 ms — 15× smaller, 43× faster, and tabular tooling (Excel, Pandas, Looker Studio) handles it natively.

2. **CSV scales gracefully through 100K.** The 342 ms / 6.3 MB number is the production baseline. We can confidently offer CSV as the "large-export" format with no caveats up to 100K rows. 100K corresponds roughly to "every respondent in the OSLSR field survey, full submissions table" — i.e. the entire dataset.

3. **The current ExportService has no row cap.** Given user-facing endpoints today: a hostile or confused user could request a 50K-row PDF and pin a request for ~75 seconds + return a ~470 MB response. (Linear extrapolation from the 10K observation; we haven't actually measured 50K because the benchmark suite stops at 10K.) Even ignoring hostility, the next staff member who tries to "export everything" gets that experience.

---

## Questions for John to answer with Iris/Sally

Each question has decision options the team should pick between. The right answer probably differs by export type (per-LGA-summary vs full-submission-export vs supervisor-analytics-rollup).

### Q1 — Should PDF export be capped by row count?

- **Option A** — No cap. Users own the consequences. (Status quo.)
- **Option B** — Hard cap (e.g. 1,000 rows). Requests for more rows get HTTP 413 with a message: "PDF supports up to 1,000 rows; for larger exports, choose CSV."
- **Option C** — Soft cap with confirmation modal in the UI. "You're requesting 5,000 rows. PDF at this size will be ~50 MB and take ~12 seconds. Continue, or switch to CSV?"
- **Option D** — Auto-redirect: PDF requests over the threshold are silently fulfilled as CSV with a banner explaining the swap.

Recommendation lens: **B is safest, C is best UX, D is risky** (silent format change confuses tabular-tool users). A is the current behaviour and should require active justification to keep.

### Q2 — If we cap, what's the threshold?

Reasoning anchors:
- PDF 1K = 9.7 MB / 2.4 s. Email-attachable, fast. Comfortable.
- PDF 2K (extrapolated) ≈ 18.6 MB / 4.7 s. Still email-attachable, marginal time.
- PDF 5K (extrapolated) ≈ 47 MB / 11.7 s. Past Gmail attachment cap; print-quality only.

Recommendation lens: **1,000 is the email-friendly cap; 2,000 is the "willing to drag through download" cap.** Either is defensible.

### Q3 — Are there exports where the row count is bounded by domain logic (not by user choice)?

E.g.: "Export this LGA's enumerator productivity for July" — the row count is bounded by enumerators × days, which is small (<200). For these, the cap is moot and we shouldn't surface the warning.

This requires a per-export-endpoint inventory. SM can produce when it goes to story.

### Q4 — Backend CSV streaming?

Currently `ExportService.generateCsvExport` builds the whole buffer in memory (the +66.4 MB heap observation at 100K rows confirms). For bigger datasets (1M+), we'd need streaming response. Not urgent — 100K is the upper end of OSLSR's lifetime data, and 6.3 MB / 66 MB heap is fine. **Flag as "watch if dataset projection grows past 1M rows."**

### Q5 — Should the BENCHMARK lane (`.github/workflows/benchmarks.yml`) cover more endpoints?

Created 2026-05-08 with just ExportService PDF/CSV. Other long-tail endpoints (admin audit log filters, supervisor analytics rollups, payroll batch generation, ID-card PDF batch render) might also benefit from regression watchdogs. Evaluate after 2-3 weeks of the new lane reporting.

---

## What John should produce

A **decision memo** with:
1. A recommendation per Q1–Q5 (with reasoning visible — these are product calls, not technical defaults).
2. Iris signoff on Q1 + Q2 (these affect user-visible UX). If Iris is unavailable in the Operate-phase window, John recommends, Awwal ratifies.
3. Routing of any "yes, change behaviour" answers to Bob (SM) for story creation. Likely target story: **prep-export-row-cap-and-redirect** or rolled into the next polish epic.

## Acceptance for THIS follow-up being "closed"

- [ ] Decision memo authored by John in `docs/decisions/` or appended to the relevant ADR
- [ ] Iris/Awwal signoff captured
- [ ] If a code change results: a new story exists in `_bmad-output/planning-artifacts/epics.md` with tasks + ACs
- [ ] If no code change results (Option A on Q1): the decision is recorded explicitly so future-John doesn't re-litigate

---

## Why this brief exists separately from Story 9-10

Story 9-10 is a PM2 stability investigation. The PDF-export row-cap question surfaced incidentally during 9-10's 2nd-pass code review when the BENCHMARK gate was lifted. Folding the product decision into 9-10 would (a) inflate the story scope past what was reviewed, and (b) bury a product-level UX call inside an infrastructure-level story. Routing it to John as a standalone follow-up keeps the 9-10 commit focused and gets the right pair of eyes on the right question.

Captured in Story 9-10 Change Log entry 2026-05-08 with a pointer back here.
