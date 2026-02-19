/**
 * Messages and Message Receipts Schema
 *
 * Two-table design for supervisor ↔ enumerator team messaging.
 * Created in Story 4.2 (In-App Team Messaging).
 *
 * Design:
 * - `messages`: One row per message (direct or broadcast)
 * - `message_receipts`: One row per recipient (enables per-recipient read tracking on broadcasts)
 * - Broadcasts: messages.recipient_id = NULL, one receipt per assigned enumerator
 * - Direct: messages.recipient_id = target user, one receipt row
 * - Boundary enforcement via prep-8's TeamAssignmentService (not in schema layer)
 */

import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';
import { lgas } from './lgas.js';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Sender (always required)
  senderId: uuid('sender_id').notNull().references(() => users.id),

  // Recipient (NULL for broadcasts)
  recipientId: uuid('recipient_id').references(() => users.id),

  // LGA scope for geographic queries
  lgaId: uuid('lga_id').notNull().references(() => lgas.id),

  // Message type: 'direct' or 'broadcast'
  messageType: text('message_type', { enum: ['direct', 'broadcast'] }).notNull(),

  // Plain text content (no HTML, no JSONB)
  content: text('content').notNull(),

  // When the message was sent
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),

  // Seed data identification (ADR-017)
  isSeeded: boolean('is_seeded').default(false).notNull(),

  // Standard timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  senderIdIdx: index('idx_messages_sender_id').on(table.senderId),
  recipientIdIdx: index('idx_messages_recipient_id').on(table.recipientId),
  lgaIdIdx: index('idx_messages_lga_id').on(table.lgaId),
  sentAtIdx: index('idx_messages_sent_at').on(table.sentAt),
}));

export const messageReceipts = pgTable('message_receipts', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

  // Which message this receipt is for
  messageId: uuid('message_id').notNull().references(() => messages.id),

  // Which user is the recipient
  recipientId: uuid('recipient_id').notNull().references(() => users.id),

  // Delivery and read tracking
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),

  // Standard timestamp
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageIdIdx: index('idx_message_receipts_message_id').on(table.messageId),
  recipientIdIdx: index('idx_message_receipts_recipient_id').on(table.recipientId),
  // Partial index for efficient unread queries
  unreadIdx: index('idx_message_receipts_unread')
    .on(table.recipientId)
    .where(sql`read_at IS NULL`),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessageReceipt = typeof messageReceipts.$inferSelect;
export type NewMessageReceipt = typeof messageReceipts.$inferInsert;
