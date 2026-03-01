---
project_name: 'oslr_cl'
user_name: 'Awwal'
date: '2026-01-13'
sections_completed: ['technology_stack', 'critical_rules', 'project_structure', 'anti_patterns', 'workflow', 'user_notes', 'ui_patterns']
architecture_source: '_bmad-output/planning-artifacts/architecture.md'
adrs_count: 11
pattern_categories: 10
patterns_documented: 13
conflict_prevention_rules: 10
status: 'complete'
---

# Project Context for AI Agents: OSLSR

_This file contains critical rules and patterns that AI agents must follow when implementing code in the Oyo State Labour & Skills Registry (OSLSR) project. Focus on unobvious details that agents might otherwise miss._

**Architecture Version:** v8.0 (2026-02-06) — SCP-2026-02-05-001: ODK Central removed, native form system
**Target Scale:** 1M records over 12 months, 200 staff users, 1K concurrent public users
**Deployment:** Single Hetzner VPS (CX43), Docker Compose, NDPA-compliant

---

## Technology Stack & Versions

### Core Technologies

**CRITICAL: Lock to these exact versions to prevent conflicts**

**Runtime & Language:**
- **Node.js 20 LTS** (locked via `.nvmrc`) - Required for all backend and build tooling
- **TypeScript 5.x** with `strict: true` - All workspaces must use strict mode
- **ES Modules** (`"type": "module"` in package.json) - NOT CommonJS

**Frontend Stack:**
- **React 18.3** (NOT React 19 - CVEs 55182, 55184, 67779, 55183) - Battle-tested stability
- **Vite 6.x** - Build tooling with HMR (NOT webpack, NOT Create React App)
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Accessible component library (Radix UI primitives)
- **TanStack Query** (formerly React Query) - Server state management
- **Zustand** - UI state management only (NOT Redux)
- **React Hook Form** - Form handling with Zod validation
- **React Router v7** - Client-side routing

**Backend Stack:**
- **Express.js** - REST API framework (NOT Fastify, NOT NestJS)
- **Drizzle ORM 1.x** - TypeScript-first ORM (~50KB, SQL-like syntax)
- **PostgreSQL 15** - Single app_db (NOT MongoDB per ADR-010)
- **Redis 7** - Caching, rate limiting, JWT blacklist, BullMQ queue
- **BullMQ** - Job queue for async processing
- **Pino 9.x** - Structured logging (fastest Node.js logger)

**Data & Validation:**
- **Zod 3.x** - Runtime validation + TypeScript types (shared between frontend/backend)
- **uuidv7** package - Time-ordered UUIDs (NOT uuid v4 package)
- **bcrypt 6.x** - Password hashing (10-12 rounds)

**Infrastructure:**
- **Docker Compose** - Local development and production deployment
- **pnpm** - Monorepo package manager (NOT npm, NOT yarn)
- ~~**ODK Central (self-hosted)**~~ REMOVED (SCP-2026-02-05-001) — Native form system replaces ODK

**Version Constraints:**
- React MUST be 18.3.x (NOT 19.x due to security vulnerabilities)
- PostgreSQL MUST be 15.x (PostGIS required for GPS data)
- Node.js MUST be 20.x LTS (not 21+, not <20)

### Accepted Dependency Risks

#### Build-Only (No Runtime Exposure)

These vulnerabilities exist only in dev/build tooling and never execute in the production runtime:

- `minimatch` (HIGH x12 — ReDoS): Transitive via eslint, drizzle-kit, workbox-build. Build tooling only, never runs in production.
- `rollup` (HIGH x2 — path traversal): Transitive via vite. Build tooling only. Mitigated by pnpm.overrides where possible.
- `serialize-javascript` (HIGH — RCE): Transitive via workbox-build -> @rollup/plugin-terser. Build-only.
- `esbuild` (MODERATE — dev server cross-origin): Dev-only via tsx/vite. Not deployed to production.
- `ajv` (MODERATE x2 — ReDoS): Dev-only via eslint -> @eslint/eslintrc. Not deployed.
- `phin` (MODERATE — header leak on redirect): Dev-only via potrace -> jimp. Not deployed.

#### Production (Accepted — Low Severity)

These vulnerabilities exist in production dependencies but are accepted due to low severity and lack of available fix:

- `qs` (LOW — arrayLimit bypass): Transitive via express -> body-parser. Low severity, no fix without Express 5 major version change. Caught by CI `pnpm audit` but below `--audit-level=high` threshold.

Pinned security-critical deps should be reviewed quarterly for available patches. The CI `pnpm audit` gate catches known CVEs automatically, but non-CVE security improvements require manual review.

---

## Critical Implementation Rules

### 1. Database ID Strategy (UUIDv7 - NEVER Auto-Increment)

**ABSOLUTE REQUIREMENT: All primary keys and foreign keys MUST use UUIDv7**

**Why UUIDv7:**
- Time-ordered (better PostgreSQL B-tree index performance than random UUIDv4)
- Offline-first compatible (enumerators can generate IDs client-side for 7-day offline operation)
- Privacy benefit (non-sequential IDs don't leak record counts)
- Globally unique (no central coordinator needed)

**Drizzle Schema Pattern:**
```typescript
import { pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

// ✅ CORRECT: UUIDv7 primary key
export const respondents = pgTable('respondents', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),  // ALWAYS use this pattern
  nin: text('nin').unique().notNull(),
  firstName: text('first_name').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// ✅ CORRECT: UUIDv7 foreign key
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  respondentId: uuid('respondent_id').notNull()
    .references(() => respondents.id),  // UUID FK
  submittedAt: timestamp('submitted_at').defaultNow()
});
```

**Frontend Offline ID Generation:**
```typescript
import { uuidv7 } from 'uuidv7';

// Generate ID client-side for offline draft
const draftSubmission = {
  id: uuidv7(),  // Pre-generate before submission
  enumeratorId: currentUser.id,
  formData: {...}
};
```

**FORBIDDEN PATTERNS:**
```typescript
// ❌ NEVER use auto-increment
id: serial('id').primaryKey()  // WRONG!

// ❌ NEVER use integer IDs
id: integer('id').primaryKey()  // WRONG!

// ❌ NEVER use UUIDv4
import { v4 as uuidv4 } from 'uuid';  // WRONG PACKAGE!
id: uuid('id').primaryKey().$defaultFn(() => uuidv4())  // WRONG VERSION!

// ❌ NEVER use numeric IDs
userId: integer('user_id')  // WRONG!
```

**SQL Migration Pattern:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE respondents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),  -- PostgreSQL function
  nin TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL
);
```

---

### 2. Naming Conventions (Database vs API vs Code)

**Database (PostgreSQL) - ALWAYS snake_case:**
- ✅ Tables: `respondents`, `submissions`, `fraud_detections` (plural, snake_case)
- ✅ Columns: `first_name`, `enumerator_id`, `gps_latitude` (snake_case)
- ✅ Primary Keys: Always `id` (UUID, never composite)
- ✅ Foreign Keys: `{table_singular}_id` (e.g., `enumerator_id` references `users.id`)
- ✅ Indexes: `idx_{table}_{column}` (e.g., `idx_submissions_enumerator_id`)
- ✅ Constraints: `uq_{table}_{column}` (e.g., `uq_respondents_nin`)
- ❌ NEVER use camelCase in database (`firstName` is WRONG, `first_name` is CORRECT)

**API Endpoints - Plural nouns, kebab-case:**
- ✅ Base: `/api/v1/` (URL versioning)
- ✅ Resources: `/users`, `/fraud-detections`, `/marketplace-profiles`
- ✅ Query params: `?lgaId=ib-north&startDate=2026-01-01` (camelCase)
- ✅ Path params: `:userId`, `:submissionId` (camelCase)
- ❌ NEVER use verbs: `/getUsers` is WRONG, `/users` is CORRECT

**API Response JSON - ALWAYS camelCase:**
```json
{
  "data": {
    "id": "018e5f2a-1234-7890-abcd-1234567890ab",
    "firstName": "Adewale",
    "lastName": "Johnson",
    "lgaId": "ib-north"
  }
}
```

**TypeScript Code:**
- ✅ Components: `PascalCase` (`EnumeratorDashboard`, `FraudAlertCard`)
- ✅ Functions: `camelCase` (`validateNin`, `calculateFraudScore`)
- ✅ Constants: `SCREAMING_SNAKE_CASE` (`MAX_RETRY_ATTEMPTS`, `FRAUD_THRESHOLD_GPS`)
- ✅ Interfaces/Types: `PascalCase` (`User`, `FraudDetectionResult`)
- ✅ Files: `kebab-case` (`fraud-detection.service.ts`, `enumerator-dashboard.tsx`)

**Environment Variables:**
- ✅ Prefix by domain: `DB_HOST`, `REDIS_PORT`, `AWS_SES_REGION`
- ✅ Boolean flags: `FEATURE_FRAUD_DETECTION_ENABLED`

---

### 3. API Response Format (Structured Errors with AppError Class)

**Success Response Pattern:**
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalItems: number;
    };
    timestamp?: string;  // ISO 8601
  };
}
```

**Error Response Pattern (ALWAYS use AppError):**
```typescript
// packages/utils/src/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Usage in service
if (existingRespondent) {
  throw new AppError(
    'NIN_DUPLICATE',
    `This individual was already registered on ${existingRespondent.createdAt}`,
    409,  // HTTP 409 Conflict
    {
      nin: existingRespondent.nin,
      originalSubmissionId: existingRespondent.id,
      originalSubmissionDate: existingRespondent.createdAt
    }
  );
}

// ❌ NEVER throw raw Error
throw new Error('Duplicate NIN');  // WRONG! Use AppError
```

**Centralized Error Handler (Express):**
```typescript
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    logger.warn({ event: 'api.error', code: err.code, path: req.path });
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details
    });
  }

  // Unknown error
  logger.error({ event: 'api.error.unknown', error: err.message, stack: err.stack });
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});
```

**Date/Time Format:**
- ✅ ALWAYS use ISO 8601 in APIs: `2026-01-03T14:30:00.000Z`
- ✅ ALWAYS store as `TIMESTAMP` in PostgreSQL (UTC timezone)
- ❌ NEVER use Unix timestamps (hard to debug)
- ❌ NEVER store local time without timezone

---

### 4. Loading States (Skeleton Screens, NOT Spinners)

**CRITICAL: Use skeleton screens to preserve layout and reduce perceived loading time**

**Skeleton Component Library (apps/web/src/components/skeletons/):**
```typescript
import {
  SkeletonText,    // Configurable width text lines
  SkeletonCard,    // Card-shaped placeholder with optional header
  SkeletonAvatar,  // Circular image placeholder (sm/md/lg/xl)
  SkeletonTable,   // Table rows with configurable columns
  SkeletonForm     // Form fields placeholder
} from '@/components/skeletons';

// Usage examples:
<SkeletonText width="75%" />                           // Text line
<SkeletonText lines={3} />                             // Multiple lines
<SkeletonCard showHeader />                            // Card with header
<SkeletonAvatar size="lg" />                           // Large avatar
<SkeletonTable rows={5} columns={4} />                 // 5x4 table
<SkeletonForm fields={['text', 'textarea', 'text']} /> // Form fields
```

**✅ CORRECT Pattern:**
```typescript
function EnumeratorDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard showHeader />           {/* Stats card skeleton */}
        <SkeletonTable rows={5} columns={4} /> {/* Data table skeleton */}
      </div>
    );
  }

  return <DashboardContent stats={stats} />;
}
```

**❌ WRONG Pattern:**
```typescript
// NEVER use generic spinners for data tables
if (isLoading) return <Spinner />;  // WRONG! No layout preservation
```

**Accessibility Requirements:**
- All skeletons have `aria-busy="true"` and `aria-label="Loading"`
- Shimmer animation uses CSS transforms (GPU-accelerated)
- Minimum 200ms display to prevent flash

**Why:** Data entry clerks process hundreds of records/day. Skeleton screens preserve layout, reduce Cumulative Layout Shift (CLS), and meet NFR1.2 (2.5s LCP target).

---

### 4a. Error Boundaries (Graceful Crash Handling)

**CRITICAL: Wrap components to prevent cascading failures**

**Error Boundary Component (apps/web/src/components/ErrorBoundary.tsx):**
```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Page-level protection (in App.tsx routes)
<ErrorBoundary
  fallbackProps={{
    title: 'Page Error',
    description: 'This page encountered an error.'
  }}
>
  <DashboardPage />
</ErrorBoundary>

// Feature-level protection (complex components)
<ErrorBoundary
  fallbackProps={{
    title: 'Camera Error',
    description: 'Unable to access the camera.',
    showHomeLink: false  // Hide "Go Home" for feature-level
  }}
  onError={(error, errorInfo) => {
    logger.error({ event: 'component.crash', error: error.message });
  }}
>
  <LiveSelfieCapture onCapture={handleCapture} />
</ErrorBoundary>
```

**ErrorFallback Props:**
- `title`: User-friendly error title (required)
- `description`: Explanation message (required)
- `showTryAgain`: Show "Try Again" button (default: true)
- `showHomeLink`: Show "Go Home" link (default: true)
- `onRetry`: Custom retry handler (optional)

**Reset Behavior:**
```typescript
// Reset on navigation (using resetKey)
<ErrorBoundary resetKey={location.pathname}>
  <Routes>...</Routes>
</ErrorBoundary>

// Manual reset via callback
<ErrorBoundary onReset={() => queryClient.invalidateQueries()}>
  <DataComponent />
</ErrorBoundary>
```

**Which Components to Wrap:**
- ✅ Page-level routes (App.tsx)
- ✅ Complex features: `LiveSelfieCapture`, `IDCardDownload`
- ✅ Third-party integrations (maps, charts, cameras)
- ❌ Simple UI components (buttons, inputs)
- ❌ Static content components

---

### 4b. Toast Notifications (User Feedback)

**CRITICAL: Use toast for action feedback, NOT for validation errors**

**Toast Hook (apps/web/src/hooks/useToast.ts):**
```typescript
import { useToast } from '@/hooks/useToast';

function SaveButton() {
  const { success, error, warning, info, loading, dismiss } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      success('Changes saved successfully');  // Auto-dismiss: 3s
    } catch (err) {
      error('Failed to save changes');        // Auto-dismiss: 5s
    }
  };
}
```

**Toast Timing Configuration:**
- Success: 3 seconds auto-dismiss
- Error: 5 seconds auto-dismiss
- Warning/Info: 4 seconds auto-dismiss
- Maximum visible toasts: 3 (older dismissed automatically)

**When to Use Toasts:**
- ✅ Mutation success/failure feedback
- ✅ Background operation completion
- ✅ System notifications
- ❌ Form validation errors (use inline errors)
- ❌ Confirmation dialogs (use modals)

**Toast with useOptimisticMutation (Automatic):**
```typescript
const mutation = useOptimisticMutation({
  mutationFn: updateProfile,
  successMessage: 'Profile updated',     // Auto-shows success toast
  errorMessage: 'Failed to update',      // Auto-shows error toast
});
```

---

### 4c. Optimistic UI (useOptimisticMutation Hook)

**CRITICAL: Use the wrapper hook for consistent optimistic updates**

**useOptimisticMutation Hook (apps/web/src/hooks/useOptimisticMutation.ts):**
```typescript
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';

function DeleteButton({ itemId, onDeleted }) {
  const mutation = useOptimisticMutation({
    mutationFn: () => deleteItem(itemId),

    // Optimistic update (runs immediately before API call)
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['items'] });
      const previousItems = queryClient.getQueryData(['items']);
      queryClient.setQueryData(['items'], (old) =>
        old.filter(item => item.id !== itemId)
      );
      return { previousItems };  // Context for rollback
    },

    // Rollback on error
    onError: (error, variables, context) => {
      queryClient.setQueryData(['items'], context.previousItems);
    },

    // Toast messages (optional - defaults provided)
    successMessage: 'Item deleted',
    errorMessage: 'Failed to delete item',

    // Callbacks
    onSuccess: () => onDeleted(),
  });

  return (
    <Button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Deleting...' : 'Delete'}
    </Button>
  );
}
```

**Disabling Toasts:**
```typescript
// Disable success toast (for silent operations)
useOptimisticMutation({
  mutationFn: syncData,
  successMessage: false,  // No success toast
});

// Custom error message function
useOptimisticMutation({
  mutationFn: uploadFile,
  errorMessage: (error) => `Upload failed: ${error.message}`,
});
```

**Button Loading Pattern:**
```typescript
<Button
  disabled={mutation.isPending}
  className={mutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}
>
  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {mutation.isPending ? 'Saving...' : 'Save'}
</Button>
```

---

### 5. Structured Logging (Pino with Event Naming Pattern)

**Log Event Pattern: `{domain}.{action}` (lowercase, underscores)**

**✅ CORRECT Patterns:**
```typescript
logger.info({ event: 'user.login', userId, role, lga });
logger.warn({ event: 'fraud.detected', heuristic: 'gps_cluster', score: 0.85 });
logger.error({ event: 'submission.ingestion.failed', submissionId, error: err.message });
logger.info({ event: 'marketplace.search', query, resultsCount, searcherId });
logger.debug({ event: 'cache.hit', key: 'fraud_thresholds', ttl: 3600 });
```

**❌ WRONG Patterns:**
```typescript
console.log('User logged in');  // WRONG! Unstructured
logger.info('User logged in: ' + userId);  // WRONG! String concatenation
logger.warn({ msg: 'Fraud detected' });  // WRONG! No event field
logger.error({ event: 'ERROR' });  // WRONG! Too generic
```

**Log Levels:**
- `logger.info()` - Normal operations (most common)
- `logger.warn()` - Warning signs (high queue lag, fraud threshold hits)
- `logger.error()` - Errors needing attention (submission ingestion failures, database errors)
- `logger.fatal()` - Application crash

---

### 6. State Management (TanStack Query + Zustand)

**Server State → TanStack Query, UI State → Zustand**

**TanStack Query Key Pattern: `[domain, ...identifiers, ...filters]`**

**✅ CORRECT Patterns:**
```typescript
['users', userId]                          // Single user
['users', userId, 'submissions']           // User's submissions
['respondents', { lgaId, page: 1 }]        // Filtered respondents
['fraud-detections', 'pending']            // Pending fraud reviews
['marketplace', 'profiles', { skills }]    // Marketplace search
```

**❌ WRONG Patterns:**
```typescript
['getUser', userId]                        // WRONG! Verb prefix
['user-' + userId]                         // WRONG! String concatenation
[{ userId }]                               // WRONG! Missing domain
```

**Zustand for UI State Only:**
```typescript
// ✅ CORRECT: UI state only
export const useDashboardFiltersStore = create((set) => ({
  lgaFilter: null,
  dateRange: null,
  setLgaFilter: (lga) => set({ lgaFilter: lga }),
  setDateRange: (range) => set({ dateRange: range })
}));

// ❌ WRONG: Server data in Zustand (use TanStack Query instead)
export const useRespondentsStore = create((set) => ({
  respondents: [],  // WRONG! This is server data
  fetchRespondents: async () => { /* ... */ }  // WRONG!
}));
```

**Optimistic Updates Pattern:**
```typescript
const mutation = useMutation({
  mutationFn: updateRespondent,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['respondents', respondentId] });
    const previousData = queryClient.getQueryData(['respondents', respondentId]);
    queryClient.setQueryData(['respondents', respondentId], newData);
    return { previousData };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['respondents', respondentId], context.previousData);
  }
});
```

---

### 7. Form Validation (React Hook Form + Zod)

**Single Source of Truth: Share Zod schemas between frontend and backend**

**Shared Schema (packages/types/src/validation/respondent.ts):**
```typescript
import { z } from 'zod';
import { verhoeffCheck } from '@oslsr/utils';

export const ninSchema = z.string()
  .length(11, 'NIN must be exactly 11 digits')
  .regex(/^\d{11}$/, 'NIN must contain only digits')
  .refine(verhoeffCheck, 'Invalid NIN checksum');

export const createRespondentSchema = z.object({
  nin: ninSchema,
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  dateOfBirth: z.string().datetime(),
  phoneNumber: z.string().regex(/^\+234\d{10}$/),
  lgaId: z.string().uuid()
});
```

**Backend Validation:**
```typescript
import { createRespondentSchema } from '@oslsr/types/validation';

router.post('/respondents', async (req, res) => {
  const validated = createRespondentSchema.parse(req.body);  // Throws if invalid
  // ... proceed with validated data
});
```

**Frontend Validation:**
```typescript
import { createRespondentSchema } from '@oslsr/types/validation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm({
  resolver: zodResolver(createRespondentSchema)
});
```

---

### 8. Authentication & Security Patterns

**JWT + Redis Blacklist (Hybrid for Offline Support):**

**Why Hybrid:**
- JWT works offline for enumerators (7-day offline capability critical)
- Blacklist enables immediate revocation (terminate compromised staff)
- Refresh token rotation for added security

**Authentication Middleware:**
```typescript
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
  }

  // Check JWT blacklist (Redis)
  const tokenJti = extractJti(token);
  const isBlacklisted = await redis.sismember('jwt:blacklist', tokenJti);
  if (isBlacklisted) {
    throw new AppError('TOKEN_REVOKED', 'Token has been revoked', 401);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  next();
};
```

**Role-Based Authorization:**
```typescript
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
    next();
  };
};

// Usage
router.post('/fraud-detections/:id/review',
  authenticate,
  authorize(UserRole.VERIFICATION_ASSESSOR, UserRole.SUPER_ADMIN),
  reviewFraudDetection
);
```

**Rate Limiting Pattern:**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Marketplace rate limit (public API)
export const marketplaceRateLimit = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000,     // 1 minute
  max: 30,                 // 30 requests per minute per IP
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later'
  }
});

// Authenticated API rate limit
export const apiRateLimit = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000,
  max: 100,               // 100 requests per minute
  keyGenerator: (req) => req.user?.id || req.ip  // Per user, not per IP
});
```

**Redis Cache Key Pattern: `{domain}:{identifier}:{subresource}`**

```typescript
// ✅ CORRECT patterns
`fraud:thresholds:gps_cluster`             // Fraud threshold
`session:blacklist:${tokenJti}`            // JWT blacklist
`rate_limit:ip:${ipAddress}`               // Rate limiting
`marketplace:profile:${respondentId}`      // Cached profile

// ❌ WRONG patterns
`fraud_thresholds`                         // WRONG! No domain prefix
`sessionBlacklist-${tokenJti}`             // WRONG! Mixed separators
```

---

### 9. Testing Organization

**Frontend: Co-located tests**
```
features/auth/
├── components/
│   ├── LoginForm.tsx
│   └── LoginForm.test.tsx        # ✅ Co-located
├── hooks/
│   ├── useAuth.ts
│   └── useAuth.test.ts           # ✅ Co-located
```

**Backend: Separate __tests__ folders**
```
src/services/
├── fraud-detection.service.ts
└── __tests__/
    └── fraud-detection.service.test.ts  # ✅ Separate folder
```

**Why:** Frontend tests need test fixtures close by. Backend tests benefit from isolated `__tests__/` for cleaner service directories.

### 9a. Test Dashboard Categories (5-Stage Pipeline)

**Dashboard URL:** Generated as `test-pipeline.html` artifact in CI/CD

**The 5 Stage Categories:**
| Stage | Purpose | Blocking? |
|-------|---------|-----------|
| GoldenPath | Core functional tests (happy path) | Yes |
| Security | Auth, authorization, crypto tests | Yes |
| Contract | API contract validation | Yes |
| UI | Component rendering tests | No |
| Performance | Load, timing, SLA tests | No |

**Auto-Detection (Current - Filename Pattern):**
Tests are automatically categorized based on filename patterns:
```
security.*.test.ts    → Security
*.performance.test.ts → Performance
*.contract.test.ts    → Contract
*.ui.test.ts          → UI
*.test.ts (default)   → GoldenPath
```

**Optional Enhancement: Explicit Decorators (Future):**
For per-test control or SLA enforcement, use `@oslsr/testing` decorators:
```typescript
import { goldenPath, securityTest } from '@oslsr/testing';

// Instead of: it('should authenticate', ...)
goldenPath('should authenticate', async () => { ... });
securityTest('should reject invalid tokens', async () => { ... }, 2); // 2s SLA
```

**When to Use Decorators:**
- Tests that need explicit category override (mixed-category files)
- Tests with SLA requirements (e.g., performance-critical paths)
- Tests that need `blocking: false` flag

See `_bmad-output/TEST_DASHBOARD_DEBT.md` for full enhancement roadmap.

---

### 10. BullMQ Job Patterns

**Job Name Pattern: `{domain}-{action}` (kebab-case)**

**✅ CORRECT Patterns:**
```typescript
await queue.add('submission-ingestion', { submissionId });
await queue.add('fraud-detection', { submissionId });
await queue.add('email-notification', { userId, template: 'welcome' });
await queue.add('marketplace-export', { format: 'csv' });
```

**❌ WRONG Patterns:**
```typescript
await queue.add('process', { data });  // WRONG! Too generic
await queue.add('FRAUD_CHECK', { id });  // WRONG! SCREAMING_SNAKE_CASE
await queue.add('send_email', { to });  // WRONG! snake_case
```

**Retry Configuration (Exponential Backoff):**
```typescript
queue.add('submission-ingestion', { submissionId }, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000  // 5s, 10s, 20s
  }
});
```

---

## Project Structure Patterns

### Monorepo Organization

```
oslr_cl/
├── apps/
│   ├── web/              # React 18.3 PWA (Vite + Tailwind + shadcn/ui)
│   └── api/              # Node.js 20 + Express API
├── packages/
│   ├── types/            # Shared TypeScript types + Zod schemas
│   ├── utils/            # Shared utilities (AppError, verhoeff, UUIDv7 helpers)
│   └── config/           # Shared configuration (constants, roles, LGAs)
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   └── Dockerfile.web
└── tests/
    ├── e2e/              # Playwright E2E tests
    └── integration/      # Cross-service integration tests
```

### Feature-Based Frontend Organization (NOT Page-Based)

```
apps/web/src/
├── features/             # ✅ Feature-based (preferred)
│   ├── auth/
│   ├── enumerator-dashboard/
│   ├── fraud-review/
│   └── marketplace/
├── components/           # Shared UI components
│   ├── ui/              # shadcn/ui base components
│   ├── layout/
│   └── common/
├── hooks/               # Shared custom hooks
├── lib/                 # Utilities (api-client, query-client, store)
└── store/               # Zustand stores (UI state only)
```

**❌ WRONG: Page-based organization**
```
src/
├── pages/               # WRONG! Use features/ instead
│   ├── Login.tsx
│   └── Dashboard.tsx
```

---

## Critical Don't-Miss Rules (Anti-Patterns)

### 1. ID Strategy Violations

❌ **NEVER** use auto-increment sequences:
```typescript
id: serial('id').primaryKey()  // FORBIDDEN!
```

✅ **ALWAYS** use UUIDv7:
```typescript
id: uuid('id').primaryKey().$defaultFn(() => uuidv7())
```

### 2. Database Naming Violations

❌ **NEVER** use camelCase in database:
```typescript
firstName: text('firstName')  // FORBIDDEN!
```

✅ **ALWAYS** use snake_case:
```typescript
firstName: text('first_name')  // CORRECT
```

### 3. React Version Violations

❌ **NEVER** upgrade to React 19:
```json
"react": "^19.0.0"  // FORBIDDEN! Security vulnerabilities
```

✅ **ALWAYS** lock to React 18.3:
```json
"react": "18.3.1"  // CORRECT
```

### 4. Error Handling Violations

❌ **NEVER** throw raw Error objects:
```typescript
throw new Error('Something went wrong');  // FORBIDDEN!
```

✅ **ALWAYS** use AppError class:
```typescript
throw new AppError('VALIDATION_ERROR', 'Invalid data', 400, { fields });
```

### 5. Loading State Violations

❌ **NEVER** use generic spinners for data tables:
```typescript
if (isLoading) return <Spinner />;  // FORBIDDEN!
```

✅ **ALWAYS** use skeleton screens:
```typescript
if (isLoading) return <Skeleton className="h-32 w-full" />;
```

### 6. Logging Violations

❌ **NEVER** use console.log or string concatenation:
```typescript
console.log('User logged in: ' + userId);  // FORBIDDEN!
```

✅ **ALWAYS** use structured Pino logging:
```typescript
logger.info({ event: 'user.login', userId, role });
```

### 7. State Management Violations

❌ **NEVER** store server data in Zustand:
```typescript
const useRespondentsStore = create((set) => ({
  respondents: [],  // FORBIDDEN! Use TanStack Query
}));
```

✅ **ALWAYS** use TanStack Query for server state:
```typescript
const { data: respondents } = useQuery({
  queryKey: ['respondents'],
  queryFn: fetchRespondents
});
```

### 8. Import Violations

❌ **NEVER** import from wrong UUID package:
```typescript
import { v4 as uuidv4 } from 'uuid';  // FORBIDDEN! Wrong package
```

✅ **ALWAYS** import from uuidv7 package:
```typescript
import { uuidv7 } from 'uuidv7';  // CORRECT
```

### 9. Date Format Violations

❌ **NEVER** use Unix timestamps in APIs:
```typescript
{ timestamp: 1704297600 }  // FORBIDDEN! Hard to debug
```

✅ **ALWAYS** use ISO 8601:
```typescript
{ timestamp: '2026-01-03T14:30:00.000Z' }  // CORRECT
```

### 10. Test Organization Violations

❌ **NEVER** co-locate backend tests:
```
services/
├── fraud-detection.service.ts
└── fraud-detection.service.test.ts  // FORBIDDEN! Use __tests__/
```

✅ **ALWAYS** use __tests__ for backend:
```
services/
├── fraud-detection.service.ts
└── __tests__/
    └── fraud-detection.service.test.ts  // CORRECT
```

---

## Architecture Reference

**Source Document:** `_bmad-output/planning-artifacts/architecture.md`

**Key ADRs:**
- ADR-001: Custom Modular Monolith (Custom App with native form system) _(Amended: SCP-2026-02-05-001)_
- ~~ADR-002: ODK Integration Abstraction~~ SUPERSEDED (SCP-2026-02-05-001)
- ADR-003: Fraud Detection Engine (Pluggable heuristics, DB-backed config)
- ADR-004: Offline Data Model (Browser owns drafts, server validates)
- ADR-007: Single Database (app_db, read-only replica for marketplace) _(Amended: SCP-2026-02-05-001)_
- ADR-010: PostgreSQL Selection (UNIQUE constraints, ACID transactions, proven for fraud detection)
- ADR-011: Hetzner Infrastructure (CX43, $168/year, 73x headroom)

**Pattern Categories:**
1. Database ID Strategy (UUIDv7)
2. Naming Conventions (snake_case DB, camelCase API)
3. Project Structure (Monorepo, feature-based frontend)
4. API Response Format (Structured errors with AppError)
5. Communication Patterns (Pino logging, BullMQ jobs, TanStack Query keys, Redis cache)
6. Process Patterns (Skeleton screens, AppError, optimistic updates, exponential backoff)
7. Security Patterns (JWT + Redis blacklist, Zod validation, rate limiting)
8. Database Seeding (Hybrid dev/prod approach) - ADR-017
9. Layout Architecture (PublicLayout vs DashboardLayout) - ADR-016
10. Email Verification (Hybrid Magic Link + OTP) - ADR-015

---

## Database Seeding Patterns (ADR-017)

**CRITICAL: Seed scripts have separate dev and prod modes**

**Commands:**
```bash
pnpm db:seed:dev        # Development - includes test users with known passwords
pnpm db:seed --admin-from-env  # Staging/Production - Super Admin from env vars only
pnpm db:reset           # Full reset - drops all data, re-runs migrations + seed
pnpm db:seed:clean      # Removes only seeded data (preserves real data)
```

**Seed Data Identification:**
- All seed data MUST have `is_seeded: true` flag
- This enables surgical removal without affecting real production data

**Development Seed Credentials (Local Only):**
```
admin@dev.local / admin123     - Super Admin
enumerator@dev.local / enum123 - Test Enumerator
supervisor@dev.local / super123 - Test Supervisor
```

**Production Requirements:**
```bash
# Required environment variables for production seed
SUPER_ADMIN_EMAIL=admin@oyotradeministry.com.ng
SUPER_ADMIN_PASSWORD=<secure-password>
```

---

## Layout Architecture (ADR-016)

**THREE LAYOUT TYPES - Do not mix:**

### 1. PublicLayout
**Used for:** Homepage, About, Marketplace Landing (unauthenticated public pages)
```typescript
<PublicLayout>
  <HomePage />
</PublicLayout>
```
- Full header with Logo + "Staff Login" + "Public Register" + "Marketplace"
- Full footer with About | Contact | Privacy | NDPA Compliance

### 2. DashboardLayout
**Used for:** All authenticated role-based dashboards (Epic 2.5)
```typescript
<DashboardLayout>
  <EnumeratorDashboard />
</DashboardLayout>
```
- Header with Logo + Role Badge + Notifications + Profile + Logout
- Sidebar with role-specific navigation
- NO public website header/footer (separate experience)
- **CRITICAL: DashboardLayout does NOT provide content padding.** Every dashboard page must add `p-6` to its outermost wrapper div (e.g., `<div className="p-6 space-y-6">`). Reference: `StaffManagementPage.tsx`. Only full-bleed pages (e.g., FormFillerPage) are exempt.

**Route Structure (Epic 2.5 - Strict Role Isolation):**
```
/dashboard/super-admin/*     - Super Admin only
/dashboard/supervisor/*      - Supervisors only
/dashboard/enumerator/*      - Enumerators only
/dashboard/data-entry/*      - Data Entry Clerks only
/dashboard/assessor/*        - Verification Assessors only
/dashboard/official/*        - Government Officials only
/dashboard/public/*          - Public Users only
```

**Security:** Each role can ONLY access their own dashboard routes. Super Admin gets 360° visibility via aggregated widgets on their own dashboard, NOT by accessing other role routes. This prevents watering hole attacks where compromising one role's route could expose Super Admin.

### 3. AuthLayout
**Used for:** Login, Register, Forgot Password, Email Verification
```typescript
<AuthLayout>
  <LoginPage />
</AuthLayout>
```
- Minimal chrome: "← Back to Homepage" link only
- Centered card layout
- No header/footer (focused experience)

**ROUTING PATTERN (Updated for Epic 2.5):**
```typescript
// Public routes
{ path: '/', element: <PublicLayout><HomePage /></PublicLayout> },

// Auth routes
{ path: '/login', element: <AuthLayout><LoginPage /></AuthLayout> },

// Dashboard routes - ROLE-SPECIFIC (Epic 2.5)
{ path: '/dashboard/super-admin/*', element: <ProtectedRoute allowedRoles={['super_admin']}><DashboardLayout><SuperAdminRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/supervisor/*', element: <ProtectedRoute allowedRoles={['supervisor']}><DashboardLayout><SupervisorRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/enumerator/*', element: <ProtectedRoute allowedRoles={['enumerator']}><DashboardLayout><EnumeratorRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/data-entry/*', element: <ProtectedRoute allowedRoles={['data_entry_clerk']}><DashboardLayout><DataEntryRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/assessor/*', element: <ProtectedRoute allowedRoles={['verification_assessor']}><DashboardLayout><AssessorRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/official/*', element: <ProtectedRoute allowedRoles={['government_official']}><DashboardLayout><OfficialRoutes /></DashboardLayout></ProtectedRoute> },
{ path: '/dashboard/public/*', element: <ProtectedRoute allowedRoles={['public_user']}><DashboardLayout><PublicUserRoutes /></DashboardLayout></ProtectedRoute> },

// Redirect /dashboard to role-specific dashboard
{ path: '/dashboard', element: <DashboardRedirect /> },  // Redirects based on user.role
```

---

## Email Verification Pattern (ADR-015)

**Hybrid Approach: Magic Link + OTP in Same Email**

When a user registers via email (not Google OAuth), send ONE email containing BOTH:
1. **Magic Link** (primary) - one-click verification
2. **6-digit OTP** (fallback) - for when links don't work

```typescript
// Single email, user chooses whichever works
await emailService.send({
  template: 'hybrid-verification',
  data: {
    magicLink: `${APP_URL}/verify-email?token=${token}`,
    otpCode: '847592',
    expiresIn: '15 minutes'
  }
});
```

**Google OAuth users skip email verification** (Google already verified the email).

---

## Rate Limit Configuration Reference

**All rate limits are skipped in test mode** (`NODE_ENV=test` or `VITEST=true`)

### Authentication Rate Limits

| Endpoint | Limiter | Window | Max | Purpose |
|----------|---------|--------|-----|---------|
| POST `/auth/staff/login` | `strictLoginRateLimit` | 1 hour | 10 | Blocks sustained brute-force |
| POST `/auth/staff/login` | `loginRateLimit` | 15 min | 5 | Blocks burst attacks |
| POST `/auth/public/login` | `strictLoginRateLimit` | 1 hour | 10 | Same as staff |
| POST `/auth/public/login` | `loginRateLimit` | 15 min | 5 | Same as staff |
| POST `/auth/refresh` | `refreshRateLimit` | 1 min | 10 | Prevents token abuse |

### Registration Rate Limits

| Endpoint | Limiter | Window | Max | Purpose |
|----------|---------|--------|-----|---------|
| POST `/auth/register` | `registrationRateLimit` | 15 min | 5 | Prevents mass registration |
| POST `/auth/verify-email` | `verifyEmailRateLimit` | 15 min | 10 | Prevents verification abuse |
| POST `/auth/resend-verification` | `resendVerificationRateLimit` | 1 hour | 3 | Prevents email spam |

### Password Reset Rate Limits

| Endpoint | Limiter | Window | Max | Purpose |
|----------|---------|--------|-----|---------|
| POST `/auth/forgot-password` | `passwordResetRateLimit` | 1 hour | 10 | Prevents email enumeration |
| POST `/auth/reset-password` | `passwordResetCompletionRateLimit` | 15 min | 5 | Prevents token brute-force |
| POST `/auth/validate-reset-token` | `passwordResetCompletionRateLimit` | 15 min | 5 | Same as reset |

### Public API Rate Limits

| Endpoint | Limiter | Window | Max | Purpose |
|----------|---------|--------|-----|---------|
| GET `/users/verify/:id` | `publicVerificationRateLimit` | 1 min | 30 | Public ID card verification |

### Rate Limit Response Format

```json
{
  "status": "error",
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests, please try again later"
}
```

**HTTP Status:** 429 Too Many Requests

**Headers:**
- `Retry-After`: Seconds until rate limit resets
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when window resets

---

## ESM Import Conventions (Critical for Backend)

**CRITICAL: TypeScript ESM modules require `.js` extensions in relative imports**

The API package uses ES Modules (`"type": "module"` in package.json). When TypeScript compiles, it does NOT rewrite import paths. This means you MUST include `.js` extensions in import statements even though the source files are `.ts`.

**✅ CORRECT: Include .js extension**
```typescript
// In apps/api/src/db/seeds/index.ts
import { db, pool } from '../index.js';       // Resolves to ../index.ts at compile time
import { roles, lgas } from '../schema/index.js';
import { hashPassword } from '@oslsr/utils';  // Workspace imports work without extension
```

**❌ WRONG: Missing .js extension (will fail at runtime)**
```typescript
// This FAILS with: Cannot find module '../index'
import { db, pool } from '../index';
import { roles, lgas } from '../schema/index';
```

**Why This Pattern:**
1. TypeScript with `"moduleResolution": "NodeNext"` or `"Node16"` requires explicit extensions
2. Node.js ESM loader does NOT auto-resolve extensions like CommonJS did
3. Workspace package imports (`@oslsr/utils`) resolve via pnpm workspace protocol
4. Third-party imports (`drizzle-orm`, `pino`) resolve via node_modules

**Where This Applies:**
- All files in `apps/api/src/` (relative imports between local files)
- Does NOT apply to: `@oslsr/*` workspace imports, `npm` packages

**Quick Fix Pattern:**
```bash
# If you see "Cannot find module" errors, check for missing .js extensions
# Add .js to relative imports that are failing
```

---

## Development Workflow

**Package Manager:** pnpm (NOT npm, NOT yarn)

**Monorepo Commands:**
```bash
pnpm install              # Install all dependencies
pnpm build                # Build all workspaces in dependency order
pnpm test                 # Run all tests
pnpm lint                 # Run ESLint across all workspaces
```

**Development Servers:**
```bash
# Terminal 1: API server with hot reload
cd apps/api && pnpm dev

# Terminal 2: Frontend dev server (Vite HMR)
cd apps/web && pnpm dev

# Terminal 3: BullMQ workers
cd apps/api && pnpm workers:dev

# Terminal 4: Docker services (PostgreSQL + Redis)
docker compose -f docker/docker-compose.dev.yml up
```

**Git Workflow:**
- Branch naming: `feature/`, `fix/`, `refactor/`
- Commit messages: Conventional Commits format
- PR requirements: Tests pass, no ESLint errors, reviewed by 1+ person

---

## User Skill Level Notes (Awwal - Intermediate, MERN Background)

**Technologies New to You:**
- **Drizzle ORM:** SQL-like syntax (familiar to raw SQL), replaces Mongoose
- **TanStack Query:** Auto caching/refetching (replaces manual useEffect + useState)
- **Zustand:** Simpler than Redux (no actions/reducers, just direct state updates)
- **Pino:** Structured logging (JSON objects instead of console.log strings)
- **UUIDv7:** Time-ordered UUIDs (replaces MongoDB ObjectID or auto-increment)

**Architecture Differences from MERN:**
- PostgreSQL instead of MongoDB (relational, strict schemas, UNIQUE constraints)
- Drizzle ORM instead of Mongoose (TypeScript-first, migration-based)
- Offline-first PWA (7-day client-side operation, IndexedDB, service workers)
- Single database (app_db with native form schemas as JSONB, full referential integrity)
- Job queue (BullMQ) for async processing (fraud detection, submission ingestion)

---

---

## NIN Validation Pattern (Modulus 11 Algorithm)

**CRITICAL: Nigerian NINs use Modulus 11, NOT Verhoeff**

The PRD originally specified Verhoeff checksum, but testing with real government-issued NINs revealed Nigerian NINs use **Modulus 11** with weights 10, 9, 8, 7, 6, 5, 4, 3, 2, 1.

**Validation Function:**
```typescript
import { modulus11Check } from '@oslsr/utils/src/validation';

// Validate a NIN
const isValid = modulus11Check('61961438053'); // true
```

**Test Helper (ALWAYS use for NIN generation in tests):**
```typescript
import { generateValidNin } from '@oslsr/testing/helpers/nin';

// ~9% of random seeds produce invalid check digit 10
// This helper retries automatically
const nin = generateValidNin();
```

**Why This Matters:**
- ~9% of random 10-digit base numbers produce check digit 10 (invalid for single digit)
- Direct `modulus11Generate(randomSeed)` will throw errors ~9% of the time
- ALWAYS use the `generateValidNin()` helper in tests

**Known Valid NINs (for test fixtures):**
```typescript
import { KNOWN_VALID_NINS } from '@oslsr/testing/helpers/nin';
// ['61961438053', '21647846180']
```

**Algorithm Reference:** See `docs/SESSION-NOTES-2026-01-25-STORY-1-11-COMPLETION.md`

---

## Epic Validation Checkpoints (Operationalized Lessons)

**CRITICAL: Every epic must include these validation gates**

### 1. Spec Validation Checkpoint (Story 3)
After 3 stories, validate that implementation assumptions match real-world data:
- Test with REAL production data samples (not synthetic)
- Verify external API integrations with actual responses
- Confirm algorithm implementations against authoritative sources

**Example (NIN validation):**
```markdown
## Spec Validation Checkpoint
- [ ] Tested NIN validation with 5+ real government-issued NINs
- [ ] Confirmed checksum algorithm matches NIMC specification
- [ ] Validated phone number formats with real Nigerian numbers
```

### 2. Spec Compliance Review (50% Stories)
After 50% of stories complete, compare implementation against spec:
- Run gap analysis against PRD requirements
- Verify IA document compliance (navigation, footer, content)
- Check for missed acceptance criteria

**Checklist:**
```markdown
## Spec Compliance Review
- [ ] All PRD functional requirements mapped to stories
- [ ] IA document navigation structure implemented
- [ ] No undocumented features added (scope creep check)
- [ ] All acceptance criteria testable
```

### 3. Security Review (Before Story Completion)
For stories tagged `[SECURITY]`, require adversarial code review:
- Timing attack analysis
- Input validation review
- Authentication/authorization audit
- Rate limiting verification

**Security Stories in Epics:**
- Story 1-11: Email Invitation System `[SECURITY]`
- ~~Story 2-4: Encrypted ODK Token Management~~ SUPERSEDED (SCP-2026-02-05-001)

---

## Adversarial Code Review Checklist

**Use this checklist for all `[SECURITY]` tagged stories:**

### Authentication & Authorization
- [ ] All endpoints have proper authentication middleware
- [ ] Authorization checks use role-based access control
- [ ] No privilege escalation paths exist
- [ ] Session tokens properly invalidated on logout

### Cryptographic Operations
- [ ] Use `crypto.timingSafeEqual()` for secret comparison (NOT `===`)
- [ ] Tokens use cryptographically secure random generation
- [ ] Passwords hashed with bcrypt (10-12 rounds)
- [ ] No secrets in logs or error messages

### Input Validation
- [ ] All inputs validated with Zod schemas
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (output encoding)
- [ ] File uploads validated (type, size, content)

### Rate Limiting
- [ ] Brute-force protection on auth endpoints
- [ ] API rate limits match documented thresholds
- [ ] Rate limit bypass not possible via headers

### Error Handling
- [ ] Errors don't leak sensitive information
- [ ] Stack traces not exposed in production
- [ ] Generic errors for auth failures (no user enumeration)

---

## Database Migration Gotchas

### Column Type Changes Require Manual Migration

**CRITICAL:** When changing a column's data type (e.g., `text` → `bytea`), Drizzle's `db:push` and `db:migrate` cannot auto-convert. PostgreSQL requires explicit casting.

**Example (Story 2-1 → 2-2):**
- `questionnaire_files.file_blob` was changed from `text` (base64) to `bytea` (binary) for efficiency
- `db:push` failed with: `column "file_blob" cannot be cast automatically to type bytea`
- PostgreSQL hint: `You might need to specify "USING file_blob::bytea"`

**Fix:** Run manual SQL with explicit cast:
```sql
-- Check if table has data first
SELECT COUNT(*) FROM table_name;

-- If empty or data is compatible, alter with USING clause
ALTER TABLE table_name
ALTER COLUMN column_name TYPE new_type
USING column_name::new_type;
```

**Prevention Checklist:**
1. When changing column types in schema, immediately create manual migration SQL
2. Test `db:push` in dev environment before committing schema changes
3. Document type changes in story Dev Notes for reviewers
4. Consider data migration strategy if column has existing data

**Common Type Change Scenarios:**
| From | To | USING Clause |
|------|-----|--------------|
| `text` | `bytea` | `column::bytea` (only if text is valid hex/base64) |
| `text` | `integer` | `column::integer` (only if text contains numbers) |
| `varchar(n)` | `text` | Usually auto-converts (safe) |
| `integer` | `bigint` | Usually auto-converts (safe) |

---

## Team Agreements & Process Guardrails

> Source: Combined Epic 2+2.5 Retrospective (2026-02-10)
> These are MANDATORY standards. All AI agents and developers must follow them.

### UI/Component Standards (A1-A3)

1. **Every AlertDialog modal MUST include an explicit Cancel button.** No dismiss-only modals. Users must always have a clear escape path.

2. **Skeleton loading layouts MUST match the shape of actual content.** A skeleton for a table must look like a table. A skeleton for a card grid must look like a card grid. No generic spinners for structured content.

3. **Test selectors: text content, `data-testid`, and ARIA roles ONLY.** Never use CSS classes, internal component names, or DOM structure for test selectors. This makes tests resilient to styling/refactoring changes.

### Story Sizing & Planning (A4-A5)

4. **Stories exceeding 15 tasks MUST be split.** If task breakdown produces >15 items, stop and split the story before writing any code. The split cost is always less than the scope explosion cost. (Lesson: Story 2.5-3 exploded from 13 to 21 tasks.)

5. **External integration epics MUST start with a spike story.** The spike validates the critical *user-facing* capability end-to-end (not just API connectivity). Only after the spike succeeds should production-quality stories be created. (Lesson: ODK pivot — 5 stories superseded because we built bottom-up without validating the preview path.)

### Quality & UAT (A6)

6. **Structured UAT after every story.** Product owner walks through acceptance criteria on the running application (local or staging). Findings are documented in the story file. Unit tests passing does NOT mean the system works. (Lesson: 53 RBAC tests passed while 3 roles couldn't access their dashboards.)

### Process Guardrails (from Retrospective)

7. **Spike-first for external integrations.** Before investing in adapter layers, webhooks, or service clients for any external system, build a throwaway vertical spike that proves the critical user path works.

8. **Spec compliance check at mid-epic.** Halfway through any epic, PO reviews implemented work against the PRD/UX spec to catch drift before it compounds.

9. **Previous retrospective action items are reviewed first** at every new retrospective. Each item must be marked as: done, irrelevant, or carried forward (with assigned story).

10. **Shared constants for cross-boundary values.** Role names, status enums, error codes, and any value used by both API and Web must be defined in `packages/types` as a single source of truth. Never hardcode these strings in application code. (Lesson: Frontend used `admin`, database used `super_admin` — 3 roles broken at runtime.)

---

**DOCUMENT STATUS:** ✅ READY FOR AI AGENT IMPLEMENTATION

**Last Updated:** 2026-02-10

**Version:** 1.6.0 (Added: Team Agreements A1-A6, Process Guardrails from Epic 2+2.5 retrospective. Prep phase for Epic 3.)
