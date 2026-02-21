// @vitest-environment jsdom
/**
 * TeamRosterPicker Tests
 *
 * Prep-1: Verifies team roster picker renders enumerator list,
 * marks existing threads, supports search filter, loading skeleton,
 * and click selection.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

expect.extend(matchers);

import TeamRosterPicker from '../TeamRosterPicker';

// ── Freeze time for deterministic relative-time assertions (L4) ─────────

const FROZEN_NOW = new Date('2026-02-21T10:00:00Z').getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

// ── Test data ────────────────────────────────────────────────────────────

const MOCK_ENUMERATORS = [
  {
    id: 'enum-1',
    fullName: 'Adewale Johnson',
    status: 'active',
    lastLoginAt: new Date(FROZEN_NOW - 5 * 60000).toISOString(), // 5 min ago
    dailyCount: 3,
    weeklyCount: 15,
    lastSubmittedAt: '2026-02-21T08:00:00Z',
  },
  {
    id: 'enum-2',
    fullName: 'Fatima Bello',
    status: 'inactive',
    lastLoginAt: null,
    dailyCount: 0,
    weeklyCount: 0,
    lastSubmittedAt: null,
  },
  {
    id: 'enum-3',
    fullName: 'Ibrahim Okafor',
    status: 'active',
    lastLoginAt: new Date(FROZEN_NOW - 2 * 3600000).toISOString(), // 2h ago
    dailyCount: 7,
    weeklyCount: 28,
    lastSubmittedAt: '2026-02-21T09:30:00Z',
  },
];

const EXISTING_THREAD_IDS = new Set(['enum-1']);

// ── Helpers ──────────────────────────────────────────────────────────────

function renderPicker(overrides = {}) {
  const defaultProps = {
    enumerators: MOCK_ENUMERATORS,
    isLoading: false,
    existingThreadPartnerIds: EXISTING_THREAD_IDS,
    onSelectEnumerator: vi.fn(),
    onClose: vi.fn(),
  };
  return { ...render(<TeamRosterPicker {...defaultProps} {...overrides} />), props: { ...defaultProps, ...overrides } };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('TeamRosterPicker', () => {
  afterEach(cleanup);

  describe('rendering', () => {
    it('renders all enumerators in the list', () => {
      renderPicker();
      expect(screen.getByText('Adewale Johnson')).toBeInTheDocument();
      expect(screen.getByText('Fatima Bello')).toBeInTheDocument();
      expect(screen.getByText('Ibrahim Okafor')).toBeInTheDocument();
    });

    it('shows "New Conversation" header', () => {
      renderPicker();
      expect(screen.getByText('New Conversation')).toBeInTheDocument();
    });

    it('renders search input', () => {
      renderPicker();
      expect(screen.getByLabelText('Search team members')).toBeInTheDocument();
    });

    it('renders team members list with ARIA label', () => {
      renderPicker();
      expect(screen.getByLabelText('Team members')).toBeInTheDocument();
    });
  });

  describe('existing thread marking (AC #5)', () => {
    it('marks enumerators with existing threads', () => {
      renderPicker();
      expect(screen.getByText('Existing thread')).toBeInTheDocument();
    });

    it('shows "Existing thread" only for enumerators with threads', () => {
      renderPicker();
      const existingLabels = screen.getAllByText('Existing thread');
      expect(existingLabels).toHaveLength(1);
    });

    it('includes existing thread info in ARIA label', () => {
      renderPicker();
      expect(
        screen.getByLabelText('Start conversation with Adewale Johnson (existing thread)')
      ).toBeInTheDocument();
    });
  });

  describe('last login / status display (AC #5)', () => {
    it('shows "Never logged in" for null lastLoginAt', () => {
      renderPicker();
      expect(screen.getByText('Never logged in')).toBeInTheDocument();
    });

    it('shows relative time for recent login', () => {
      renderPicker();
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });

  describe('search filter', () => {
    it('filters enumerators by name', () => {
      renderPicker();
      const searchInput = screen.getByLabelText('Search team members');
      fireEvent.change(searchInput, { target: { value: 'Fatima' } });
      expect(screen.getByText('Fatima Bello')).toBeInTheDocument();
      expect(screen.queryByText('Adewale Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Ibrahim Okafor')).not.toBeInTheDocument();
    });

    it('shows empty state when no matches', () => {
      renderPicker();
      const searchInput = screen.getByLabelText('Search team members');
      fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });
      expect(screen.getByText('No team members match your search')).toBeInTheDocument();
    });

    it('is case-insensitive', () => {
      renderPicker();
      const searchInput = screen.getByLabelText('Search team members');
      fireEvent.change(searchInput, { target: { value: 'ibrahim' } });
      expect(screen.getByText('Ibrahim Okafor')).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('calls onSelectEnumerator with enumerator id on click', () => {
      const onSelect = vi.fn();
      renderPicker({ onSelectEnumerator: onSelect });
      fireEvent.click(screen.getByText('Fatima Bello'));
      expect(onSelect).toHaveBeenCalledWith('enum-2');
    });

    it('calls onSelectEnumerator for enumerator with existing thread', () => {
      const onSelect = vi.fn();
      renderPicker({ onSelectEnumerator: onSelect });
      fireEvent.click(screen.getByText('Adewale Johnson'));
      expect(onSelect).toHaveBeenCalledWith('enum-1');
    });
  });

  describe('close button', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      renderPicker({ onClose });
      fireEvent.click(screen.getByLabelText('Close roster picker'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('loading state', () => {
    it('shows skeleton loading when isLoading is true', () => {
      renderPicker({ isLoading: true, enumerators: [] });
      expect(screen.getByLabelText('Loading team members')).toBeInTheDocument();
    });

    it('does not render enumerators when loading', () => {
      renderPicker({ isLoading: true, enumerators: [] });
      expect(screen.queryByText('Adewale Johnson')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no enumerators assigned', () => {
      renderPicker({ enumerators: [] });
      expect(screen.getByText('No team members assigned')).toBeInTheDocument();
    });
  });

  describe('error state (H1)', () => {
    it('shows error message when isError is true', () => {
      renderPicker({ isError: true, enumerators: [] });
      expect(screen.getByText('Failed to load team members')).toBeInTheDocument();
      expect(screen.getByText('Please try again later')).toBeInTheDocument();
    });

    it('does not render enumerator list when in error state', () => {
      renderPicker({ isError: true, enumerators: MOCK_ENUMERATORS });
      expect(screen.queryByText('Adewale Johnson')).not.toBeInTheDocument();
    });

    it('does not render loading skeleton when in error state', () => {
      renderPicker({ isError: true, isLoading: true, enumerators: [] });
      expect(screen.queryByLabelText('Loading team members')).not.toBeInTheDocument();
      expect(screen.getByText('Failed to load team members')).toBeInTheDocument();
    });
  });
});
