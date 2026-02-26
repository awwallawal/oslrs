/**
 * Message Service
 *
 * Handles team messaging between supervisors and enumerators.
 * Created in Story 4.2 (In-App Team Messaging).
 *
 * Key behaviors:
 * - sendDirectMessage: supervisor ↔ enumerator with boundary enforcement via prep-8
 * - sendBroadcast: supervisor → all assigned enumerators
 * - getInbox: conversation list with unread counts
 * - getThread: paginated message history between two users
 * - markAsRead: update receipt read timestamp
 * - getUnreadCount: total unread messages for a user
 */

import { db } from '../db/index.js';
import { messages, messageReceipts } from '../db/schema/index.js';
import { AuditService } from './audit.service.js';
import { users } from '../db/schema/users.js';
import { eq, and, or, isNull, desc, sql, count } from 'drizzle-orm';
import { TeamAssignmentService } from './team-assignment.service.js';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'message-service' });

export class MessageService {
  /**
   * Send a direct message from one user to another.
   * Enforces team assignment boundary: supervisor ↔ assigned enumerator only.
   */
  static async sendDirectMessage(
    senderId: string,
    senderRole: string,
    recipientId: string,
    content: string,
    lgaId: string,
  ) {
    // Boundary enforcement using prep-8's assignment service
    if (senderRole === 'supervisor') {
      // Supervisor → enumerator: check enumerator is assigned to this supervisor
      const assignedEnumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(senderId);
      if (!assignedEnumeratorIds.includes(recipientId)) {
        throw new AppError('TEAM_BOUNDARY_VIOLATION', 'Cannot message a user outside your assigned team', 403);
      }
    } else if (senderRole === 'enumerator') {
      // Enumerator → supervisor: check sender is assigned to this supervisor (reverse lookup)
      const assignedEnumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(recipientId);
      if (!assignedEnumeratorIds.includes(senderId)) {
        throw new AppError('TEAM_BOUNDARY_VIOLATION', 'Cannot message a user outside your assigned team', 403);
      }
    } else {
      throw new AppError('FORBIDDEN', 'Only supervisors and enumerators can send messages', 403);
    }

    // Create message
    const [message] = await db
      .insert(messages)
      .values({
        senderId,
        recipientId,
        lgaId,
        messageType: 'direct',
        content,
      })
      .returning();

    // Create receipt for recipient
    await db.insert(messageReceipts).values({
      messageId: message.id,
      recipientId,
    });

    // Audit log (fire-and-forget)
    AuditService.logAction({
      actorId: senderId,
      action: 'message.send',
      targetResource: 'messages',
      targetId: message.id,
      details: { messageType: 'direct', recipientId },
    });

    logger.info({ event: 'message.sent', messageId: message.id, senderId, recipientId, messageType: 'direct' });

    return message;
  }

  /**
   * Send a broadcast message from a supervisor to all assigned enumerators.
   */
  static async sendBroadcast(
    supervisorId: string,
    content: string,
    lgaId: string,
  ) {
    // Resolve assigned enumerator IDs
    const enumeratorIds = await TeamAssignmentService.getEnumeratorIdsForSupervisor(supervisorId);

    if (enumeratorIds.length === 0) {
      throw new AppError('NO_TEAM_MEMBERS', 'No assigned enumerators found for broadcast', 400);
    }

    // Create broadcast message (recipientId = null)
    const [message] = await db
      .insert(messages)
      .values({
        senderId: supervisorId,
        recipientId: null,
        lgaId,
        messageType: 'broadcast',
        content,
      })
      .returning();

    // Create one receipt per assigned enumerator
    const receiptValues = enumeratorIds.map((enumeratorId) => ({
      messageId: message.id,
      recipientId: enumeratorId,
    }));

    await db.insert(messageReceipts).values(receiptValues);

    // Audit log (fire-and-forget)
    AuditService.logAction({
      actorId: supervisorId,
      action: 'message.send',
      targetResource: 'messages',
      targetId: message.id,
      details: { messageType: 'broadcast', recipientCount: enumeratorIds.length },
    });

    logger.info({
      event: 'message.broadcast',
      messageId: message.id,
      supervisorId,
      recipientCount: enumeratorIds.length,
    });

    return { message, recipientCount: enumeratorIds.length, enumeratorIds };
  }

  /**
   * Get inbox for a user: conversation partners with latest message preview and unread count.
   * Uses a single efficient query (no N+1).
   */
  static async getInbox(userId: string) {
    // Limit to recent messages to prevent loading entire history into memory.
    // With 3 enumerators per supervisor and moderate usage, 500 covers months of history.
    // TODO: Replace with SQL GROUP BY aggregation for production scale.
    const INBOX_QUERY_LIMIT = 500;

    // Get recent receipts for this user (messages they received) with message + sender info
    const receivedReceipts = await db
      .select({
        messageId: messages.id,
        senderId: messages.senderId,
        senderName: users.fullName,
        content: messages.content,
        messageType: messages.messageType,
        sentAt: messages.sentAt,
        readAt: messageReceipts.readAt,
      })
      .from(messageReceipts)
      .innerJoin(messages, eq(messageReceipts.messageId, messages.id))
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messageReceipts.recipientId, userId))
      .orderBy(desc(messages.sentAt))
      .limit(INBOX_QUERY_LIMIT);

    // Get recent messages this user sent (for two-way thread display)
    const sentMessages = await db
      .select({
        messageId: messages.id,
        recipientId: messages.recipientId,
        recipientName: users.fullName,
        content: messages.content,
        messageType: messages.messageType,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .leftJoin(users, eq(messages.recipientId, users.id))
      .where(and(
        eq(messages.senderId, userId),
        eq(messages.messageType, 'direct'),
      ))
      .orderBy(desc(messages.sentAt))
      .limit(INBOX_QUERY_LIMIT);

    // Build conversation map
    const conversations = new Map<string, {
      partnerId: string;
      partnerName: string;
      lastMessage: string;
      lastMessageAt: Date;
      unreadCount: number;
      messageType: string;
    }>();

    // Pre-compute unread counts in a single O(n) pass (avoids O(n²) filter-inside-loop)
    const unreadCounts = new Map<string, number>();
    for (const r of receivedReceipts) {
      if (!r.readAt) {
        const key = r.messageType === 'broadcast' ? `broadcast:${r.senderId}` : r.senderId;
        unreadCounts.set(key, (unreadCounts.get(key) ?? 0) + 1);
      }
    }

    // Process received messages
    for (const receipt of receivedReceipts) {
      if (receipt.messageType === 'broadcast') {
        // Group broadcasts under the sender
        const key = `broadcast:${receipt.senderId}`;
        const existing = conversations.get(key);
        if (!existing || receipt.sentAt > existing.lastMessageAt) {
          conversations.set(key, {
            partnerId: receipt.senderId,
            partnerName: receipt.senderName,
            lastMessage: receipt.content,
            lastMessageAt: receipt.sentAt,
            unreadCount: unreadCounts.get(key) ?? 0,
            messageType: 'broadcast',
          });
        }
        continue;
      }

      // Direct message thread
      const partnerId = receipt.senderId;
      const existing = conversations.get(partnerId);

      if (!existing || receipt.sentAt > existing.lastMessageAt) {
        conversations.set(partnerId, {
          partnerId,
          partnerName: receipt.senderName,
          lastMessage: receipt.content,
          lastMessageAt: receipt.sentAt,
          unreadCount: unreadCounts.get(partnerId) ?? 0,
          messageType: 'direct',
        });
      }
    }

    // Process sent messages (add partners the user messaged first but hasn't received reply from)
    for (const sent of sentMessages) {
      if (!sent.recipientId) continue;
      const partnerId = sent.recipientId;
      const existing = conversations.get(partnerId);
      if (!existing || sent.sentAt > existing.lastMessageAt) {
        conversations.set(partnerId, {
          partnerId,
          partnerName: sent.recipientName || 'Unknown',
          lastMessage: sent.content,
          lastMessageAt: sent.sentAt,
          unreadCount: existing?.unreadCount ?? 0,
          messageType: 'direct',
        });
      }
    }

    // Sort by latest message timestamp descending
    return Array.from(conversations.values())
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  /**
   * Get paginated thread between two users.
   * Includes direct messages and broadcasts from the other user that this user received.
   * Uses LEFT JOIN with message_receipts to filter broadcasts in SQL (no N+1).
   * Cursor pagination uses (sentAt, id) compound key for reliability.
   */
  static async getThread(
    userId: string,
    otherUserId: string,
    cursor?: string,
    limit: number = 50,
  ) {
    // LEFT JOIN with message_receipts so we can filter broadcasts in SQL
    const baseConditions = or(
      // Direct messages between the two users (either direction)
      and(
        eq(messages.senderId, userId),
        eq(messages.recipientId, otherUserId),
        eq(messages.messageType, 'direct'),
      ),
      and(
        eq(messages.senderId, otherUserId),
        eq(messages.recipientId, userId),
        eq(messages.messageType, 'direct'),
      ),
      // Broadcasts from the other user WHERE this user has a receipt (JOIN filter)
      and(
        eq(messages.senderId, otherUserId),
        eq(messages.messageType, 'broadcast'),
        sql`${messageReceipts.id} IS NOT NULL`,
      ),
    );

    // Compound cursor format: "sentAt_ISO|messageId"
    let cursorCondition;
    if (cursor) {
      const [cursorDate, cursorId] = cursor.split('|');
      const parsedDate = new Date(cursorDate);
      cursorCondition = sql`(${messages.sentAt} < ${parsedDate} OR (${messages.sentAt} = ${parsedDate} AND ${messages.id} < ${cursorId || ''}))`;
    }

    const results = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        senderName: users.fullName,
        recipientId: messages.recipientId,
        messageType: messages.messageType,
        content: messages.content,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(
        messageReceipts,
        and(
          eq(messageReceipts.messageId, messages.id),
          eq(messageReceipts.recipientId, userId),
        ),
      )
      .where(and(baseConditions, cursorCondition))
      .orderBy(desc(messages.sentAt), desc(messages.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const trimmedResults = hasMore ? results.slice(0, limit) : results;
    const lastItem = trimmedResults[trimmedResults.length - 1];

    return {
      messages: trimmedResults,
      nextCursor: hasMore && lastItem
        ? `${lastItem.sentAt.toISOString()}|${lastItem.id}`
        : null,
    };
  }

  /**
   * Batch mark all unread messages in a thread as read for a recipient.
   * Used when opening a thread to avoid N individual markAsRead calls.
   */
  static async markThreadAsRead(userId: string, otherUserId: string): Promise<number> {
    // Find all unread receipts for messages in this thread
    const result = await db
      .update(messageReceipts)
      .set({ readAt: new Date() })
      .where(and(
        eq(messageReceipts.recipientId, userId),
        isNull(messageReceipts.readAt),
        sql`${messageReceipts.messageId} IN (
          SELECT id FROM messages
          WHERE (sender_id = ${otherUserId} AND recipient_id = ${userId} AND message_type = 'direct')
             OR (sender_id = ${otherUserId} AND message_type = 'broadcast')
        )`,
      ))
      .returning();

    if (result.length > 0) {
      // Audit log (fire-and-forget) — single entry for batch operation.
      // Note: targetId uses conversation partner ID (not individual messageId) because
      // this is a batch operation marking N messages at once. Individual message IDs
      // would require a separate audit row per message, which defeats the batch purpose.
      AuditService.logAction({
        actorId: userId,
        action: 'message.read',
        targetResource: 'messages',
        targetId: otherUserId,
        details: { readBy: userId, markedCount: result.length, type: 'batch_thread' },
      });
    }

    return result.length;
  }

  /**
   * Mark a message as read for a specific recipient.
   * Idempotent: returns false if already read or not found.
   */
  static async markAsRead(messageId: string, recipientId: string): Promise<boolean> {
    const [updated] = await db
      .update(messageReceipts)
      .set({ readAt: new Date() })
      .where(and(
        eq(messageReceipts.messageId, messageId),
        eq(messageReceipts.recipientId, recipientId),
        isNull(messageReceipts.readAt),
      ))
      .returning();

    if (updated) {
      // Audit log (fire-and-forget)
      AuditService.logAction({
        actorId: recipientId,
        action: 'message.read',
        targetResource: 'messages',
        targetId: messageId,
        details: { readBy: recipientId },
      });
    }

    return !!updated;
  }

  /**
   * Get total unread message count for a user.
   * Single indexed query on the partial index.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(messageReceipts)
      .where(and(
        eq(messageReceipts.recipientId, userId),
        isNull(messageReceipts.readAt),
      ));

    return result?.count ?? 0;
  }
}
