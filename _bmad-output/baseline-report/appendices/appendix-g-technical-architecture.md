# APPENDIX G: TECHNICAL ARCHITECTURE DOCUMENTATION

---

## G.1 System Architecture

### G.1.1 Architecture Pattern

The OSLSR platform employs a **modular monolith architecture** — a single deployable unit with clear internal module boundaries. This pattern was selected over microservices based on:

- Project scale (200+ concurrent staff users, 1,000 concurrent public users)
- Single-VPS deployment simplicity
- Reduced operational complexity for government handover

### G.1.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | 20 LTS | Server-side JavaScript runtime |
| **Framework** | Express.js | Latest | REST API framework |
| **Frontend** | React | 18.3 | User interface library |
| **Build** | Vite | 6.x | Frontend build tool with HMR |
| **Styling** | Tailwind CSS | v4 | Utility-first CSS framework |
| **Components** | shadcn/ui (Radix) | Latest | Accessible component library |
| **State** | TanStack Query | Latest | Server state management |
| **Forms** | React Hook Form + Zod | Latest | Form handling with validation |
| **Routing** | React Router | v7 | Client-side routing |
| **ORM** | Drizzle ORM | 1.x | TypeScript-first database ORM |
| **Database** | PostgreSQL | 15 | Primary relational database |
| **Cache** | Redis | 7 | Caching, rate limiting, sessions |
| **Queue** | BullMQ | Latest | Async job processing |
| **Logging** | Pino | 9.x | Structured JSON logging |
| **Metrics** | prom-client | Latest | Prometheus-compatible metrics |
| **Security** | Helmet | Latest | HTTP security headers |
| **Auth** | JWT + bcrypt | Latest | Token auth + password hashing |
| **IDs** | UUIDv7 | Latest | Time-ordered unique identifiers |
| **Validation** | Zod | 3.x | Shared frontend/backend schemas |
| **Package Mgr** | pnpm | 9.x | Fast, disk-efficient package manager |
| **Monorepo** | Turborepo | Latest | Monorepo build orchestration |

### G.1.3 Repository Structure

```
oslrs/
├── apps/
│   ├── api/                     # Backend application
│   │   ├── src/
│   │   │   ├── controllers/     # Route handlers
│   │   │   ├── services/        # Business logic
│   │   │   ├── routes/          # Route definitions
│   │   │   ├── middleware/       # Auth, validation, rate limiting
│   │   │   ├── db/              # Database schema, migrations
│   │   │   ├── jobs/            # BullMQ job processors
│   │   │   └── utils/           # Shared utilities
│   │   └── tests/               # API test suites
│   │
│   └── web/                     # Frontend application
│       ├── src/
│       │   ├── features/        # Feature modules
│       │   │   ├── auth/        # Authentication
│       │   │   ├── dashboard/   # Analytics dashboards
│       │   │   ├── staff/       # Staff management
│       │   │   ├── survey/      # Survey form engine
│       │   │   ├── marketplace/ # Public marketplace
│       │   │   ├── fraud/       # Fraud detection UI
│       │   │   ├── payments/    # Remuneration
│       │   │   ├── messaging/   # Team messaging
│       │   │   ├── id-cards/    # ID card generation
│       │   │   └── monitoring/  # System health
│       │   ├── components/      # Shared UI components
│       │   ├── hooks/           # Shared React hooks
│       │   └── lib/             # Utility libraries
│       └── tests/               # Frontend test suites
│
├── packages/
│   └── types/                   # Shared TypeScript types
│       └── src/
│           ├── schemas/         # Zod validation schemas
│           ├── enums/           # Shared enum definitions
│           └── index.ts         # Package exports
│
├── docs/                        # Project documentation
├── scripts/                     # Deployment & utility scripts
└── turbo.json                   # Turborepo configuration
```

---

## G.2 Database Architecture

### G.2.1 Core Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | Staff accounts (8 roles) | id (UUIDv7), email, password_hash, role, lga_id, status |
| `respondents` | Registry entries | id (UUIDv7), nin (unique), phone, lga_id, status |
| `submissions` | Survey responses | id (UUIDv7), respondent_id, enumerator_id, data (JSONB), channel |
| `audit_logs` | Immutable action log | id (UUIDv7), user_id, action, target, metadata, prev_hash, hash |
| `fraud_flags` | Automated detection results | id, submission_id, flag_type, severity, reviewer_id, resolution |
| `payments` | Staff remuneration | id, user_id, amount, bank_ref, receipt_url, status |
| `messages` | Team messaging | id, sender_id, recipient_id, content, read_at |
| `marketplace_profiles` | Public skills directory | respondent_id, bio, portfolio_url, consent_tier |
| `contact_logs` | Marketplace contact reveals | id, viewer_ip, profile_id, captcha_verified |

### G.2.2 Key Database Design Decisions

| Decision | Rationale |
|----------|-----------|
| **UUIDv7 primary keys** | Time-ordered for natural sorting; no sequential ID enumeration vulnerability |
| **JSONB for survey data** | Flexible schema accommodates survey version changes without migrations |
| **NIN UNIQUE constraint** | Database-level deduplication across all submission channels |
| **Audit log hash chaining** | SHA-256 hash of each entry includes previous entry's hash — tamper-evident chain |
| **Database triggers on audit_logs** | PREVENT UPDATE, DELETE, TRUNCATE — immutability enforced at database level |
| **Parameterised queries only** | Drizzle ORM prevents SQL injection; zero string concatenation in queries |
| **Full-text search (PostgreSQL)** | GIN-indexed tsvector for marketplace skills search — no external search engine needed |

---

## G.3 Authentication Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 AUTHENTICATION FLOW                            │
│                                                                │
│  CLIENT                         SERVER                        │
│  ──────                         ──────                        │
│                                                                │
│  1. POST /auth/login                                          │
│     { email, password }  ──────────▶  Verify bcrypt hash      │
│                                       │                       │
│                          ◀────────────┘                       │
│     Response:                         Generate:               │
│     • access_token (JWT,              • 15-min access token   │
│       15-min expiry)                  • 7-day refresh token   │
│     • refresh_token                   • Store JTI in Redis    │
│       (httpOnly cookie)                                       │
│                                                                │
│  2. API Request                                               │
│     Authorization: Bearer {token}                             │
│     Cookie: refresh_token={token}                             │
│            ──────────▶  Verify JWT signature                  │
│                          Check JTI not in blacklist            │
│                          Verify role permissions               │
│                          Enforce LGA scope                    │
│                                                                │
│  3. Token Refresh                                             │
│     POST /auth/refresh                                        │
│     Cookie: refresh_token                                     │
│            ──────────▶  Verify refresh token                  │
│                          Issue new access token               │
│                          Rotate refresh token                 │
│                                                                │
│  4. Logout                                                    │
│     POST /auth/logout                                         │
│            ──────────▶  Add JTI to Redis blacklist            │
│                          Clear httpOnly cookie                │
│                                                                │
│  5. Password Change                                           │
│     POST /auth/change-password                                │
│            ──────────▶  Revoke ALL active sessions            │
│                          (All JTIs blacklisted)               │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## G.4 Offline Architecture (PWA)

```
┌──────────────────────────────────────────────────────────────┐
│              PWA OFFLINE ARCHITECTURE                          │
│                                                                │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  SERVICE WORKER                                        │   │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ Cache Strategy    │  │ Background Sync           │  │   │
│  │  │ • App shell cached│  │ • Submissions queued in   │  │   │
│  │  │ • API responses   │  │   IndexedDB when offline  │  │   │
│  │  │   cached (stale-  │  │ • Auto-sync when online   │  │   │
│  │  │   while-revalidate│  │ • Conflict resolution     │  │   │
│  │  │ • Skills taxonomy │  │   (server wins)           │  │   │
│  │  │   pre-cached      │  │ • 7-day offline capacity  │  │   │
│  │  └──────────────────┘  └──────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  INDEXEDDB (Browser Storage)                           │   │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │   │
│  │  │ Pending           │  │ Form State               │  │   │
│  │  │ Submissions       │  │ • Auto-save per question │  │   │
│  │  │ • Full survey data│  │ • Resume capability      │  │   │
│  │  │ • GPS coordinates │  │ • Draft management       │  │   │
│  │  │ • Timestamps      │  │                          │  │   │
│  │  └──────────────────┘  └──────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                                │
│  ONLINE ──▶ Submissions sent immediately to API               │
│  OFFLINE ──▶ Submissions stored in IndexedDB                  │
│  RECONNECT ──▶ Background sync uploads all pending            │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## G.5 Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              PRODUCTION DEPLOYMENT                             │
│              DigitalOcean VPS (Ubuntu 24.04 LTS)              │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  NGINX (Reverse Proxy)                                │    │
│  │  • SSL termination (TLS 1.2+)                        │    │
│  │  • Rate limiting (IP-based)                           │    │
│  │  • Static asset serving (React build)                 │    │
│  │  • Security headers (CSP, HSTS, X-Frame-Options)     │    │
│  │  • GZIP compression                                   │    │
│  │  • /api → localhost:3000                              │    │
│  │  • /socket.io/ → localhost:3000 (WebSocket upgrade)   │    │
│  └──────────────────────────┬───────────────────────────┘    │
│                              │                                 │
│  ┌──────────────────────────┴───────────────────────────┐    │
│  │  PM2 (Process Manager)                                │    │
│  │  • Node.js application (apps/api)                    │    │
│  │  • Auto-restart on crash                              │    │
│  │  • Log rotation                                       │    │
│  │  • Cluster mode capability                            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ PostgreSQL  │  │    Redis     │  │  BullMQ Workers   │   │
│  │   15        │  │  (Docker)    │  │  • Backup jobs    │   │
│  │ Local install│  │  Port 6379  │  │  • Fraud detection│   │
│  │ Port 5432   │  │  AOF persist │  │  • Email delivery │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  CRON JOBS                                            │    │
│  │  02:00 WAT — pg_dump → S3 encrypted backup           │    │
│  │  06:00 WAT — SSL certificate expiry check             │    │
│  │  Hourly    — System health metrics collection         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

---

## G.6 Quality Assurance Summary

| Metric | Value |
|--------|:-----:|
| **Total automated tests** | 3,564 |
| **API unit & integration tests** | 1,471 |
| **Frontend component & hook tests** | 2,093 |
| **Pass rate** | 100% |
| **OWASP Top 10 categories assessed** | 10 of 10 |
| **OWASP categories rated SECURE** | 10 of 10 |
| **Test framework** | Vitest |
| **CI pipeline** | Automated test + lint + audit on every commit |

---

## G.7 API Endpoint Summary

| Module | Endpoints | Auth Required | Methods |
|--------|:---------:|:------------:|---------|
| Authentication | 6 | Mixed | POST, GET |
| Staff Management | 12 | Admin+ | GET, POST, PATCH, DELETE |
| Survey/Submissions | 8 | Enumerator+ | GET, POST |
| Respondents | 6 | Supervisor+ | GET, PATCH |
| Fraud Detection | 5 | Supervisor+ | GET, PATCH |
| Marketplace | 5 | Public/Auth | GET, POST |
| Payments | 7 | Admin+ | GET, POST, PATCH |
| Messaging | 4 | Supervisor+ | GET, POST |
| Analytics | 6 | Admin+ | GET |
| System Health | 4 | Super Admin | GET |
| Audit Logs | 3 | Super Admin | GET |
| ID Cards | 3 | Admin+ | GET, POST |
| **Total** | **69** | | |

---

*Document Reference: CHM/OSLR/2026/001 | Appendix G | Chemiroy Nigeria Limited*
