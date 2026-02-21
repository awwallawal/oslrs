// @vitest-environment jsdom
/**
 * SupervisorMessagesPage Tests
 *
 * Story 4.2: Supervisor messaging interface tests.
 * Verifies inbox rendering, thread interaction, broadcast, loading/empty/error states,
 * and realtime event handling.
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
const mockBroadcastMutate = vi.fn();
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

const mockTeamMetricsData = vi.hoisted(() => ({
  data: null as any,
  isLoading: false,
  isError: false,
}));

// Mock useAuth
vi.mock('../../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'supervisor', fullName: 'Test Supervisor', email: 'sup@test.local', lgaId: 'lga-1', status: 'active' },
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
  useSendBroadcast: () => ({ mutate: mockBroadcastMutate, isPending: false }),
  useMarkThreadAsRead: () => ({ mutate: mockMarkThreadAsReadMutate }),
  useUnreadCount: () => ({ data: { count: 0 } }),
  useMessageRealtime: vi.fn(),
}));

// Mock supervisor hooks
vi.mock('../../hooks/useSupervisor', () => ({
  useTeamMetrics: () => mockTeamMetricsData,
  useTeamOverview: () => ({ data: null, isLoading: false }),
  usePendingAlerts: () => ({ data: null, isLoading: false }),
  useTeamGps: () => ({ data: null, isLoading: false }),
}));

import SupervisorMessagesPage from '../SupervisorMessagesPage';

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
        <SupervisorMessagesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_THREADS = [
  {
    partnerId: 'enum-1',
    partnerName: 'John Doe',
    lastMessage: 'When is the next survey?',
    lastMessageAt: '2026-02-19T10:00:00Z',
    unreadCount: 2,
    messageType: 'direct' as const,
  },
  {
    partnerId: 'enum-2',
    partnerName: 'Jane Smith',
    lastMessage: 'Completed all submissions',
    lastMessageAt: '2026-02-19T09:00:00Z',
    unreadCount: 0,
    messageType: 'direct' as const,
  },
];

const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    senderId: 'enum-1',
    senderName: 'John Doe',
    recipientId: 'user-1',
    messageType: 'direct' as const,
    content: 'When is the next survey?',
    sentAt: '2026-02-19T10:00:00Z',
  },
  {
    id: 'msg-2',
    senderId: 'user-1',
    senderName: 'Test Supervisor',
    recipientId: 'enum-1',
    messageType: 'direct' as const,
    content: 'Tomorrow at 9am',
    sentAt: '2026-02-19T10:01:00Z',
  },
];

const MOCK_TEAM_ENUMERATORS = [
  { id: 'enum-1', fullName: 'John Doe', status: 'active', lastLoginAt: '2026-02-21T09:00:00Z', dailyCount: 5, weeklyCount: 20, lastSubmittedAt: '2026-02-21T08:00:00Z' },
  { id: 'enum-2', fullName: 'Jane Smith', status: 'active', lastLoginAt: '2026-02-20T15:00:00Z', dailyCount: 3, weeklyCount: 12, lastSubmittedAt: '2026-02-20T14:00:00Z' },
  { id: 'enum-3', fullName: 'Ibrahim Okafor', status: 'inactive', lastLoginAt: null, dailyCount: 0, weeklyCount: 0, lastSubmittedAt: null },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('SupervisorMessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInboxData.data = [];
    mockInboxData.isLoading = false;
    mockInboxData.error = null;
    mockThreadData.data = { messages: [] };
    mockThreadData.isLoading = false;
    mockTeamMetricsData.data = { enumerators: MOCK_TEAM_ENUMERATORS };
    mockTeamMetricsData.isLoading = false;
    mockTeamMetricsData.isError = false;
  });

  afterEach(cleanup);

  describe('page heading', () => {
    it('renders page title and subtitle', () => {
      renderPage();
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('Communicate with your team')).toBeInTheDocument();
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
      expect(screen.getByText('Select a conversation or broadcast to your team')).toBeInTheDocument();
    });
  });

  describe('inbox with threads', () => {
    it('renders thread list with partner names', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('shows message previews in thread list', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('When is the next survey?')).toBeInTheDocument();
      expect(screen.getByText('Completed all submissions')).toBeInTheDocument();
    });

    it('shows unread count badge for threads with unread messages', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('thread selection', () => {
    it('opens thread when clicking a conversation', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('John Doe'));

      // Thread header should show partner name
      const headerElements = screen.getAllByText('John Doe');
      expect(headerElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders messages in thread view', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('John Doe'));

      // Use role="log" (MessageThread's aria container) to scope within thread
      const threadLog = screen.getByRole('log');
      expect(within(threadLog).getByText('When is the next survey?')).toBeInTheDocument();
      expect(within(threadLog).getByText('Tomorrow at 9am')).toBeInTheDocument();
    });

    it('shows thread loading skeleton while loading', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.isLoading = true;
      mockThreadData.data = null;
      renderPage();

      fireEvent.click(screen.getByText('John Doe'));

      expect(screen.getByLabelText('Loading thread')).toBeInTheDocument();
    });
  });

  describe('broadcast', () => {
    it('renders broadcast button for supervisor', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByText('Broadcast to Team')).toBeInTheDocument();
    });

    it('opens broadcast composer when broadcast button is clicked', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();

      fireEvent.click(screen.getByText('Broadcast to Team'));

      expect(screen.getByText('Send a message to all your assigned enumerators')).toBeInTheDocument();
    });

    it('shows broadcast composer with correct placeholder', () => {
      mockInboxData.data = [];
      renderPage();

      fireEvent.click(screen.getByText('Broadcast to Team'));

      expect(screen.getByPlaceholderText('Type a broadcast message...')).toBeInTheDocument();
    });
  });

  describe('message composer', () => {
    it('renders message input when thread is selected', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('John Doe'));

      expect(screen.getByLabelText('Message input')).toBeInTheDocument();
      expect(screen.getByLabelText('Send message')).toBeInTheDocument();
    });

    it('send button is disabled when input is empty', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('John Doe'));

      const sendButton = screen.getByLabelText('Send message');
      expect(sendButton).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('inbox list has correct ARIA label', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByLabelText('Message threads')).toBeInTheDocument();
    });

    it('thread items have correct ARIA labels with unread count', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByLabelText('Conversation with John Doe, 2 unread')).toBeInTheDocument();
    });

    it('broadcast button has ARIA label', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByLabelText('Send broadcast message to all team members')).toBeInTheDocument();
    });
  });

  describe('new conversation (AC #1-#5)', () => {
    it('renders "New Conversation" button in inbox (AC #1)', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();
      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('"New Conversation" button visible in empty inbox (AC #4)', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('"New Conversation" button has ARIA label', () => {
      mockInboxData.data = [];
      renderPage();
      expect(screen.getByLabelText('Start a new conversation')).toBeInTheDocument();
    });

    it('opens roster picker when "New Conversation" clicked (AC #1)', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));

      // Roster picker should show team members
      expect(screen.getByLabelText('Team members')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Ibrahim Okafor')).toBeInTheDocument();
    });

    it('roster picker shows search input', () => {
      mockInboxData.data = [];
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));

      expect(screen.getByLabelText('Search team members')).toBeInTheDocument();
    });

    it('marks enumerators with existing threads in roster (AC #5)', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));

      // enum-1 (John Doe) and enum-2 (Jane Smith) have existing threads
      const existingLabels = screen.getAllByText('Existing thread');
      expect(existingLabels.length).toBe(2);
    });

    it('selecting enumerator from roster opens thread (AC #2)', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));

      // Select an enumerator
      fireEvent.click(screen.getByLabelText('Start conversation with John Doe (existing thread)'));

      // Roster picker should be closed and thread should be open
      expect(screen.queryByLabelText('Team members')).not.toBeInTheDocument();
    });

    it('selecting enumerator with existing thread shows existing messages (AC #3)', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: MOCK_MESSAGES };
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));
      fireEvent.click(screen.getByLabelText('Start conversation with John Doe (existing thread)'));

      // Thread should show existing messages
      const threadLog = screen.getByRole('log');
      expect(within(threadLog).getByText('When is the next survey?')).toBeInTheDocument();
    });

    it('selecting enumerator without existing thread shows thread header with name', () => {
      mockInboxData.data = MOCK_THREADS;
      mockThreadData.data = { messages: [] };
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));
      fireEvent.click(screen.getByLabelText('Start conversation with Ibrahim Okafor'));

      // Thread header should show enumerator name from team metrics
      expect(screen.getByText('Ibrahim Okafor')).toBeInTheDocument();
    });

    it('closing roster picker returns to inbox', () => {
      mockInboxData.data = MOCK_THREADS;
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));
      expect(screen.getByLabelText('Team members')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Close roster picker'));
      expect(screen.queryByLabelText('Team members')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Message threads')).toBeInTheDocument();
    });

    it('shows error state in roster picker when team metrics fails (M1)', () => {
      mockInboxData.data = MOCK_THREADS;
      mockTeamMetricsData.data = null;
      mockTeamMetricsData.isError = true;
      renderPage();

      fireEvent.click(screen.getByText('New Conversation'));

      expect(screen.getByText('Failed to load team members')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });
});
