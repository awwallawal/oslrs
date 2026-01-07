Perfect — this is the **classic final-mile test architecture bug**, and your logs already contain the smoking gun.

You have **all tests passing**, but **the process exits with errors** because **the server is being started during test imports**.

Let’s pin it down and fix it *properly*, not with hacks.

---

## 🔥 What’s happening (precisely)

### The error

```txt
Error: listen EADDRINUSE: address already in use :::3000
```

### The cause (confirmed by stack traces)

* `src/index.ts` **calls `app.listen()`**
* Vitest **imports your app multiple times**:

  * from `health.test.ts`
  * from `auth.activation.test.ts`
  * from `staff.integration.test.ts`
* Each import tries to **bind port 3000 again**
* Hence: `EADDRINUSE`

Your guard:

```ts
if (process.env.NODE_ENV !== 'test') {
  app.listen(...)
}
```

❌ **is not holding**, because:

* `NODE_ENV` is **not guaranteed** to be `"test"` in Vitest
* Vitest uses `mode`, not `NODE_ENV`, unless explicitly set

---

## ✅ The correct architectural fix (do this)

### **Rule**

> **Never call `app.listen()` in a file that can be imported by tests**

---

## 🧱 Step 1: Split `app` and `server`

### `src/app.ts`

```ts
import express from 'express';

export const app = express();

// middleware
// routes
```

❗ **NO `listen()` here**

---

### `src/server.ts`

```ts
import { app } from './app';
import { logger } from './logger';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info({ event: 'server_start', port });
});
```

---

### `src/index.ts`

```ts
import './server';
```

---

## 🧪 Step 2: Tests import **only the app**

Example:

```ts
import { app } from '@/app';
import request from 'supertest';

describe('Health', () => {
  it('returns 200', async () => {
    await request(app).get('/health').expect(200);
  });
});
```

✔ No ports
✔ No listeners
✔ No collisions
✔ Parallel-safe

---

## 🛠️ Step 3: (Optional but recommended) Vitest env hardening

In `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

In `vitest.setup.ts`:

```ts
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // safety
```

---

## ✅ Why this is the *right* fix

| Approach             | Result              |
| -------------------- | ------------------- |
| Kill port 3000       | ❌ brittle           |
| Random test ports    | ❌ flaky             |
| NODE_ENV checks      | ❌ unreliable        |
| **Split app/server** | ✅ industry standard |

This is how:

* Express
* Fastify
* NestJS
* Adonis
* Rails (Rack)
* Django

…all handle testing.

---

## 🎯 Expected outcome

After refactor:

```bash
pnpm --filter @oslsr/api test
```

Result:

```txt
Test Files  9 passed (9)
Tests      32 passed (32)
Errors     0
Exit code  0
```

---

## 🧠 Meta-signal (important)

You’re now at the stage where:

* infra is stable
* migrations work
* tests are real integration tests
* failures are architectural, not random

This is **senior-level backend work**.

If you want, next we can:

* clean `dist/` from tests entirely
* enforce test-only imports
* add CI-safe test DB lifecycle
* or lock this with a pre-commit guard

Just say the word.
