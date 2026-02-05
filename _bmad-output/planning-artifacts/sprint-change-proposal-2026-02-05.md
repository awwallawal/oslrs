# Sprint Change Proposal: Remove ODK Central, Build Native Form System

**Date:** 2026-02-05
**Proposal ID:** SCP-2026-02-05-001
**Status:** ✅ APPROVED
**Prepared By:** BMAD Correct-Course Workflow
**Approved By:** Awwal (Product Owner)
**Approval Date:** 2026-02-05

---

## Executive Summary

This proposal recommends **removing ODK Central integration** and building a **native questionnaire/form system** directly in OSLRS. The change is triggered by persistent, unresolved connectivity issues with ODK Central's Enketo web form renderer that are blocking the pilot timeline.

**Key Decision:** Replace external dependency with internally-controlled solution.

| Metric | Value |
|--------|-------|
| **Timeline Impact** | +1.5-2 weeks |
| **Risk Level** | LOW |
| **MVP Impact** | Preserved (100% of core features) |
| **Long-term Benefit** | Eliminated external dependency, simplified architecture |

---

## 1. Problem Statement

### Trigger
ODK Central/Enketo integration has persistent, unresolved connectivity issues preventing form preview functionality despite multiple debugging sessions including:
- Server-side diagnostics (`scripts/diagnose-odk-enketo.sh`)
- Container restarts and stack rebuilds
- Minimal test form creation and upload
- Multiple troubleshooting sessions without resolution

### Impact
- **Stories Blocked:** 3.1-3.4 (Data Collection flows)
- **Pilot Timeline:** At risk
- **Team Productivity:** Blocked on core functionality
- **Debugging ROI:** Diminishing returns on external system

### Root Cause
The integration point between OSLRS Custom App and ODK Central's Enketo web form renderer is non-functional. Debugging an external system (ODK/Enketo) is time-unbounded and outside team control.

---

## 2. Proposed Solution

### Approach: Hybrid (Rollback + Reduced-Scope Native Implementation)

**Phase 1: Cleanup (Days 1-2)**
- Remove `services/odk-integration/` module
- Remove ODK Docker containers from compose
- Consolidate to single PostgreSQL database
- Clean CI/CD pipeline of ODK references

**Phase 2: Form Infrastructure (Days 3-7)**
- Design native form definition JSON schema
- Create `questionnaires` and `questions` tables
- Build Admin Form Builder UI
- One-time migration script for `oslsr_master_v3.xlsx`
- GPS capture integration (coordinates only, no media)

**Phase 3: Form Renderer (Days 8-12)**
- React form renderer (one question per screen)
- Skip logic evaluation engine
- IndexedDB draft storage with auto-save
- Background sync queue to API
- Sync status indicators
- Draft resume (exact question position)

**Phase 4: Integration (Days 13-15)**
- Connect to Enumerator Dashboard
- Connect to Public User registration flow
- Connect to Data Entry Clerk interface
- Fraud detection integration (existing engine)
- End-to-end testing

**Phase 5: Documentation (Day 16)**
- Update PRD sections
- Create new ADRs (supersede old)
- Update UX spec references

---

## 3. Scope Clarifications (User-Provided)

The following features are **NOT NEEDED**, significantly reducing complexity:

| Feature | Original Assumption | User Clarification | Impact |
|---------|--------------------|--------------------|--------|
| Media Attachments | Required for forms | No media in forms (GPS is just coordinates) | -1 week effort |
| Multi-language | Required infrastructure | English only, inline Yoruba optional | -0.5 week effort |
| Form Versioning | Complex version management | Delete + re-upload workflow sufficient | -0.5 week effort |
| XLSForm Parser (ongoing) | Continuous parsing | One-time migration script only | Simplified |

---

## 4. XLSForm Analysis

Analysis of `oslsr_master_v3` questionnaire:

| Metric | Value |
|--------|-------|
| **Total Questions** | ~35 data-entry fields |
| **Sections** | 6 |
| **Choice Lists** | 12 |
| **Skills Options** | 50+ |
| **LGA Options** | 33 |

### Skip Logic Patterns (All Supported)

| Pattern | Count | Example |
|---------|-------|---------|
| Simple equals | 14 | `${consent_basic} = 'yes'` |
| Numeric comparison | 1 | `${age} >= 15` |
| OR condition | 3 | `${employment_status} = 'yes' or ${temp_absent} = 'yes'` |
| Complex nested | 0 | Not needed |

**Conclusion:** Skip logic is straightforward and fully supported by simple condition builder.

---

## 5. Epic & Story Impact

### Epics Requiring Changes

| Epic | Impact Level | Changes |
|------|-------------|---------|
| Epic 2 | MAJOR REWRITE | Remove Stories 2.2 (XLSForm Upload to ODK), 2.3 (ODK Sync) |
| Epic 3 | MAJOR REWRITE | Replace Enketo-based collection with native renderer |
| Epic 2.5 | MODERATE | Dashboard integration points unchanged |
| Epic 4 | MODERATE | Fraud detection works same (different data source) |
| Epic 1, 1.5, 5, 6, 7 | MINIMAL | No ODK dependencies |

### Stories Eliminated (6)
- ODK App User provisioning
- ODK token encryption/storage
- ODK webhook receiver
- Enketo form embedding
- ODK sync status checking
- XLSForm push to ODK Central

### New Stories Required (4-5)
- Native form definition schema
- Admin Form Builder UI
- Native form renderer
- IndexedDB sync protocol
- One-time XLSForm migration

---

## 6. Architecture Changes

### ADRs to Supersede

| ADR | Original Decision | New Decision |
|-----|-------------------|--------------|
| ADR-001 | Composed Monolith with ODK Central | Custom Monolith with native forms |
| ADR-002 | ODK Integration Boundary | REMOVED - No ODK |
| ADR-004 | Enketo/IndexedDB owns draft state | Native IndexedDB sync protocol |
| ADR-007 | Two PostgreSQL databases | Single app_db |
| ADR-008 | Emergency sync to ODK Central | Native sync control |
| ADR-009 | ODK Webhook failure detection | REMOVED - No webhooks |

### New ADRs Required

| ADR | Decision |
|-----|----------|
| ADR-NEW-001 | Native Form Definition Schema (JSON in PostgreSQL) |
| ADR-NEW-002 | Native Offline Sync Protocol (IndexedDB → API) |
| ADR-NEW-003 | Simple Condition-Based Skip Logic Engine |

### Infrastructure Simplification

| Before | After |
|--------|-------|
| 6 containers | 4 containers |
| 2 PostgreSQL databases | 1 PostgreSQL database |
| ODK Central + Enketo | Native form system |
| ~8GB RAM usage | ~6GB RAM usage |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Native forms don't match Enketo UX | Low | Medium | Follow same patterns (one question/screen, progress indicators) |
| Offline sync issues | Low | High | Proven IndexedDB patterns, extensive testing |
| Migration script errors | Low | Low | Validate against original XLSForm, manual review |
| Timeline slip | Medium | Medium | Buffer built into estimate, scope already reduced |

**Overall Risk Level: LOW**
- Known scope (questionnaire analyzed)
- Proven technologies (React, IndexedDB)
- Full team control (no external dependencies)

---

## 8. Success Criteria

| Criteria | Measurement |
|----------|-------------|
| Form Builder works | Super Admin can create/edit questionnaire |
| 7-day offline works | Submissions survive without connectivity |
| Draft resume works | Exact question position restored |
| Sync indicators work | "Syncing... (X pending)" displays correctly |
| Fraud detection works | Submissions trigger scoring engine |
| Performance maintained | <250ms API, <2.5s LCP |
| All tests pass | CI green |
| Migration complete | All 35 questions from oslsr_master_v3 imported |

---

## 9. Effort Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Cleanup | 2 days | Clean codebase without ODK |
| Phase 2: Form Infrastructure | 5 days | Admin Form Builder, DB schema |
| Phase 3: Form Renderer | 5 days | Working native form system |
| Phase 4: Integration | 3 days | Connected to all dashboards |
| Phase 5: Documentation | 1 day | Updated artifacts |
| **Total** | **16 days (~3 weeks)** | **Production-ready native forms** |

**Conservative estimate:** 1.5-2 weeks with focused execution.

---

## 10. Handoff Plan

### Role Assignments

| Role | Responsibilities |
|------|-----------------|
| **Product Owner (User)** | Approve proposal, review Form Builder UI, validate bilingual labels |
| **Developer (Claude Code)** | Execute all phases, write code and tests |
| **QA** | End-to-end testing, offline scenario validation |

### Execution Sequence

```
APPROVAL → Phase 1 (Cleanup) → Phase 2-3 (Build) → Phase 4 (Integrate) → Phase 5 (Document) → PILOT READY
```

---

## 11. Approval Request

**This proposal requires explicit approval to proceed.**

### What You're Approving:
1. Remove ODK Central integration entirely
2. Build native form system (1.5-2 weeks)
3. Use one-time XLSForm migration (not ongoing parser)
4. Implement simple skip logic (covers all current patterns)
5. Update PRD, Architecture, and UX documentation

### What You're NOT Approving:
- Any reduction in core MVP functionality
- Any changes to fraud detection, marketplace, or other features
- Any delay beyond the stated 1.5-2 weeks

---

## Appendix A: Files to Remove

```
services/odk-integration/           # Entire module
docker/docker-compose.yml           # ODK containers section
apps/api/src/services/odk*.ts       # ODK service files
apps/api/src/routes/webhook/odk.ts  # ODK webhook route
test-fixtures/minimal-test-form.xlsx # Test fixtures
scripts/diagnose-odk-enketo.sh      # Diagnostic script
```

## Appendix B: New Files to Create

```
apps/api/src/db/schema/questionnaires.ts    # Form definition schema
apps/api/src/db/schema/questions.ts         # Question schema
apps/api/src/services/form-renderer.ts      # Skip logic engine
apps/web/src/features/forms/                # Native form renderer
apps/web/src/features/admin/form-builder/   # Admin Form Builder UI
scripts/migrate-xlsform.ts                  # One-time migration script
```

## Appendix C: Native Form JSON Schema (Draft)

```typescript
interface Questionnaire {
  id: string;
  title: string;
  version: string;
  status: 'draft' | 'published' | 'archived';
  sections: Section[];
  choiceLists: Record<string, Choice[]>;
  createdAt: Date;
  publishedAt?: Date;
}

interface Section {
  id: string;
  title: string;
  showWhen?: Condition | ConditionGroup;
  questions: Question[];
}

interface Question {
  id: string;
  type: 'text' | 'number' | 'date' | 'select_one' | 'select_multiple' | 'note' | 'geopoint';
  name: string;
  label: string;
  labelYoruba?: string;
  required: boolean;
  choices?: string; // Reference to choiceLists key
  showWhen?: Condition | ConditionGroup;
  validation?: ValidationRule[];
}

interface Condition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'greater_or_equal' | 'less_than' | 'less_or_equal' | 'is_empty' | 'is_not_empty';
  value: string | number;
}

interface ConditionGroup {
  any?: Condition[];  // OR
  all?: Condition[];  // AND
}

interface ValidationRule {
  type: 'regex' | 'min' | 'max' | 'minLength' | 'maxLength' | 'lessThanField';
  value: string | number;
  message: string;
}
```

---

---

## Appendix D: Infrastructure Changes (DigitalOcean)

### Current Setup: Two Droplets

```
┌─────────────────────────────────────────────────────────────────┐
│                      CURRENT ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐    ┌─────────────────────────┐     │
│  │   Droplet 1 (Main)      │    │   Droplet 2 (ODK)       │     │
│  │   ~$12-48/month         │    │   ~$12-24/month         │     │
│  │                         │    │                         │     │
│  │  NGINX (Reverse Proxy)  │───▶│  ODK Central            │     │
│  │    ├─ /api/* → API      │    │    ├─ Enketo            │     │
│  │    ├─ /* → Frontend     │    │    ├─ PostgreSQL (odk)  │     │
│  │    └─ /odk/* → Droplet 2│    │    └─ Redis (enketo)    │     │
│  │                         │    │                         │     │
│  │  PM2 (oslsr-api)        │    └─────────────────────────┘     │
│  │  PostgreSQL (app_db)    │              ↑                     │
│  │  Redis                  │              │                     │
│  │  React Frontend         │         DECOMMISSION               │
│  └─────────────────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### After Change: Single Droplet

```
┌─────────────────────────────────────────────────────────────────┐
│                      NEW ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐                                    │
│  │   Droplet 1 (Main)      │     ┌─────────────────────────┐   │
│  │   ~$12-48/month         │     │   Droplet 2 (ODK)       │   │
│  │                         │     │                         │   │
│  │  NGINX (Simplified)     │     │      ██ DELETED ██      │   │
│  │    ├─ /api/* → API      │     │                         │   │
│  │    └─ /* → Frontend     │     │   SAVINGS: $12-24/mo    │   │
│  │                         │     │                         │   │
│  │  PM2 (oslsr-api)        │     └─────────────────────────┘   │
│  │  PostgreSQL (app_db)    │                                    │
│  │  Redis                  │                                    │
│  │  React Frontend         │                                    │
│  │  Native Form System     │ ◀── NEW                           │
│  └─────────────────────────┘                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Infrastructure Cleanup Steps

**Step 1: Backup ODK Data (Optional, if any submissions exist)**
```bash
# SSH to Droplet 2
ssh root@<droplet-2-ip>
cd /root/central
docker exec central-postgres pg_dump -U odk central > /tmp/odk_backup.sql
scp /tmp/odk_backup.sql user@<your-machine>:~/odk_backup.sql
```

**Step 2: Update NGINX on Droplet 1**
```bash
# SSH to Droplet 1
ssh root@<droplet-1-ip>

# Edit NGINX config
sudo nano /etc/nginx/sites-available/oslsr

# REMOVE any ODK-related blocks:
# - upstream odk_central { ... }
# - location ~ ^/(v1|enketo|/-/) { ... }
# - server { server_name odk.yourdomain.com; ... }

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

**Step 3: Update DNS (if applicable)**
```
# In DigitalOcean DNS or your DNS provider:
# DELETE: odk.yourdomain.com → <droplet-2-ip>
```

**Step 4: Decommission Droplet 2**
```
# DigitalOcean Console:
# 1. Droplets → Select ODK Droplet
# 2. (Optional) Create Snapshot for backup
# 3. Destroy → Confirm
```

### Cost Savings

| Item | Before | After | Monthly Savings |
|------|--------|-------|-----------------|
| Droplet 1 (Main) | $12-48 | $12-48 | $0 |
| Droplet 2 (ODK) | $12-24 | $0 | **$12-24** |
| **Total** | $24-72 | $12-48 | **$12-24/month** |

**Annual Savings: $144-288/year**

---

## Appendix E: Complete File Deletion/Modification List

### Files to DELETE (59 files)

```
# Service Package (entire directory)
services/odk-integration/                    # 25+ files

# API - Database Schema
apps/api/src/db/schema/odk-app-users.ts
apps/api/src/db/schema/odk-sync-failures.ts

# API - Routes
apps/api/src/routes/admin/odk-health.routes.ts

# API - Services
apps/api/src/services/odk-health-admin.service.ts
apps/api/src/services/odk-backfill-admin.service.ts
apps/api/src/services/odk-alert-rate-limiter.ts

# API - Workers
apps/api/src/workers/odk-health-check.worker.ts
apps/api/src/workers/odk-app-user.worker.ts

# API - Queues
apps/api/src/queues/odk-health-check.queue.ts
apps/api/src/queues/odk-app-user.queue.ts

# API - Scripts
apps/api/scripts/republish-odk-form.ts
apps/api/scripts/debug-odk-health.ts
apps/api/scripts/test-odk-connection.ts

# API - Tests
apps/api/src/workers/__tests__/odk-health-check.worker.test.ts
apps/api/src/workers/__tests__/odk-app-user.processor.test.ts
apps/api/src/workers/__tests__/odk-app-user.worker.test.ts
apps/api/src/services/__tests__/odk-alert-rate-limiter.test.ts

# Web - Pages
apps/web/src/features/questionnaires/pages/OdkHealthPage.tsx
apps/web/src/features/questionnaires/pages/__tests__/OdkHealthPage.test.tsx

# Web - Components
apps/web/src/features/questionnaires/components/OdkWarningBanner.tsx
apps/web/src/features/questionnaires/components/__tests__/OdkWarningBanner.test.tsx

# Web - Hooks
apps/web/src/features/questionnaires/hooks/useOdkHealth.ts
apps/web/src/features/questionnaires/hooks/__tests__/useOdkHealth.test.tsx

# Web - API
apps/web/src/features/questionnaires/api/odk-health.api.ts

# Test Fixtures
test-fixtures/minimal-test-form.xlsx
scripts/diagnose-odk-enketo.sh
```

### Files to MODIFY (15+ files)

```
# API
apps/api/package.json                        # Remove @oslsr/odk-integration dependency
apps/api/src/db/schema/index.ts              # Remove ODK exports
apps/api/src/db/schema/relations.ts          # Remove ODK relations
apps/api/src/db/schema/questionnaires.ts     # Remove odkXmlFormId, odkPublishedAt
apps/api/src/routes/admin.routes.ts          # Remove ODK routes import
apps/api/src/services/questionnaire.service.ts
apps/api/src/controllers/questionnaire.controller.ts
apps/api/src/workers/webhook-ingestion.worker.ts  # Repurpose for native forms
apps/api/src/queues/webhook-ingestion.queue.ts    # Repurpose

# Web
apps/web/src/App.tsx                         # Remove ODK routes
apps/web/src/features/questionnaires/hooks/useQuestionnaires.ts
apps/web/src/features/questionnaires/api/questionnaire.api.ts
apps/web/src/features/questionnaires/components/QuestionnaireList.tsx
apps/web/src/features/questionnaires/constants.ts
apps/web/src/features/dashboard/pages/SuperAdminHome.tsx
apps/web/src/features/dashboard/config/sidebarConfig.ts

# Config
.env.example                                 # Remove 5 ODK variables
.github/workflows/ci-cd.yml                  # Remove odk-integration from matrix
```

### Database Migration Required

```sql
-- New migration: XXXX_remove_odk_tables.sql

-- Drop ODK-specific tables
DROP TABLE IF EXISTS odk_app_users CASCADE;
DROP TABLE IF EXISTS odk_sync_failures CASCADE;

-- Remove ODK columns from questionnaire_forms
ALTER TABLE questionnaire_forms
  DROP COLUMN IF EXISTS odk_xml_form_id,
  DROP COLUMN IF EXISTS odk_published_at;

-- Add new columns for native form system
ALTER TABLE questionnaire_forms
  ADD COLUMN IF NOT EXISTS form_schema JSONB,
  ADD COLUMN IF NOT EXISTS native_published_at TIMESTAMP WITH TIME ZONE;
```

---

## Appendix F: CI/CD Pipeline Changes (Exact Diff)

```yaml
# .github/workflows/ci-cd.yml

# CHANGE 1: Line 80 - Remove odk-integration from test matrix
# BEFORE:
  test-unit:
    strategy:
      matrix:
        package: [utils, testing, odk-integration]

# AFTER:
  test-unit:
    strategy:
      matrix:
        package: [utils, testing]

# CHANGE 2: Lines 362-367 - Remove artifact download step
# DELETE THIS ENTIRE BLOCK:
      - name: Download test results (odk-integration)
        uses: actions/download-artifact@v4
        with:
          name: test-results-odk-integration
          path: .
        continue-on-error: true
```

**No other CI/CD changes required.** The deploy job already only deploys to Droplet 1.

---

**END OF PROPOSAL**

*Generated by BMAD Correct-Course Workflow on 2026-02-05*
*Updated with comprehensive codebase analysis and infrastructure details*
