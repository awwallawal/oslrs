import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  actorId: uuid('actor_id').references(() => users.id), // Nullable if system action?
  action: text('action').notNull(),
  targetResource: text('target_resource'), // e.g. 'users'
  targetId: uuid('target_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
