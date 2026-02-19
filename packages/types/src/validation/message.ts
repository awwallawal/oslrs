/**
 * Message validation schemas shared between client and server.
 *
 * Created in Story 4.2 (In-App Team Messaging).
 * Used by message controller (server) and message hooks (client).
 */

import { z } from 'zod';

export const sendDirectMessageSchema = z.object({
  recipientId: z.string().uuid('recipientId must be a valid UUID'),
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
});
export type SendDirectMessageDto = z.infer<typeof sendDirectMessageSchema>;

export const sendBroadcastSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
});
export type SendBroadcastDto = z.infer<typeof sendBroadcastSchema>;

export const getThreadQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type GetThreadQueryDto = z.infer<typeof getThreadQuerySchema>;
