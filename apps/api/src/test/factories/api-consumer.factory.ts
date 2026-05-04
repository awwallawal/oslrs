/**
 * Test factory for `api_consumers` rows.
 *
 * Created in Story 9-11 (Schema Down Payment) so this story's tests can seed
 * Consumer-principal audit log fixtures, AND so Story 10-1 (Consumer
 * Authentication Layer) can reuse the same factory for its own service /
 * middleware / integration tests without duplicating setup.
 *
 * Usage:
 *
 *   import { createApiConsumer } from '../../test/factories/api-consumer.factory.js';
 *
 *   const consumer = await createApiConsumer();
 *   const piiConsumer = await createApiConsumer({
 *     name: 'ITF-SUPA',
 *     organisationType: 'federal_mda',
 *     dsaDocumentUrl: 'https://example.test/dsa-itf-supa-2026.pdf',
 *   });
 *
 * Cleanup is the caller's responsibility — track inserted ids and `await
 * db.delete(apiConsumers).where(inArray(apiConsumers.id, ids))` in `afterAll`.
 * Pattern matches the project's integration-test convention (`beforeAll` /
 * `afterAll`, never `beforeEach` / `afterEach`) per MEMORY.md "Key Patterns".
 */
import { db } from '../../db/index.js';
import {
  apiConsumers,
  type ApiConsumerOrganisationType,
  type ApiConsumerStatus,
} from '../../db/schema/api-consumers.js';
import { uuidv7 } from 'uuidv7';
import { randomUUID } from 'node:crypto';

export interface ApiConsumerOverrides {
  id?: string;
  name?: string;
  organisationType?: ApiConsumerOrganisationType;
  contactEmail?: string;
  dsaDocumentUrl?: string | null;
  status?: ApiConsumerStatus;
}

/**
 * Insert a single api_consumers row with sensible defaults; return the row.
 *
 * Each invocation generates a per-call random suffix (8 hex chars from a fresh
 * UUID v4) for the default name + email, so concurrent Vitest workers cannot
 * collide on the (name, contact_email) unique constraints.
 *
 * R2-M3: replaces the prior module-level `let counter = 0` (which was
 * vulnerable to parallel-test races — two workers calling `createApiConsumer()`
 * within the same JS event-loop tick could increment-read the counter
 * non-atomically OR start from `counter=0` independently in different worker
 * processes, both producing `Test Consumer 1`). UUID-based naming carries
 * 32 bits of randomness per call which is safe at any test-suite size.
 */
export async function createApiConsumer(
  overrides: ApiConsumerOverrides = {}
): Promise<typeof apiConsumers.$inferSelect> {
  const unique = randomUUID().slice(0, 8);
  const [row] = await db
    .insert(apiConsumers)
    .values({
      id: overrides.id ?? uuidv7(),
      name: overrides.name ?? `Test Consumer ${unique}`,
      organisationType: overrides.organisationType ?? 'state_mda',
      contactEmail:
        overrides.contactEmail ?? `test-consumer-${unique}@example.test`,
      dsaDocumentUrl:
        overrides.dsaDocumentUrl === undefined
          ? null
          : overrides.dsaDocumentUrl,
      status: overrides.status ?? 'active',
    })
    .returning();
  return row;
}
