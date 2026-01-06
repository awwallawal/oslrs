import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { roles } from './roles.js';
import { lgas } from './lgas.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  phone: text('phone').unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'), // Nullable for invited state
  nin: text('nin').unique(), // Nullable for invited state
  roleId: uuid('role_id').notNull().references(() => roles.id),
  lgaId: uuid('lga_id').references(() => lgas.id), // Nullable for state-wide roles
  status: text('status', { enum: ['invited', 'active', 'deactivated'] }).notNull().default('invited'),
  invitationToken: text('invitation_token').unique(),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
