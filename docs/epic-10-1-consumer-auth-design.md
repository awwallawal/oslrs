# Epic 10 Story 10-1 — Consumer Authentication Layer (Design Brief)

**Status:** Design brief for review. Pre-story artefact. Produces the story file once Awwal approves.

**Scope:** Establish the authentication substrate for third-party MDA access to OSLRS APIs. This design underpins all subsequent Epic 10 stories (10-2 rate limiting, 10-3 admin UI, 10-4 developer portal, 10-5 data-sharing agreements, 10-6 consumer audit dashboard).

---

## 1. Problem statement

Today, every OSLRS API endpoint authenticates callers as **human users via JWT**. There is no mechanism for a third-party service (e.g., Nigerian Bureau of Statistics, NIMC NIN-verification cross-check, Oyo State Bureau of Statistics, a future Ministry of Labour integration) to call OSLRS programmatically under its own machine identity, with scoped permissions, rate limits separate from human users, and a distinct audit trail.

Story 10-1 introduces that substrate. Without it, the rest of Epic 10 has no foundation.

---

## 2. Decision: scoped API keys (not OAuth2, not mTLS)

**Recommendation:** Opaque, scoped API keys issued per consumer.

| Option | Verdict | Reasoning |
|---|---|---|
| **Scoped API keys** (bearer tokens) | **Selected** | Simple to issue, document, and rotate. Consumers do one thing — send `Authorization: Bearer <key>`. Works for expected consumer count (3–10 MDAs, not thousands). Proven pattern. |
| **OAuth2 client-credentials grant** | Rejected for MVP | Richer standards compliance, but requires a token endpoint, refresh semantics, client registration UI, and discovery. Overhead unjustified at expected scale. Door remains open to add this as an enhancement if consumer count grows. |
| **Mutual TLS (mTLS)** | Rejected | Most secure, but worst developer experience. Requires PKI, certificate management, rotation coordination with external MDAs. Overkill and raises the bar on the consumer's side to a level that would slow adoption. |

**If Awwal prefers OAuth2 for standards-compliance optics with NDPC or NITDA, flag now — it doubles the scope of Story 10-1 but is doable.**

---

## 3. Key format and storage

### 3.1 Format

- 32 bytes of cryptographic randomness, base64url-encoded → ~43-character string
- Prefixed with environment-identifying slug for observability: `oslrs_prod_<key>`
- Example: `oslrs_prod_K7g2X9...`

### 3.2 Storage

- **At rest:** SHA-256 hash of the key stored in `api_consumers.key_hash`. Plaintext key is shown to the super-admin *exactly once* at creation time, then never retrievable.
- **In transit:** HTTPS only (enforced by existing Helmet CSP + HSTS).
- **In client systems:** Consumer MDA stores the key as an environment secret. The data-sharing agreement (Story 10-5) includes a clause requiring secure storage.

### 3.3 Rotation

- Default rotation cadence: **90 days**, with a **7-day overlap window** where both the old and new key are valid simultaneously
- Super-admin can force-rotate at any time (e.g., on suspected compromise)
- Rotation UI lives in Story 10-3

---

## 4. Scope taxonomy

Scopes are the contract between OSLRS and consumers. Each scope represents a **class of data access** with legal, privacy, and rate-limit implications. Initial scopes proposed:

| Scope | Data returned | PII level | Typical consumer | Default rate limit (from 10-2) |
|---|---|---|---|---|
| `aggregated_stats:read` | Labour market statistics, counts, rates, trends. Cell-suppression for <5 values (already implemented in Story 8). | None (aggregated) | NBS, Oyo State Bureau of Statistics, research bodies | 1,000 calls/day |
| `marketplace:read_public` | Same data as unauthenticated public marketplace: anonymised skill profiles, non-PII fields only | None | Employment platforms, gov job-matching services | 5,000 calls/day |
| `registry:verify_nin` | Given an NIN, returns boolean `{ registered: true|false }` with no further PII | Minimal (NIN input; boolean output) | NIMC cross-check, other MDAs verifying registration status | 10,000 calls/day |
| `submissions:read_aggregated` | Fraud-scored submission counts, quality scores, by LGA/period. No individual records. | None | Supervisor agencies, internal analytics partners | 500 calls/day |
| `submissions:read_pii` | Individual records with full PII, subject to data-sharing agreement | **Full PII** | Only specific MDAs with signed DPA (e.g., Ministry of Labour for case investigations) | 100 calls/day (highest sensitivity, lowest default) |

### 4.1 Scope assignment rules

- A consumer can hold **multiple scopes**
- Each scope on a consumer's key is individually enabled/disabled by super-admin
- Adding `submissions:read_pii` to a consumer's scope set **requires** a signed Data-Sharing Agreement per Story 10-5. The admin UI will enforce this as a precondition check.
- **New scopes** added in future go through the same admin provisioning flow

### 4.2 Deferred for later (not MVP)

- Fine-grained LGA-scoping per consumer (e.g., "consumer X can only read Ibadan North")
- Time-bounded scopes (e.g., "this access expires at month-end")
- IP allowlist per consumer

These are reasonable future enhancements; keep the data model extensible to accommodate them.

---

## 5. Middleware design

### 5.1 New middleware: `apiKeyAuth`

Location: `apps/api/src/middleware/apiKeyAuth.ts`

Responsibilities:
1. Extract `Authorization: Bearer <key>` header
2. If absent or malformed → respond `401 API_KEY_MISSING`
3. Hash the key (SHA-256) and look up in `api_consumers.key_hash`
4. If no match → respond `401 API_KEY_INVALID`
5. If match is revoked → respond `401 API_KEY_REVOKED`
6. If match has expired → respond `401 API_KEY_EXPIRED`
7. Populate `req.apiConsumer = { id, name, scopes, rateLimit, ... }`
8. Proceed

### 5.2 Scope-check helper: `requireScope(scopeName)`

Usage in routes:

```ts
router.get('/api/v1/public/stats',
  apiKeyAuth,
  requireScope('aggregated_stats:read'),
  statsController.getAggregated);
```

If scope missing → respond `403 API_KEY_SCOPE_INSUFFICIENT`.

### 5.3 Dual-principal awareness

Some endpoints may serve *either* a human user (JWT) *or* an API consumer (key). For the MVP, keep them distinct — API consumers call dedicated `/api/v1/public/*` or `/api/v1/partner/*` routes that only accept `apiKeyAuth`. Do **not** try to make a single endpoint accept both in Story 10-1.

### 5.4 Interaction with existing `authMiddleware`

- `authMiddleware` (user JWT) and `apiKeyAuth` (machine) are mutually exclusive on any given route
- A request with both headers is ambiguous → reject with `400 AMBIGUOUS_AUTH`

---

## 6. Data model

### 6.1 New tables

```sql
-- Consumer identity
CREATE TABLE api_consumers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                    -- "National Bureau of Statistics"
  contact_email TEXT NOT NULL,
  contact_person TEXT,
  organisation_type TEXT NOT NULL,              -- "government_mda", "research_body", "private_sector"
  status TEXT NOT NULL DEFAULT 'active',        -- "active", "suspended", "revoked"
  data_sharing_agreement_url TEXT,              -- link to signed DSA for this consumer
  data_sharing_agreement_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keys (one consumer may have multiple, e.g., during rotation)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID NOT NULL REFERENCES api_consumers(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,                -- SHA-256 hex
  key_prefix TEXT NOT NULL,                     -- first 8 chars after env slug, for display
  scopes TEXT[] NOT NULL,                       -- e.g., ['aggregated_stats:read', 'marketplace:read_public']
  expires_at TIMESTAMPTZ,                       -- NULL = no expiry (super-admin managed)
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_api_keys_consumer_active ON api_keys(consumer_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
```

### 6.2 Drizzle schema placement

`apps/api/src/db/schema/apiConsumers.ts` — standalone file following existing schema-per-domain pattern. No imports from `@oslsr/types` (per auto-memory rule). Types are defined inline with `InferSelectModel`/`InferInsertModel`.

### 6.3 Audit log extension

The existing `audit_logs` table (Epic 6) has a `user_id` column. Extend with:

```sql
ALTER TABLE audit_logs
  ADD COLUMN consumer_id UUID REFERENCES api_consumers(id),
  ADD CONSTRAINT audit_principal_exclusive
    CHECK (
      (user_id IS NOT NULL AND consumer_id IS NULL)
      OR (user_id IS NULL AND consumer_id IS NOT NULL)
      OR (user_id IS NULL AND consumer_id IS NULL)  -- system events
    );
```

All existing audit code keeps working unchanged. New code called from API-consumer paths passes `consumerId` instead of `userId`.

---

## 7. Error semantics

| HTTP code | Error code | Meaning |
|---|---|---|
| 400 | `AMBIGUOUS_AUTH` | Both user JWT and API key provided |
| 401 | `API_KEY_MISSING` | No `Authorization` header or wrong scheme |
| 401 | `API_KEY_INVALID` | Key not found |
| 401 | `API_KEY_REVOKED` | Key was revoked |
| 401 | `API_KEY_EXPIRED` | Key has expired |
| 403 | `API_KEY_SCOPE_INSUFFICIENT` | Key valid but does not include required scope |
| 429 | `API_RATE_LIMIT_EXCEEDED` | (Story 10-2 responsibility, noted here for completeness) |

All responses follow existing OSLRS error envelope (`{ code, message, details? }`). No sensitive information leaks in error messages (never confirm "this key exists but is suspended" — treat as generic invalid).

---

## 8. Non-goals for Story 10-1

Explicitly deferred to other stories to keep 10-1 scoped:

- **Per-consumer rate limiting** → Story 10-2 (will read `req.apiConsumer.id` from this middleware)
- **Admin UI for provisioning** → Story 10-3 (will use the service layer this story builds)
- **Developer portal** → Story 10-4
- **Data-sharing agreement template** → Story 10-5 (legal-drafting story)
- **Consumer audit dashboard** → Story 10-6
- **Self-service key rotation by consumers** → deferred (super-admin-managed in MVP)
- **Federated identity / OIDC** → deferred (not in scope of Epic 10)

---

## 9. Testing strategy

- **Unit tests** for `apiKeyAuth` middleware (all branches: missing, invalid, expired, revoked, valid)
- **Unit tests** for `requireScope` helper
- **Integration test** for a sample protected endpoint (once 10-4 routes exist; for 10-1, a test-only endpoint suffices)
- **Database test** for `api_consumers` / `api_keys` schema constraints (audit_principal_exclusive CHECK)
- **Security test:** timing-safe comparison for key hash lookup (use `crypto.timingSafeEqual` or equivalent ORM-level protection)

Target coverage: match existing controller/middleware baseline (~85%+).

---

## 10. Open questions for Awwal

Before I create the story file, confirm:

1. **Auth model — scoped API keys or OAuth2 client-credentials?** My recommendation is API keys. Confirm or redirect.
## Answer: 
API Keys 
2. **Initial scopes — the 5 proposed in Section 4?** Add, remove, or rename? The scope names are contract-level commitments to external MDAs, so worth getting right now.
## Answer
It is okay since it can be made extensible. Or is it possible to include the options you want to defer so that we know we have done it once and for all and we create a UI interface where we can check and uncheck the previledges for each API Users. How can we operationalize this? 
3. **Who provisions consumer keys post-Transfer?** Options:
   - (a) Only Awwal / OSLRS super-admin — highest security, bottleneck if Awwal is unavailable
   - (b) Ministry ICT lead after a brief training — better continuity
   - (c) Ministry ICT lead, with two-person approval required for `submissions:read_pii` scope
   My recommendation: **(c)**.
## Answer
I Accept your recommendation 
4. **Default rate-limit numbers in Section 4 table** — reasonable, or adjust? These are starting points; adjustable per-consumer via Story 10-3.
## Answer
Since it is adjustable that's great! 
5. **Key rotation cadence — 90 days acceptable?** Industry norm is 60–180 days. 90 is middle-of-road.
## Answer
Let us use the industry standard of 180 days which can be revoke or reduced by the admin and a mail sent to the API User on the decision reached by the Admin
6. **Should expired/revoked keys auto-prune after a retention period, or keep indefinitely for audit?** My recommendation: **keep indefinitely**. Audit value > storage cost.
## Answer 
I accept your recommendation 

---

## 11. Acceptance criteria preview (for the story file)

Once approved, these become the Story 10-1 ACs:

- AC1: `api_consumers` and `api_keys` tables exist with constraints listed in Section 6
- AC2: `apiKeyAuth` middleware enforces all error semantics in Section 7
- AC3: `requireScope` helper rejects requests missing required scope with 403
- AC4: Audit log extension allows `consumer_id` as alternative principal, enforced by CHECK constraint
- AC5: Sample partner endpoint (e.g., `GET /api/v1/partner/_healthcheck` requiring no scope, returning 200 for any valid key) demonstrates end-to-end wiring
- AC6: Unit + integration tests cover all middleware branches and the sample endpoint
- AC7: No regressions in the existing test suite (4,191 tests)
- AC8: Story documentation: each file touched, each DB change, every ADR-worthy decision recorded inline in the story Dev Notes

---

## 12. Estimated sequencing downstream

Once 10-1 ships, the other stories unblock in this order:

1. **10-2** (rate limiting) — depends on `req.apiConsumer` from 10-1
2. **10-4** (developer portal) — can start once 10-1 + 10-2 are in (needs working endpoints to document)
3. **10-5** (data-sharing agreement template) — parallelizable with 10-4, largely a drafting task (Iris co-authors)
4. **10-3** (admin UI) — depends on 10-1 service layer
5. **10-6** (consumer audit dashboard) — depends on audit log extension in 10-1 + several days of traffic in 10-3

---

## 13. Drafting notes

- This is a design brief only. The story file (`_bmad-output/implementation-artifacts/10-1-api-consumer-auth.md`) will be created after Awwal's approval on the questions in Section 10.
- If the auth model changes to OAuth2, this brief is replaced wholesale; the decision in Section 2 is load-bearing.
- If the scope taxonomy in Section 4 changes, the admin UI (10-3), the data-sharing agreement (10-5), and the documentation (10-4) all pivot.

---

*Design brief prepared: 2026-04-21. Awaiting Awwal's decisions on Section 10 before story creation.*
