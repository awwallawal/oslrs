import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { MessageController } from '../message.controller.js';

// ── Mock MessageService ─────────────────────────────────────────────────

const mockSendDirectMessage = vi.fn();
const mockSendBroadcast = vi.fn();
const mockGetInbox = vi.fn();
const mockGetThread = vi.fn();
const mockMarkThreadAsRead = vi.fn();
const mockMarkAsRead = vi.fn();
const mockGetUnreadCount = vi.fn();

vi.mock('../../services/message.service.js', () => ({
  MessageService: {
    sendDirectMessage: (...args: unknown[]) => mockSendDirectMessage(...args),
    sendBroadcast: (...args: unknown[]) => mockSendBroadcast(...args),
    getInbox: (...args: unknown[]) => mockGetInbox(...args),
    getThread: (...args: unknown[]) => mockGetThread(...args),
    markThreadAsRead: (...args: unknown[]) => mockMarkThreadAsRead(...args),
    markAsRead: (...args: unknown[]) => mockMarkAsRead(...args),
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  },
}));

// ── Fixtures ────────────────────────────────────────────────────────────

const MESSAGE_ID = '01234567-0000-7000-8000-000000000030';
const RECIPIENT_ID = '01234567-0000-7000-8000-000000000002';
const LGA_ID = '01234567-0000-7000-8000-000000000010';

const makeMessage = (overrides = {}) => ({
  id: MESSAGE_ID,
  senderId: 'sup-123',
  recipientId: RECIPIENT_ID,
  lgaId: LGA_ID,
  messageType: 'direct' as const,
  content: 'Hello team',
  sentAt: new Date().toISOString(),
  ...overrides,
});

function createMocks(userOverrides?: Record<string, unknown>) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes = { json: jsonMock, status: statusMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  const mockReq = {
    user: { sub: 'sup-123', role: 'supervisor', lgaId: LGA_ID, ...userOverrides },
    body: {},
    params: {},
    query: {},
  } as unknown as Request;
  return { mockReq, mockRes, mockNext, jsonMock, statusMock };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('MessageController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('sendDirect', () => {
    it('returns 201 with created message on valid request', async () => {
      const message = makeMessage();
      mockSendDirectMessage.mockResolvedValueOnce(message);
      const { mockReq, mockRes, mockNext, jsonMock, statusMock } = createMocks();
      mockReq.body = { recipientId: RECIPIENT_ID, content: 'Hello team' };

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({ data: message });
      expect(mockSendDirectMessage).toHaveBeenCalledWith(
        'sup-123', 'supervisor', RECIPIENT_ID, 'Hello team', LGA_ID,
      );
    });

    it('returns 400 when recipientId is missing', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.body = { content: 'Hello' };

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });

    it('returns 400 when content is empty', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.body = { recipientId: RECIPIENT_ID, content: '' };

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });

    it('returns 400 when content exceeds 2000 characters', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.body = { recipientId: RECIPIENT_ID, content: 'a'.repeat(2001) };

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });

    it('passes service errors (403 boundary violation) to next', async () => {
      const error = { code: 'TEAM_BOUNDARY_VIOLATION', statusCode: 403, message: 'Not assigned' };
      mockSendDirectMessage.mockRejectedValueOnce(error);
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.body = { recipientId: RECIPIENT_ID, content: 'Hello' };

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('returns 401 when user is not authenticated', async () => {
      const { mockRes, mockNext } = createMocks();
      const mockReq = { user: null, body: {}, params: {}, query: {} } as unknown as Request;

      await MessageController.sendDirect(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AUTH_REQUIRED', statusCode: 401 }),
      );
    });
  });

  describe('sendBroadcast', () => {
    it('returns 201 with broadcast result for supervisor', async () => {
      const result = { message: makeMessage({ messageType: 'broadcast', recipientId: null }), recipientCount: 3 };
      mockSendBroadcast.mockResolvedValueOnce(result);
      const { mockReq, mockRes, mockNext, jsonMock, statusMock } = createMocks();
      mockReq.body = { content: 'Team update' };

      await MessageController.sendBroadcast(mockReq, mockRes, mockNext);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({ data: result });
    });

    it('returns 403 when non-supervisor attempts broadcast', async () => {
      const { mockReq, mockRes, mockNext } = createMocks({ role: 'enumerator' });
      mockReq.body = { content: 'Hello' };

      await MessageController.sendBroadcast(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }),
      );
    });

    it('returns 400 when content is empty', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.body = { content: '' };

      await MessageController.sendBroadcast(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });
  });

  describe('getInbox', () => {
    it('returns 200 with inbox threads', async () => {
      const inbox = [{ partnerId: RECIPIENT_ID, partnerName: 'Enum 1', lastMessage: 'Hi', lastMessageAt: new Date(), unreadCount: 2, messageType: 'direct' }];
      mockGetInbox.mockResolvedValueOnce(inbox);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

      await MessageController.getInbox(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: inbox });
      expect(mockGetInbox).toHaveBeenCalledWith('sup-123');
    });
  });

  describe('getThread', () => {
    it('returns 200 with paginated thread', async () => {
      const threadData = { messages: [makeMessage()], nextCursor: null };
      mockGetThread.mockResolvedValueOnce(threadData);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
      mockReq.params = { userId: RECIPIENT_ID };
      mockReq.query = {};

      await MessageController.getThread(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: threadData });
      expect(mockGetThread).toHaveBeenCalledWith('sup-123', RECIPIENT_ID, undefined, 50);
    });

    it('returns 400 when userId param is missing', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.params = {};

      await MessageController.getThread(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });
  });

  describe('markThreadAsRead', () => {
    it('returns 200 with markedCount on success', async () => {
      mockMarkThreadAsRead.mockResolvedValueOnce(3);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
      mockReq.params = { userId: RECIPIENT_ID };

      await MessageController.markThreadAsRead(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: { markedCount: 3 } });
      expect(mockMarkThreadAsRead).toHaveBeenCalledWith('sup-123', RECIPIENT_ID);
    });

    it('returns 400 when userId param is missing', async () => {
      const { mockReq, mockRes, mockNext } = createMocks();
      mockReq.params = {};

      await MessageController.markThreadAsRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      );
    });

    it('returns 401 when user is not authenticated', async () => {
      const { mockRes, mockNext } = createMocks();
      const mockReq = { user: null, body: {}, params: { userId: RECIPIENT_ID }, query: {} } as unknown as Request;

      await MessageController.markThreadAsRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AUTH_REQUIRED', statusCode: 401 }),
      );
    });
  });

  describe('markAsRead', () => {
    it('returns 200 with updated=true when receipt found', async () => {
      mockMarkAsRead.mockResolvedValueOnce(true);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
      mockReq.params = { messageId: MESSAGE_ID };

      await MessageController.markAsRead(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: { updated: true } });
      expect(mockMarkAsRead).toHaveBeenCalledWith(MESSAGE_ID, 'sup-123');
    });

    it('returns 200 with updated=false when already read', async () => {
      mockMarkAsRead.mockResolvedValueOnce(false);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();
      mockReq.params = { messageId: MESSAGE_ID };

      await MessageController.markAsRead(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: { updated: false } });
    });
  });

  describe('getUnreadCount', () => {
    it('returns 200 with unread count', async () => {
      mockGetUnreadCount.mockResolvedValueOnce(5);
      const { mockReq, mockRes, mockNext, jsonMock } = createMocks();

      await MessageController.getUnreadCount(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 5 } });
      expect(mockGetUnreadCount).toHaveBeenCalledWith('sup-123');
    });
  });
});
