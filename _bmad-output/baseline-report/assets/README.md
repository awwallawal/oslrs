# Chemiroy Document Design System v2.0

**Reusable design system + build pipeline for Chemiroy → MTIC documents.**

Authored 2026-04-27 per recommendations in the prior session transcript (lines 3453-3483):

> *"A proper design pass, not a template tweak. The styling lives in a shared .css file that could also apply to future Ministry-facing documents."*

This is the standalone delivery `delivery-1-baseline-v2-design-system`. It is intentionally generic enough to be reused beyond the OSLRS Baseline Report — any Chemiroy-authored document for the Ministry of Trade, Industry and Cooperatives (or other government clients) can render through this pipeline by supplying its own Markdown source with appropriate front-matter.

---

## Files

| File | Purpose |
|---|---|
| `v2-styles.css` | Main stylesheet — typography (Inter + Plus Jakarta Sans), colour tokens, layout, components (callouts, stat cards, tables), page furniture, cover variants |
| `print.css` | Print-specific overrides (`@page` rules, page-break behaviour, link-URL footnoting) |
| `template.html` | HTML scaffold with `{{ PLACEHOLDER }}` slots filled by `build.js` |
| `cover-photo.html` | Stand-alone cover preview (open in browser to see what the cover looks like before rendering full document) |
| `build.js` | Node build script: Markdown + YAML front-matter → HTML → headless-Chromium PDF |
| `images/` | Cover photographs (CC BY-SA 4.0, attribution in front-matter) |
| `README.md` | This file |

---

## Quick start

### Prerequisites

- **Node.js** ≥ 20 (already required by the OSLRS monorepo)
- **Microsoft Edge** OR **Google Chrome** OR **Chromium** installed (Edge is default on Windows 11; the build script auto-detects)
- **`markdown-it`** + **`js-yaml`** packages (declared in monorepo `package.json` devDependencies after this design system was added)

### Install dependencies

From repo root:

```bash
pnpm install
```

### Render a document

```bash
node _bmad-output/baseline-report/assets/build.js \
  _bmad-output/baseline-report/sources/pre-field-status-report.md \
  _bmad-output/baseline-report/output/CHM-OSLR-2026-002-PFSR.pdf
```

Output:
- `…/output/CHM-OSLR-2026-002-PFSR.pdf` — final PDF for submission
- `…/output/CHM-OSLR-2026-002-PFSR.html` — intermediate HTML (kept for debugging)

---

## Markdown source structure

Each document source must begin with a YAML front-matter block. Required keys:

```markdown
---
docRef: CHM/OSLR/2026/002
classification: Confidential — For Official Use Only
title: Pre-Field Survey Status Report
subtitle: Skilled Labour Registry deployment readiness for the Ministry of Trade, Industry and Cooperatives
superhead: Oyo State Labour & Skills Registry
authors: Lawal Awwal · Mrs Fateemah Roy-Lagbaja
firm: Chemiroy Nigeria Limited
date: May 2026
version: 1.0
coverCredit: 'Cover image: "A Tailor Sewing Clothes in Her Shop" · Meritkosy / Wikimedia Commons · CC BY-SA 4.0'
---

# 1. Document Control

(body content begins here, regular Markdown)
```

The build script will:
1. Parse YAML front-matter into the cover (doc ref, title, subtitle, etc.)
2. Render the Markdown body into HTML
3. Combine into the full template with cover + body
4. Save HTML to `<output>.html`
5. Invoke headless Chromium/Edge to render PDF to `<output>.pdf`

---

## Design system reference

### Typography

- **Body**: Inter 10.5pt, line-height 1.55, left-aligned (NOT justified — avoids "awkward rivers" in short English words)
- **Display headings**: Plus Jakarta Sans 800 (cover/h1) → 700 (h2) → 600 (h3, h4)
- **Heading colour**: near-black `#1a1a1a` (NOT maroon — visual hierarchy comes from weight + size, not colour)
- **Mono**: ui-monospace for code/data; tabular-nums (`font-variant-numeric: tabular-nums`) for numeric tables

### Colour palette

| Token | Hex | Use |
|---|---|---|
| `--colour-maroon` | `#9C1E23` | Brand accent only — page rules, callout left-bars, stat-card top-borders |
| `--colour-maroon-dark` | `#7A171B` | Cover-variant-split solid bottom; deep gradient anchor |
| `--colour-ink` | `#1a1a1a` | Primary text + headings |
| `--colour-charcoal` | `#4a4a4a` | Secondary text, table headers |
| `--colour-graphite` | `#6b6b6b` | Tertiary text |
| `--colour-mute` | `#9a9a9a` | Page footer text |
| `--colour-rule` | `#e5e3df` | Borders, dividers |
| `--colour-paper` | `#ffffff` | Page background |
| `--colour-warm` | `#fafaf7` | Off-white doc background, table-header tint |
| `--colour-callout` | `#f4f2ed` | Callout-box background |
| `--colour-teal` | `#2f6b6f` | "Recommendation" callout bar; data-viz "completed" status |
| `--colour-amber` | `#b58105` | "Assumption" callout bar; warning indicators |

### Layout

- A4 page (210 × 297mm)
- Content column: 170mm wide
- Margins: 20mm horizontal + vertical
- Cover: full-bleed, no margins (`@page :first { margin: 0; }`)

### Components

#### Callout boxes

```html
<div class="callout callout--key">
  <p class="callout-label">Key finding</p>
  <p class="callout-body">…</p>
</div>
```

Modifier classes: `callout--key` (maroon, default), `callout--assumption` (amber), `callout--recommend` (teal).

#### Dashboard stat cards

```html
<div class="stat-grid stat-grid-4">
  <div class="stat-card">
    <p class="stat-card__value">132</p>
    <p class="stat-card__label">Field staff</p>
    <p class="stat-card__sublabel">33 supervisors + 99 enumerators</p>
  </div>
  <!-- 3 more stat-cards -->
</div>
```

Per design recs: dashboard-style executive summary on **page 2** (not page 1) — page 1 is the photographic cover.

#### Tables

Standard Markdown tables render with:
- No outer border
- Subtle warm-off-white header tint
- Inner row borders only
- Add `class="num"` to numeric cells/headers for right-align + tabular-nums

### Cover variants

Three cover styles defined in CSS — switch via class on `.cover` element:

- **`.variant-photo`** *(canonical default)*: full-bleed photo, light overlay with darker top + bottom for text legibility
- **`.variant-blur`**: photo gaussian-blurred + dark overlay (atmospheric)
- **`.variant-split`**: photo top-half, solid maroon-dark bottom-half (clean editorial split)

The current `template.html` uses `variant-photo`. For other Ministry docs, edit the template.

---

## Reusing the design system for other Chemiroy → MTIC documents

To produce a new document (e.g., DPIA, Operations Manual, Quarterly Update):

1. **Author the source Markdown** at `_bmad-output/<doc-name>/sources/<slug>.md` with the required YAML front-matter
2. **Reuse `template.html`** — copy + adjust placeholders if the new doc needs different cover layout
3. **Run `build.js`** with input/output paths
4. **Override styles** for doc-specific tweaks by adding a new CSS file that extends `v2-styles.css`

The CSS is intentionally token-based (`var(--colour-maroon)` etc.) so re-skinning for a different client (different brand colour) is a 5-minute task.

---

## Document control conventions

Every Chemiroy → MTIC document carries:

| Element | Standard |
|---|---|
| Document reference | `CHM/OSLR/2026/00X` (incrementing) — version-suffix for revisions (e.g., `001 v2.0`) |
| Classification | `Confidential — For Official Use Only` (cover + every page header) |
| Distribution list | 6 copies typical: Commissioner (hard + digital), Permanent Secretary (hard + digital), Director Trade & Investment (digital), Lawal Awwal (hard + digital), Mrs Fateemah Roy-Lagbaja (hard + digital), File Copy (hard) |
| "Valid as of submission date" clause | In Document Control section — every factual claim true on that date |
| Co-signers | Lawal Awwal (Principal Consultant) + Mrs Fateemah Roy-Lagbaja (Managing Director) |

---

## Known limitations + future work

- **Cover photo resolution**: the canonical Pre-Field Status Report cover photo is 1080×810. Variant-photo uses CSS `background-size: cover` which stretches; print quality is acceptable at typical viewing distances but visible softening on close zoom. Higher-resolution replacement images can be dropped into `images/` without code changes.
- **Pandoc not used**: build pipeline uses `markdown-it` (Node-native) instead of pandoc to avoid a system dependency. Loses some pandoc niceties (citations, footnotes-style cross-refs) but gains portability.
- **No automated TOC**: build.js does not auto-generate a Table of Contents. If needed, write the ToC manually in the Markdown source or extend the build script with a heading-extraction pass.
- **No watermarking**: classification stamp ("CONFIDENTIAL") appears on cover + page header; no diagonal watermark across body pages. Could be added via CSS pseudo-element if required.

---

## License

The design system stylesheet (`v2-styles.css`, `print.css`, `template.html`, `build.js`) is part of the OSLRS project deliverables, owned by Chemiroy Nigeria Limited.

Cover photo (`images/cover-tailor-meritkosy.jpg`) is **CC BY-SA 4.0** — attribution required (see cover-credit footer; matches the YAML `coverCredit` field). Photographer: Meritkosy. Source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_Tailor_Sewing_Clothes_in_Her_Shop.jpg).

The CC BY-SA share-alike applies to derivative works of the photograph itself, not to the document as a whole. Standard interpretation; consistent with how government and academic publications use CC BY-SA Wikimedia photographs.
