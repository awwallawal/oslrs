# Form spreadsheets (XLSForm sources)

Both live form instruments sit HERE, side by side:

| File | Instrument | Canonical home | Git |
|---|---|---|---|
| `oslsr_master_v3_email.xlsx` | **Full "Baseline" master** (email variant — the one the operator publishes for enumerators/clerks) | here | **gitignored** (local operator artifact) |
| `oslsr_master_v3.xlsx` | Full master, pre-email variant | here | tracked |
| `oslsr-public-core-v1.xlsx` | **Public Core** (~16-question short form, Story 13-14; pinned as `wizard.public_form_id`) | `docs/launch-campaign/oslsr-public-core-v1.xlsx` — **edit THAT one**; this is a synced copy for discoverability | tracked (copy) |
| `oslsr_master_v3_backup.xlsx`, `oslsr_master_v3.pre-email.bak.xlsx` | Historical snapshots — do not edit | here | mixed |

## Rules

- **`lga_list` choice values MUST equal the canonical LGA slug** (`Lga` enum in
  `packages/types/src/constants.ts` = `lgas.code` seeded by
  `apps/api/src/db/seeds/lgas.seed.ts`). `respondents.lga_id` canonically holds
  this slug (Story 13-16) and every LGA analytics join assumes it. The XLSForm
  upload validator flags any divergent value. The retired fossils
  (`ibadan_ne/nw/se/sw`, `ogbomoso_north/south`) were purged from all sources
  2026-07-04 (13-16).
- Re-uploading a form mints a NEW form row — **re-pinning
  `wizard.public_form_id` (Public Core) / re-selecting the Baseline is
  mandatory** after any upload.
- If you edit the Public Core, update `docs/launch-campaign/oslsr-public-core-v1.xlsx`
  first, then refresh the copy here.
