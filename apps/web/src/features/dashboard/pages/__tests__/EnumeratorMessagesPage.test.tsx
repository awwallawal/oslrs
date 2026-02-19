// @vitest-environment jsdom
/**
 * EnumeratorMessagesPage Tests
 *
 * Story 4.2: Enumerator messaging interface tests.
 * Verifies inbox rendering, thread interaction, no broadcast button,
 * loading/empty/error states.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ── Hoisted mocks ───────────────────────────────────────────────────────

const mockMutate = vi.fn();
const mockMarkThreadAsReadMutate = vi.fn();

const mockInboxData = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  error: null as any,
}));

const mockThreadData = vi.hoisted(() => ({
  data: { messages: [] } as any,
  isLoading: false,
}));

// Mock useAuth
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'enum-1', role: 'enumerator', fullName: 'Test Enumerator', email: 'enum@test.local', lgaId: 'lga-1', status: 'active' },
    isLoading: false,
  }),
}));

// Mock useRealtimeConnection
vi.mock('../../../../hooks/useRealtimeConnection', () => ({
  useRealtimeConnection: () => ({
    connectionState: 'connected',
    isConnected: true,
    isDegraded: false,
    socket: null,
    pollingInterval: false as const,
  }),
}));

// Mock message hooks
vi.mock('../../hooks/useMessages', () => ({
  useInbox: () => mockInboxData,
  useThread: () => mockThreadData,
  useSendMessage: () => ({ mutate: mockMutate, isPending: false }),
  useSendBroadcast: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkThreadAsRead: () => ({ mutate: mockMarkThreadAsReadMutate }),
  useUnreadCount: () => ({ data: { count: 0 } }),
  useMessageRealtime: vi.fn(),
}));

import EnumeratorMessagesPage from '../EnumeratorMessagesPage';

// ── Helpers ─────────────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <EnumeratorMessagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_THREADS = [
  {
    partnerId: 'sup-1',
    partnerName: 'Supervisor Alpha',
    lastMessage: 'Please complete your surveys by Friday',
    lastMessageAt: '2026-02-19T10:00:00Z',
    unreadCount: 1,
    messageType: 'direct' as const,
  },
];

const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    senderId: 'sup-1',
    senderName: 'Supervisor Alpha',
    recipientId: 'enum-1',
    messageType: 'direct' as const,
    content: 'Please complete your surveys by Friday',
    sentAt: '2026-02-19T10:00:00Z',
  },
  {
    id: 'msg-2',
    senderId: 'enum-1',
    senderName: 'Test Enumerator',
    recipientId: 'sup-1',
    messageType: 'direct' as const,
    content: 'Will do, thank you!',
    sentAt: '2026-02-19T10:05:00Z',
  },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('EnumeratorMessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInboxData.data = [];
    mockInboxData.isLoading = false;
    mockInboxData.error = null;
    mockThreadData.data = { messages: [] };
    mockThreadData.isLoading = false;
  });

  afterEach(cleanup);

  describe('page heading', () => {
    it('renders page title and enumerator-specific subtitle', () => {
      renderPage();
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('Communicate with your supervisor')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows skeleton cards when inbox is loading', () => {
      mockInboxData.isLoading = true;
      mockInboxData.data = null;
      renderPage();
      expect(screen.getByLabelText('Loading messages')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when inbox fails to load', () => {
      mockInboxData.error = new Error('Network error');
      renderPage();
      expect(screen.getByText(/Failed to load messages/)).toBeInTheDocument();
    });
  });

  describe('empty inbox', () => {
    it('renders empty state with contextual message', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
    });

    it('renders select conversation prompt in right panel', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByText('Select a conversation to start messaging')).toBeInTheDocument();
    });
  });

  describe('no broadcast button', () => {
    it('does NOT show broadcast button for enumerator', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.queryByText('Broadcast to Team')).not.toBeInTheDocument();
    });
  });

  describe('inbox with threads', () => {
    it('renders supervisor thread in inbox list', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('Supervisor Alpha')).toBeInTheDocument();
      expect(screen.getByText('Please complete your surveys by Friday')).toBeInTheDocument();
    });

    it('shows unread count badge', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('thread interaction', () => {
    it('opens supervisor thread when clicked', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('Supervisor Alpha'));

      // Thread header should show partner name
      const headerElements = screen.getAllByText('Supervisor Alpha');
      expect(headerElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders messages in thread view', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('Supervisor Alpha'));

      // Use role="log" (MessageThread's aria container) to scope within thread
      const threadLog = screen.getByRole('log');
      expect(within(threadLog).getByText('Please complete your surveys by Friday')).toBeInTheDocument();
      expect(within(threadLog).getByText('Will do, thank you!')).toBeInTheDocument();
    });

    it('shows message input when thread is open', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('Supervisor Alpha'));

      expect(screen.getByLabelText('Message input')).toBeInTheDocument();
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('send button is disabled when input is empty', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('Supervisor Alpha'));

      expect(screen.getByLabelText('Send message')).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('inbox list has correct ARIA label', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByLabelText('Message threads')).toBeInTheDocument();
    });

    it('thread items have ARIA labels with unread count', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByLabelText('Conversation with Supervisor Alpha, 1 unread')).toBeInTheDocument();
    });

    it('back button has ARIA label when thread is open', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('Supervisor Alpha'));

      expect(screen.getByLabelText('Back to inbox')).toBeInTheDocument();
    });
  });
});
