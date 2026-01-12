# Developer Onboarding Guide
## Complete Learning Path from MERN to OSLSR Self-Hosted Stack

**Purpose:** Step-by-step tutorials to learn each new technology required for OSLSR development.

**Target Audience:** MERN stack developers transitioning to self-hosted VPS architecture.

**Time Commitment:** 3-4 weeks part-time (10-15 hours/week) or 2 weeks full-time.

---

## Learning Path Overview

```
Week 1: Docker & Local Development
├─ Day 1-2: Docker Basics
├─ Day 3-4: Docker Compose
└─ Day 5-7: Local OSLSR Setup

Week 2: Database & Backend Tools
├─ Day 1-3: PostgreSQL Fundamentals
├─ Day 4-5: Drizzle ORM
└─ Day 6-7: Redis & BullMQ

Week 3: Infrastructure & Deployment
├─ Day 1-2: NGINX Configuration
├─ Day 3-4: Linux Command Line
└─ Day 5-7: VPS Setup

Week 4: Automation & Production
├─ Day 1-3: GitHub Actions
├─ Day 4-5: ODK Central Integration
└─ Day 6-7: Production Deployment
```

---

## Module 1: Docker Fundamentals (Days 1-2)

### What is Docker?

**Problem Docker Solves:**
```
Traditional Development:
❌ "Works on my machine" syndrome
❌ Complex setup instructions (Install Node.js 20.x, PostgreSQL 15, Redis 7...)
❌ Conflicts between projects (one needs Node 18, another needs Node 20)
❌ Different behavior in dev vs production

With Docker:
✅ Identical environments everywhere (dev, staging, production)
✅ One command to start entire stack: docker-compose up
✅ Isolated projects (no conflicts)
✅ Predictable deployments
```

**Docker Analogy:**
Think of Docker like **shipping containers** (the real ones on cargo ships):
- Everything your app needs is packed inside the container
- Container looks the same whether it's in Nigeria, Germany, or USA
- Container runs the same on your laptop, VPS, or cloud

### Core Docker Concepts

#### 1. **Images** (Blueprints)

An image is like a **recipe** or **template** for your application.

**Example:** Node.js 20 Image
```dockerfile
# This is what's inside the node:20-alpine image (simplified)
FROM alpine:3.18
RUN apk add nodejs npm
CMD ["node"]
```

**Pre-built Images (Docker Hub):**
- `node:20-alpine` - Node.js 20 on lightweight Alpine Linux
- `postgres:15-alpine` - PostgreSQL 15
- `redis:7-alpine` - Redis 7
- `nginx:1.25-alpine` - NGINX web server

#### 2. **Containers** (Running Instances)

A container is a **running instance** of an image.

**Analogy:**
- Image = Class (blueprint)
- Container = Object (instance)

```bash
# Create container from image (like: new NodeApp())
docker run node:20-alpine

# You can create multiple containers from same image
docker run --name app1 node:20-alpine
docker run --name app2 node:20-alpine
```

#### 3. **Volumes** (Persistent Storage)

Containers are **ephemeral** (temporary). When you stop/delete a container, all data inside is lost.

**Volumes** preserve data across container restarts.

```bash
# Without volume (data lost when container stops)
docker run postgres:15-alpine

# With volume (data persists)
docker run -v postgres-data:/var/lib/postgresql/data postgres:15-alpine
```

**Use Cases:**
- Database files (PostgreSQL data)
- Uploaded files (user photos)
- Logs

### Hands-On Tutorial: Docker Basics

#### Exercise 1: Run Your First Container

```bash
# Pull (download) an image from Docker Hub
docker pull hello-world

# Run the container
docker run hello-world

# You should see: "Hello from Docker!" message
```

#### Exercise 2: Run Interactive Container

```bash
# Run Ubuntu container with interactive terminal
docker run -it ubuntu:22.04 bash

# You're now INSIDE the container (Ubuntu Linux)
# Try some commands:
ls                  # List files
cat /etc/os-release # Check Ubuntu version
apt update          # Update package list
exit                # Exit container
```

#### Exercise 3: Run Node.js Container

```bash
# Run Node.js container interactively
docker run -it node:20-alpine sh

# Inside container, try Node.js:
node --version      # Should show v20.x.x
npm --version
node -e "console.log('Hello from Docker Node.js!')"
exit
```

#### Exercise 4: Run Container with Port Mapping

```bash
# Create simple web server
cat > server.js <<EOF
const http = require('http');
const server = http.createServer((req, res) => {
  res.end('Hello from Dockerized Node.js!');
});
server.listen(3000, () => console.log('Server on port 3000'));
EOF

# Run Node.js container with:
# -p 3000:3000 = Map container port 3000 to host port 3000
# -v $(pwd):/app = Mount current directory as /app in container
# -w /app = Set working directory to /app
docker run -p 3000:3000 -v $(pwd):/app -w /app node:20-alpine node server.js

# Open browser: http://localhost:3000
# Press Ctrl+C to stop
```

#### Exercise 5: Create Your First Dockerfile

```dockerfile
# Create Dockerfile
cat > Dockerfile <<EOF
# Start from Node.js 20 Alpine base image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port 3000
EXPOSE 3000

# Command to run when container starts
CMD ["node", "server.js"]
EOF

# Build image from Dockerfile
docker build -t my-node-app .

# Run container from your custom image
docker run -p 3000:3000 my-node-app

# Open browser: http://localhost:3000
```

### Common Docker Commands Cheat Sheet

```bash
# Images
docker images                    # List all images
docker pull <image>              # Download image from Docker Hub
docker build -t <name> .         # Build image from Dockerfile
docker rmi <image>               # Remove image

# Containers
docker ps                        # List running containers
docker ps -a                     # List all containers (including stopped)
docker run <image>               # Create and start container
docker start <container>         # Start stopped container
docker stop <container>          # Stop running container
docker rm <container>            # Remove container
docker logs <container>          # View container logs
docker exec -it <container> sh   # Execute command in running container

# Cleanup
docker system prune              # Remove unused data
docker volume prune              # Remove unused volumes
```

---

## Module 2: Docker Compose (Days 3-4)

### What is Docker Compose?

**Problem:**
Running OSLSR requires 7+ services:
```bash
# Without Docker Compose (painful!)
docker run -d postgres:15-alpine ...
docker run -d redis:7-alpine ...
docker run -d nginx:1.25-alpine ...
docker run -d node:20-alpine ...
# ... 4 more services
```

**Solution: Docker Compose**
```bash
# With Docker Compose (one command!)
docker-compose up -d
# Starts ALL 7 services automatically
```

### Docker Compose File Structure

**`docker-compose.yml` Anatomy:**

```yaml
version: '3.8'              # Docker Compose file format version

services:                    # Define all services (containers)
  postgres:                  # Service name (you choose this)
    image: postgres:15-alpine  # Which Docker image to use
    container_name: my-postgres  # Container name (optional)
    ports:                   # Port mapping
      - "5432:5432"          # host:container
    environment:             # Environment variables
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: myapp_db
    volumes:                 # Persistent storage
      - postgres-data:/var/lib/postgresql/data
    networks:                # Network for inter-service communication
      - myapp-network

  redis:                     # Another service
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - myapp-network

volumes:                     # Define named volumes
  postgres-data:

networks:                    # Define networks
  myapp-network:
    driver: bridge
```

### Hands-On Tutorial: Docker Compose

#### Exercise 1: Simple Two-Service Stack

```yaml
# Create docker-compose.yml
version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html

  api:
    image: node:20-alpine
    ports:
      - "3000:3000"
    working_dir: /app
    volumes:
      - ./api:/app
    command: sh -c "npm install && node server.js"
```

```bash
# Create HTML file
mkdir html
echo "<h1>Hello from Docker Compose NGINX!</h1>" > html/index.html

# Create API
mkdir api
cat > api/server.js <<EOF
const http = require('http');
http.createServer((req, res) => {
  res.end('Hello from Docker Compose API!');
}).listen(3000, () => console.log('API running'));
EOF

cat > api/package.json <<EOF
{
  "name": "api",
  "version": "1.0.0",
  "dependencies": {}
}
EOF

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs web
docker-compose logs api

# Test
curl http://localhost:8080  # NGINX
curl http://localhost:3000  # API

# Stop services
docker-compose down
```

#### Exercise 2: Database + API Stack

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: demo_user
      POSTGRES_PASSWORD: demo_pass
      POSTGRES_DB: demo_db
    ports:
      - "5432:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U demo_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: node:20-alpine
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://demo_user:demo_pass@postgres:5432/demo_db
    ports:
      - "3000:3000"
    working_dir: /app
    volumes:
      - ./api:/app
    command: sh -c "npm install && node server.js"

volumes:
  pg-data:
```

**Key Concepts:**

1. **depends_on:** API waits for PostgreSQL to be healthy before starting
2. **healthcheck:** Docker checks if PostgreSQL is ready
3. **Service names as hostnames:** API connects to `postgres:5432` (not `localhost`)

```javascript
// api/server.js - Connecting to PostgreSQL
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL!'))
  .catch(err => console.error('Connection error', err));

const http = require('http');
http.createServer((req, res) => {
  res.end('API connected to PostgreSQL!');
}).listen(3000);
```

### Docker Compose Commands Cheat Sheet

```bash
# Start services (detached mode)
docker-compose up -d

# Start services (view logs in terminal)
docker-compose up

# Stop services (containers remain)
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (fresh start)
docker-compose down -v

# View running services
docker-compose ps

# View logs
docker-compose logs                 # All services
docker-compose logs -f postgres     # Follow logs for one service
docker-compose logs --tail=50 api   # Last 50 lines

# Restart specific service
docker-compose restart postgres

# Execute command in running container
docker-compose exec postgres psql -U demo_user -d demo_db

# Build images
docker-compose build

# Pull latest images
docker-compose pull
```

---

## Module 3: PostgreSQL Fundamentals (Days 1-3)

### MongoDB vs PostgreSQL

| Concept | MongoDB (What You Know) | PostgreSQL (What OSLSR Uses) |
|---------|------------------------|------------------------------|
| **Data Model** | Documents (JSON-like) | Tables with rows & columns |
| **Schema** | Flexible (schemaless) | Strict (must define schema) |
| **Query Language** | MongoDB queries | SQL |
| **Relationships** | Manual refs | Foreign keys (enforced) |
| **Transactions** | Limited | Full ACID support |

### PostgreSQL Basics

#### 1. **Databases and Tables**

**MongoDB:**
```javascript
// Collection: users
{
  _id: ObjectId("..."),
  name: "Awwal",
  email: "awwal@example.com",
  posts: [
    { title: "Post 1", content: "..." },
    { title: "Post 2", content: "..." }
  ]
}
```

**PostgreSQL:**
```sql
-- Table: users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table: posts (separate table)
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),  -- Foreign key
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. **Basic SQL Operations**

**CREATE (Insert)**
```sql
-- MongoDB
db.users.insertOne({
  name: "Awwal",
  email: "awwal@example.com"
});

-- PostgreSQL
INSERT INTO users (id, name, email)
VALUES (gen_random_uuid(), 'Awwal', 'awwal@example.com');
```

**READ (Select)**
```sql
-- MongoDB
db.users.find({ email: /gmail/ });

-- PostgreSQL
SELECT * FROM users WHERE email LIKE '%gmail%';
```

**UPDATE**
```sql
-- MongoDB
db.users.updateOne(
  { email: "awwal@example.com" },
  { $set: { name: "Awwal Updated" } }
);

-- PostgreSQL
UPDATE users
SET name = 'Awwal Updated'
WHERE email = 'awwal@example.com';
```

**DELETE**
```sql
-- MongoDB
db.users.deleteOne({ email: "awwal@example.com" });

-- PostgreSQL
DELETE FROM users WHERE email = 'awwal@example.com';
```

### Hands-On Tutorial: PostgreSQL

#### Exercise 1: Connect to PostgreSQL

```bash
# Start PostgreSQL with Docker
docker run -d \
  --name postgres-tutorial \
  -e POSTGRES_PASSWORD=tutorial \
  -p 5432:5432 \
  postgres:15-alpine

# Connect using psql (PostgreSQL CLI)
docker exec -it postgres-tutorial psql -U postgres

# You're now in PostgreSQL shell (postgres=#)
```

#### Exercise 2: Create Database and Tables

```sql
-- Create database
CREATE DATABASE oslsr_tutorial;

-- Connect to database
\c oslsr_tutorial

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create posts table with foreign key
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- View tables
\dt

-- View table structure
\d users
```

#### Exercise 3: Insert and Query Data

```sql
-- Insert users
INSERT INTO users (name, email, role) VALUES
  ('Awwal', 'awwal@oslsr.gov.ng', 'Admin'),
  ('John', 'john@oslsr.gov.ng', 'Enumerator'),
  ('Sarah', 'sarah@oslsr.gov.ng', 'Supervisor');

-- View all users
SELECT * FROM users;

-- Insert posts
INSERT INTO posts (user_id, title, content, published)
VALUES
  ((SELECT id FROM users WHERE name = 'Awwal'), 'First Post', 'Hello OSLSR!', true),
  ((SELECT id FROM users WHERE name = 'John'), 'Field Report', 'Data collection ongoing', true);

-- View all posts
SELECT * FROM posts;

-- Join users and posts
SELECT
  users.name,
  posts.title,
  posts.published
FROM users
INNER JOIN posts ON users.id = posts.user_id;

-- Count posts per user
SELECT
  users.name,
  COUNT(posts.id) as post_count
FROM users
LEFT JOIN posts ON users.id = posts.user_id
GROUP BY users.name;
```

#### Exercise 4: Update and Delete

```sql
-- Update user
UPDATE users
SET role = 'Super Admin'
WHERE email = 'awwal@oslsr.gov.ng';

-- Update post
UPDATE posts
SET published = false
WHERE title = 'Field Report';

-- Delete post
DELETE FROM posts WHERE title = 'Field Report';

-- Try to delete user with posts (will fail due to foreign key)
DELETE FROM users WHERE name = 'Awwal';
-- Error: violates foreign key constraint

-- Delete posts first, then user
DELETE FROM posts WHERE user_id = (SELECT id FROM users WHERE name = 'Awwal');
DELETE FROM users WHERE name = 'Awwal';
```

### SQL Cheat Sheet for MERN Developers

```sql
-- SELECT (like MongoDB find)
SELECT * FROM users;                              -- db.users.find()
SELECT * FROM users WHERE role = 'Admin';         -- db.users.find({ role: 'Admin' })
SELECT name, email FROM users;                    -- db.users.find({}, { name: 1, email: 1 })
SELECT * FROM users LIMIT 10;                     -- db.users.find().limit(10)
SELECT * FROM users ORDER BY created_at DESC;     -- db.users.find().sort({ created_at: -1 })

-- INSERT (like MongoDB insertOne)
INSERT INTO users (name, email, role)             -- db.users.insertOne({ ... })
VALUES ('John', 'john@test.com', 'User');

-- UPDATE (like MongoDB updateOne)
UPDATE users SET role = 'Admin'                   -- db.users.updateOne({ ... }, { $set: { ... } })
WHERE email = 'john@test.com';

-- DELETE (like MongoDB deleteOne)
DELETE FROM users WHERE email = 'john@test.com';  -- db.users.deleteOne({ ... })

-- JOINS (like MongoDB populate)
SELECT users.*, posts.title
FROM users
LEFT JOIN posts ON posts.user_id = users.id;     -- db.users.find().populate('posts')

-- COUNT (like MongoDB countDocuments)
SELECT COUNT(*) FROM users;                       -- db.users.countDocuments()

-- AGGREGATE (like MongoDB aggregate)
SELECT role, COUNT(*) as count
FROM users
GROUP BY role;                                    -- db.users.aggregate([{ $group: { ... } }])
```

---

## Module 4: Drizzle ORM (Days 4-5)

### What is Drizzle ORM?

**Drizzle ORM** is like **Mongoose for PostgreSQL** but with:
- TypeScript-first design
- Type safety (catch errors before runtime)
- SQL-like syntax (easier to learn SQL concepts)
- Better performance than Prisma

### Hands-On Tutorial: Drizzle ORM

#### Step 1: Install Drizzle

```bash
# Create new project
mkdir drizzle-tutorial && cd drizzle-tutorial
npm init -y

# Install dependencies
npm install drizzle-orm postgres
npm install -D drizzle-kit tsx @types/node typescript

# Initialize TypeScript
npx tsc --init
```

#### Step 2: Define Schema

```typescript
// src/schema.ts
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// Define users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at').defaultNow()
});

// Define posts table
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').default(false),
  createdAt: timestamp('created_at').defaultNow()
});
```

#### Step 3: Connect to Database

```typescript
// src/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = 'postgresql://postgres:tutorial@localhost:5432/oslsr_tutorial';
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
```

#### Step 4: Query Database

```typescript
// src/index.ts
import { db } from './db';
import { users, posts } from './schema';
import { eq, like, and } from 'drizzle-orm';

async function main() {
  // INSERT (like Mongoose .create())
  const newUser = await db.insert(users).values({
    name: 'Awwal',
    email: 'awwal@oslsr.gov.ng',
    role: 'Admin'
  }).returning();

  console.log('Created user:', newUser);

  // SELECT ALL (like Mongoose .find())
  const allUsers = await db.select().from(users);
  console.log('All users:', allUsers);

  // SELECT WITH WHERE (like Mongoose .find({ role: 'Admin' }))
  const admins = await db.select().from(users).where(eq(users.role, 'Admin'));
  console.log('Admins:', admins);

  // SELECT WITH LIKE (like MongoDB regex)
  const gmailUsers = await db.select().from(users).where(like(users.email, '%gmail%'));
  console.log('Gmail users:', gmailUsers);

  // SELECT ONE (like Mongoose .findOne())
  const user = await db.query.users.findFirst({
    where: eq(users.email, 'awwal@oslsr.gov.ng')
  });
  console.log('Found user:', user);

  // UPDATE (like Mongoose .updateOne())
  await db.update(users)
    .set({ role: 'Super Admin' })
    .where(eq(users.email, 'awwal@oslsr.gov.ng'));

  // DELETE (like Mongoose .deleteOne())
  await db.delete(users).where(eq(users.email, 'awwal@oslsr.gov.ng'));

  // INSERT POST (like Mongoose .create() with ref)
  const newPost = await db.insert(posts).values({
    userId: user!.id,
    title: 'First Post',
    content: 'Hello OSLSR!',
    published: true
  }).returning();

  // JOIN (like Mongoose .populate())
  const usersWithPosts = await db.query.users.findMany({
    with: {
      posts: true  // Automatically joins posts
    }
  });
  console.log('Users with posts:', JSON.stringify(usersWithPosts, null, 2));
}

main();
```

#### Step 5: Run Migrations

```bash
# Generate migration SQL from schema
npx drizzle-kit generate:pg

# Apply migrations to database
npx drizzle-kit push:pg

# Run your code
npx tsx src/index.ts
```

### Drizzle vs Mongoose Comparison

```typescript
// MONGOOSE (MongoDB)
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  role: String
});
const User = mongoose.model('User', UserSchema);

// Create
await User.create({ name: 'Awwal', email: 'awwal@test.com', role: 'Admin' });

// Find all
await User.find();

// Find one
await User.findOne({ email: 'awwal@test.com' });

// Update
await User.updateOne({ email: 'awwal@test.com' }, { role: 'Super Admin' });

// Delete
await User.deleteOne({ email: 'awwal@test.com' });

// Populate
await User.findOne({ email: 'awwal@test.com' }).populate('posts');
```

```typescript
// DRIZZLE ORM (PostgreSQL)
const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  role: text('role').notNull()
});

// Create
await db.insert(users).values({ name: 'Awwal', email: 'awwal@test.com', role: 'Admin' });

// Find all
await db.select().from(users);

// Find one
await db.query.users.findFirst({ where: eq(users.email, 'awwal@test.com') });

// Update
await db.update(users).set({ role: 'Super Admin' }).where(eq(users.email, 'awwal@test.com'));

// Delete
await db.delete(users).where(eq(users.email, 'awwal@test.com'));

// Populate (join)
await db.query.users.findFirst({
  where: eq(users.email, 'awwal@test.com'),
  with: { posts: true }
});
```

**Key Takeaway:** Drizzle syntax is very similar to Mongoose! The main difference is SQL tables vs MongoDB collections.

---

## Module 5: Redis & BullMQ (Days 6-7)

### What is Redis?

**Redis** = **Remote Dictionary Server** = Super-fast key-value store in memory (RAM).

**Use Cases in OSLSR:**
1. **Caching:** Store frequently accessed data
2. **Session Storage:** JWT blacklist
3. **Rate Limiting:** Track API requests
4. **Job Queue:** BullMQ background jobs

### Hands-On Tutorial: Redis

#### Exercise 1: Basic Redis Operations

```bash
# Start Redis
docker run -d --name redis-tutorial -p 6379:6379 redis:7-alpine

# Connect to Redis CLI
docker exec -it redis-tutorial redis-cli

# You're now in Redis CLI (127.0.0.1:6379>)
```

```bash
# SET (store key-value)
SET name "Awwal"
# Response: OK

# GET (retrieve value)
GET name
# Response: "Awwal"

# SET with expiry (TTL = Time To Live)
SET session:abc123 "user_data" EX 3600  # Expires in 1 hour (3600 seconds)

# Check TTL
TTL session:abc123
# Response: 3598 (seconds remaining)

# INCREMENT (useful for counters)
SET page_views 0
INCR page_views  # Returns: 1
INCR page_views  # Returns: 2
GET page_views   # Returns: "2"

# HASH (like JavaScript object)
HSET user:1 name "Awwal" email "awwal@test.com" role "Admin"
HGET user:1 name     # Returns: "Awwal"
HGETALL user:1       # Returns all fields

# LIST (like JavaScript array)
LPUSH tasks "Task 1" "Task 2" "Task 3"
LRANGE tasks 0 -1    # Get all items

# SET (unique values)
SADD tags "redis" "database" "cache"
SMEMBERS tags

# DELETE key
DEL name

# Check if key exists
EXISTS name  # Returns: 0 (doesn't exist)

# Clear all data (careful!)
FLUSHALL
```

#### Exercise 2: Redis with Node.js

```bash
# Install ioredis
npm install ioredis
```

```typescript
// redis-tutorial.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

async function main() {
  // SET and GET
  await redis.set('name', 'Awwal');
  const name = await redis.get('name');
  console.log('Name:', name);

  // SET with expiry
  await redis.set('session:abc', 'user_data', 'EX', 3600);
  const ttl = await redis.ttl('session:abc');
  console.log('TTL:', ttl, 'seconds');

  // INCREMENT
  await redis.set('page_views', 0);
  await redis.incr('page_views');
  await redis.incr('page_views');
  const views = await redis.get('page_views');
  console.log('Page views:', views);

  // HASH
  await redis.hset('user:1', {
    name: 'Awwal',
    email: 'awwal@test.com',
    role: 'Admin'
  });
  const user = await redis.hgetall('user:1');
  console.log('User:', user);

  // RATE LIMITING example
  const ip = '192.168.1.1';
  const requests = await redis.incr(`rate:${ip}`);
  await redis.expire(`rate:${ip}`, 60); // Reset after 60 seconds

  if (requests > 10) {
    console.log('Rate limit exceeded!');
  } else {
    console.log(`Request ${requests}/10`);
  }

  await redis.quit();
}

main();
```

### BullMQ (Background Job Queue)

**Use Cases in OSLSR:**
- Process ODK webhooks (survey submissions)
- Run fraud detection (CPU-intensive)
- Send emails/SMS notifications
- Generate PDF reports

#### Exercise 3: BullMQ Basics

```bash
npm install bullmq
```

```typescript
// bullmq-tutorial.ts
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({ host: 'localhost', port: 6379 });

// Create queue
const emailQueue = new Queue('email', { connection });

// Add job to queue
async function sendWelcomeEmail(userId: string, email: string) {
  await emailQueue.add('welcome', {
    userId,
    email,
    subject: 'Welcome to OSLSR!',
    body: 'Thank you for registering...'
  });
  console.log('Email job added to queue');
}

// Create worker to process jobs
const worker = new Worker('email', async (job) => {
  console.log('Processing job:', job.id, job.name);
  console.log('Data:', job.data);

  // Simulate email sending
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Email sent to:', job.data.email);
}, { connection });

// Handle job completion
worker.on('completed', (job) => {
  console.log('Job completed:', job.id);
});

// Handle job failure
worker.on('failed', (job, err) => {
  console.error('Job failed:', job?.id, err);
});

// Add some jobs
await sendWelcomeEmail('user123', 'awwal@test.com');
await sendWelcomeEmail('user456', 'john@test.com');

// Keep process alive
await new Promise(() => {});
```

**Run it:**
```bash
npx tsx bullmq-tutorial.ts
```

---

## Module 6: NGINX Configuration (Days 1-2)

### What is NGINX?

**NGINX** = Web server + Reverse proxy

**Use Cases in OSLSR:**
1. **Serve React static files** (HTML, CSS, JS)
2. **Route traffic** to Node.js API, ODK Central
3. **SSL/HTTPS termination**
4. **Rate limiting**

### Hands-On Tutorial: NGINX

#### Exercise 1: NGINX as Static File Server

```bash
# Create simple HTML site
mkdir nginx-tutorial && cd nginx-tutorial
mkdir html
echo "<h1>Hello from NGINX!</h1>" > html/index.html

# Create NGINX config
cat > nginx.conf <<EOF
events {}

http {
  server {
    listen 80;
    server_name localhost;

    location / {
      root /usr/share/nginx/html;
      index index.html;
    }
  }
}
EOF

# Run NGINX
docker run -d \
  --name nginx-tutorial \
  -p 8080:80 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v $(pwd)/html:/usr/share/nginx/html:ro \
  nginx:alpine

# Open browser: http://localhost:8080
```

#### Exercise 2: NGINX as Reverse Proxy

```nginx
# nginx-reverse-proxy.conf
events {}

http {
  # Upstream (backend services)
  upstream api {
    server host.docker.internal:3000;
  }

  server {
    listen 80;

    # Serve React app
    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Node.js
    location /api/ {
      proxy_pass http://api;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
  }
}
```

**Test it:**
```bash
# Start Node.js API (in another terminal)
node -e "require('http').createServer((req,res)=>res.end('API Response')).listen(3000)"

# Start NGINX with reverse proxy config
docker run -d \
  --name nginx-proxy \
  -p 8080:80 \
  -v $(pwd)/nginx-reverse-proxy.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine

# Test
curl http://localhost:8080/api/  # Should show "API Response"
```

---

## Next Steps

Continue to:
- **[VPS Deployment Guide](04-vps-deployment-guide.md)** - Deploy to production VPS
- **[Troubleshooting Guide](06-troubleshooting-guide.md)** - Common issues and solutions

You now have the core knowledge needed for OSLSR development! 🎉
