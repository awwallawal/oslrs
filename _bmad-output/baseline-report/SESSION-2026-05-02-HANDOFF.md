# Session Handoff — 2026-05-02 — IUBR / PFSR PDF Pagination

> **Audience:** Awwal in a fresh CLI session, OR a fresh Claude Code session resuming this work cold.
> **Read order:** TL;DR → Current State → Verification Checklist. Everything else is reference.
> **Quality principle (user-stated, repeat in any new session):** *"Quality is of essence not just rushing to meet a deadline."*

---

## TL;DR

The PDF heading-orphan bug is **fixed in build.js + print.css and rebuilt**. Both `CHM-OSLR-2026-001-PFSR.pdf` and `CHM-OSLR-2026-002-IUBR.pdf` regenerated cleanly at 2026-05-02 ~17:30 UTC.

**Open the rebuilt IUBR.pdf and verify three specific cases** (full list in §Verification Checklist below). If any still break, follow §Escalation Ladder — do not re-derive the analysis.

**Cover full-bleed already settled:** PFSR works fully. IUBR keeps both separate (Cover.pdf + Body.pdf) and merged variants — accept both as deliverables, the merge issue for IUBR was already triaged and de-prioritised.

---

## Current State (snapshot)

| Item | Status |
|---|---|
| Cover full-bleed (PFSR + IUBR) | ✅ Done — split-render + pdf-lib merge approach |
| 58 figures → polished SVG | ✅ Done (16 Excalidraw + 10 bar charts + 32 authored) |
| All 19 IUBR chapters intact | ✅ Done |
| PFSR diplomatic conventions applied to IUBR | ✅ Done |
| Heading-orphan bug (Abbreviations, Table 3.5, Table 4.2, etc.) | ⏳ **Fixed in code, awaiting user visual verification** |
| Code review of pipeline | ⬜ Not done — defer until pagination signed off |
| Final commit | ⬜ Not done — pipeline files still uncommitted |

---

## What Got Done This Session

### 1. Heading-orphan root-cause fix (the main work today)

**Symptom reported by user:**
> *"Abbreviations Page and the Abbreviations Table is breaking to different pages, Table 3.5 title and table breaks separately, table 4.2 similarly, and many more."*

**Root cause (3 compounding faults):**

1. **`assets/print.css:137` had `table` in the `break-inside: avoid` list.** Multi-page tables (Abbreviations, regulatory traceability, etc.) cannot honour that constraint. Chromium falls back to *"break at the first available boundary"*, which is precisely the boundary between caption/heading and `<table>`.
2. **`.keep-with-next` wrapper around `caption + entire-table`** had the same impossible-constraint problem. Wrapping made it worse, not better — chromium gave up and broke at the worst position (caption alone, table on next page).
3. **`h1 + *` was missing** from the universal next-sibling rule (`assets/print.css:115`). Abbreviations is an `<h1>`, so the universal rule never applied.

**Fix (3 surgical edits):**

- **`assets/print.css`** — added `h1 +` to the universal sibling selector; removed `table` from the no-break list (with explanatory comment); added `!important` to `.caption + table, .caption + pre` break-before rules.
- **`assets/build.js` `table_open` rule** — emits caption + table as **adjacent siblings**, no wrapping `<div class="keep-with-next">`. CSS adjacent-sibling rules with `!important` glue them.
- **`assets/build.js` heading-orphan post-render regex** — removed `table` from the alternation. H1+table relationships now rely on CSS instead of an unsatisfiable wrapper.

**Why this is the right architecture:**
- Adjacent-sibling CSS rules scale. They work whether the table is one row or 200 rows.
- `<thead>` repeats on each page automatically (chromium default for table-header-group), so multi-page tables look continuous.
- We stopped fighting chromium's pagination engine and started cooperating with it.

**Wrapper count went 574 → 364** in IUBR body — the drop is exactly the table-wrapping ones we removed. Heading + paragraph and caption + figure wrappers (which DO fit on a page and DO benefit from `break-inside: avoid`) are preserved.

### 2. Earlier in this session (per pre-compaction summary)

Documented in the prior conversation summary at:
`C:\Users\DELL\.claude\projects\C--Users-DELL-Desktop-oslrs\121465ce-ebcb-4f4d-87b7-ded06b6b17e2.jsonl`

Highlights to **not redo**:
- Cover-full-bleed via cover/body split + pdf-lib merge — final design, don't revisit
- All 58 ASCII figures converted to SVG — 66 SVGs in `diagrams/`
- All 19 chapters consolidated, captions, callouts, NDPA anchor, R-21 row, terminology fixes ("Compliance"→"Alignment", "Data Center"→"Data Centre", "first phase"→"Build Phase")
- Engagement chronology paragraph (Nov 2025 award + Feb 2026 LoI in passive voice)

---

## Verification Checklist

Open `output/CHM-OSLR-2026-002-IUBR.pdf` and confirm each:

- [ ] **Abbreviations and Acronyms** (was broken — H1 + table). Heading should sit on the same page as the start of the table. `<thead>` repeats on subsequent pages where the table overflows.
- [ ] **Table 3.5: Activity Schedule** (was broken — caption + table). Caption immediately above the table on the same page.
- [ ] **Table 4.2: Geographic Zones** (was broken — caption + table).
- [ ] **All other captioned tables** in chapters 5–19 — visual sanity scroll.
- [ ] **Subsection headings (H2/H3)** still glue to their first paragraph (regression check — the wrapper logic for non-table content was preserved).
- [ ] **Cover page still full-bleed** in IUBR-Cover.pdf and PFSR-Cover.pdf (regression check).
- [ ] **Page count delta** — IUBR body PDF should have a similar page count to the prior build (large changes here would indicate a layout regression). Prior build: ~ check via PDF metadata.

If all green → mark task #33 as done in the task list and commit the pipeline files.
If any red → §Escalation Ladder.

---

## Escalation Ladder (if heading-orphan still broken)

Use **in order**. Don't skip. Each step is more invasive than the last.

### Level 1 — Verify the CSS actually loaded
- Open `output/CHM-OSLR-2026-002-IUBR-Body.html` in a browser
- DevTools → inspect the `<table>` immediately after Abbreviations H1
- Confirm `break-inside` is **not** set on the table (no longer in the list)
- Confirm `h1 + table` resolves to `break-before: avoid` from the universal sibling rule

### Level 2 — Check chromium honoured the rules
- Print-preview the body HTML in Edge/Chrome (Ctrl+P)
- Watch the page break — does it match the rendered PDF?
- If preview is fine but PDF is broken: chromium `--print-to-pdf` headless quirk. Try adding `--run-all-compositor-stages-before-draw` and `--virtual-time-budget=20000` to `renderPdf()` flags in `build.js`.

### Level 3 — Force `<thead>` repeat with explicit CSS
Add to print.css:
```css
@media print {
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr    { page-break-inside: avoid; }
}
```
This guarantees thead repeats and individual rows don't split.

### Level 4 — HTML restructure: caption-as-HTML-caption
Change `table_open` rule to emit caption as a real `<caption>` element **inside** the table:
```html
<table>
  <caption class="caption caption--table">Table 3.5: …</caption>
  <thead>…</thead>
  <tbody>…</tbody>
</table>
```
HTML `<caption>` is part of the table per CSS spec. When the table breaks, the caption stays with the first chunk. Drawback: caption styling needs `caption-side: top` and may need different layout CSS.

### Level 5 — Manual page-break hints
Last resort. Add `<!-- pagebreak -->` comments at problem locations in `improved-updated-baseline-report.md` and have the renderer emit `<div style="page-break-before: always"></div>`.

### Level 6 — Headless puppeteer instead of chromium CLI
Replace `--print-to-pdf` with puppeteer's `page.pdf()`. More reliable, more configurable. Adds dependency. Only if Levels 1–5 all fail.

---

## File Map

```
_bmad-output/baseline-report/
├── assets/
│   ├── build.js          ← THE pipeline. table_open rule + heading-orphan regex live here
│   ├── print.css         ← @page rules, break-inside avoid list, .caption + table rule
│   ├── v2-styles.css     ← screen + base typography (rarely touched)
│   └── template.html     ← cover scaffold + content slot
├── sources/
│   ├── pre-field-status-report.md         ← PFSR source (CHM/OSLR/2026/001)
│   └── improved-updated-baseline-report.md ← IUBR source (CHM/OSLR/2026/002)
├── diagrams/             ← 66 SVG figures (Excalidraw conversions + authored)
├── output/
│   ├── CHM-OSLR-2026-001-PFSR.pdf         ← Merged final
│   ├── CHM-OSLR-2026-001-PFSR-Cover.pdf   ← Cover-only fallback
│   ├── CHM-OSLR-2026-001-PFSR-Body.pdf    ← Body-only fallback
│   ├── CHM-OSLR-2026-002-IUBR.pdf         ← Merged final
│   ├── CHM-OSLR-2026-002-IUBR-Cover.pdf   ← Cover-only fallback
│   └── CHM-OSLR-2026-002-IUBR-Body.pdf    ← Body-only fallback (★ inspect HTML version for debugging)
├── CONTEXT-AND-NUANCES.md                 ← Diplomatic principles (PFSR + IUBR)
└── SESSION-2026-05-02-HANDOFF.md          ← THIS FILE
```

**Rebuild commands:**
```bash
cd _bmad-output/baseline-report
node assets/build.js sources/improved-updated-baseline-report.md output/CHM-OSLR-2026-002-IUBR.pdf
node assets/build.js sources/pre-field-status-report.md output/CHM-OSLR-2026-001-PFSR.pdf
```

---

## Lessons / Don't-Repeat List for Next Session

1. **Don't add `break-inside: avoid` to elements that may legitimately exceed one page.** It's worse than no rule at all — chromium gives up and breaks at the *worst* boundary. Reserve it for figures, callouts, code blocks, and other inherently-bounded content.
2. **Adjacent-sibling CSS selectors with `!important` beat wrapper divs** for "keep these two together" relationships when content size is unbounded.
3. **The `/schedule` skill instructions can resurface stale** in a system-reminder if the session was previously a /schedule one. Ignore them when the actual user task is unrelated. (This happened today — I almost spent a turn writing a Cloudflare WAF agent prompt before the user redirected me back.)
4. **`<thead>` repeats automatically** on each page when a table breaks — don't try to "fix" thead replication, it's already working.
5. **Cover full-bleed for long documents needs cover/body split.** chromium `@page :first { margin: 0 }` is unreliable for long docs. Keep the split architecture; don't try to merge back into a single render.
6. **Memory limit reached** — `MEMORY.md` is at 24.8KB (limit 24.4KB). One-line index entries are now too long. **Action item for a future session:** prune `MEMORY.md` to one-line summaries, move detail into topic files. Not urgent for PDF work but blocks any new memory entry.

---

## Open Questions / Decisions Deferred

- **Should the pipeline be committed?** It's currently uncommitted. Recommend: commit only after user signs off on the heading-orphan fix in §Verification Checklist. Suggested commit message: `feat(reports): IUBR + PFSR pagination overhaul — adjacent-sibling break rules, multi-page table support`.
- **Distribution-ready packaging?** Currently 6 PDFs per document family. For Ministry delivery: probably ship the merged PDF only, archive the cover/body separates. User decision.
- **Code review of `build.js` + `print.css`?** Pipeline has grown organically across this session and the prior. Worth a `feedback_review_before_commit.md`-style review pass before committing — but only after pagination is signed off, otherwise we'd review code that's still in flux.

---

## How to Resume in the New Session

1. Open this file (`SESSION-2026-05-02-HANDOFF.md`) — it's the brief.
2. Open `output/CHM-OSLR-2026-002-IUBR.pdf` and run §Verification Checklist.
3. If all green: tell Claude *"pagination signed off, do the commit + close out task #33."*
4. If any case still broken: tell Claude *"X is still breaking, escalate to Level N from the handoff."* — Claude should NOT redo Levels < N.
5. Pipeline files to mention if Claude needs them fast:
   - `assets/build.js:107-145` — table_open + caption rules
   - `assets/build.js:222-244` — heading-orphan post-render regex
   - `assets/print.css:105-127` — heading + keep-with-next rules
   - `assets/print.css:137-150` — break-inside avoid list (note: table EXCLUDED)
   - `assets/print.css:248-256` — `.caption + table` rule with `!important`
