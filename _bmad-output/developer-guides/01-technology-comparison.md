# Technology Comparison Chart
## MERN + Vercel/Render vs OSLSR Self-Hosted Stack

**Purpose:** This document maps your existing MERN stack knowledge to OSLSR's self-hosted architecture, showing what you know vs what's new.

**Your Background:** MERN stack developer using Vercel (frontend) + Render (backend) with automatic GitHub deployments.

---

## High-Level Architecture Comparison

### What You Know: MERN + PaaS Workflow

```
┌─────────────────────────────────────────────────────┐
│ YOUR LOCAL MACHINE                                  │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │ Development                                 │   │
│  │ - React (npm run dev)                      │   │
│  │ - Express API (nodemon)                    │   │
│  │ - MongoDB (local or Atlas)                 │   │
│  └────────────────────────────────────────────┘   │
│                      ↓                              │
│              git push origin main                   │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GITHUB                                              │
│ - Source code repository                            │
│ - Triggers automatic deployments                    │
└─────────────────────────────────────────────────────┘
          ↓                              ↓
┌──────────────────────┐    ┌──────────────────────┐
│ VERCEL (PaaS)        │    │ RENDER (PaaS)        │
│                      │    │                      │
│ - Auto-builds React  │    │ - Auto-builds API    │
│ - Serves on CDN      │    │ - Manages Node.js    │
│ - Handles SSL/HTTPS  │    │ - Connects to DB     │
│ - Zero config needed │    │ - Zero config needed │
└──────────────────────┘    └──────────────────────┘
```

**Key Characteristics:**
- ✅ **Automatic:** Push to GitHub → Everything deploys automatically
- ✅ **Managed:** Vercel/Render handle servers, SSL, scaling
- ✅ **Simple:** No server management, no DevOps knowledge needed
- ✅ **Instant:** Vercel's global CDN = fast worldwide
- ❌ **Limited Control:** Can't customize infrastructure
- ❌ **Expensive:** $100+/month for production workloads
- ❌ **US-Based:** Data goes through US servers (NDPA violation)

---

### What OSLSR Uses: Self-Hosted VPS Workflow

```
┌─────────────────────────────────────────────────────┐
│ YOUR LOCAL MACHINE                                  │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │ Development (Docker Compose)                │   │
│  │ - React + Node.js (Custom App)             │   │
│  │ - PostgreSQL (x2 databases)                │   │
│  │ - Redis                                     │   │
│  │ - ODK Central                               │   │
│  │ - NGINX                                     │   │
│  │ - Plausible Analytics                       │   │
│  │                                             │   │
│  │ Command: docker-compose up                  │   │
│  └────────────────────────────────────────────┘   │
│                      ↓                              │
│              git push origin main                   │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ GITHUB                                              │
│ - Source code repository                            │
│ - GitHub Actions (CI/CD pipeline)                   │
│   • Builds Docker images                            │
│   • Runs tests                                      │
│   • SSH into VPS                                    │
│   • Deploys via docker-compose                      │
└─────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│ HETZNER VPS (Germany - Nigerian VPS in production) │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │ Docker Compose Stack                        │   │
│  │                                             │   │
│  │  ├─ NGINX (Port 80/443) ← Entry point     │   │
│  │  │   Routes traffic to services            │   │
│  │  │                                         │   │
│  │  ├─ Custom App                              │   │
│  │  │   • React build (served by NGINX)       │   │
│  │  │   • Node.js API                         │   │
│  │  │   • BullMQ workers                       │   │
│  │  │                                         │   │
│  │  ├─ ODK Central (Survey collection)        │   │
│  │  │                                         │   │
│  │  ├─ PostgreSQL (app_db)                    │   │
│  │  ├─ PostgreSQL (odk_db)                    │   │
│  │  │                                         │   │
│  │  ├─ Redis (Queue + Rate limiting)          │   │
│  │  │                                         │   │
│  │  └─ Plausible Analytics                    │   │
│  └────────────────────────────────────────────┘   │
│                                                     │
│  All services communicate via internal network      │
└─────────────────────────────────────────────────────┘
```

**Key Characteristics:**
- ✅ **Full Control:** Configure everything (NGINX, Redis, PostgreSQL)
- ✅ **Cost-Effective:** $14/month (86% cheaper than Render/Vercel)
- ✅ **NDPA Compliant:** Data stays in Nigeria (never leaves country)
- ✅ **Powerful:** Run ODK Central, Redis, multiple databases
- ⚠️ **More Complex:** Need to learn Docker, NGINX, Linux
- ⚠️ **Manual Setup:** One-time VPS configuration required
- ✅ **Still Automatic:** GitHub Actions handles deployments after setup

---

## Component-by-Component Comparison

### 1. Frontend (React)

| Aspect | MERN (Vercel) | OSLSR (Self-Hosted) |
|--------|---------------|---------------------|
| **Framework** | React | React (SAME) ✅ |
| **Build Tool** | Vite / Create React App | Vite (SAME) ✅ |
| **Styling** | Tailwind CSS | Tailwind CSS + shadcn/ui (SIMILAR) ✅ |
| **Routing** | React Router | React Router v7 (SAME) ✅ |
| **State Management** | Redux / Context | TanStack Query + Zustand (NEW) ⚠️ |
| **Form Handling** | Formik / React Hook Form | React Hook Form + Zod (SIMILAR) ✅ |
| **Deployment** | Vercel auto-deploys | NGINX serves static build (NEW) ⚠️ |
| **Hosting** | Vercel CDN (global) | NGINX on VPS (single location) |
| **SSL/HTTPS** | Vercel auto-manages | Let's Encrypt via NGINX (NEW) ⚠️ |

**What's NEW:**
- **TanStack Query:** Modern data fetching (replaces Redux for server state)
- **Zustand:** Lightweight state management (simpler than Redux)
- **shadcn/ui:** Component library (copy-paste components, not npm package)
- **NGINX Static Serving:** React build files served by NGINX (faster than Node.js)

**Learning Curve:** 🟢 **LOW** - React skills transfer 95%, new libraries are easier than Redux

---

### 2. Backend API

| Aspect | MERN (Render) | OSLSR (Self-Hosted) |
|--------|---------------|---------------------|
| **Runtime** | Node.js | Node.js 20 LTS (SAME) ✅ |
| **Framework** | Express | Express (SAME) ✅ |
| **Language** | JavaScript | TypeScript (UPGRADE) ⚠️ |
| **API Style** | REST | REST (SAME) ✅ |
| **Authentication** | JWT + Passport | JWT + Redis blacklist (SIMILAR) ✅ |
| **Validation** | Joi / Yup | Zod (SIMILAR) ✅ |
| **File Uploads** | Multer | Multer + S3 (SIMILAR) ✅ |
| **Background Jobs** | None / Bull | BullMQ (NEW) ⚠️ |
| **API Docs** | Manual / Postman | OpenAPI/Swagger (NEW) ⚠️ |
| **Deployment** | Render auto-deploys | Docker container on VPS (NEW) ⚠️ |

**What's NEW:**
- **TypeScript:** Type safety (gradual learning, not required to start)
- **BullMQ:** Background job queue (webhook processing, fraud detection)
- **OpenAPI/Swagger:** Auto-generated API documentation
- **Docker:** API runs in container (isolated environment)

**Learning Curve:** 🟡 **MEDIUM** - Express knowledge transfers, TypeScript is optional initially, BullMQ is new

---

### 3. Database

| Aspect | MERN (MongoDB) | OSLSR (PostgreSQL) |
|--------|----------------|---------------------|
| **Database Type** | NoSQL (MongoDB) | SQL (PostgreSQL 15) (DIFFERENT) ❌ |
| **Query Language** | MongoDB queries | SQL (NEW) ⚠️ |
| **ORM/ODM** | Mongoose | Drizzle ORM (NEW) ⚠️ |
| **Schema** | Flexible (schemaless) | Strict (typed tables) |
| **Hosting** | MongoDB Atlas (cloud) | Self-hosted on VPS (NEW) ⚠️ |
| **Relationships** | Manual refs | Foreign keys (easier) ✅ |
| **Transactions** | Limited | Full ACID support ✅ |
| **Geospatial** | Built-in | PostGIS extension ✅ |
| **Full-Text Search** | Basic | Advanced (tsvector, GIN indexes) ✅ |

**MongoDB Example (What You Know):**
```javascript
// Mongoose schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
});

// Query
const users = await User.find({ email: /gmail/ }).populate('posts');
```

**PostgreSQL Example (What OSLSR Uses):**
```typescript
// Drizzle ORM schema
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  title: text('title').notNull(),
});

// Query (TypeScript with type safety)
const usersWithPosts = await db.query.users.findMany({
  where: like(users.email, '%gmail%'),
  with: { posts: true } // Automatic join
});
```

**What's NEW:**
- **SQL Syntax:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`
- **Drizzle ORM:** Type-safe ORM (like Mongoose but for SQL)
- **Migrations:** Database schema versioning (change tracking)
- **Foreign Keys:** Enforced relationships (MongoDB doesn't have this)

**Learning Curve:** 🔴 **HIGH** - SQL is different from MongoDB, but Drizzle ORM makes it easier. Budget 1 week for basics.

**Good News:** Drizzle ORM abstracts most SQL complexity, so you write JavaScript/TypeScript similar to Mongoose.

---

### 4. Caching & Queue

| Aspect | MERN (Usually None) | OSLSR (Redis) |
|--------|---------------------|---------------|
| **Caching** | None / In-memory | Redis (NEW) ⚠️ |
| **Session Storage** | express-session (memory) | Redis (persistent) ✅ |
| **Background Jobs** | None / Bull | BullMQ + Redis (NEW) ⚠️ |
| **Rate Limiting** | express-rate-limit (memory) | NGINX + Redis (faster) ✅ |
| **Pub/Sub** | None | Redis Pub/Sub (NEW) ⚠️ |

**What is Redis?**
Think of Redis as a **super-fast in-memory database** (like a JavaScript object, but persistent and shared across servers).

**Use Cases in OSLSR:**
1. **Rate Limiting:** Track "User X made 10 requests in last minute"
2. **Session Blacklist:** Revoke JWT tokens (logout functionality)
3. **BullMQ Queue:** Store background jobs (webhook processing, fraud detection)
4. **Caching:** Store frequently accessed data (marketplace search results)

**Redis Example:**
```javascript
// Traditional (without Redis) - you probably do this now
let requestCount = {}; // Lost when server restarts
app.get('/api/data', (req, res) => {
  requestCount[req.ip] = (requestCount[req.ip] || 0) + 1;
  if (requestCount[req.ip] > 100) {
    return res.status(429).send('Too many requests');
  }
  // ... handle request
});

// OSLSR (with Redis) - persistent across restarts
import { redis } from './lib/redis';
app.get('/api/data', async (req, res) => {
  const count = await redis.incr(`rate:${req.ip}`);
  await redis.expire(`rate:${req.ip}`, 60); // Reset after 60s

  if (count > 100) {
    return res.status(429).send('Too many requests');
  }
  // ... handle request
});
```

**Learning Curve:** 🟢 **LOW** - Redis is simple key-value store, commands are intuitive (`SET`, `GET`, `INCR`, `EXPIRE`)

---

### 5. Reverse Proxy & Web Server

| Aspect | MERN (Vercel/Render) | OSLSR (NGINX) |
|--------|----------------------|---------------|
| **Reverse Proxy** | Managed by platform | NGINX (NEW) ⚠️ |
| **SSL/HTTPS** | Auto-managed | Let's Encrypt via Certbot (NEW) ⚠️ |
| **Static Files** | Vercel CDN | NGINX (10x faster than Node.js) ✅ |
| **Load Balancing** | Automatic | NGINX (manual config) |
| **Rate Limiting** | Platform-level | NGINX + Redis (NEW) ⚠️ |
| **Routing** | Auto-detected | Manual NGINX config (NEW) ⚠️ |

**What is NGINX?**
NGINX is a **web server** and **reverse proxy** (traffic router). It's the "front door" to your application.

**Why OSLSR Needs It:**
1. **Routes Traffic:** `oslsr.gov.ng/api/*` → Node.js, `oslsr.gov.ng/marketplace/*` → Node.js, `odk.oslsr.gov.ng/*` → ODK Central
2. **Serves Static Files:** React build files (faster than Node.js)
3. **SSL Termination:** Manages HTTPS certificates
4. **Rate Limiting:** Blocks bad traffic before it hits your API

**Vercel/Render Equivalent:**
- Vercel's edge network IS your reverse proxy (you just don't see it)
- Render's platform handles routing automatically

**OSLSR Difference:**
- You configure NGINX yourself (but it's a one-time setup)

**NGINX Config Example:**
```nginx
# Route /api/* to Node.js backend
location /api/ {
    proxy_pass http://localhost:3000;
}

# Serve React static files
location / {
    root /var/www/oslr/dist;
    try_files $uri /index.html;
}
```

**Learning Curve:** 🟡 **MEDIUM** - NGINX config syntax is new, but you'll mostly copy-paste from templates. Budget 2-3 days.

---

### 6. Deployment & DevOps

| Aspect | MERN (Vercel/Render) | OSLSR (Docker + VPS) |
|--------|----------------------|----------------------|
| **Deployment Method** | Git push → Auto-deploy | GitHub Actions → Docker deploy (NEW) ⚠️ |
| **Server Management** | None (managed platform) | Linux VPS (NEW) ⚠️ |
| **Environment Variables** | Dashboard UI | `.env` file + Docker secrets ✅ |
| **Logs** | Dashboard UI | `docker-compose logs` (NEW) ⚠️ |
| **Scaling** | Automatic | Manual (vertical scaling) |
| **Rollback** | One-click | Docker image tags (NEW) ⚠️ |
| **CI/CD** | Built-in | GitHub Actions (NEW) ⚠️ |
| **Monitoring** | Platform-provided | Self-hosted Plausible (NEW) ⚠️ |

**What's NEW:**

#### **Docker**
**What it is:** Containerization (package app + dependencies into a "box")

**Why OSLSR needs it:**
- Consistent environments (dev, staging, production are identical)
- Isolated services (NGINX, Node.js, PostgreSQL each in own container)
- Easy deployment (build once, run anywhere)

**Docker vs Traditional:**
```bash
# Traditional (what you do now)
npm install           # Install dependencies on your machine
npm run dev           # Run on your machine

# OSLSR (Docker)
docker-compose up     # Runs ALL services in containers:
                      # - Node.js API
                      # - PostgreSQL (x2)
                      # - Redis
                      # - NGINX
                      # - ODK Central
                      # - Plausible Analytics
```

#### **VPS (Virtual Private Server)**
**What it is:** A virtual computer you rent (like AWS EC2, but cheaper)

**Why OSLSR needs it:**
- Full control (install anything: Docker, NGINX, PostgreSQL)
- NDPA compliance (data stays in Nigeria)
- Cost-effective ($14/month vs $100+/month on Vercel/Render)

**VPS Management Tasks:**
- SSH into server (`ssh root@your-vps-ip`)
- Run commands (`docker-compose up`, `docker-compose logs`)
- Update services (`git pull`, `docker-compose restart`)

**Learning Curve:** 🟡 **MEDIUM** - Linux command line is new, but you'll use ~10 commands regularly. GitHub Actions automates most tasks.

---

### 7. ODK Central (Survey Collection)

| Aspect | MERN (N/A) | OSLSR (ODK Central) |
|--------|------------|---------------------|
| **What it is** | N/A | Survey data collection platform (NEW) ⚠️ |
| **Purpose** | N/A | Offline-first form collection for Enumerators |
| **Integration** | N/A | Custom App integrates via REST API + Webhooks |
| **Hosting** | N/A | Self-hosted Docker container on VPS (NEW) ⚠️ |
| **Forms** | N/A | XLSForm (Excel-based form definition) (NEW) ⚠️ |
| **Data Flow** | N/A | ODK Webhook → BullMQ → Custom App database |

**What is ODK Central?**
**ODK Central** is an **open-source survey platform** designed for offline data collection (think Google Forms, but works offline and is more robust).

**Why OSLSR needs it:**
- **Offline-First:** Enumerators collect surveys without internet (7-day offline capability)
- **Proven:** Battle-tested in 100+ countries for field research, elections, health surveys
- **Mobile-Optimized:** Works on cheap Android phones (Android 8.0+)
- **Form Management:** Supports complex skip logic, validation, GPS capture

**How You'll Interact with ODK:**
1. **Form Creation:** Upload XLSForm (Excel file defining survey questions)
2. **API Integration:** Custom App calls ODK API to provision users, deploy forms
3. **Webhook Integration:** ODK sends webhook when survey submitted → Custom App processes it

**MERN Equivalent:**
Think of ODK Central as a **specialized microservice** for survey collection. Your Custom App (Node.js API) orchestrates it.

**Learning Curve:** 🟡 **MEDIUM** - ODK Central is a new tool, but architecture document provides integration patterns. You'll interact with it via REST API (familiar).

---

## Technology Stack Summary

### What Transfers from MERN (Your Strengths)

✅ **95% Transferable:**
- React fundamentals
- Component patterns
- React Router
- Express.js API structure
- REST API design
- JWT authentication
- Environment variables
- Git workflow

✅ **80% Transferable (Minor Adjustments):**
- Form handling (React Hook Form similar to Formik)
- State management (TanStack Query simpler than Redux)
- Validation (Zod similar to Yup)
- File uploads (Multer same)

### What's New (Learning Required)

🟡 **Medium Learning Curve (1-2 weeks):**
- **Docker Basics:** Containers, docker-compose
- **NGINX Configuration:** Reverse proxy, static file serving
- **PostgreSQL + Drizzle ORM:** SQL basics, type-safe queries
- **Redis:** Key-value store, caching patterns
- **BullMQ:** Background job queue
- **Linux Command Line:** Basic server management

🔴 **Steeper Learning Curve (2-4 weeks):**
- **VPS Management:** SSH, systemctl, server security
- **GitHub Actions:** CI/CD pipeline configuration
- **ODK Central Integration:** XLSForm, webhook handling
- **TypeScript (Optional):** Type safety, can start without it

---

## Effort Estimation

### Time to Proficiency

| Technology | Time to Basic Proficiency | Time to Comfortable |
|------------|---------------------------|---------------------|
| Docker Basics | 2-3 days | 1-2 weeks |
| Docker Compose | 1-2 days | 1 week |
| PostgreSQL + Drizzle | 3-5 days | 2-3 weeks |
| SQL Fundamentals | 1 week | 1 month |
| NGINX Configuration | 2-3 days | 1 week |
| Redis | 1-2 days | 1 week |
| BullMQ | 2-3 days | 1 week |
| Linux CLI | 3-5 days | 2 weeks |
| VPS Management | 1 week | 1 month |
| GitHub Actions | 2-3 days | 1-2 weeks |
| ODK Central Integration | 3-5 days | 2 weeks |
| **TOTAL (Part-time)** | **3-4 weeks** | **2-3 months** |
| **TOTAL (Full-time)** | **2 weeks** | **1 month** |

### Phased Learning Path

**Phase 1: Local Development (Week 1)**
- Learn Docker basics
- Set up local OSLSR stack via docker-compose
- Develop features locally (no VPS needed yet)
- **Output:** Can run full OSLSR stack on your laptop

**Phase 2: Core Technologies (Week 2)**
- PostgreSQL + Drizzle ORM basics
- Redis + BullMQ basics
- NGINX static file serving
- **Output:** Understand all moving pieces

**Phase 3: VPS Setup (Week 3)**
- Rent Hetzner VPS
- Install Docker on Ubuntu
- Deploy OSLSR stack to VPS
- Configure NGINX + SSL
- **Output:** OSLSR running on production VPS

**Phase 4: Automation (Week 4)**
- Set up GitHub Actions
- Automate deployments
- Configure monitoring
- **Output:** Push to GitHub → Auto-deploys to VPS

---

## Key Differences Summary

### MERN + Vercel/Render (Your Current Workflow)

**Pros:**
- ✅ Zero DevOps knowledge needed
- ✅ Push to GitHub = automatic deployment
- ✅ Managed SSL, scaling, monitoring
- ✅ Fast global CDN (Vercel)
- ✅ Quick to start

**Cons:**
- ❌ Expensive ($100+/month production)
- ❌ Limited control (can't customize infrastructure)
- ❌ US-based (NDPA violation for OSLSR)
- ❌ Can't run ODK Central
- ❌ Can't run Redis/PostgreSQL self-hosted

### OSLSR Self-Hosted VPS

**Pros:**
- ✅ Full control (customize everything)
- ✅ Cost-effective ($14/month = 86% cheaper)
- ✅ NDPA compliant (data stays in Nigeria)
- ✅ Can run ODK Central, Redis, multiple databases
- ✅ More powerful (not limited by platform constraints)
- ✅ Still automatic after setup (GitHub Actions)

**Cons:**
- ⚠️ Steeper learning curve (Docker, NGINX, Linux, PostgreSQL)
- ⚠️ One-time VPS setup required
- ⚠️ You manage server (more responsibility)
- ⚠️ Single location (not global CDN like Vercel)

---

## Confidence Builders

### What You Already Know (Leverage These)

1. **JavaScript/Node.js:** 95% of OSLSR backend is Express.js (your strength)
2. **React:** Frontend is React (your strength)
3. **REST APIs:** Same patterns you use now
4. **Git Workflow:** Identical to what you do now
5. **Environment Variables:** Same concept (`.env` files)
6. **JSON:** All data formats are JSON (MongoDB habits transfer)

### Learning Accelerators

1. **Drizzle ORM:** Designed to feel like Mongoose (MongoDB ORM you know)
2. **Docker Compose:** Write once, never think about it again (mostly)
3. **NGINX Config:** Copy-paste from architecture document (rarely modify)
4. **GitHub Actions:** Set up once, forget about it (like Vercel/Render auto-deploy)

### You're Not Starting from Zero

Think of it as:
- **70% of your MERN skills transfer directly**
- **20% are minor upgrades** (TanStack Query vs Redux, Zod vs Yup)
- **10% is genuinely new** (Docker, NGINX, PostgreSQL, VPS)

---

## Next Steps

Now that you understand the landscape, proceed to:

1. **[Local Development Quick Start](03-local-development-quickstart.md)** - Get OSLSR running on your laptop in 30 minutes
2. **[Developer Onboarding Guide](02-developer-onboarding-guide.md)** - Step-by-step tutorials for each technology
3. **[VPS Deployment Guide](04-vps-deployment-guide.md)** - Deploy to production VPS

You've got this! 💪 Your MERN foundation is solid, and these new tools will make you a more versatile developer.
