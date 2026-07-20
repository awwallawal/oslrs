import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const lgas = pgTable('lgas', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(), // Canonical slug for the LGA — underscore-delimited (e.g. 'ibadan_north', 'ona_ara'); see src/db/seeds/lgas.seed.ts
  isSeeded: boolean('is_seeded').default(false).notNull(), // ADR-017: Seed data identification
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
