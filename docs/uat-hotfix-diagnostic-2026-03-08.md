


# UAT Hotfix Diagnostic Report — 2026-03-08

**Reported by:** Awwal (UAT)
**Investigated by:** Amelia (Dev Agent)
**Status:** Root cause confirmed, pending fix

---

## Issue 1: Missing Questionnaire Questions (3.6-3.9, 5.6-5.8)

### Symptom

Enumerators do not see 7 questions during form filling:

| # | Question | Type | Show If |
|---|----------|------|---------|
| 3.6 | Type of Employment | select_one (6 opts) | Q3.1=Yes OR Q3.2=Yes |
| 3.7 | Years of Experience | select_one (5 opts) | Q3.1=Yes OR Q3.2=Yes |
| 3.8 | Hours worked last week | number (0-168) | Q3.1=Yes |
| 3.9 | Estimated Monthly Income | number | Q3.1=Yes |
| 5.6 | Business registered with CAC? | select_one (3 opts) | Q5.4=Yes |
| 5.7 | Business Premises Address | text | Q5.4=Yes |
| 5.8 | Number of apprentices/trainees | number | Q5.4=Yes |

All 7 were introduced in **Version 3.0** (per `docs/questionnaire_schema_review.md`, "What's New" table).

### Root Cause Analysis

**Diagnosis: Two compounding issues — stale form schema + converter bug.**

#### Layer 1: Converter Bug (section-level `showWhen`)

The XLSForm-to-native converter (`apps/api/src/services/xlsform-to-native-converter.ts`) was converting `begin_group` relevance conditions into section-level `showWhen`. This is incorrect for the native form system because:

- Section 3 (Labour Force Participation) has XLSForm relevance: `${age} >= 15`
- `age` is a **calculated field** in XLSForm (derived from DOB via ODK Collect engine)
- The native form system has no ODK calculation engine — `age` never exists in `formData`
- `evaluateCondition()` evaluates `Number(undefined) >= 15` → `NaN >= 15` → `false`
- **Result: Entire Section 3 hidden, regardless of user answers**

The same pattern affects any section with calculated-field relevance.

**Evidence — committed code vs working tree:**

```diff
# OLD (committed) — extractSections() in xlsform-to-native-converter.ts
if (baseType === 'begin_group') {
-  const relevance = getRelevance(row);
   currentSection = {
     id: uuidv7(),
     title: row.label || row.name,
     questions: [],
-    ...(relevance ? { showWhen: parseXlsformRelevance(relevance) } : {}),
   };
```

```diff
# NEW (uncommitted fix) — section-level showWhen deliberately stripped
if (baseType === 'begin_group') {
+  // Section-level showWhen deliberately omitted — see JSDoc above
   currentSection = {
     id: uuidv7(),
     title: row.label || row.name,
     questions: [],
   };
```

**Files affected:**
- `apps/api/src/services/xlsform-to-native-converter.ts:163-178` (fix present but uncommitted)
- `scripts/__tests__/xlsform-to-native-converter.test.ts:83-91, 159-167` (tests updated)

#### Layer 2: Ungrouped Questions Silently Dropped

The old converter discarded any question outside a `begin_group`/`end_group` pair. The XLSForm spec allows top-level questions (e.g., `geopoint` for GPS).

**Fix (uncommitted):** Questions outside groups now go into an auto-generated "General" section.

```diff
+  } else {
+    if (!ungroupedSection) {
+      ungroupedSection = { id: uuidv7(), title: 'General', questions: [] };
+    }
+    ungroupedSection.questions.push(question);
+  }
```

#### Layer 3: Stale Cache After Re-Upload

Even after fixing the converter and re-uploading the XLSX, enumerators may still see old questions due to **three caching layers**:

| Layer | Strategy | TTL | Invalidation |
|-------|----------|-----|-------------|
| TanStack Query (in-memory) | Standard cache | `staleTime: 5min` | Page refresh clears it |
| Service Worker (HTTP cache) | **StaleWhileRevalidate** | 7 days, 30 entries | Serves stale first, revalidates in background — enumerator sees old schema on first load |
| Dexie/IndexedDB (`formSchemaCache`) | Write-through, offline fallback | **No expiry** | Only overwritten when API fetch succeeds; never evicted |

**Critical gap:** No version comparison between server and cache. No manual cache-clear UI.

**Key code paths:**
- `apps/web/src/sw.ts:66-79` — SW StaleWhileRevalidate for `/api/v1/forms/{id}/render`
- `apps/web/src/features/forms/hooks/useForms.ts:24-49` — write-through to Dexie
- `apps/web/src/lib/offline-db.ts:27-33` — CachedFormSchema (has `etag` field, never used)

### XLSX ↔ Schema Alignment

**Confirmed aligned.** The `test-fixtures/oslsr_master_v3.xlsx` was created from `docs/questionnaire_schema_review.md` and contains all 35+ questions including the 7 missing ones (`employment_type`, `years_experience`, `hours_worked`, `monthly_income`, `business_reg`, `business_address`, `apprentice_count`). The gap is between the XLSX and what's stored in the database's `questionnaire_forms.formSchema` JSONB column.

### Browser Debug Script

To verify what's cached on an enumerator's device, paste in browser console:

```js
void function(){var r=indexedDB.open("oslrs-offline");r.onsuccess=function(){var d=r.result,t=d.transaction("formSchemaCache","readonly"),s=t.objectStore("formSchemaCache"),a=s.getAll();a.onsuccess=function(){console.log("Cached forms:",a.result.length);a.result.forEach(function(e){var q=e.schema.questions||[];console.log("formId:",e.formId,"version:",e.version,"questions:",q.length);q.forEach(function(x,i){if(x.name==="employment_type"||x.name==="years_experience"||x.name==="hours_worked"||x.name==="monthly_income"||x.name==="business_reg"||x.name==="business_address"||x.name==="apprentice_count"){console.log("  FOUND:",i,x.name,JSON.stringify(x.showWhen||null))}})})}}}()
```

**Expected output if form is stale:** 0 FOUND lines (questions not in cached schema).

---

## Issue 2: Submission Count (5) vs Respondent Count (4) Discrepancy

### Symptom

Drizzle Studio shows 5 rows in `submissions` but only 4 rows in `respondents`.

### Root Cause: By Design (NIN Deduplication)

The submission pipeline intentionally allows submissions without respondents. The `respondentId` column on `submissions` is **nullable** (`apps/api/src/db/schema/submissions.ts:54`).

**Processing flow** (`apps/api/src/services/submission-processing.service.ts:310-370`):

```
Submission received
  → Check NIN against respondents table
    → EXISTS? → PermanentProcessingError("NIN_DUPLICATE") → submission saved, NO respondent created
    → NEW?    → Check NIN against users (staff) table
      → STAFF? → PermanentProcessingError("NIN_DUPLICATE_STAFF") → submission saved, NO respondent created
      → OK     → INSERT respondent → link to submission → mark processed
```

**The orphaned submission** will have one of these states:

| Column | Expected Value |
|--------|---------------|
| `respondentId` | `NULL` |
| `processed` | `true` |
| `processingError` | `NIN_DUPLICATE: This individual was already registered on...` or similar |

### Diagnostic Query

```sql
-- Find the orphaned submission
SELECT id, "submissionUid", processed, "processingError", "respondentId", "createdAt"
FROM submissions
WHERE "respondentId" IS NULL
ORDER BY "createdAt" DESC;

-- Cross-check: verify 4 unique respondents
SELECT COUNT(*) AS total_respondents,
       COUNT(DISTINCT nin) AS unique_nins
FROM respondents;
```

### Assessment

**Not a bug.** This is the expected NIN deduplication behavior from Story 3.7 (AC 3.7.1 / 3.7.2). The 5th submission was either:
1. A duplicate NIN (same person registered by different enumerator)
2. A staff member's NIN used in a test submission
3. A submission that failed processing (check `processed = false` + BullMQ dead-letter queue)

---

## Remediation Plan

### Phase 1: Commit Converter Fixes (immediate)

| Step | Action | File |
|------|--------|------|
| 1a | Commit section-level showWhen removal | `apps/api/src/services/xlsform-to-native-converter.ts` |
| 1b | Commit ungrouped question handling | (same file) |
| 1c | Commit RESPONDENT_FIELD_MAP aliases (`surname`, `firstname`) | `apps/api/src/services/submission-processing.service.ts` |
| 1d | Run converter tests | `scripts/__tests__/xlsform-to-native-converter.test.ts` |

### Phase 2: Cache Invalidation Hardening

| Step | Action | File |
|------|--------|------|
| 2a | Bump SW form-schema cache name `v1` → `v2` to force eviction on deploy | `apps/web/src/sw.ts:18` |
| 2b | Add version-aware Dexie cache: if server `version > cached.version`, overwrite immediately | `apps/web/src/features/forms/hooks/useForms.ts:31-37` |
| 2c | Optional: populate `etag` field for HTTP conditional requests | Future consideration |

### Phase 3: Re-Upload & Verify

| Step | Action |
|------|--------|
| 3a | Deploy updated converter + SW to production |
| 3b | Re-upload `test-fixtures/oslsr_master_v3.xlsx` via admin UI |
| 3c | Verify form via preview (`/forms/{id}/preview`) — confirm all 35+ questions present |
| 3d | Verify on enumerator device — first load may serve stale (SW), second load shows new schema |
| 3e | Run browser debug script to confirm 7 FOUND lines |

### Phase 4: Submission Discrepancy (informational)

| Step | Action |
|------|--------|
| 4a | Run diagnostic SQL to confirm orphaned submission's `processingError` |
| 4b | No code change needed unless error is unexpected (e.g., `processed = false` indicating stuck job) |

---

## Files Referenced

| File | Role |
|------|------|
| `docs/questionnaire_schema_review.md` | Canonical questionnaire spec (v3.0) |
| `test-fixtures/oslsr_master_v3.xlsx` | XLSForm source (aligned with spec) |
| `apps/api/src/services/xlsform-to-native-converter.ts` | Converter (has uncommitted fixes) |
| `scripts/__tests__/xlsform-to-native-converter.test.ts` | Converter tests (has uncommitted fixes) |
| `apps/api/src/services/submission-processing.service.ts` | Respondent extraction + NIN dedup |
| `apps/web/src/sw.ts` | Service worker caching strategies |
| `apps/web/src/lib/offline-db.ts` | Dexie schema (IndexedDB) |
| `apps/web/src/features/forms/hooks/useForms.ts` | Form schema fetch + write-through cache |
| `apps/web/src/features/forms/utils/skipLogic.ts` | Client-side skip logic evaluation |
| `apps/web/src/features/forms/pages/FormFillerPage.tsx` | Form rendering + navigation |

---

*Report generated during UAT hotfix triage — OSLRS Project, 2026-03-08*
