# Story 9.23: Questionnaire publish-path convergence — unify `PATCH /:id/status` and `POST /:id/publish`

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Promoted from `prep-questionnaire-publish-path-converge` candidate
prep-task to a numbered Story per Awwal's 2026-05-19 directive.

Real-data justification: on 2026-05-14 the operator re-uploaded the
public-wizard questionnaire via Q.M. via `PATCH /:id/status` (not
`POST /:id/publish`). Both paths produced a `status='published'` form
that the wizard's `getPublicActiveForm` correctly served. BUT the
new form record has `native_published_at = NULL`, while the canonical
publish path stamps that field as a side effect. Cosmetic
inconsistency today — but the field is what the dev-pin-public-form
script's `--list` command surfaces as `(no native_published_at)`,
making the operator-visible state confusing.

Full incident: Story 9-12 § "Post-Launch UAT Session Log" § Op-3 + § L3.
-->

## Story

As the **dev agent or operator inspecting questionnaire forms via the Q.M. page, the dashboard CLI, or SQL queries**,
I want **every published form to have a consistent `native_published_at` timestamp regardless of whether it was published via `PATCH /:id/status` (status flip) or `POST /:id/publish` (canonical publish path)**,
So that **the metadata field is reliable enough to drive UI sort order, the dashboard's "newest pinned form" display, the Q.M. list page, and future analytics queries — and so the operator's `--list` output doesn't show `(no native_published_at)` ambiguous-state warnings on healthy forms**.

## Acceptance Criteria

1. **AC#1 — Converge on one publish path**: pick ONE of two strategies, document the choice in Dev Notes:
   - **Strategy A (recommended)** — DEPRECATE `PATCH /:id/status` for the `'published'` status transition. Callers must use `POST /:id/publish`. PATCH continues to handle other status transitions (`draft → closing`, `closing → deprecated`, etc.). Add a controller guard that returns 400 INVALID_TRANSITION if `newStatus === 'published'` arrives via PATCH.
   - **Strategy B (compatibility)** — KEEP `PATCH /:id/status` accepting `'published'` BUT update `QuestionnaireService.updateFormStatus` to ALSO stamp `nativePublishedAt: now` when the target status is `'published'`. Both paths produce identical row state.

2. **AC#2 — If Strategy A: Q.M. page UI updates**: any Q.M. page button that previously hit `PATCH /:id/status` to publish a form now hits `POST /:id/publish` instead. Confirm by grepping the frontend for the PATCH call and the surrounding button handler.

3. **AC#3 — If Strategy B: convergence test**: an automated test creates a form via the `POST /` upload path → `PATCH /:id/status` with `{status: 'published'}` → asserts `native_published_at` is non-null. Symmetric test using `POST /:id/publish` shows the same field non-null. Both tests assert equality on every other field of the row to prove path-convergence.

4. **AC#4 — Migrate the existing prod form record**: one-shot script `apps/api/scripts/_backfill-native-published-at.ts` finds any `questionnaire_forms` row with `status='published' AND native_published_at IS NULL` and stamps it with the `updated_at` value (best-available proxy for publish-time). Author with Story 9-22's operator-audit helper so the backfill is audit-logged via `OPERATOR_QUESTIONNAIRE_BACKFILL`.

5. **AC#5 — `pnpm pin-public-form --list` output cleaner**: the `(no native_published_at)` parenthetical disappears for healthy forms. The dev script's display logic shows `native_published_at` as a formatted timestamp.
   > **[SUPERSEDED 2026-06-10 by Story 9-17 AC#A7 — SM to confirm drop]** `dev-pin-public-form.ts` (and its `--list` command) was deleted when 9-17 shipped the Pin-for-Public-Wizard UI; this cosmetic output AC is now moot. The Q.M. page pin badge (9-17 AC#A1) is the operator-visible pin-state surface. The `native_published_at` convergence core (AC#1/#3/#4/#6) is unaffected — AC#4's backfill still wants a consistent timestamp for Q.M. list sort order.

6. **AC#6 — Q.M. list page sorts by `native_published_at DESC`**: currently sorts by `created_at` or `updated_at`. Switching to `native_published_at` requires the field to be reliable — which AC#1 + AC#4 deliver.

7. **AC#7 — Tests + lint + tsc clean**: zero regression on existing 41 questionnaire-related tests.

## Tasks / Subtasks

- [ ] **Task 1 — Decision: Strategy A or Strategy B** (AC: #1)
  - [ ] 1.1: Dev agent reviews both options + makes recommendation to operator
  - [ ] 1.2: Document the choice in Dev Notes
- [ ] **Task 2 (Strategy A path) — Deprecate PATCH `'published'`** (AC: #1, #2)
  - [ ] 2.1: Add INVALID_TRANSITION guard in `apps/api/src/controllers/questionnaire.controller.ts:updateStatus`
  - [ ] 2.2: Update `apps/web/src/features/questionnaires/**` to use the publish endpoint
- [ ] **Task 2 (Strategy B path) — Stamp `nativePublishedAt` in updateFormStatus** (AC: #1, #3)
  - [ ] 2.B.1: Modify `apps/api/src/services/questionnaire.service.ts:updateFormStatus` to set `nativePublishedAt: now` when target status is `'published'`
  - [ ] 2.B.2: Author the convergence test from AC#3
- [ ] **Task 3 — Backfill historical rows** (AC: #4)
  - [ ] 3.1: Author `_backfill-native-published-at.ts` using Story 9-22's operator-audit helper
  - [ ] 3.2: Run on prod via SSH (after 9-22 ships)
  - [ ] 3.3: Verify via `pnpm --filter @oslsr/api dashboard` that all published forms now have the field set
- [ ] **Task 4 — Dev script display polish** (AC: #5)
- [ ] **Task 5 — Q.M. sort order update** (AC: #6)
- [ ] **Task 6 — Tests + lint + tsc clean** (AC: #7)
- [ ] **Task 7 — Pre-merge BMAD code review on uncommitted tree**

## Dev Notes

### Recommendation: Strategy A

Cleaner long-term. `PATCH /:id/status` becomes purely the "non-publish state transitions" endpoint; `POST /:id/publish` is the canonical "publish" surface. Frontend code self-documents (one button = one endpoint = one outcome).

Strategy B is the lighter migration but leaves two paths that can drift again. Story 9-22 (operator audit helper) is exactly the kind of story that exists because we keep accumulating "two paths that should be one."

### Dependencies

- **Story 9-22** — provides the operator-audit helper. AC#4's backfill script uses it. So 9-22 should ship BEFORE 9-23's backfill task runs. (The code refactor work CAN ship before 9-22; just the backfill blocked.)
- **Story 2-1** — Q.M. page surface that this story modifies.

### Risks

1. **Strategy A breaks Q.M. button** — if a frontend caller still uses PATCH for publishing, the new 400 INVALID_TRANSITION breaks the UI. Mitigation: AC#2's grep audit catches this. Run before the controller guard ships.
2. **Strategy B silent stamp behavior is surprising** — a future maintainer wonders why `updateFormStatus` has a side effect for one status value. Mitigation: docblock + AC#3 convergence test self-documents.
3. **Backfill timestamp inaccuracy** — `updated_at` is the best proxy for publish-time but isn't strictly correct (a form might have been updated AFTER publication). The audit-log row notes this in `details`.

### Effort estimate

~half-day (Strategy A) to ~1 day (Strategy B with the convergence test).

## File List

(Populated by dev agent.)
