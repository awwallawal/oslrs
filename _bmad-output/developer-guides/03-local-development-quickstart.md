# Local Development Quick Start
## Get OSLSR Running on Your Machine in 30 Minutes

**Goal:** Run the complete OSLSR stack locally using Docker Compose, so you can develop without needing a VPS.

**Prerequisites:**
- Windows 10/11 with WSL2 (Windows Subsystem for Linux) OR macOS
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space
- Basic command line knowledge

---

## Why Local Development First?

**Benefits:**
- ✅ Develop without VPS (no $14/month cost during development)
- ✅ Instant feedback (no deployment wait time)
- ✅ Learn Docker in safe environment
- ✅ Test changes before pushing to production
- ✅ Work offline (no internet needed after initial setup)

**What You'll Get:**
- Full OSLSR stack running on `localhost`
- All services (NGINX, PostgreSQL, Redis, ODK Central, Custom App)
- Hot-reload for code changes (like `npm run dev`)
- Identical to production (Docker ensures consistency)

---

## Step 1: Install Docker Desktop

### Windows Users

1. **Enable WSL2** (if not already enabled):
   ```powershell
   # Run PowerShell as Administrator
   wsl --install
   # Restart your computer
   ```

2. **Download Docker Desktop**:
   - Visit: https://www.docker.com/products/docker-desktop/
   - Download "Docker Desktop for Windows"
   - Run installer (accept all defaults)
   - Restart computer when prompted

3. **Verify Installation**:
   ```bash
   # Open PowerShell or Windows Terminal
   docker --version
   # Should output: Docker version 24.x.x

   docker-compose --version
   # Should output: Docker Compose version v2.x.x
   ```

### macOS Users

1. **Download Docker Desktop**:
   - Visit: https://www.docker.com/products/docker-desktop/
   - Download "Docker Desktop for Mac"
   - Drag to Applications folder
   - Open Docker Desktop (grant permissions)

2. **Verify Installation**:
   ```bash
   # Open Terminal
   docker --version
   docker-compose --version
   ```

### Linux Users

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in

# Verify
docker --version
docker-compose --version
```

---

## Step 2: Clone OSLSR Repository

```bash
# Navigate to your projects folder
cd ~/projects  # macOS/Linux
cd C:\Users\YourName\projects  # Windows

# Clone the repository (when available)
git clone https://github.com/your-org/oslr_cl.git
cd oslr_cl
```

**If repo doesn't exist yet**, create initial project structure:

```bash
mkdir oslr_cl && cd oslr_cl
git init
```

---

## Step 3: Create Local Docker Compose File

Create `docker-compose.local.yml` in project root:

```yaml
version: '3.8'

services:
  # PostgreSQL (Custom App)
  postgres:
    image: postgis/postgis:15-3.4-alpine
    container_name: oslsr-postgres-local
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: oslsr_admin
      POSTGRES_PASSWORD: local_dev_password
      POSTGRES_DB: app_db
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - oslsr-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U oslsr_admin"]
      interval: 10s
      timeout: 5s
      retries: 5

  # PostgreSQL (ODK Central)
  postgres-odk:
    image: postgres:15-alpine
    container_name: oslsr-postgres-odk-local
    ports:
      - "5433:5432"  # Different port to avoid conflict
    environment:
      POSTGRES_USER: odk_admin
      POSTGRES_PASSWORD: local_odk_password
      POSTGRES_DB: odk_db
    volumes:
      - postgres-odk-data:/var/lib/postgresql/data
    networks:
      - oslsr-network

  # Redis
  redis:
    image: redis:7-alpine
    container_name: oslsr-redis-local
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - oslsr-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ODK Central (Simplified for local dev)
  odk-central:
    image: odk/central:latest
    container_name: oslsr-odk-central-local
    ports:
      - "8383:8383"
    environment:
      - DB_HOST=postgres-odk
      - DB_NAME=odk_db
      - DB_USER=odk_admin
      - DB_PASSWORD=local_odk_password
      - DOMAIN=local.odk.oslsr.gov.ng
    volumes:
      - odk-data:/data
    depends_on:
      - postgres-odk
    networks:
      - oslsr-network

  # Plausible Analytics (Optional for local dev)
  plausible:
    image: plausible/analytics:latest
    container_name: oslsr-plausible-local
    ports:
      - "8000:8000"
    environment:
      - BASE_URL=http://localhost:8000
      - SECRET_KEY_BASE=local_dev_secret_key_base_at_least_64_chars_long_for_security
      - DATABASE_URL=postgres://plausible:plausible@plausible-db:5432/plausible_db
      - CLICKHOUSE_DATABASE_URL=http://plausible-clickhouse:8123/plausible_events_db
    depends_on:
      - plausible-db
      - plausible-clickhouse
    networks:
      - oslsr-network

  plausible-db:
    image: postgres:15-alpine
    container_name: oslsr-plausible-db-local
    environment:
      POSTGRES_DB: plausible_db
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: plausible
    volumes:
      - plausible-db-data:/var/lib/postgresql/data
    networks:
      - oslsr-network

  plausible-clickhouse:
    image: clickhouse/clickhouse-server:23-alpine
    container_name: oslsr-plausible-clickhouse-local
    volumes:
      - plausible-clickhouse-data:/var/lib/clickhouse
    networks:
      - oslsr-network

volumes:
  postgres-data:
  postgres-odk-data:
  redis-data:
  odk-data:
  plausible-db-data:
  plausible-clickhouse-data:

networks:
  oslsr-network:
    driver: bridge
```

**Save this file** as `docker-compose.local.yml`

---

## Step 4: Start Infrastructure Services

```bash
# Start all services
docker-compose -f docker-compose.local.yml up -d

# Check status (all should show "healthy" or "running")
docker-compose -f docker-compose.local.yml ps

# Expected output:
# NAME                          STATUS
# oslsr-postgres-local          Up (healthy)
# oslsr-postgres-odk-local      Up
# oslsr-redis-local             Up (healthy)
# oslsr-odk-central-local       Up
# oslsr-plausible-local         Up
```

**Troubleshooting:**
```bash
# View logs if any service fails
docker-compose -f docker-compose.local.yml logs postgres
docker-compose -f docker-compose.local.yml logs redis

# Restart specific service
docker-compose -f docker-compose.local.yml restart postgres

# Stop all services
docker-compose -f docker-compose.local.yml down
```

---

## Step 5: Set Up Custom App (Backend)

### Create Project Structure

```bash
# Create monorepo structure
mkdir -p apps/api apps/web packages

# Initialize package.json
cat > package.json <<EOF
{
  "name": "oslr_cl",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^1.11.0"
  }
}
EOF

# Initialize pnpm (faster than npm)
npm install -g pnpm
pnpm install
```

### Create Backend App

```bash
cd apps/api

# Initialize Node.js API
pnpm init

# Install dependencies
pnpm add express cors dotenv
pnpm add drizzle-orm postgres
pnpm add ioredis bullmq
pnpm add zod jsonwebtoken bcrypt
pnpm add -D typescript @types/node @types/express
pnpm add -D tsx nodemon

# Initialize TypeScript
npx tsc --init
```

### Create `.env.local` file

```bash
# apps/api/.env.local
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://oslsr_admin:local_dev_password@localhost:5432/app_db
DATABASE_URL_REPLICA=postgresql://oslsr_admin:local_dev_password@localhost:5432/app_db

# ODK Central
ODK_SERVER_URL=http://localhost:8383
ODK_ADMIN_EMAIL=admin@local.dev
ODK_ADMIN_PASSWORD=local_odk_admin_pass

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=local_dev_jwt_secret_change_in_production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3 (use local storage for dev)
AWS_S3_BUCKET=oslsr-local-dev
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=local_dev_key
AWS_SECRET_ACCESS_KEY=local_dev_secret

# Email (log to console for dev)
EMAIL_PROVIDER=console
```

### Create Basic API Server

```typescript
// apps/api/src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      database: 'connected', // TODO: Add actual DB check
      redis: 'connected',    // TODO: Add actual Redis check
      odk: 'connected'       // TODO: Add actual ODK check
    }
  });
});

// API routes
app.get('/api/v1/status', (req, res) => {
  res.json({
    message: 'OSLSR API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: err.message || 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 OSLSR API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1/status`);
});
```

### Update `package.json`

```json
{
  "name": "@oslr_cl/api",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "drizzle-orm": "^0.29.0",
    "postgres": "^3.4.3",
    "ioredis": "^5.3.2",
    "bullmq": "^5.0.0",
    "zod": "^3.22.4",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21",
    "tsx": "^4.7.0",
    "nodemon": "^3.0.2"
  }
}
```

### Start Backend

```bash
cd apps/api
pnpm install
pnpm dev

# Should see:
# 🚀 OSLSR API running on http://localhost:3000
# 📊 Health check: http://localhost:3000/health
```

**Test it:**
```bash
# In another terminal
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/status
```

---

## Step 6: Set Up Frontend (React)

```bash
cd apps/web

# Create Vite React app with TypeScript
pnpm create vite . --template react-ts

# Install dependencies
pnpm install

# Install additional packages
pnpm add react-router-dom
pnpm add @tanstack/react-query
pnpm add zustand
pnpm add zod
pnpm add react-hook-form @hookform/resolvers

# Install Tailwind CSS + shadcn/ui
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install shadcn/ui
npx shadcn-ui@latest init
# Select: TypeScript, Tailwind CSS, src/components, Yes to all
```

### Configure Tailwind

```javascript
// apps/web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### Create Basic App Structure

```tsx
// apps/web/src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const queryClient = new QueryClient();

function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            Oyo State Labour & Skills Registry
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            OSLSR - Development Environment
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <a
            href="/dashboard"
            className="block w-full py-3 px-4 bg-blue-600 text-white rounded-lg text-center hover:bg-blue-700 transition"
          >
            Staff Login
          </a>
          <a
            href="/register"
            className="block w-full py-3 px-4 bg-green-600 text-white rounded-lg text-center hover:bg-green-700 transition"
          >
            Public Register
          </a>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Local Development Mode</p>
          <p className="mt-2">
            API: <a href="http://localhost:3000" className="text-blue-600">localhost:3000</a>
          </p>
          <p>
            ODK: <a href="http://localhost:8383" className="text-blue-600">localhost:8383</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<div>Dashboard (Coming Soon)</div>} />
          <Route path="/register" element={<div>Register (Coming Soon)</div>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
```

### Create `.env.local`

```bash
# apps/web/.env.local
VITE_API_URL=http://localhost:3000
VITE_ODK_URL=http://localhost:8383
VITE_PLAUSIBLE_URL=http://localhost:8000
```

### Start Frontend

```bash
cd apps/web
pnpm dev

# Should see:
# VITE v5.0.0  ready in 500 ms
# ➜  Local:   http://localhost:5173/
```

**Open browser:** http://localhost:5173

---

## Step 7: Verify Everything Works

### Service Checklist

Open these URLs in your browser:

- ✅ **Frontend:** http://localhost:5173 (React app)
- ✅ **Backend API:** http://localhost:3000/health (JSON response)
- ✅ **ODK Central:** http://localhost:8383 (ODK login page)
- ✅ **Plausible Analytics:** http://localhost:8000 (Analytics dashboard)
- ✅ **PostgreSQL:** `psql -h localhost -U oslsr_admin -d app_db` (Database)
- ✅ **Redis:** `redis-cli ping` (Should return "PONG")

### Test API from Frontend

```tsx
// apps/web/src/App.tsx - Add this to HomePage component
import { useQuery } from '@tanstack/react-query';

function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['api-status'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/v1/status');
      return res.json();
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      {/* ... existing code ... */}

      <div className="mt-4 p-4 bg-white rounded-lg shadow">
        <h3 className="font-semibold">API Status:</h3>
        {isLoading && <p>Loading...</p>}
        {error && <p className="text-red-600">API Error: {error.message}</p>}
        {data && (
          <pre className="mt-2 text-sm bg-gray-100 p-2 rounded">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
```

---

## Step 8: Development Workflow

### Daily Workflow

```bash
# Morning: Start all services
docker-compose -f docker-compose.local.yml up -d

# Start backend (in terminal 1)
cd apps/api
pnpm dev

# Start frontend (in terminal 2)
cd apps/web
pnpm dev

# Code changes auto-reload (hot reload)
# - Edit files in apps/api/src → API restarts
# - Edit files in apps/web/src → Browser refreshes

# Evening: Stop services (optional, or leave running)
docker-compose -f docker-compose.local.yml down
```

### Useful Commands

```bash
# View logs
docker-compose -f docker-compose.local.yml logs -f postgres
docker-compose -f docker-compose.local.yml logs -f redis

# Access PostgreSQL
docker exec -it oslsr-postgres-local psql -U oslsr_admin -d app_db

# Access Redis CLI
docker exec -it oslsr-redis-local redis-cli

# Restart a service
docker-compose -f docker-compose.local.yml restart postgres

# Stop all services
docker-compose -f docker-compose.local.yml down

# Stop and remove volumes (fresh start)
docker-compose -f docker-compose.local.yml down -v
```

### Database Management

```bash
# Run migrations (once you create them)
cd apps/api
pnpm drizzle-kit push:pg

# Seed database with test data
pnpm run seed

# View database in GUI (optional)
# Install DBeaver or TablePlus
# Connect: localhost:5432, user: oslsr_admin, password: local_dev_password
```

---

## Step 9: Add Your First Feature

### Example: Create a Simple API Endpoint

```typescript
// apps/api/src/routes/test.routes.ts
import { Router } from 'express';

const router = Router();

router.get('/hello', (req, res) => {
  res.json({
    message: 'Hello from OSLSR!',
    timestamp: new Date().toISOString()
  });
});

router.post('/echo', (req, res) => {
  res.json({
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

export default router;
```

```typescript
// apps/api/src/index.ts - Add route
import testRoutes from './routes/test.routes';

// ... existing code ...

app.use('/api/v1/test', testRoutes);

// ... rest of code ...
```

**Test it:**
```bash
curl http://localhost:3000/api/v1/test/hello

curl -X POST http://localhost:3000/api/v1/test/echo \
  -H "Content-Type: application/json" \
  -d '{"name":"Awwal","message":"Testing OSLSR"}'
```

### Add Corresponding Frontend Component

```tsx
// apps/web/src/components/TestComponent.tsx
import { useState } from 'react';

export function TestComponent() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<any>(null);

  const sendMessage = async () => {
    const res = await fetch('http://localhost:3000/api/v1/test/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    setResponse(data);
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Test API Connection</h3>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter a message"
        className="w-full p-2 border rounded mb-4"
      />
      <button
        onClick={sendMessage}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Send to API
      </button>

      {response && (
        <pre className="mt-4 p-2 bg-gray-100 rounded text-sm">
          {JSON.stringify(response, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

---

## Common Issues & Solutions

### Issue: Docker containers won't start

**Solution:**
```bash
# Check if ports are in use
netstat -an | findstr :5432  # Windows
lsof -i :5432                # macOS/Linux

# If ports are in use, stop conflicting services
# Or change ports in docker-compose.local.yml

# Restart Docker Desktop
# Windows: Right-click Docker Desktop icon → Restart
# macOS: Docker Desktop → Restart
```

### Issue: "Cannot connect to database"

**Solution:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs oslsr-postgres-local

# Restart PostgreSQL
docker-compose -f docker-compose.local.yml restart postgres

# Wait for health check (10-15 seconds)
docker-compose -f docker-compose.local.yml ps
```

### Issue: Frontend can't reach backend (CORS error)

**Solution:**
```typescript
// apps/api/src/index.ts
app.use(cors({
  origin: 'http://localhost:5173', // Vite default port
  credentials: true
}));
```

### Issue: Hot reload not working

**Solution:**
```bash
# Backend - Make sure tsx watch is running
cd apps/api
pnpm dev

# Frontend - Make sure Vite is running
cd apps/web
pnpm dev

# If still not working, restart both
# Kill processes (Ctrl+C) and restart
```

---

## Next Steps

Congratulations! 🎉 You now have a local OSLSR development environment.

**What's Next:**

1. **[Developer Onboarding Guide](02-developer-onboarding-guide.md)** - Deep dive into each technology
2. **[VPS Deployment Guide](04-vps-deployment-guide.md)** - Deploy to production
3. **Architecture Document** - Understand the full system design
4. **PRD** - Understand business requirements

**Development Tips:**
- Keep Docker Compose running in background
- Use hot reload for fast iteration
- Test API endpoints with `curl` or Postman
- Use browser DevTools Network tab to debug API calls
- Commit frequently to Git

You're ready to start building OSLSR! 💪
