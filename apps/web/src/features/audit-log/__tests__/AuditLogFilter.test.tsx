// @vitest-environment jsdom

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

expect.extend(matchers);

// ── Hoisted mocks ──────────────────────────────────────────────────────

const {
  mockGetDistinctValues,
  mockSearchPrincipals,
} = vi.hoisted(() => ({
  mockGetDistinctValues: vi.fn(),
  mockSearchPrincipals: vi.fn(),
}));

vi.mock('../api/audit-log.api', async () => {
  const actual = await vi.importActual<typeof import('../api/audit-log.api')>(
    '../api/audit-log.api',
  );
  return {
    ...actual,
    getDistinctValues: (...args: unknown[]) => mockGetDistinctValues(...args),
    searchPrincipals: (...args: unknown[]) => mockSearchPrincipals(...args),
  };
});

// ── Import SUT ─────────────────────────────────────────────────────────

import AuditLogFilter from '../components/AuditLogFilter';
import type { AuditLogFilter as AuditLogFilterValue } from '../api/audit-log.api';

function renderFilter(props: {
  value: AuditLogFilterValue;
  onApply?: (filter: AuditLogFilterValue) => void;
  onReset?: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuditLogFilter
          value={props.value}
          onApply={props.onApply ?? vi.fn()}
          onReset={props.onReset ?? vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuditLogFilter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetDistinctValues.mockImplementation((field: string) => {
      if (field === 'action')
        return Promise.resolve(['user.login', 'user.logout', 'audit_log.exported']);
      return Promise.resolve(['users', 'respondents', 'audit_logs']);
    });
    mockSearchPrincipals.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all five filter dimensions', async () => {
    renderFilter({ value: {} });

    expect(await screen.findByTestId('principal-checkbox-user')).toBeInTheDocument();
    expect(screen.getByTestId('principal-checkbox-consumer')).toBeInTheDocument();
    expect(screen.getByTestId('principal-checkbox-system')).toBeInTheDocument();
    expect(screen.getByTestId('actor-search-input')).toBeInTheDocument();
    expect(await screen.findByTestId('action-chips')).toBeInTheDocument();
    expect(screen.getByTestId('target-resource-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('date-from')).toBeInTheDocument();
    expect(screen.getByTestId('date-to')).toBeInTheDocument();
    expect(screen.getByTestId('date-preset-7d')).toBeInTheDocument();
  });

  it('defaults all three principal types to checked', () => {
    renderFilter({ value: {} });

    const user = screen.getByTestId('principal-checkbox-user') as HTMLInputElement;
    const consumer = screen.getByTestId('principal-checkbox-consumer') as HTMLInputElement;
    const system = screen.getByTestId('principal-checkbox-system') as HTMLInputElement;

    expect(user.checked).toBe(true);
    expect(consumer.checked).toBe(true);
    expect(system.checked).toBe(true);
  });

  it('shows conflict warning + disables Apply when both User and Consumer unchecked', async () => {
    const user = userEvent.setup();
    renderFilter({ value: {} });

    await user.click(screen.getByTestId('principal-checkbox-user'));
    await user.click(screen.getByTestId('principal-checkbox-consumer'));

    expect(screen.getByTestId('principal-conflict-warning')).toBeInTheDocument();
    expect((screen.getByTestId('filter-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('R3-M1: clicking the disabled Apply button does NOT invoke onApply', async () => {
    // Defence-in-depth assertion for AC#3 conflict guard. The previous test
    // verified the .disabled property; this one verifies the click-handler is
    // genuinely silent. Prevents a class of regression where a `disabled`
    // attribute is removed (e.g. converting Button to a custom div) without
    // updating the handler — the visual state would still look right but the
    // submission would fire.
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderFilter({ value: {}, onApply });

    await user.click(screen.getByTestId('principal-checkbox-user'));
    await user.click(screen.getByTestId('principal-checkbox-consumer'));

    // Sanity: button is now disabled per AC#3.
    expect((screen.getByTestId('filter-apply') as HTMLButtonElement).disabled).toBe(true);

    // userEvent respects the disabled attribute and does NOT fire the click;
    // explicitly attempt the click anyway and assert the handler stays silent.
    await user.click(screen.getByTestId('filter-apply'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('R3-L1: shows inline warning when From date is later than To date', async () => {
    const user = userEvent.setup();
    renderFilter({ value: {} });

    // Set From to a date later than To.
    await user.type(screen.getByTestId('date-from'), '2026-05-10');
    await user.type(screen.getByTestId('date-to'), '2026-05-01');

    expect(screen.getByTestId('date-range-inverted-warning')).toBeInTheDocument();
    // R3-L1 deliberately does NOT disable Apply — the warning is informational.
    expect((screen.getByTestId('filter-apply') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does NOT show conflict warning when at least one of User/Consumer is checked', async () => {
    const user = userEvent.setup();
    renderFilter({ value: {} });

    // Uncheck only User; Consumer stays checked.
    await user.click(screen.getByTestId('principal-checkbox-user'));

    expect(screen.queryByTestId('principal-conflict-warning')).toBeNull();
    expect((screen.getByTestId('filter-apply') as HTMLButtonElement).disabled).toBe(false);
  });

  it('applies filter via the Apply button', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderFilter({ value: {}, onApply });

    // Set a target resource to verify it flows through.
    await screen.findByTestId('action-chips');
    await user.click(screen.getByTestId('filter-apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined }),
    );
  });

  it('toggles action chips when clicked', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderFilter({ value: {}, onApply });

    const chip = await screen.findByTestId('action-chip-user.login');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('filter-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ actions: ['user.login'] }),
    );
  });

  it('applies a date preset', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderFilter({ value: {}, onApply });

    await user.click(screen.getByTestId('date-preset-7d'));
    await user.click(screen.getByTestId('filter-apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const callArg = onApply.mock.calls[0][0] as AuditLogFilterValue;
    expect(callArg.from).toBeDefined();
    // 7d preset: roughly 7 days before now. Allow ±1 day tolerance for flake.
    const fromMs = new Date(callArg.from!).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(fromMs - sevenDaysAgo)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('debounces actor search input — does not fire before 300ms but does after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSearchPrincipals.mockResolvedValue([
      { id: 'user-1', name: 'Awwal Lawal', type: 'user' },
    ]);

    renderFilter({ value: {} });

    const input = screen.getByTestId('actor-search-input');
    await act(async () => {
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Awwal' } });
    });

    // Before 300ms elapses, no search should have fired.
    expect(mockSearchPrincipals).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(
      () => {
        expect(mockSearchPrincipals).toHaveBeenCalledWith('Awwal');
      },
      { timeout: 2000 },
    );
  });

  it('calls onReset when Reset clicked', async () => {
    const onReset = vi.fn();
    renderFilter({ value: { actions: ['user.login'] }, onReset });

    fireEvent.click(screen.getByTestId('filter-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
