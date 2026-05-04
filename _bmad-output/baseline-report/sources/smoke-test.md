---
docRef: CHM/OSLR/2026/SMOKE
classification: Confidential — For Official Use Only
title: Smoke Test
subtitle: Verifying the Chemiroy Document Design System v2.0 build pipeline renders Markdown, applies the design system, and outputs a PDF correctly.
superhead: Oyo State Labour & Skills Registry
authors: Lawal Awwal · Mrs Fateemah Roy-Lagbaja
firm: Chemiroy Nigeria Limited
date: April 2026
version: 0.1
coverCredit: 'Cover image: "A Tailor Sewing Clothes in Her Shop" · Meritkosy / Wikimedia Commons · CC BY-SA 4.0'
---

# 1. Smoke Test

This document exists to verify that the build pipeline correctly:

1. Parses YAML front-matter into the cover
2. Renders Markdown body content into HTML
3. Applies the design system stylesheet
4. Generates a PDF via headless Chromium / Edge

## 1.1 Typography

The body text uses **Inter** at 10.5pt with line-height 1.55, left-aligned. Headings use **Plus Jakarta Sans** with weight-driven hierarchy (H1: 800, H2: 700, H3: 600). All headings render in near-black `#1a1a1a`, not maroon. Maroon is reserved for *accent only* — page rules, callout left-bars, stat-card top borders.

## 1.2 Sample callouts

<div class="callout callout--key">
  <p class="callout-label">Key finding</p>
  <p class="callout-body">Field-Survey Readiness Certificate is on track. 2 of 6 items complete; 4 in active development with completion targeted before the field-survey window.</p>
</div>

<div class="callout callout--assumption">
  <p class="callout-label">Assumption</p>
  <p class="callout-body">Per Assumption Class B, the projected enumerator deployment of 99 across 33 LGAs assumes a 1:3 supervisor-to-enumerator ratio holds throughout the field phase.</p>
</div>

<div class="callout callout--recommend">
  <p class="callout-label">Recommendation</p>
  <p class="callout-body">Lock the Transfer Protocol counter-signature appointment with the Honourable Commissioner before the IUBR submission window.</p>
</div>

## 1.3 Sample table

| Field Readiness Item | Status | Owner | ETA |
|---|---|---|---|
| Tailscale + SSH hardening | Done | Builder | 2026-04-23 |
| Schema foundation | In progress | Dev | 2026-05-02 |
| Public wizard + pending-NIN | Ready for dev | Dev | 2026-05-04 |
| Input sanitisation layer | Ready for dev | Dev | 2026-05-04 |
| Backup AES-256 encryption | Ready for dev | Builder | 2026-05-06 |
| Operations Manual (enumerator section) | In progress | Builder + Tech Writer | 2026-05-07 |

## 1.4 Sample dashboard

<div class="stat-grid stat-grid-4">
  <div class="stat-card">
    <p class="stat-card__value">2/6</p>
    <p class="stat-card__label">FRC items complete</p>
    <p class="stat-card__sublabel">4 in active development</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">132</p>
    <p class="stat-card__label">Field staff</p>
    <p class="stat-card__sublabel">33 supervisors + 99 enumerators</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">33</p>
    <p class="stat-card__label">LGAs covered</p>
    <p class="stat-card__sublabel">100% of Oyo State</p>
  </div>
  <div class="stat-card">
    <p class="stat-card__value">B+</p>
    <p class="stat-card__label">Security posture</p>
    <p class="stat-card__sublabel">Assessed 2026-04-12</p>
  </div>
</div>

# 2. End of smoke test

If you can see a properly-styled cover, this section, the callouts, the table, and the dashboard cards in the rendered PDF — the design system pipeline is working end to end.
