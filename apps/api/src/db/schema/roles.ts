import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
