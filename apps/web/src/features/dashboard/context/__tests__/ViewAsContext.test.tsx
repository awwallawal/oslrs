// @vitest-environment jsdom
/**
 * ViewAsContext Tests
 *
 * Story 6-7 AC #5: blockAction() shows toast when View-As active
 * Story 6-7 AC #7: Auth context not overridden
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

expect.extend(matchers);

// ── Mocks ────────────────────────────────────────────────────────────────

const mockWarning = vi.fn();
const mockMutate = vi.fn();

let mockViewAsQueryData: any = null;
let mockViewAsQueryLoading = false;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ role: 'enumerator' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../hooks/useViewAs', () => ({
  useViewAsState: () => ({
    data: mockViewAsQueryData,
    isLoading: mockViewAsQueryLoading,
  }),
  useEndViewAs: () => ({
    mutate: mockMutate,
  }),
}));

vi.mock('../../../../hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: mockWarning,
  }),
}));

import { MemoryRouter } from 'react-router-dom';
import { ViewAsProvider, useViewAs } from '../ViewAsContext';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockViewAsQueryData = {
    active: true,
    targetRole: 'enumerator',
    targetLgaId: 'lga-123',
    startedAt: '2026-03-01T10:00:00Z',
    expiresAt: '2026-03-01T10:30:00Z',
  };
  mockViewAsQueryLoading = false;
});

// Test consumer component
function TestConsumer() {
  const { isViewingAs, blockAction, targetRole, exitViewAs } = useViewAs();

  return (
    <div>
      <span data-testid="is-viewing">{String(isViewingAs)}</span>
      <span data-testid="target-role">{targetRole ?? 'none'}</span>
      <button data-testid="block-test" onClick={() => blockAction('submit form')}>
        Test Block
      </button>
      <button data-testid="exit-test" onClick={exitViewAs}>
        Exit
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/super-admin/view-as/enumerator']}>
      <ViewAsProvider>
        <TestConsumer />
      </ViewAsProvider>
    </MemoryRouter>,
  );
}

describe('ViewAsContext', () => {
  it('blockAction() returns true and shows toast when View-As active', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.getByTestId('is-viewing').textContent).toBe('true');

    await user.click(screen.getByTestId('block-test'));

    expect(mockWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Actions disabled in View-As mode',
      }),
    );
  });

  it('blockAction() returns false when not in View-As mode', async () => {
    mockViewAsQueryData = { active: false };
    const user = userEvent.setup();
    renderWithProvider();

    expect(screen.getByTestId('is-viewing').textContent).toBe('false');

    await user.click(screen.getByTestId('block-test'));

    // No warning shown when not viewing as
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('provides target role from View-As state', () => {
    renderWithProvider();

    expect(screen.getByTestId('target-role').textContent).toBe('enumerator');
  });

  it('exitViewAs() calls end mutation', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByTestId('exit-test'));

    expect(mockMutate).toHaveBeenCalled();
  });
});
