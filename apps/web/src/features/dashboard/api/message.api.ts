import { apiClient } from '../../../lib/api-client';
import { sendDirectMessageSchema, sendBroadcastSchema } from '@oslsr/types';

export interface InboxThread {
  partnerId: string;
  partnerName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messageType: 'direct' | 'broadcast';
}

export interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string | null;
  messageType: 'direct' | 'broadcast';
  content: string;
  sentAt: string;
}

export interface ThreadResponse {
  messages: ThreadMessage[];
  nextCursor: string | null;
}

export interface MessageResponse {
  id: string;
  senderId: string;
  recipientId: string | null;
  lgaId: string;
  messageType: 'direct' | 'broadcast';
  content: string;
  sentAt: string;
}

export interface BroadcastResponse {
  message: MessageResponse;
  recipientCount: number;
}

export async function sendDirectMessage(recipientId: string, content: string): Promise<MessageResponse> {
  // Client-side validation with shared Zod schema (AC4.2.5)
  const validated = sendDirectMessageSchema.parse({ recipientId, content });
  const result = await apiClient('/messages/send', {
    method: 'POST',
    body: JSON.stringify(validated),
  });
  return result.data;
}

export async function sendBroadcast(content: string): Promise<BroadcastResponse> {
  // Client-side validation with shared Zod schema (AC4.2.5)
  const validated = sendBroadcastSchema.parse({ content });
  const result = await apiClient('/messages/broadcast', {
    method: 'POST',
    body: JSON.stringify(validated),
  });
  return result.data;
}

export async function fetchInbox(): Promise<InboxThread[]> {
  const result = await apiClient('/messages/inbox');
  return result.data;
}

export async function fetchThread(userId: string, cursor?: string, limit?: number): Promise<ThreadResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const queryString = params.toString();
  const result = await apiClient(`/messages/thread/${userId}${queryString ? `?${queryString}` : ''}`);
  return result.data;
}

export async function markThreadAsRead(userId: string): Promise<{ markedCount: number }> {
  const result = await apiClient(`/messages/thread/${userId}/read`, {
    method: 'PATCH',
  });
  return result.data;
}

export async function markMessageAsRead(messageId: string): Promise<{ updated: boolean }> {
  const result = await apiClient(`/messages/${messageId}/read`, {
    method: 'PATCH',
  });
  return result.data;
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  const result = await apiClient('/messages/unread-count');
  return result.data;
}
