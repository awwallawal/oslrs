import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  name: text('name').notNull().unique(),
  description: text('description'),
  isSeeded: boolean('is_seeded').default(false).notNull(), // ADR-017: Seed data identification
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
