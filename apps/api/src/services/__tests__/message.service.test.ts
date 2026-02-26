import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from '../message.service.js';

// ── Chainable DB Mock ─────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockReceiptsInsertValues = vi.fn();
const mockUpdateReturning = vi.fn();
// Queued results for db.select() chains — each call to select() shifts one result off
const selectResults: any[][] = [];

function createChain(terminalResult?: any) {
  const chain: any = {};
  ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy'].forEach((m) => {
    chain[m] = () => chain;
  });
  chain.limit = () => {
    const result = terminalResult ?? selectResults.shift() ?? [];
    return result;
  };
  // When chain is awaited without .limit() (e.g., getUnreadCount)
  chain.then = (resolve: (v: any) => void) => {
    resolve(terminalResult ?? selectResults.shift() ?? []);
  };
  return chain;
}

let insertCallCount = 0;

vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => {
      insertCallCount++;
      const callNum = insertCallCount;
      return {
        values: (vals: any) => {
          if (callNum === 1) {
            return {
              returning: () => mockInsertReturning(vals),
              catch: vi.fn(),
            };
          }
          if (callNum === 2) {
            mockReceiptsInsertValues(vals);
            const result = Promise.resolve();
            (result as any).catch = vi.fn().mockReturnValue(result);
            return result;
          }
          // Audit or batch operations
          return {
            returning: () => mockUpdateReturning(vals),
            catch: vi.fn(),
          };
        },
      };
    },
    update: () => ({
      set: (vals: any) => ({
        where: () => ({
          returning: () => mockUpdateReturning(vals),
        }),
      }),
    }),
    select: () => createChain(),
    query: {
      messageReceipts: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// ── Mock TeamAssignmentService ──────────────────────────────────────────

const mockGetEnumeratorIds = vi.fn();

vi.mock('../team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: any[]) => mockGetEnumeratorIds(...args),
  },
}));

vi.mock('../audit.service.js', () => ({
  AuditService: {
    logAction: vi.fn(),
    logActionTx: vi.fn(),
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Fixtures ────────────────────────────────────────────────────────────

const SUPERVISOR_ID = '01234567-0000-7000-8000-000000000001';
const ENUMERATOR_ID_1 = '01234567-0000-7000-8000-000000000002';
const ENUMERATOR_ID_2 = '01234567-0000-7000-8000-000000000003';
const LGA_ID = '01234567-0000-7000-8000-000000000010';
const MESSAGE_ID = '01234567-0000-7000-8000-000000000030';
const MESSAGE_ID_2 = '01234567-0000-7000-8000-000000000031';

const makeMessage = (overrides = {}) => ({
  id: MESSAGE_ID,
  senderId: SUPERVISOR_ID,
  recipientId: ENUMERATOR_ID_1,
  lgaId: LGA_ID,
  messageType: 'direct' as const,
  content: 'Hello team member',
  sentAt: new Date('2026-02-19T10:00:00Z'),
  isSeeded: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('MessageService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    insertCallCount = 0;
    selectResults.length = 0;
  });

  describe('sendDirectMessage', () => {
    it('creates message and receipt when supervisor messages assigned enumerator', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([ENUMERATOR_ID_1, ENUMERATOR_ID_2]);
      const message = makeMessage();
      mockInsertReturning.mockReturnValueOnce([message]);

      const result = await MessageService.sendDirectMessage(
        SUPERVISOR_ID, 'supervisor', ENUMERATOR_ID_1, 'Hello team member', LGA_ID,
      );

      expect(result).toEqual(message);
      expect(mockGetEnumeratorIds).toHaveBeenCalledWith(SUPERVISOR_ID);
      expect(mockInsertReturning).toHaveBeenCalledTimes(1);
      expect(mockReceiptsInsertValues).toHaveBeenCalledTimes(1);
    });

    it('creates message when enumerator messages their supervisor', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([ENUMERATOR_ID_1]);
      const message = makeMessage({ senderId: ENUMERATOR_ID_1, recipientId: SUPERVISOR_ID });
      mockInsertReturning.mockReturnValueOnce([message]);

      const result = await MessageService.sendDirectMessage(
        ENUMERATOR_ID_1, 'enumerator', SUPERVISOR_ID, 'Question about assignment', LGA_ID,
      );

      expect(result).toEqual(message);
      expect(mockGetEnumeratorIds).toHaveBeenCalledWith(SUPERVISOR_ID);
    });

    it('throws TEAM_BOUNDARY_VIOLATION when supervisor messages unassigned enumerator', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([ENUMERATOR_ID_2]);

      await expect(
        MessageService.sendDirectMessage(SUPERVISOR_ID, 'supervisor', ENUMERATOR_ID_1, 'Hello', LGA_ID),
      ).rejects.toMatchObject({
        code: 'TEAM_BOUNDARY_VIOLATION',
        statusCode: 403,
      });
    });

    it('throws TEAM_BOUNDARY_VIOLATION when enumerator messages non-assigned supervisor', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([]);

      await expect(
        MessageService.sendDirectMessage(ENUMERATOR_ID_1, 'enumerator', SUPERVISOR_ID, 'Hello', LGA_ID),
      ).rejects.toMatchObject({
        code: 'TEAM_BOUNDARY_VIOLATION',
        statusCode: 403,
      });
    });

    it('throws FORBIDDEN when non-field role attempts to send', async () => {
      await expect(
        MessageService.sendDirectMessage('user-id', 'data_entry_clerk', ENUMERATOR_ID_1, 'Hello', LGA_ID),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });
  });

  describe('sendBroadcast', () => {
    it('creates broadcast message with receipts for all assigned enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([ENUMERATOR_ID_1, ENUMERATOR_ID_2]);
      const message = makeMessage({ recipientId: null, messageType: 'broadcast' });
      mockInsertReturning.mockReturnValueOnce([message]);

      const result = await MessageService.sendBroadcast(SUPERVISOR_ID, 'Team update', LGA_ID);

      expect(result.message).toEqual(message);
      expect(result.recipientCount).toBe(2);
      expect(mockReceiptsInsertValues).toHaveBeenCalledTimes(1);
      const receiptValues = mockReceiptsInsertValues.mock.calls[0][0];
      expect(receiptValues).toHaveLength(2);
    });

    it('throws NO_TEAM_MEMBERS when supervisor has no assigned enumerators', async () => {
      mockGetEnumeratorIds.mockResolvedValueOnce([]);

      await expect(
        MessageService.sendBroadcast(SUPERVISOR_ID, 'Hello team', LGA_ID),
      ).rejects.toMatchObject({
        code: 'NO_TEAM_MEMBERS',
        statusCode: 400,
      });
    });
  });

  describe('getInbox', () => {
    it('returns conversation threads sorted by latest message', async () => {
      // First select: received receipts
      selectResults.push([
        {
          messageId: MESSAGE_ID,
          senderId: ENUMERATOR_ID_1,
          senderName: 'Enum One',
          content: 'Hello supervisor',
          messageType: 'direct',
          sentAt: new Date('2026-02-19T10:00:00Z'),
          readAt: null,
        },
        {
          messageId: MESSAGE_ID_2,
          senderId: ENUMERATOR_ID_2,
          senderName: 'Enum Two',
          content: 'All done',
          messageType: 'direct',
          sentAt: new Date('2026-02-19T09:00:00Z'),
          readAt: new Date('2026-02-19T09:30:00Z'),
        },
      ]);
      // Second select: sent messages
      selectResults.push([]);

      const inbox = await MessageService.getInbox(SUPERVISOR_ID);

      expect(inbox).toHaveLength(2);
      // Sorted by latest message first
      expect(inbox[0].partnerId).toBe(ENUMERATOR_ID_1);
      expect(inbox[0].partnerName).toBe('Enum One');
      expect(inbox[0].unreadCount).toBe(1);
      expect(inbox[1].partnerId).toBe(ENUMERATOR_ID_2);
      expect(inbox[1].unreadCount).toBe(0);
    });

    it('returns empty array when no messages', async () => {
      selectResults.push([]); // received
      selectResults.push([]); // sent

      const inbox = await MessageService.getInbox(SUPERVISOR_ID);
      expect(inbox).toEqual([]);
    });

    it('includes sent messages for threads where user messaged first', async () => {
      selectResults.push([]); // No received messages
      // Sent messages
      selectResults.push([
        {
          messageId: MESSAGE_ID,
          recipientId: ENUMERATOR_ID_1,
          recipientName: 'Enum One',
          content: 'Hello, welcome to the team',
          messageType: 'direct',
          sentAt: new Date('2026-02-19T10:00:00Z'),
        },
      ]);

      const inbox = await MessageService.getInbox(SUPERVISOR_ID);

      expect(inbox).toHaveLength(1);
      expect(inbox[0].partnerId).toBe(ENUMERATOR_ID_1);
      expect(inbox[0].lastMessage).toBe('Hello, welcome to the team');
    });

    it('groups broadcast messages under sender', async () => {
      selectResults.push([
        {
          messageId: MESSAGE_ID,
          senderId: SUPERVISOR_ID,
          senderName: 'Supervisor A',
          content: 'Team broadcast',
          messageType: 'broadcast',
          sentAt: new Date('2026-02-19T10:00:00Z'),
          readAt: null,
        },
      ]);
      selectResults.push([]); // sent

      const inbox = await MessageService.getInbox(ENUMERATOR_ID_1);

      expect(inbox).toHaveLength(1);
      expect(inbox[0].messageType).toBe('broadcast');
      expect(inbox[0].unreadCount).toBe(1);
    });
  });

  describe('getThread', () => {
    it('returns messages in chronological order', async () => {
      const msg1 = {
        id: MESSAGE_ID,
        senderId: SUPERVISOR_ID,
        senderName: 'Supervisor A',
        recipientId: ENUMERATOR_ID_1,
        messageType: 'direct',
        content: 'Hello',
        sentAt: new Date('2026-02-19T10:00:00Z'),
      };
      const msg2 = {
        id: MESSAGE_ID_2,
        senderId: ENUMERATOR_ID_1,
        senderName: 'Enum One',
        recipientId: SUPERVISOR_ID,
        messageType: 'direct',
        content: 'Hi there',
        sentAt: new Date('2026-02-19T10:01:00Z'),
      };
      selectResults.push([msg2, msg1]); // DB returns desc order

      const thread = await MessageService.getThread(SUPERVISOR_ID, ENUMERATOR_ID_1);

      expect(thread.messages).toHaveLength(2);
      expect(thread.nextCursor).toBeNull();
    });

    it('returns nextCursor when more messages exist (hasMore)', async () => {
      // Simulate limit+1 results (more than limit=2 for testing)
      const msgs = Array.from({ length: 3 }, (_, i) => ({
        id: `msg-${i}`,
        senderId: SUPERVISOR_ID,
        senderName: 'Supervisor A',
        recipientId: ENUMERATOR_ID_1,
        messageType: 'direct',
        content: `Message ${i}`,
        sentAt: new Date(`2026-02-19T10:0${i}:00Z`),
      }));
      selectResults.push(msgs);

      const thread = await MessageService.getThread(SUPERVISOR_ID, ENUMERATOR_ID_1, undefined, 2);

      expect(thread.messages).toHaveLength(2);
      expect(thread.nextCursor).not.toBeNull();
    });

    it('returns empty messages for no data', async () => {
      selectResults.push([]);

      const thread = await MessageService.getThread(SUPERVISOR_ID, ENUMERATOR_ID_1);

      expect(thread.messages).toEqual([]);
      expect(thread.nextCursor).toBeNull();
    });
  });

  describe('markThreadAsRead', () => {
    it('returns count of updated receipts', async () => {
      mockUpdateReturning.mockReturnValueOnce([
        { id: 'receipt-1', messageId: MESSAGE_ID, recipientId: ENUMERATOR_ID_1, readAt: new Date() },
        { id: 'receipt-2', messageId: MESSAGE_ID_2, recipientId: ENUMERATOR_ID_1, readAt: new Date() },
      ]);

      const result = await MessageService.markThreadAsRead(ENUMERATOR_ID_1, SUPERVISOR_ID);
      expect(result).toBe(2);
    });

    it('returns 0 when no unread messages in thread', async () => {
      mockUpdateReturning.mockReturnValueOnce([]);

      const result = await MessageService.markThreadAsRead(ENUMERATOR_ID_1, SUPERVISOR_ID);
      expect(result).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('returns true when receipt is updated', async () => {
      mockUpdateReturning.mockReturnValueOnce([{
        id: 'receipt-1',
        messageId: MESSAGE_ID,
        recipientId: ENUMERATOR_ID_1,
        readAt: new Date(),
      }]);

      const result = await MessageService.markAsRead(MESSAGE_ID, ENUMERATOR_ID_1);
      expect(result).toBe(true);
    });

    it('returns false when receipt not found or already read', async () => {
      mockUpdateReturning.mockReturnValueOnce([]);

      const result = await MessageService.markAsRead(MESSAGE_ID, ENUMERATOR_ID_1);
      expect(result).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('returns count from query result', async () => {
      selectResults.push([{ count: 5 }]);

      const result = await MessageService.getUnreadCount(ENUMERATOR_ID_1);
      expect(result).toBe(5);
    });

    it('returns 0 when no unread messages', async () => {
      selectResults.push([{ count: 0 }]);

      const result = await MessageService.getUnreadCount(ENUMERATOR_ID_1);
      expect(result).toBe(0);
    });
  });
});
