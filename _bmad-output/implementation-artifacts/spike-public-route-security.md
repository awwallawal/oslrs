# Public Route Security Spike — Threat Model & Control Design

**Date:** 2026-03-06
**Author:** Dev Agent (prep-5-public-route-security-spike)
**Consumers:** Stories 7-2 (Search), 7-4 (Contact Reveal + CAPTCHA), 7-6 (Logging + Rate Limiting)
**Status:** Complete

---

## 1. Threat Model — Marketplace Routes

### 1.1 Route Inventory & Data Exposure

| # | Route | Method | Auth | Data Exposed | Risk Level |
|---|-------|--------|------|-------------|------------|
| R1 | `/marketplace` | GET | None | Anonymous profiles: profession, skills, lga_name, experience_level, verified_badge, bio, portfolio_url | HIGH — bulk data target |
| R2 | `/marketplace/profile/:id` | GET | None | Same as R1 for single profile | MEDIUM — enumeration target |
| R3 | `/marketplace/profile/:id/reveal` | POST | JWT + CAPTCHA | PII: first_name, last_name, phone_number (via respondents JOIN, requires consent_enriched=true) | HIGH — PII exposure |
| R4 | `/marketplace/profile/:id/edit-token` | POST | CAPTCHA | Triggers SMS with edit token to respondent's phone | MEDIUM — SMS abuse vector |
| R5 | `/marketplace/profile/:id` | PUT | Edit token | Updates bio, portfolio_url, consent_enriched | LOW — single-use token auth |

### 1.2 Attack Vectors Per Route

#### R1: `GET /marketplace` (Search/List)

| Attack Vector | Description | Impact | Likelihood |
|--------------|-------------|--------|------------|
| **Scraping** | Automated bulk harvest of all profiles via paginated requests | Full registry exfiltration (anonymous data) | HIGH |
| **Search injection** | Malicious tsvector/tsquery input to manipulate search results | Query errors, potential info disclosure | LOW (plainto_tsquery is safe) |
| **Enumeration via filters** | Systematically querying every LGA + profession combination | Build complete profile map | MEDIUM |
| **Cache poisoning** | Crafted queries to bloat Redis cache | Memory exhaustion on 2GB VPS | LOW |
| **PII leakage** | Error messages exposing column names, stack traces | Internal schema disclosure | LOW (if error sanitization applied) |

#### R2: `GET /marketplace/profile/:id` (Single Profile View)

| Attack Vector | Description | Impact | Likelihood |
|--------------|-------------|--------|------------|
| **ID enumeration** | Sequential/dictionary probing of profile UUIDs | Map all profiles; prelude to reveal abuse | MEDIUM (UUIDs resist sequential probing) |
| **Scraping** | Automated fetching of all profile detail pages | Full profile data harvest | MEDIUM |
| **Timing attack** | Response time differences for existing vs non-existing IDs | Confirm profile existence | LOW |

#### R3: `POST /marketplace/profile/:id/reveal` (Contact Reveal)

| Attack Vector | Description | Impact | Likelihood |
|--------------|-------------|--------|------------|
| **Bulk PII harvest** | Automated reveal requests across many profiles | Mass phone number/name exfiltration | HIGH |
| **CAPTCHA solving services** | Use of 2captcha/anticaptcha to bypass hCaptcha | Programmatic PII access | MEDIUM |
| **Account sharing** | Multiple users sharing one account to pool 50/day limit | Circumvent per-user rate limit | LOW |
| **Token theft** | Stolen JWT used for reveals from different device | Unauthorized PII access | LOW (fingerprint logging detects) |

#### R4: `POST /marketplace/profile/:id/edit-token` (Request Edit Token)

| Attack Vector | Description | Impact | Likelihood |
|--------------|-------------|--------|------------|
| **SMS bombing** | Repeated requests to exhaust SMS credits or harass respondent | Financial cost, user harassment | HIGH |
| **Phone enumeration** | Observe response differences to confirm phone number existence | Indirect PII disclosure | MEDIUM |
| **CAPTCHA bypass** | Automated token requests via solving services | Enable SMS flooding | LOW |

#### R5: `PUT /marketplace/profile/:id` (Edit Profile)

| Attack Vector | Description | Impact | Likelihood |
|--------------|-------------|--------|------------|
| **Token brute force** | Guess 32-char random token | Unauthorized profile edit | NEGLIGIBLE (2^192 entropy) |
| **Replay attack** | Reuse expired/used token | Unauthorized edit | LOW (single-use + 90-day expiry) |
| **Content injection** | Malicious bio/URL content (XSS, phishing links) | Harm to profile viewers | MEDIUM |

### 1.3 Mitigations & Residual Risk

| Attack Vector | Mitigation | Residual Risk |
|--------------|-----------|---------------|
| Scraping (R1, R2) | IP rate limiting (30/min search, 100/min profile view), cursor pagination, no total count | Determined scraper with IP rotation can extract ~4,300 profiles/day per IP. Acceptable — data is anonymous. |
| Search injection | `plainto_tsquery()` only (hard rule), parameterized queries via Drizzle `sql` template | None — plainto_tsquery has no operator parsing. |
| ID enumeration | UUIDs (not sequential), consistent 404 response time, no existence confirmation in errors | UUIDs have 2^122 entropy. Brute force infeasible. |
| Bulk PII harvest (R3) | JWT auth + CAPTCHA + 50 reveals/24h/user + device fingerprint logging | CAPTCHA solving services (~$2/1000). At 50/day limit, an attacker harvests max 50 contacts/day/account. Acceptable. |
| SMS bombing (R4) | CAPTCHA + 3 requests/day/NIN rate limit | Max 3 SMS per respondent per day. Acceptable. |
| Cache poisoning | Normalize + hash cache keys, cap cache entries, 5-min TTL auto-eviction | Redis memory bounded by key count cap. |
| Content injection (R5) | Zod validation (max length, URL format), output encoding, CSP | XSS prevented by React's default escaping + CSP. Phishing URLs are a residual risk mitigated by URL display (not auto-linking). |
| CAPTCHA bypass | Progressive difficulty escalation after failures, enterprise hCaptcha as future option | Current free tier is adequate for government registry traffic. Upgrade if abuse detected. |
| Timing attacks | Consistent response structure for 404 and 200 (same fields, same shape) | Negligible risk for anonymous data. |

### 1.4 Data Exposure Rules

| Visibility Level | Data Fields | Access Requirements |
|-----------------|-------------|-------------------|
| **Public (no auth)** | profession, skills, lga_name, experience_level, verified_badge, bio, portfolio_url | None — requires consent_marketplace=true in extraction |
| **Authenticated + CAPTCHA** | + first_name, last_name, phone_number | JWT auth + CAPTCHA + consent_enriched=true on profile |
| **Never exposed via marketplace** | NIN, date_of_birth, home_address, survey responses, fraud scores | No marketplace route serves this data |

---

## 2. Rate Limiting Architecture

### 2.1 Tiered Rate Limits

| Route | Limit | Window | Key | Redis Pattern | Source |
|-------|-------|--------|-----|--------------|--------|
| `GET /marketplace` (search) | 30 req | 1 min | IP | `rl:marketplace:search:{ip}` | architecture.md |
| `GET /marketplace/profile/:id` (view) | 100 req | 1 min | IP | `rl:marketplace:view:{ip}` | story spec |
| `POST /marketplace/profile/:id/reveal` | 50 reveals | 24 hr | User ID | `rl:marketplace:reveal:{userId}` | architecture.md, epics.md |
| `POST /marketplace/profile/:id/edit-token` | 3 req | 24 hr | NIN (hashed) | `rl:marketplace:edittoken:{sha256(nin)}` | architecture.md |
| `PUT /marketplace/profile/:id` | 10 req | 1 hr | IP | `rl:marketplace:edit:{ip}` | defensive default |

### 2.2 Redis Key Patterns

Following existing convention (`rl:login:`, `rl:register:`, `rl:export:`, etc.):

```
rl:marketplace:search:{ip}          → counter, TTL 60s
rl:marketplace:view:{ip}            → counter, TTL 60s
rl:marketplace:reveal:{userId}      → counter, TTL 86400s (24hr)
rl:marketplace:edittoken:{ninHash}  → counter, TTL 86400s (24hr)
rl:marketplace:edit:{ip}            → counter, TTL 3600s (1hr)
```

**NIN hashing for edit-token key:** The NIN is PII and must not be stored as a Redis key in plaintext. Use `HMAC-SHA256(JWT_SECRET, nin)` as the key suffix — plain SHA-256 of an 11-digit NIN (~2^37 combinations) is brute-forceable in seconds; HMAC with a server secret prevents offline reversal even if Redis keys are exposed. Any existing server secret (e.g., `JWT_SECRET`) can serve as the HMAC key.

**Edit-token rate limit data flow:** The NIN is provided in the request body (the user proves identity by supplying their NIN to request an edit token). The `keyGenerator` reads `req.body.nin` after body parsing — this requires `express.json()` to run before the rate limiter in the middleware chain. This differs from IP-based limiters and must be documented in the route setup.

### 2.3 Integration with Existing Stack

Each marketplace rate limiter follows the **exact same pattern** as existing middleware:

```typescript
// apps/api/src/middleware/marketplace-rate-limit.ts
// Pattern matches: login-rate-limit.ts, registration-rate-limit.ts, export-rate-limit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'marketplace-rate-limit' });

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.E2E === 'true';
const shouldSkipRateLimit = () => isTestMode();

let redisClient: Redis | null = null;

const getRedisClient = () => {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

export const marketplaceSearchRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:marketplace:search:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    status: 'error',
    code: 'MARKETPLACE_RATE_LIMIT_EXCEEDED',
    message: 'Too many search requests. Please try again shortly.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'marketplace.search_rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false },
  skip: shouldSkipRateLimit,
});
```

**Implementation note:** Create ONE file `marketplace-rate-limit.ts` with all 5 rate limiters exported. This follows the same single-file-per-domain pattern used by `login-rate-limit.ts` (3 limiters) and `registration-rate-limit.ts` (3 limiters).

### 2.4 429 Error Response Format

Match existing JSON error shape with `code` field:

```json
{
  "status": "error",
  "code": "MARKETPLACE_RATE_LIMIT_EXCEEDED",
  "message": "Too many search requests. Please try again shortly."
}
```

This matches the existing project convention (`status: 'error'` string, not numeric status code — see `login-rate-limit.ts:37-40`, `registration-rate-limit.ts:37-40`). The `retryAfter` information is conveyed via `express-rate-limit`'s `standardHeaders: true` which sets `RateLimit-*` HTTP headers — no need to duplicate in the JSON body.

### 2.5 IP-Based vs Fingerprint-Based Limiting

**Decision: IP-based for all public routes. Fingerprint logging (not limiting) for reveal.**

| Route | Primary Key | Rationale |
|-------|------------|-----------|
| Search (R1) | IP | Unauthenticated — IP is the only identifier. Fingerprinting adds bundle size for anonymous read-only data. |
| Profile view (R2) | IP | Same rationale as search. |
| Contact reveal (R3) | User ID | Authenticated — user ID is authoritative. Device fingerprint logged for audit trail but not used as rate-limit key (avoids false positives from fingerprint instability). |
| Edit token (R4) | NIN hash | Rate limit is per-respondent (per-NIN), not per-requester. Prevents any requester from bombing a specific respondent. |
| Profile edit (R5) | IP | Token-authed — IP is sufficient defensive layer. |

---

## 3. CAPTCHA Strategy

### 3.1 Reuse Existing hCaptcha Infrastructure

The existing CAPTCHA stack in `middleware/captcha.ts` is fully reusable:

- **Provider:** hCaptcha (free tier)
- **Server-side:** `HCAPTCHA_SECRET_KEY` validation via `https://hcaptcha.com/siteverify`
- **Client-side:** `VITE_HCAPTCHA_SITE_KEY` widget rendering
- **Middleware variants:** `verifyCaptcha` (required) and `optionalCaptcha` (monitoring)
- **Test bypass:** `'test-captcha-bypass'` token for automated tests
- **CSP:** hcaptcha.com domains already whitelisted in app.ts:93-126

**No new CAPTCHA library, service, or env vars needed.**

### 3.2 CAPTCHA Trigger Conditions

| Route | CAPTCHA Behavior | Middleware | Rationale |
|-------|-----------------|-----------|-----------|
| `GET /marketplace` (search) | After 10 searches per session | Controller-level (see §3.3) | Allow casual browsing, gate automated scraping |

> **Note:** The existing `optionalCaptcha` middleware (captcha.ts:129-141) is not suitable here because the search CAPTCHA is conditional on a Redis counter, not on token presence. The conditional logic (check counter → require/validate CAPTCHA → reset counter) must live in the controller. See §3.3 for the implementation pattern.
| `GET /marketplace/profile/:id` (view) | None | — | Anonymous read of public data, rate limit sufficient |
| `POST /marketplace/profile/:id/reveal` | Always required | `verifyCaptcha` | PII access gate — never skip |
| `POST /marketplace/profile/:id/edit-token` | Always required | `verifyCaptcha` | Prevents SMS bombing |
| `PUT /marketplace/profile/:id` | None | — | Token-authed, single-use token is sufficient |

### 3.3 Search CAPTCHA Session Tracking

**Challenge:** How to track "10 searches per session" for unauthenticated users?

**Decision: IP-based counter in Redis with 5-minute sliding window.**

```
Key:    captcha:marketplace:search:{ip}
Value:  integer counter
TTL:    300 seconds (5 minutes)
```

**Implementation approach:**

```typescript
// In marketplace search controller (not middleware — needs conditional logic)
const searchCountKey = `captcha:marketplace:search:${req.ip}`;
const searchCount = parseInt(await redis.get(searchCountKey) || '0');

if (searchCount >= 10) {
  // CAPTCHA required — validate captcha token from request body/header
  const captchaToken = req.headers['x-captcha-token'] || req.body?.captchaToken;
  if (!captchaToken) {
    return res.status(428).json({
      status: 428,
      code: 'CAPTCHA_REQUIRED',
      message: 'Please complete the CAPTCHA to continue searching.',
      captchaRequired: true,
    });
  }
  // Validate via existing hCaptcha verification logic
  const isValid = await verifyCaptchaToken(captchaToken);
  if (!isValid) {
    return res.status(403).json({
      status: 403,
      code: 'CAPTCHA_FAILED',
      message: 'CAPTCHA verification failed. Please try again.',
    });
  }
  // Reset counter on successful CAPTCHA
  await redis.del(searchCountKey);
}

// Increment search counter
await redis.multi().incr(searchCountKey).expire(searchCountKey, 300).exec();
```

**Why IP-based, not cookie/localStorage?**
- Cookies can be cleared by bots between requests
- localStorage is client-side only — trivially spoofable
- IP is server-side, reliable, and consistent with the rate-limit key strategy
- Shared IP (corporate NAT) may trigger CAPTCHA earlier — acceptable trade-off since CAPTCHA is not a block, just a challenge

**Why 428 (Precondition Required)?**
- 401 implies authentication needed (wrong — search is public)
- 403 implies permanent denial (wrong — user can complete CAPTCHA)
- 428 explicitly means "the server requires a precondition to be met" — semantically correct
- Client can detect `captchaRequired: true` to render the CAPTCHA widget

> **Caveat:** RFC 6585 defines 428 for conditional request headers (`If-Match`, etc.), not application-level preconditions. This is a non-standard usage. If API consumers find it confusing, 403 with `code: 'CAPTCHA_REQUIRED'` is a safe fallback — the client should key off the `code` field, not the HTTP status.

### 3.4 Progressive CAPTCHA Escalation

**Current recommendation: Do NOT implement progressive difficulty at launch.**

Rationale:
- hCaptcha free tier does not expose difficulty controls via API
- Enterprise tier (paid) provides `setDifficulty()` — evaluate only if abuse metrics warrant it
- The combination of rate limiting + CAPTCHA + IP blocking provides sufficient defense at current scale
- Progressive escalation adds frontend complexity (difficulty state management, widget reconfiguration)

**Future trigger for escalation:**
- If monitoring (Story 6-2 Prometheus metrics) shows >100 CAPTCHA-solved requests/hour from a single IP range, evaluate enterprise tier or IP blocklist.

### 3.5 CSP Implications

**No CSP changes needed.** The existing Helmet configuration already includes all required hCaptcha domains:

- `scriptSrc`: `https://hcaptcha.com`, `https://*.hcaptcha.com`
- `styleSrc`: `https://hcaptcha.com`, `https://*.hcaptcha.com`
- `frameSrc`: `https://hcaptcha.com`, `https://*.hcaptcha.com`
- `connectSrc`: `https://hcaptcha.com`, `https://*.hcaptcha.com`

**CSP enforcement mode decision:** Keep report-only for Epic 7. Switching to enforcement should be a separate, tested change after verifying no legitimate resources are blocked. This is a P3 item for post-Epic 7.

---

## 4. Bot Detection Strategy

### 4.1 Device Fingerprinting Decision

**Decision: Header-based heuristics only. No client-side fingerprinting library.**

| Option | Bundle Size | RAM Impact | Accuracy | Complexity |
|--------|------------|------------|----------|-----------|
| FingerprintJS (free) | ~30KB gzipped | Minimal | High (99.5%) | Medium — client SDK + server validation |
| Custom canvas/WebGL | ~5KB | Minimal | Medium (85%) | High — cross-browser maintenance |
| **Header-based heuristics** | **0KB** | **Negligible** | **Low-Medium (70%)** | **Low — server-side only** |

**Rationale for header-based:**
1. **Current scale doesn't justify it.** VPS at 26% RAM, ~1K concurrent public users target. A full fingerprinting library is premature optimization.
2. **Anonymous data exposure is low-risk.** Marketplace profiles contain profession/skills/LGA — not PII. The cost of scraping this data is low, so the defense should be proportional.
3. **Contact reveal (the PII route) already has 3 layers:** JWT auth + CAPTCHA + 50/day rate limit. Adding fingerprinting as a 4th layer provides diminishing returns.
4. **Bundle size matters.** 30KB gzipped is significant for a government portal targeting mobile users on Nigerian networks.

**What we DO implement:** Log request headers for the reveal endpoint to enable post-hoc abuse analysis.

```typescript
// Logged on every contact reveal (R3)
interface RevealAuditFields {
  searcher_id: string;
  profile_id: string;
  ip_address: string;
  user_agent: string;
  accept_language: string;
  // Derived heuristic score (not used for blocking, just logging)
  bot_score: number; // 0-100, higher = more likely bot
}
```

**Bot score heuristics (logging only, not blocking):**
- Missing `Accept-Language` header: +30
- Missing `Accept-Encoding` header: +20
- User-Agent matches known bot pattern: +40
- User-Agent is empty or generic: +30
- No `Referer` header on reveal request: +10
- **Cap total at 100** — `Math.min(sum, 100)` to stay within defined 0-100 range

**Upgrade path:** If bot_score analysis reveals automated abuse patterns post-launch, add FingerprintJS for the reveal endpoint only (R3). This is a targeted upgrade, not a full-site deployment.

### 4.2 Honeypot Fields

**Design for search form:**

```html
<!-- Hidden via CSS (not display:none — some bots detect that) -->
<div style="position: absolute; left: -9999px;" aria-hidden="true">
  <label for="website">Website</label>
  <input type="text" name="website" id="website" tabindex="-1" autocomplete="off" />
</div>
```

**Server-side validation:**

```typescript
// In marketplace search controller
if (req.query.website || req.body?.website) {
  // Honeypot triggered — bot detected
  logger.warn({ ip: req.ip }, 'Marketplace honeypot triggered');
  // Return normal-looking empty results (don't reveal detection)
  return res.json({ data: [], pagination: { hasMore: false } });
}
```

**Key design decisions:**
- Field name `website` — plausible form field that bots auto-fill
- `aria-hidden="true"` — screen readers skip it (accessibility)
- `tabindex="-1"` — keyboard navigation skips it
- Positioned off-screen, not `display:none` (bots detect hidden elements)
- Server returns 200 with empty results, not 403 (don't reveal detection to bot operators)

### 4.3 User-Agent Validation

**Approach: Log and allow search engines. Block empty UA on non-search routes.**

```typescript
// Known bot patterns to LOG (not block on search routes — SEO needs crawling)
const KNOWN_BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i,
  /curl/i, /wget/i, /python-requests/i, /httpie/i,
  /postman/i, /insomnia/i,
];

// Search engine bots to ALLOW (SEO — marketplace pages should be indexed)
const SEARCH_ENGINE_PATTERNS = [
  /googlebot/i, /bingbot/i, /yandexbot/i, /duckduckbot/i,
];
```

**Route-specific behavior:**

| Route | Empty UA | Known Bot | Search Engine | Unknown UA |
|-------|---------|-----------|---------------|-----------|
| Search (R1) | Allow (log) | Allow (log) | Allow | Allow |
| Profile view (R2) | Allow (log) | Allow (log) | Allow | Allow |
| Contact reveal (R3) | Reject 400 | Reject 403 | Reject 403 | Allow |
| Edit token (R4) | Reject 400 | Reject 403 | Reject 403 | Allow |
| Profile edit (R5) | Reject 400 | Reject 403 | Reject 403 | Allow |

**Rationale:** Search and profile view routes must be bot-friendly for SEO. The PII and action routes (reveal, edit-token, edit) should reject obvious bots since no legitimate use case exists.

### 4.4 Pagination Safety

**Decision: Offset-based pagination with hard caps (per prep-4 spike decision).**

| Parameter | Constraint | Rationale |
|-----------|-----------|-----------|
| `page_size` | Max 100, default 20 | Prevent bulk extraction via large pages |
| `page` | Integer >= 1 | Standard offset pagination |
| **No total count** | `totalCount` field omitted | Prevents attackers from knowing registry size |
| **No unbounded offset** | Max offset = page_size * 100 (10,000 results deep) | Prevents deep scraping; legitimate users rarely go beyond page 10 |

**Response shape:**

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

**Note:** prep-4 spike explicitly chose offset-based over cursor-based pagination, overriding the architecture.md suggestion. This is documented and accepted — offset is simpler for the frontend and the max-depth cap mitigates the scraping concern that cursors were meant to address.

### 4.5 Scale Assessment

**Full fingerprinting library is NOT needed at current scale.**

- Target: 1K concurrent public users, ~300K searchable profiles
- VPS: 2GB RAM, 26% utilization
- The combination of IP rate limiting + CAPTCHA + honeypot + UA validation provides adequate defense
- Fingerprinting should be added reactively based on abuse metrics from Story 6-2 monitoring, not proactively

---

## 5. Search Input Validation & Injection Prevention

### 5.1 Zod Schema for Marketplace Search

```typescript
import { z } from 'zod';

export const marketplaceSearchSchema = z.object({
  query: z
    .string()
    .max(200, 'Search query too long')
    .transform((s) => s.trim())
    .optional()
    .default(''),
  lga: z
    .string()
    .max(100)
    .optional(),
  profession: z
    .string()
    .max(200)
    .optional(),
  experience_min: z
    .coerce.number()
    .int()
    .min(0)
    .max(50)
    .optional(),
  experience_max: z
    .coerce.number()
    .int()
    .min(0)
    .max(50)
    .optional(),
  page: z
    .coerce.number()
    .int()
    .min(1)
    .max(500)
    .default(1),
  page_size: z
    .coerce.number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  // Honeypot — must be empty
  website: z
    .string()
    .max(0)
    .optional(),
}).refine(
  (data) => !data.experience_min || !data.experience_max || data.experience_min <= data.experience_max,
  { message: 'experience_min must be <= experience_max', path: ['experience_min'] }
);
```

**Validation notes:**
- `query` is optional — empty query returns filter-only browse results (per prep-4 Section 2.3)
- `lga` validated against LGA codes at the service layer (not in Zod — requires DB lookup)
- `profession` validated against known professions list at service layer
- `page * page_size` capped at 10,000 to prevent deep scraping (enforced in controller)
- `website` honeypot field — any non-empty value triggers bot detection

### 5.2 tsvector Injection Prevention

**Hard rule: ALWAYS use `plainto_tsquery()`. NEVER use `to_tsquery()` for user input.**

| Function | Operator Parsing | Injection Risk | Use Case |
|----------|-----------------|----------------|----------|
| `to_tsquery()` | YES — parses `&`, `\|`, `!`, `<->` | **VULNERABLE** if user input passed directly | Internal/admin queries with controlled input only |
| `plainto_tsquery()` | NO — treats all input as plain text | **SAFE by design** | All user-facing search |
| `websearch_to_tsquery()` | Limited — Google-like syntax | Low risk but unnecessary complexity | Not recommended |

**Safe query pattern (Drizzle):**

```typescript
// SAFE — parameterized query with plainto_tsquery
const results = await db
  .select()
  .from(marketplaceProfiles)
  .where(
    sql`${marketplaceProfiles.searchVector} @@ plainto_tsquery('english', ${query})`
  )
  .orderBy(
    sql`ts_rank(${marketplaceProfiles.searchVector}, plainto_tsquery('english', ${query})) DESC`
  )
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

**Why this is safe:**
1. `plainto_tsquery()` has no operator syntax — input like `'; DROP TABLE --` becomes a plain text search for those literal words
2. Drizzle's `sql` template tag parameterizes all interpolated values — the `${query}` becomes a `$1` parameter, never interpolated into the SQL string
3. Double protection: even if one layer fails, the other prevents injection

**pg_trgm queries are equally safe:**

```typescript
// SAFE — parameterized similarity query
const results = await db
  .select()
  .from(marketplaceProfiles)
  .where(
    sql`similarity(${marketplaceProfiles.profession}, ${query}) > 0.3`
  );
```

The `similarity()` function takes a plain string argument, parameterized by Drizzle. No injection vector.

### 5.3 Error Response Sanitization

**Public route errors must NEVER expose:**
- Internal column names (e.g., `search_vector`, `respondent_id`)
- PostgreSQL error codes or query plans
- Stack traces
- File paths

**Implementation pattern:**

```typescript
// Public route error handler (separate from authenticated API error handler)
function marketplaceErrorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Log full error internally
  logger.error({ err, path: req.path, ip: req.ip }, 'Marketplace route error');

  // Return sanitized error to client
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.statusCode,
      code: err.code,
      message: err.message,
    });
  }

  // Generic 500 for unexpected errors — no details
  return res.status(500).json({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  });
}
```

**Specific sanitization rules:**
- 404 for non-existent profiles: `{ code: "NOT_FOUND", message: "Profile not found" }` — no indication of whether the ID format was valid
- Validation errors: Return Zod error messages (these are safe — they describe input format, not internal schema)
- Database errors: Always map to generic 500 — never pass through PostgreSQL error messages

---

## 6. Environment Variables & Infrastructure

### 6.1 New Environment Variables

**Decision: No new env vars required for marketplace security.**

| Considered Variable | Decision | Rationale |
|--------------------|----------|-----------|
| `MARKETPLACE_SEARCH_RATE_LIMIT` | NOT NEEDED | Hardcode 30/min. Rate limits are security controls, not user-configurable settings. Changing them requires deliberate code review. |
| `FINGERPRINT_API_KEY` | NOT NEEDED | No client-side fingerprinting library. Header-based heuristics are server-side only. |
| `MARKETPLACE_CAPTCHA_THRESHOLD` | NOT NEEDED | Hardcode 10 searches. Same rationale as rate limits. |

All marketplace security controls use existing infrastructure:
- `HCAPTCHA_SECRET_KEY` — already in production
- `VITE_HCAPTCHA_SITE_KEY` — already in production
- `REDIS_URL` — already in production (rate limit storage)

**This means prep-2's env var safety script requires no updates for marketplace security.**

### 6.2 pg_trgm Extension

**Required for typo-tolerance fallback (prep-4 decision).**

```sql
-- Run once on production PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Verification:** Check if already installed:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

**Action for Story 7-1:** Include `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in the marketplace migration. This is idempotent — safe to run multiple times. The extension is included in standard PostgreSQL distributions (including the Docker image used in production).

### 6.3 Redis Memory Impact

**Estimated additional Redis memory for marketplace rate limiting:**

| Key Pattern | Max Keys | Key Size | TTL | Memory |
|-------------|----------|----------|-----|--------|
| `rl:marketplace:search:{ip}` | ~1K concurrent IPs | ~40 bytes | 60s | ~40KB |
| `rl:marketplace:view:{ip}` | ~1K concurrent IPs | ~38 bytes | 60s | ~38KB |
| `rl:marketplace:reveal:{userId}` | ~200 active users | ~42 bytes | 24hr | ~8KB |
| `rl:marketplace:edittoken:{hash}` | ~50 requests/day | ~80 bytes | 24hr | ~4KB |
| `captcha:marketplace:search:{ip}` | ~1K concurrent IPs | ~42 bytes | 300s | ~42KB |
| `marketplace:search:{queryHash}` | ~500 unique queries | ~2KB (cached results) | 300s | ~1MB |
| **Total** | | | | **~1.1MB** |

**Assessment:** Negligible impact. Redis currently uses a fraction of the 2GB VPS RAM. The 5-minute search cache (~1MB) is the largest component and self-evicts via TTL.

---

## 7. Implementation Reference — Middleware Stack Per Route

### Route Middleware Chains

```typescript
// apps/api/src/routes/marketplace.routes.ts

// R1: Public search — rate limit + conditional CAPTCHA + honeypot
router.get('/marketplace',
  marketplaceSearchRateLimit,      // 30/min/IP
  marketplaceSearchController      // Handles CAPTCHA check + honeypot internally
);

// R2: Public profile view — rate limit only
router.get('/marketplace/profile/:id',
  marketplaceViewRateLimit,        // 100/min/IP
  marketplaceProfileController
);

// R3: Authenticated contact reveal — full security stack
router.post('/marketplace/profile/:id/reveal',
  authenticateToken,                // JWT verification (existing middleware)
  marketplaceRevealRateLimit,       // 50/24hr/user
  verifyCaptcha,                    // hCaptcha (existing middleware)
  validateUserAgent,                // Reject bots on action routes
  marketplaceRevealController       // Logs audit trail with headers
);

// R4: Edit token request — CAPTCHA + NIN rate limit
router.post('/marketplace/profile/:id/edit-token',
  marketplaceEditTokenRateLimit,    // 3/24hr/NIN
  verifyCaptcha,                    // hCaptcha (existing middleware)
  validateUserAgent,                // Reject bots on action routes
  marketplaceEditTokenController
);

// R5: Edit profile — token auth + rate limit
router.put('/marketplace/profile/:id',
  marketplaceEditRateLimit,         // 10/hr/IP
  validateUserAgent,                // Reject bots on action routes
  marketplaceEditController         // Token validation inside controller
);
```

### New Middleware Files (to be created in implementation stories)

| File | Exports | Story |
|------|---------|-------|
| `middleware/marketplace-rate-limit.ts` | `marketplaceSearchRateLimit`, `marketplaceViewRateLimit`, `marketplaceRevealRateLimit`, `marketplaceEditTokenRateLimit`, `marketplaceEditRateLimit` | 7-2 (search), 7-4 (reveal), 7-6 (rate limiting) |
| `middleware/marketplace-bot-detection.ts` | `validateUserAgent` | 7-6 |

### Existing Middleware Reused (no changes needed)

| File | Export | Used By |
|------|--------|---------|
| `middleware/captcha.ts` | `verifyCaptcha` | R3 (reveal), R4 (edit-token) |
| `middleware/auth.middleware.ts` | `authenticateToken` | R3 (reveal) |

---

## 8. Open Questions Resolved

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Device fingerprinting library? | **No. Header-based heuristics only.** | Current scale (26% RAM, ~1K users) doesn't justify 30KB bundle. Upgrade reactively if monitoring shows abuse. |
| 2 | Progressive CAPTCHA? | **No. Standard difficulty at launch.** | hCaptcha free tier doesn't expose difficulty API. Sufficient defense with rate limits + CAPTCHA + IP blocking. |
| 3 | Search CAPTCHA session tracking? | **IP-based Redis counter, 5-min window.** | Server-side, reliable, consistent with rate-limit strategy. |
| 4 | Honeypot field design? | **Hidden `website` field, positioned off-screen.** | Classic effective pattern. Server returns empty results (not 403) to avoid revealing detection. |
| 5 | New env vars? | **None.** | All controls use existing infra (Redis, hCaptcha, Helmet). |
| 6 | CSP enforcement? | **Keep report-only for Epic 7.** | Enforcement is a separate change requiring thorough testing. |

---

## 9. Summary — Security Controls by Story

### Story 7-2: Public Marketplace Search Interface
- `marketplaceSearchRateLimit` (30/min/IP)
- CAPTCHA after 10 searches (IP-based counter)
- Honeypot field on search form
- `plainto_tsquery()` only (hard rule)
- Zod validation schema
- No total count in pagination response
- Max 10,000 results depth

### Story 7-4: Authenticated Contact Reveal & CAPTCHA
- `authenticateToken` (JWT required)
- `verifyCaptcha` (always required)
- `marketplaceRevealRateLimit` (50/24hr/user)
- `validateUserAgent` (reject obvious bots)
- Audit logging with headers (UA, Accept-Language, IP)
- Bot score calculation (logging only)
- consent_enriched check before returning PII

### Story 7-6: Contact View Logging & Rate Limiting
- All 5 rate limiters in `marketplace-rate-limit.ts`
- `validateUserAgent` middleware
- Header-based bot scoring (logged to contact_views table)
- Redis memory within negligible bounds (~1.1MB)
- Prometheus metrics integration (counters for rate-limit hits, CAPTCHA triggers, bot detections)
